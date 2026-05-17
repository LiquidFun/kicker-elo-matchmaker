"""One-shot migration: collapse username/display_name/email into a single 'name'.

  - Uses the existing display_name as the new name (verbatim).
  - Drops email entirely.
  - Drops username (was the lowercase slug login id).
  - Adds case-insensitive uniqueness on name via COLLATE NOCASE.

Requires SQLite >= 3.35 (DROP COLUMN) and >= 3.25 (RENAME COLUMN). Both ship in
Python 3.12 on any modern OS.

Usage:
  uv run python migrate_user_columns.py            # default kicker.db
  uv run python migrate_user_columns.py path.db    # explicit
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path


def migrate(db_path: Path) -> None:
    if not db_path.exists():
        raise SystemExit(f"db not found: {db_path}")

    con = sqlite3.connect(db_path)

    cols = {row[1] for row in con.execute("PRAGMA table_info(users)")}

    already_done = "name" in cols and "username" not in cols and "display_name" not in cols
    if already_done:
        print("nothing to do — schema already migrated")
        con.close()
        return

    if "display_name" not in cols or "username" not in cols:
        raise SystemExit(
            f"unexpected schema (cols={sorted(cols)}); aborting to avoid data loss"
        )

    # SQLite-recommended pattern for altering a table referenced by FKs:
    # disable FKs, recreate, copy, swap, verify, re-enable.
    # https://www.sqlite.org/lang_altertable.html#otheralter
    print("creating new users table…")
    con.execute("PRAGMA foreign_keys = OFF")
    try:
        con.executescript(
            """
            BEGIN;

            CREATE TABLE users_new (
                id              INTEGER PRIMARY KEY,
                name            VARCHAR(128) COLLATE NOCASE NOT NULL UNIQUE,
                avatar_url      VARCHAR(512),
                role            VARCHAR(16) NOT NULL DEFAULT 'user',
                password_hash   VARCHAR(256),
                rating_attacker FLOAT NOT NULL DEFAULT 1600.0,
                rating_defender FLOAT NOT NULL DEFAULT 1600.0,
                rating_singles  FLOAT NOT NULL DEFAULT 1600.0,
                games_attacker  INTEGER NOT NULL DEFAULT 0,
                games_defender  INTEGER NOT NULL DEFAULT 0,
                games_singles   INTEGER NOT NULL DEFAULT 0,
                created_at      DATETIME NOT NULL,
                deleted_at      DATETIME,
                created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                CHECK (role IN ('admin', 'user'))
            );

            INSERT INTO users_new (
                id, name, avatar_url, role, password_hash,
                rating_attacker, rating_defender, rating_singles,
                games_attacker, games_defender, games_singles,
                created_at, deleted_at, created_by_user_id
            )
            SELECT
                id, display_name, avatar_url, role, password_hash,
                rating_attacker, rating_defender, rating_singles,
                games_attacker, games_defender, games_singles,
                created_at, deleted_at, created_by_user_id
            FROM users;

            DROP TABLE users;
            ALTER TABLE users_new RENAME TO users;

            CREATE INDEX ix_users_name ON users(name);

            COMMIT;
            """
        )
        violations = list(con.execute("PRAGMA foreign_key_check"))
        if violations:
            raise SystemExit(f"foreign key violations after migration: {violations}")
    finally:
        con.execute("PRAGMA foreign_keys = ON")

    print(f"migrated {con.execute('SELECT COUNT(*) FROM users').fetchone()[0]} rows")
    con.close()


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("kicker.db")
    migrate(path)
