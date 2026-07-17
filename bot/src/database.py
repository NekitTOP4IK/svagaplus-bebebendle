"""Database module for connecting to the shared PostgreSQL database."""

from __future__ import annotations

import json
import logging
import os
from datetime import UTC, datetime

import asyncpg
from scipy.spatial.distance import cosine
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


class PendingSuggestionLimitError(Exception):
    """Raised when a user already has 6+ pending suggestions."""


class UserBannedError(Exception):
    """Raised when a banned user tries to submit."""

    def __init__(self, reason: str = "") -> None:
        self.reason = reason
        super().__init__(reason or "user banned")


class Database:
    """Async database connection handler for PostgreSQL."""

    def __init__(self) -> None:
        """Initialize database connection."""
        self.connection: asyncpg.Connection | None = None
        self.pool: asyncpg.Pool | None = None
        self._emb_model: SentenceTransformer | None = None

    @property
    def emb_model(self) -> SentenceTransformer:
        if self._emb_model is None:
            logger.info("Loading embedding model (first use)...")
            self._emb_model = SentenceTransformer("sergeyzh/rubert-mini-frida")
        return self._emb_model

    async def connect(self) -> None:
        """Establish database connection pool."""
        pool_max = int(os.getenv("DB_POOL_MAX", "3"))
        database_url = os.getenv("DATABASE_URL")
        if database_url:
            self.pool = await asyncpg.create_pool(
                dsn=database_url,
                min_size=1,
                max_size=pool_max,
            )
            logger.info("Connected to PostgreSQL via DATABASE_URL")
            return

        host = os.getenv("POSTGRES_HOST", "localhost")
        port = int(os.getenv("POSTGRES_PORT", "5432"))
        database = os.getenv("POSTGRES_DB", "bebendle")
        user = os.getenv("POSTGRES_USER", "postgres")
        password = os.getenv("POSTGRES_PASSWORD", "postgres")

        self.pool = await asyncpg.create_pool(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password,
            min_size=1,
            max_size=pool_max,
        )
        logger.info(
            "Connected to PostgreSQL database=%s host=%s port=%s",
            str(database),
            str(host),
            str(port),
        )

    async def close(self) -> None:
        """Close database connection pool."""
        if self.pool:
            await self.pool.close()
            self.pool = None
            logger.debug("Database connection pool closed")

    def get_icon(self, name: str, description: str) -> str:
        full_name = name + "\n" + description
        embeddings = self.emb_model.encode([full_name])
        res: list[list[object]] = []

        with open("src/emb_map.json") as j:
            emb_map = json.load(j)

        for k, v in emb_map.items():
            res.append([k, 1 - cosine(embeddings[0], v)])

        min_cos = max(res, key=lambda x: x[1])  # type: ignore[arg-type, return-value]
        return str(min_cos[0])

    async def count_pending_scrans(self, telegram_id: str) -> int:
        """Count pending (not approved) scrans for a user."""
        if not self.pool:
            raise RuntimeError("Database not connected")
        async with self.pool.acquire() as connection:
            count = await connection.fetchval(
                """
                SELECT COUNT(*) FROM scrans
                WHERE telegram_id = $1 AND approved = false
                  AND COALESCE(rejected, false) = false
                """,
                telegram_id,
            )
            return count or 0

    async def get_active_ban_reason(self, telegram_id: str) -> str | None:
        """Return ban reason if telegram_id has an active ban, else None."""
        if not self.pool:
            raise RuntimeError("Database not connected")
        async with self.pool.acquire() as connection:
            row = await connection.fetchrow(
                """
                SELECT reason FROM user_bans
                WHERE telegram_id = $1 AND active = true
                LIMIT 1
                """,
                telegram_id,
            )
            if not row:
                return None
            return str(row["reason"] or "")

    async def is_user_banned(self, telegram_id: str) -> bool:
        return (await self.get_active_ban_reason(telegram_id)) is not None

    async def insert_scran(
        self,
        image_url: str,
        name: str,
        description: str | None,
        price: float,
        telegram_id: str,
        is_subscriber: bool | None,
        subscriber_checked_at: datetime | None,
    ) -> int:
        """Insert a new scran into the database.

        Uses a transaction advisory lock so concurrent confirmations cannot both
        pass the six-pending-suggestions cap.
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        icon = self.get_icon(name, description or "")

        async with self.pool.acquire() as connection, connection.transaction():
            try:
                telegram_int = int(telegram_id)
            except (ValueError, TypeError) as exc:
                raise ValueError("Invalid telegram_id") from exc

            await connection.execute("SELECT pg_advisory_xact_lock($1)", telegram_int)

            ban_reason = await connection.fetchval(
                """
                SELECT reason FROM user_bans
                WHERE telegram_id = $1 AND active = true
                LIMIT 1
                """,
                telegram_id,
            )
            if ban_reason is not None:
                raise UserBannedError(str(ban_reason or ""))

            pending = await connection.fetchval(
                """
                SELECT COUNT(*) FROM scrans
                WHERE telegram_id = $1 AND approved = false
                  AND COALESCE(rejected, false) = false
                """,
                telegram_id,
            )
            if pending is not None and pending >= 6:
                raise PendingSuggestionLimitError()

            user_id = await connection.fetchval(
                "SELECT id FROM users WHERE telegram_id = $1 LIMIT 1",
                telegram_int,
            )

            scran_id = await connection.fetchval(
                """
                INSERT INTO scrans (
                    image_url, name, description, price,
                    number_of_likes, number_of_dislikes, approved, rejected, telegram_id, icon,
                    is_subscriber_at_submit, subscriber_checked_at, submitted_by_user_id
                ) VALUES ($1, $2, $3, $4, 0, 0, false, false, $5, $6, $7, $8, $9)
                RETURNING id
                """,
                image_url,
                name,
                description,
                price,
                telegram_id,
                icon,
                is_subscriber,
                _naive_utc(subscriber_checked_at),
                user_id,
            )

        if scran_id is None:
            raise RuntimeError("Failed to get ID after insert")
        logger.info(
            "Inserted scran id=%s name=%s is_subscriber_at_submit=%s",
            str(scran_id),
            str(name),
            str(is_subscriber),
        )
        return int(scran_id)

    async def get_user_scrans(self, telegram_id: str) -> list[dict]:
        """Get all scrans suggested by a specific user.

        Args:
            telegram_id: Telegram user ID

        Returns:
            List of scran dictionaries
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT
                  s.id,
                  s.name,
                  s.approved,
                  s.rejected,
                  s.is_subscriber_at_submit,
                  d.date
                FROM scrans s
                LEFT JOIN daily_scrandles d ON
                    s.id = d.scran_a_id OR s.id = d.scran_b_id
                WHERE telegram_id = $1
                ORDER BY id DESC
                LIMIT 50;
                """,
                telegram_id,
            )

        return [
            {
                "id": row["id"],
                "name": row["name"],
                "approved": row["approved"],
                "rejected": bool(row["rejected"]) if row["rejected"] is not None else False,
                "is_subscriber_at_submit": row["is_subscriber_at_submit"],
                "date": row["date"],
            }
            for row in rows
        ]

    async def get_scran_by_id(self, scran_id: int) -> dict | None:
        """Get a scran by its ID.

        Args:
            scran_id: Scran ID

        Returns:
            Scran dictionary or None if not found
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as connection:
            row = await connection.fetchrow(
                "SELECT id, name, approved, telegram_id FROM scrans WHERE id = $1",
                scran_id,
            )

        if not row:
            return None

        return {
            "id": row["id"],
            "name": row["name"],
            "approved": row["approved"],
            "telegram_id": row["telegram_id"],
        }

    async def approve_scran(self, scran_id: int) -> bool:
        """Approve a scran.

        Args:
            scran_id: Scran ID to approve

        Returns:
            True if approved successfully
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as connection:
            await connection.execute(
                "UPDATE scrans SET approved = true WHERE id = $1",
                scran_id,
            )

        logger.info("Approved scran id=%s", str(scran_id))
        return True

    async def get_least_voted_scrans(
        self, limit: int = 10, telegram_id: str | None = None
    ) -> list[dict]:
        """Get scrans with least votes that user hasn't voted for yet.

        Args:
            limit: Number of scrans to return
            telegram_id: Optional Telegram user ID to exclude already-voted scrans

        Returns:
            List of scran dictionaries with image_url
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as connection:
            if telegram_id:
                rows = await connection.fetch(
                    """
                    SELECT s.id, s.image_url, s.name, s.description, s.price,
                           s.number_of_likes, s.number_of_dislikes,
                           (s.number_of_likes + s.number_of_dislikes) as total_votes
                    FROM scrans s
                    WHERE s.approved = true
                      AND s.id NOT IN (
                          SELECT tv.scran_id
                          FROM telegram_votes tv
                          WHERE tv.telegram_id = $1
                      )
                    ORDER BY total_votes ASC, RANDOM()
                    LIMIT $2
                    """,
                    telegram_id,
                    limit,
                )
            else:
                rows = await connection.fetch(
                    """
                    SELECT id, image_url, name, description, price,
                           number_of_likes, number_of_dislikes,
                           (number_of_likes + number_of_dislikes) as total_votes
                    FROM scrans
                    WHERE approved = true
                    ORDER BY total_votes ASC, RANDOM()
                    LIMIT $1
                    """,
                    limit,
                )

        return [
            {
                "id": row["id"],
                "image_url": row["image_url"],
                "name": row["name"],
                "description": row["description"],
                "price": row["price"],
                "number_of_likes": row["number_of_likes"],
                "number_of_dislikes": row["number_of_dislikes"],
            }
            for row in rows
        ]

    async def get_random_scran(self, exclude_id: int | None = None) -> dict | None:
        """Get a random approved scran.

        Args:
            exclude_id: Optional scran ID to exclude

        Returns:
            Scran dictionary or None if not found
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as connection:
            if exclude_id:
                row = await connection.fetchrow(
                    """
                    SELECT id, image_url, name, description, price,
                           number_of_likes, number_of_dislikes
                    FROM scrans
                    WHERE approved = true AND id != $1
                    ORDER BY RANDOM()
                    LIMIT 1
                    """,
                    exclude_id,
                )
            else:
                row = await connection.fetchrow(
                    """
                    SELECT id, image_url, name, description, price,
                           number_of_likes, number_of_dislikes
                    FROM scrans
                    WHERE approved = true
                    ORDER BY RANDOM()
                    LIMIT 1
                    """,
                )

        if not row:
            return None

        return {
            "id": row["id"],
            "image_url": row["image_url"],
            "name": row["name"],
            "description": row["description"],
            "price": row["price"],
            "number_of_likes": row["number_of_likes"],
            "number_of_dislikes": row["number_of_dislikes"],
        }

    async def vote_for_scran(self, scran_id: int, is_like: bool) -> bool:
        """Add a like or dislike to a scran.

        Args:
            scran_id: Scran ID to vote for
            is_like: True for like, False for dislike

        Returns:
            True if vote was recorded successfully
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        column = "number_of_likes" if is_like else "number_of_dislikes"

        async with self.pool.acquire() as connection:
            await connection.execute(
                f"""
                UPDATE scrans
                SET {column} = {column} + 1
                WHERE id = $1
                """,
                scran_id,
            )

        logger.info(
            "%s added to scran id=%s",
            "Like" if is_like else "Dislike",
            str(scran_id),
        )
        return True

    async def get_voted_scran_ids(self, telegram_id: str) -> list[int]:
        """Get all scran IDs that a user has voted for.

        Args:
            telegram_id: Telegram user ID

        Returns:
            List of scran IDs
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as connection:
            rows = await connection.fetch(
                """
                SELECT scran_id
                FROM telegram_votes
                WHERE telegram_id = $1
                """,
                telegram_id,
            )

        return [row["scran_id"] for row in rows]

    async def record_telegram_vote(self, telegram_id: str, scran_id: int, is_like: bool) -> None:
        """Record a vote from Telegram user.

        Args:
            telegram_id: Telegram user ID
            scran_id: Scran ID that was voted for
            is_like: True for like, False for dislike
        """
        if not self.pool:
            raise RuntimeError("Database not connected")

        async with self.pool.acquire() as connection:
            await connection.execute(
                """
                INSERT INTO telegram_votes (telegram_id, scran_id, is_like, created_at)
                VALUES ($1, $2, $3, NOW())
                """,
                telegram_id,
                scran_id,
                is_like,
            )

        logger.info(
            "Telegram vote recorded telegram_id=%s scran_id=%s like=%s",
            str(telegram_id),
            str(scran_id),
            str(is_like),
        )
