"""Tests for SVAGA+ subscriber status helper in the bot."""

import asyncio
import os
import sys
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _load_main_module_safely() -> ModuleType:
    """Load main module for testing, stubbing heavy deps and top-level side effects."""
    # Ensure required env to avoid BOT_TOKEN raise at import time
    os.environ.setdefault("BOT_TOKEN", "123456789:TEST-BOT-TOKEN-FOR-UNITTESTS")
    os.environ.setdefault("INTERNAL_SECRET", "test-internal-secret")
    os.environ.setdefault("BEBEBENDLE_INTERNAL_URL", "http://test:3000")

    # Stub heavy optional deps that run at import time (SentenceTransformer etc.)
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

    # Stub asyncpg to prevent pool creation side effects if any
    sys.modules["asyncpg"] = MagicMock()

    # Now safe to import (note: import path from bot root context)
    # We manipulate sys.path so 'from database import' and relative work when running tests
    orig_path = sys.path[:]
    try:
        bot_src = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
        if bot_src not in sys.path:
            sys.path.insert(0, bot_src)
        # also parent for package style
        bot_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
        if bot_root not in sys.path:
            sys.path.insert(0, bot_root)

        # Force reimport clean
        for mod in list(sys.modules.keys()):
            if mod.startswith("database") or mod.startswith("main") or "bot.src" in mod:
                del sys.modules[mod]

        import database  # type: ignore  # noqa: F401  # ensure stub works for 'from database'
        import main as main_module  # type: ignore  # the bot/src/main.py as 'main'
        return main_module
    finally:
        sys.path[:] = orig_path


@pytest.mark.asyncio
async def test_get_svaga_subscriber_status_returns_false_when_no_config():
    """Should safely return False and log warning if env not configured."""
    main_module = _load_main_module_safely()
    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", None), \
         patch.object(main_module, "INTERNAL_SECRET", None), \
         patch.object(main_module, "logger") as mock_logger:
        result = await main_module.get_svaga_subscriber_status("123456")
        assert result is False
        mock_logger.warning.assert_called()


@pytest.mark.asyncio
async def test_get_svaga_subscriber_status_success_true():
    """Happy path: returns True when API says isSubscriber true."""
    main_module = _load_main_module_safely()
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value={"isSubscriber": True, "tributeUserId": "abc"})
    mock_response.text = AsyncMock(return_value="")

    mock_session = MagicMock()
    mock_session.get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
    mock_session.get.return_value.__aexit__ = AsyncMock(return_value=False)

    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", "http://example.test"), \
         patch.object(main_module, "INTERNAL_SECRET", "sekret"), \
         patch("main.aiohttp.ClientSession", return_value=mock_session), \
         patch.object(main_module, "logger"):
        result = await main_module.get_svaga_subscriber_status("987654321")
        assert result is True
        # verify call
        mock_session.get.assert_called_once()
        call_kwargs = mock_session.get.call_args.kwargs
        assert call_kwargs["params"] == {"telegram_id": "987654321"}
        assert call_kwargs["headers"] == {"x-internal-secret": "sekret"}


@pytest.mark.asyncio
async def test_get_svaga_subscriber_status_success_false():
    """Returns False when API reports not subscriber."""
    main_module = _load_main_module_safely()
    mock_response = MagicMock()
    mock_response.status = 200
    mock_response.json = AsyncMock(return_value={"isSubscriber": False})
    mock_response.text = AsyncMock(return_value="")

    mock_session = MagicMock()
    mock_session.get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
    mock_session.get.return_value.__aexit__ = AsyncMock(return_value=False)

    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", "http://example.test"), \
         patch.object(main_module, "INTERNAL_SECRET", "sekret"), \
         patch("main.aiohttp.ClientSession", return_value=mock_session), \
         patch.object(main_module, "logger"):
        result = await main_module.get_svaga_subscriber_status("111")
        assert result is False


@pytest.mark.asyncio
async def test_get_svaga_subscriber_status_http_error_returns_false():
    """Non-200 status -> False and logs warning."""
    main_module = _load_main_module_safely()
    mock_response = MagicMock()
    mock_response.status = 500
    mock_response.text = AsyncMock(return_value="boom")
    mock_response.json = AsyncMock()

    mock_session = MagicMock()
    mock_session.get.return_value.__aenter__ = AsyncMock(return_value=mock_response)
    mock_session.get.return_value.__aexit__ = AsyncMock(return_value=False)

    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", "http://example.test"), \
         patch.object(main_module, "INTERNAL_SECRET", "sekret"), \
         patch("main.aiohttp.ClientSession", return_value=mock_session), \
         patch.object(main_module, "logger") as mock_logger:
        result = await main_module.get_svaga_subscriber_status("222")
        assert result is False
        mock_logger.warning.assert_called()


@pytest.mark.asyncio
async def test_get_svaga_subscriber_status_timeout_returns_false():
    """Timeout is caught and returns False."""
    main_module = _load_main_module_safely()
    mock_session = MagicMock()
    # Simulate timeout on context enter
    mock_session.get.side_effect = asyncio.TimeoutError

    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", "http://example.test"), \
         patch.object(main_module, "INTERNAL_SECRET", "sekret"), \
         patch("main.aiohttp.ClientSession", return_value=mock_session), \
         patch.object(main_module, "logger") as mock_logger:
        result = await main_module.get_svaga_subscriber_status("333")
        assert result is False
        mock_logger.error.assert_called()


@pytest.mark.asyncio
async def test_get_svaga_subscriber_status_other_exception_returns_false():
    """Any other error -> False + logged."""
    main_module = _load_main_module_safely()
    mock_session = MagicMock()
    mock_session.get.side_effect = Exception("network down")

    with patch.object(main_module, "BEBEBENDLE_INTERNAL_URL", "http://example.test"), \
         patch.object(main_module, "INTERNAL_SECRET", "sekret"), \
         patch("main.aiohttp.ClientSession", return_value=mock_session), \
         patch.object(main_module, "logger") as mock_logger:
        result = await main_module.get_svaga_subscriber_status("444")
        assert result is False
        mock_logger.error.assert_called()


@pytest.mark.asyncio
async def test_insert_scran_accepts_is_subscriber_kwarg():
    """Smoke that the updated signature accepts the kwarg (no real DB)."""
    # We only test that calling the method def doesn't raise on signature,
    # real integration would require DB mocking which is heavier.
    # This at least ensures the change in main.py call site matches.
    main_module = _load_main_module_safely()
    # Import via the loaded side to get patched db
    # reload database separately is covered by the safe loader
    import inspect
    from database import Database  # type: ignore  # uses the sys.path we set in loader

    # instantiate with patched __init__ inside loader already
    db = Database()
    sig = inspect.signature(db.insert_scran)
    params = list(sig.parameters.keys())
    assert "is_subscriber" in params
