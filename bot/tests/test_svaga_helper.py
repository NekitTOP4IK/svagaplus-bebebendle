"""Tests for SVAGA+ subscriber status helper in the bot."""

from __future__ import annotations

import inspect
import os
import sys
from datetime import datetime
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _load_main_module_safely() -> ModuleType:
    """Load main module for testing, stubbing heavy deps and top-level side effects."""
    os.environ.setdefault("BOT_TOKEN", "123456789:TEST-BOT-TOKEN-FOR-UNITTESTS")
    os.environ.setdefault("BEBEBENDLE_INTERNAL_SECRET", "test-internal-secret")
    os.environ.setdefault("BEBEBENDLE_INTERNAL_URL", "http://test:3000")

    fake_sentence = ModuleType("sentence_transformers")
    fake_sentence.SentenceTransformer = MagicMock(return_value=MagicMock(encode=MagicMock()))
    sys.modules["sentence_transformers"] = fake_sentence

    fake_scipy = ModuleType("scipy")
    fake_scipy_spatial = ModuleType("scipy.spatial")
    fake_scipy_spatial_distance = ModuleType("scipy.spatial.distance")
    fake_scipy_spatial_distance.cosine = lambda a, b: 0.0
    sys.modules["scipy"] = fake_scipy
    sys.modules["scipy.spatial"] = fake_scipy_spatial
    sys.modules["scipy.spatial.distance"] = fake_scipy_spatial_distance
    sys.modules["asyncpg"] = MagicMock()

    orig_path = sys.path[:]
    try:
        bot_src = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
        if bot_src not in sys.path:
            sys.path.insert(0, bot_src)
        bot_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        if bot_root not in sys.path:
            sys.path.insert(0, bot_root)

        for mod in list(sys.modules.keys()):
            if mod.startswith("database") or mod.startswith("main") or "bot.src" in mod:
                del sys.modules[mod]

        import database  # type: ignore  # noqa: F401
        import main as main_module  # type: ignore
        return main_module
    finally:
        sys.path[:] = orig_path


class _AsyncCM:
    def __init__(self, value: object) -> None:
        self._value = value

    async def __aenter__(self) -> object:
        if isinstance(self._value, BaseException):
            raise self._value
        return self._value

    async def __aexit__(self, *args: object) -> bool:
        return False


def _mock_session(response: MagicMock | BaseException) -> MagicMock:
    mock_session = MagicMock()
    if isinstance(response, BaseException):
        mock_session.get.side_effect = response
    else:
        mock_session.get.return_value = _AsyncCM(response)

    # ClientSession() is itself an async context manager yielding the session.
    mock_cm = MagicMock()
    mock_cm.__aenter__ = AsyncMock(return_value=mock_session)
    mock_cm.__aexit__ = AsyncMock(return_value=False)
    return mock_cm


@pytest.mark.asyncio
async def test_unknown_when_no_config():
    main_module = _load_main_module_safely()
    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", None), \
         patch.object(main_module, "BEBEBENDLE_INTERNAL_SECRET", None), \
         patch.object(main_module, "logger") as mock_logger:
        result = await main_module.get_svaga_subscriber_status("123456")
        assert result.is_subscriber is None
        assert result.checked_at is None
        assert result.source == "unknown"
        mock_logger.warning.assert_called()


@pytest.mark.asyncio
async def test_fresh_true_snapshot():
    main_module = _load_main_module_safely()
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value={
        "isSubscriber": True,
        "source": "fresh",
        "checkedAt": "2026-07-16T12:00:00Z",
        "error": None,
    })
    mock_response.text = AsyncMock(return_value="")
    mock_session = _mock_session(mock_response)

    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", "http://example.test"), \
         patch.object(main_module, "BEBEBENDLE_INTERNAL_SECRET", "sekret"), \
         patch("main.aiohttp.ClientSession", return_value=mock_session), \
         patch.object(main_module, "logger"):
        result = await main_module.get_svaga_subscriber_status("987654321")
        assert result.is_subscriber is True
        assert result.source == "fresh"
        # naive UTC for asyncpg timestamp without time zone
        assert result.checked_at == datetime(2026, 7, 16, 12, 0)
        session = await mock_session.__aenter__()
        call_kwargs = session.get.call_args.kwargs
        assert call_kwargs["params"] == {"telegram_id": "987654321"}
        assert call_kwargs["headers"] == {"X-Internal-Secret": "sekret"}


@pytest.mark.asyncio
async def test_stale_cache_preserves_boolean_and_timestamp():
    main_module = _load_main_module_safely()
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value={
        "isSubscriber": False,
        "source": "stale_cache",
        "checkedAt": "2026-07-16T10:00:00Z",
        "error": "timeout",
    })
    mock_response.text = AsyncMock(return_value="")
    mock_session = _mock_session(mock_response)

    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", "http://example.test"), \
         patch.object(main_module, "BEBEBENDLE_INTERNAL_SECRET", "sekret"), \
         patch("main.aiohttp.ClientSession", return_value=mock_session), \
         patch.object(main_module, "logger"):
        result = await main_module.get_svaga_subscriber_status("111")
        assert result.is_subscriber is False
        assert result.source == "stale_cache"
        assert result.checked_at == datetime(2026, 7, 16, 10, 0)


@pytest.mark.asyncio
async def test_malformed_json_becomes_unknown():
    main_module = _load_main_module_safely()
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value={"not": "valid"})
    mock_response.text = AsyncMock(return_value="")
    mock_session = _mock_session(mock_response)

    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", "http://example.test"), \
         patch.object(main_module, "BEBEBENDLE_INTERNAL_SECRET", "sekret"), \
         patch("main.aiohttp.ClientSession", return_value=mock_session), \
         patch.object(main_module, "logger"):
        result = await main_module.get_svaga_subscriber_status("222")
        assert result == main_module.SubscriberSnapshot(None, None, "unknown")


@pytest.mark.asyncio
async def test_http_error_returns_unknown():
    main_module = _load_main_module_safely()
    mock_response = MagicMock()
    mock_response.status = 500
    mock_response.text = AsyncMock(return_value="boom")
    mock_session = _mock_session(mock_response)

    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", "http://example.test"), \
         patch.object(main_module, "BEBEBENDLE_INTERNAL_SECRET", "sekret"), \
         patch("main.aiohttp.ClientSession", return_value=mock_session), \
         patch.object(main_module, "logger"):
        result = await main_module.get_svaga_subscriber_status("222")
        assert result.is_subscriber is None
        assert result.source == "unknown"


@pytest.mark.asyncio
async def test_timeout_returns_unknown():
    main_module = _load_main_module_safely()
    mock_session = _mock_session(TimeoutError())

    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", "http://example.test"), \
         patch.object(main_module, "BEBEBENDLE_INTERNAL_SECRET", "sekret"), \
         patch("main.aiohttp.ClientSession", return_value=mock_session), \
         patch.object(main_module, "logger"):
        result = await main_module.get_svaga_subscriber_status("333")
        assert result.is_subscriber is None
        assert result.source == "unknown"


@pytest.mark.asyncio
async def test_insert_scran_accepts_nullable_snapshot_kwargs():
    main_module = _load_main_module_safely()
    del main_module  # ensure import side effects only
    from database import Database  # type: ignore

    db = Database()
    params = list(inspect.signature(db.insert_scran).parameters.keys())
    assert "is_subscriber" in params
    assert "subscriber_checked_at" in params
