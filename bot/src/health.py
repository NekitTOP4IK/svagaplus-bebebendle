from __future__ import annotations

import asyncio
import json


async def _handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    request_line = await reader.readline()
    while await reader.readline() not in {b"\r\n", b"\n", b""}:
        pass
    ok = request_line.startswith(b"GET /health ")
    body = json.dumps({"status": "ok" if ok else "not_found"}).encode()
    status = b"200 OK" if ok else b"404 Not Found"
    writer.write(
        b"HTTP/1.1 "
        + status
        + b"\r\n"
        + b"Content-Type: application/json\r\n"
        + f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode()
        + body
    )
    await writer.drain()
    writer.close()
    await writer.wait_closed()


async def start_health_server(host: str, port: int) -> asyncio.AbstractServer:
    return await asyncio.start_server(_handle, host, port)
