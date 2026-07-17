from __future__ import annotations

import asyncio
import json

import pytest

from health import start_health_server


@pytest.mark.asyncio
async def test_health_endpoint_ok() -> None:
    server = await start_health_server("127.0.0.1", 0)
    assert server.sockets
    port = server.sockets[0].getsockname()[1]
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        writer.write(b"GET /health HTTP/1.1\r\nHost: localhost\r\n\r\n")
        await writer.drain()
        raw = await reader.read(4096)
        writer.close()
        await writer.wait_closed()
    finally:
        server.close()
        await server.wait_closed()

    assert b"200 OK" in raw
    body = raw.split(b"\r\n\r\n", 1)[1]
    assert json.loads(body.decode()) == {"status": "ok"}


@pytest.mark.asyncio
async def test_health_unknown_path_404() -> None:
    server = await start_health_server("127.0.0.1", 0)
    assert server.sockets
    port = server.sockets[0].getsockname()[1]
    try:
        reader, writer = await asyncio.open_connection("127.0.0.1", port)
        writer.write(b"GET /nope HTTP/1.1\r\nHost: localhost\r\n\r\n")
        await writer.drain()
        raw = await reader.read(4096)
        writer.close()
        await writer.wait_closed()
    finally:
        server.close()
        await server.wait_closed()

    assert b"404 Not Found" in raw
