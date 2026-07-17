#!/usr/bin/env python3
"""Staging-only: give approved scrans 20–30 votes and ensure ≥20 candidates for daily.

Daily needs MIN_SCRANS=20 with likes+dislikes > MIN_VOTES(10), and
getApprovedScransWithVotes uses DISTINCT ON (rating) — so ratings must be unique.

Run on staging host as deploy:
  python3 /home/deploy/seed-staging-daily-votes.py
"""
from __future__ import annotations

import random
import subprocess
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path

ENV_PATH = Path("/opt/bebebendle/shared/.env")
TARGET_APPROVED = 22
MIN_TOTAL = 20
MAX_TOTAL = 30
RNG = random.Random(20260717)


def env_val(key: str) -> str | None:
    for line in ENV_PATH.read_text().splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip().strip("\"'")
    return None


def psql(sql: str, *, tuples: bool = False) -> str:
    db = env_val("DATABASE_URL")
    if not db:
        raise SystemExit("DATABASE_URL missing in shared/.env")
    args = ["psql", db, "-v", "ON_ERROR_STOP=1"]
    if tuples:
        args += ["-tAc", sql]
    else:
        args += ["-c", sql]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr or r.stdout or "psql failed")
    return r.stdout


def esc(s: str) -> str:
    return s.replace("'", "''")


def rating(likes: int, dislikes: int) -> Decimal:
    total = likes + dislikes
    if total == 0:
        return Decimal("0")
    return (Decimal(likes) / Decimal(total)).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )


def main() -> None:
    raw = psql(
        "SELECT id, name, image_url, coalesce(description,''), price "
        "FROM scrans WHERE approved = true AND rejected = false ORDER BY id",
        tuples=True,
    )
    approved: list[dict[str, str | int]] = []
    for line in raw.strip().splitlines():
        if not line.strip():
            continue
        parts = line.split("|")
        if len(parts) < 5:
            raise RuntimeError(f"unexpected row: {line!r}")
        approved.append(
            {
                "id": int(parts[0]),
                "name": parts[1],
                "image_url": parts[2],
                "description": parts[3],
                "price": parts[4],
            }
        )

    print(f"approved before: {len(approved)}")

    need = max(0, TARGET_APPROVED - len(approved))
    if need:
        if not approved:
            raise SystemExit("no approved scrans to clone from")
        print(f"cloning {need} extra approved scrans for daily MIN_SCRANS=20 …")
        for i in range(need):
            src = approved[i % len(approved)]
            new_name = f"{src['name']} (seed {i + 1})"
            desc = str(src["description"] or "")
            desc_sql = f"'{esc(desc)}'" if desc else "NULL"
            sql = f"""
INSERT INTO scrans (
  image_url, name, description, price,
  number_of_likes, number_of_dislikes, approved, rejected
) VALUES (
  '{esc(str(src["image_url"]))}',
  '{esc(new_name)}',
  {desc_sql},
  {src["price"]},
  0, 0, true, false
) RETURNING id;
"""
            out = psql(sql, tuples=True).strip().splitlines()
            new_id = int(next(line for line in out if line.strip().isdigit()))
            approved.append(
                {
                    "id": new_id,
                    "name": new_name,
                    "image_url": src["image_url"],
                    "description": desc,
                    "price": src["price"],
                }
            )

    used_ratings: set[Decimal] = set()
    assignments: list[tuple[int, int, int]] = []

    for sc in approved:
        sid = int(sc["id"])
        found = False
        for _ in range(800):
            total = RNG.randint(MIN_TOTAL, MAX_TOTAL)
            likes = RNG.randint(max(1, total // 5), max(1, total - 1))
            dislikes = total - likes
            r = rating(likes, dislikes)
            if r not in used_ratings:
                used_ratings.add(r)
                assignments.append((sid, likes, dislikes))
                found = True
                break
        if not found:
            likes = 12 + (sid % 17)
            dislikes = 8 + (sid % 13)
            while rating(likes, dislikes) in used_ratings:
                likes += 1
            used_ratings.add(rating(likes, dislikes))
            assignments.append((sid, likes, dislikes))

    for sid, likes, dislikes in assignments:
        psql(
            "UPDATE scrans SET "
            f"number_of_likes = {likes}, number_of_dislikes = {dislikes} "
            f"WHERE id = {sid};"
        )

    print("\n=== after update (approved) ===")
    print(
        psql(
            """
SELECT id, left(name, 40) AS name, number_of_likes, number_of_dislikes,
       number_of_likes + number_of_dislikes AS total,
       round(
         number_of_likes::numeric
         / nullif(number_of_likes + number_of_dislikes, 0),
         2
       ) AS rating
FROM scrans
WHERE approved = true AND rejected = false
ORDER BY rating, id;
"""
        )
    )

    print("=== daily pool (distinct on rating, unused in daily) ===")
    print(
        psql(
            """
SELECT COUNT(*) AS distinct_on_rating_count FROM (
  SELECT DISTINCT ON (rating) id, rating
  FROM (
    SELECT s.id,
      round(
        s.number_of_likes::numeric
        / nullif(s.number_of_likes + s.number_of_dislikes, 0),
        2
      ) AS rating
    FROM scrans s
    WHERE s.approved = true
      AND s.rejected = false
      AND (s.number_of_likes + s.number_of_dislikes) > 10
      AND NOT EXISTS (
        SELECT 1 FROM daily_scrandles d
        WHERE d.scran_a_id = s.id OR d.scran_b_id = s.id
      )
  ) c
  ORDER BY rating, id
) x;
"""
        )
    )
    print("done — generate daily from admin when ready")


if __name__ == "__main__":
    main()
