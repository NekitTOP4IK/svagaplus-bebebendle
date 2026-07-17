"""Logging setup for PM2 (stdout; every message is a str)."""

from __future__ import annotations

import logging
import sys


class StringOnlyFilter(logging.Filter):
    """PM2 and most process managers expect record.msg to be a string."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not isinstance(record.msg, str):
            record.msg = str(record.msg)
        return True


def setup_logging(level: int = logging.INFO) -> None:
    """Configure root logging to stdout for PM2 capture."""
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(level)

    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    handler.addFilter(StringOnlyFilter())
    handler.setFormatter(
        logging.Formatter(
            fmt="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root.addHandler(handler)

    logging.getLogger("aiogram").setLevel(logging.WARNING)
    logging.getLogger("aiohttp").setLevel(logging.WARNING)
    logging.getLogger("asyncio").setLevel(logging.WARNING)
