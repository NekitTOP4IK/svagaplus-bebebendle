"""Focused tests for database DSN selection."""

from __future__ import annotations

import os
import sys
from types import ModuleType
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _load_database_module():
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

    bot_src = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "src"))
    if bot_src not in sys.path:
        sys.path.insert(0, bot_src)

    for mod in list(sys.modules.keys()):
        if mod == "database" or mod.startswith("database."):
            del sys.modules[mod]

    import database as database_module  # type: ignore
    return database_module


@pytest.mark.asyncio
async def test_connect_uses_database_url_when_set(monkeypatch):
    database_module = _load_database_module()
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@dbhost:5432/bebendle")
    create_pool = AsyncMock(return_value=MagicMock())

    with patch.object(database_module.asyncpg, "create_pool", create_pool):
        db = database_module.Database()
        await db.connect()

    create_pool.assert_awaited_once()
    kwargs = create_pool.await_args.kwargs
    assert kwargs["dsn"] == "postgresql://user:pass@dbhost:5432/bebendle"
    assert kwargs["min_size"] == 1
    assert kwargs["max_size"] == 3


@pytest.mark.asyncio
async def test_connect_is_idempotent(monkeypatch):
    database_module = _load_database_module()
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@dbhost:5432/bebendle")
    create_pool = AsyncMock(return_value=MagicMock())

    with patch.object(database_module.asyncpg, "create_pool", create_pool):
        db = database_module.Database()
        await db.connect()
        await db.connect()

    create_pool.assert_awaited_once()
