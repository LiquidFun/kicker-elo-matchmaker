"""Migrate existing database to support organizations.

Creates the organizations table, adds organization_id FK to users and matches,
rebuilds the settings table with a composite PK, and updates the role CHECK
constraint to allow 'moderator'.

All existing data is assigned to a "Default" organization (id=1).

Idempotent: skips steps that have already been applied.

Usage:
  uv run python -m kicker.scripts.migrate_orgs [db-path]
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path


def _has_column(con: sqlite3.Connection, table: str, column: str) -> bool:
    return any(row[1] == column for row in con.execute(f"PRAGMA table_info({table})"))


def _has_table(con: sqlite3.Connection, table: str) -> bool:
    row = con.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def migrate(db_path: Path) -> None:
    if not db_path.exists():
        raise SystemExit(f"db not found: {db_path}")

    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = OFF")

    # Step 1: Create organizations table
    if not _has_table(con, "organizations"):
        print("creating organizations table...")
        con.execute("""
            CREATE TABLE organizations (
                id         INTEGER PRIMARY KEY,
                name       VARCHAR(128) NOT NULL UNIQUE,
                created_at DATETIME NOT NULL DEFAULT (datetime('now'))
            )
        """)
        con.execute("INSERT INTO organizations (id, name) VALUES (1, 'Default')")
        con.commit()
        print("  inserted Default organization (id=1)")
    else:
        print("organizations table already exists, skipping")

    # Step 2: Add organization_id to users + update role CHECK
    if not _has_column(con, "users", "organization_id"):
        print("rebuilding users table (add organization_id, update role CHECK)...")
        con.executescript("""
            BEGIN;

            CREATE TABLE users_new (
                id                 INTEGER PRIMARY KEY,
                name               VARCHAR(128) COLLATE NOCASE NOT NULL UNIQUE,
                avatar_url         VARCHAR(512),
                role               VARCHAR(16) NOT NULL DEFAULT 'user',
                password_hash      VARCHAR(256),
                organization_id    INTEGER NOT NULL DEFAULT 1
                                       REFERENCES organizations(id) ON DELETE RESTRICT,
                rating_attacker    FLOAT NOT NULL DEFAULT 1600.0,
                rating_defender    FLOAT NOT NULL DEFAULT 1600.0,
                rating_singles     FLOAT NOT NULL DEFAULT 1600.0,
                games_attacker     INTEGER NOT NULL DEFAULT 0,
                games_defender     INTEGER NOT NULL DEFAULT 0,
                games_singles      INTEGER NOT NULL DEFAULT 0,
                created_at         DATETIME NOT NULL,
                deleted_at         DATETIME,
                created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                CHECK (role IN ('admin', 'moderator', 'user'))
            );

            INSERT INTO users_new (
                id, name, avatar_url, role, password_hash, organization_id,
                rating_attacker, rating_defender, rating_singles,
                games_attacker, games_defender, games_singles,
                created_at, deleted_at, created_by_user_id
            )
            SELECT
                id, name, avatar_url, role, password_hash, 1,
                rating_attacker, rating_defender, rating_singles,
                games_attacker, games_defender, games_singles,
                created_at, deleted_at, created_by_user_id
            FROM users;

            DROP TABLE users;
            ALTER TABLE users_new RENAME TO users;

            CREATE INDEX ix_users_name ON users(name);
            CREATE INDEX ix_users_org ON users(organization_id);

            COMMIT;
        """)
        print(f"  migrated {con.execute('SELECT COUNT(*) FROM users').fetchone()[0]} users")
    else:
        print("users.organization_id already exists, skipping")

    # Step 3: Add organization_id to matches
    if not _has_column(con, "matches", "organization_id"):
        print("adding organization_id to matches...")
        con.execute(
            "ALTER TABLE matches ADD COLUMN organization_id INTEGER NOT NULL DEFAULT 1 "
            "REFERENCES organizations(id) ON DELETE RESTRICT"
        )
        con.execute("CREATE INDEX ix_matches_org ON matches(organization_id)")
        con.commit()
        print(f"  updated {con.execute('SELECT COUNT(*) FROM matches').fetchone()[0]} matches")
    else:
        print("matches.organization_id already exists, skipping")

    # Step 4: Rebuild settings table with composite PK (organization_id, key)
    if not _has_column(con, "settings", "organization_id"):
        print("rebuilding settings table with composite PK...")
        con.executescript("""
            BEGIN;

            CREATE TABLE settings_new (
                organization_id INTEGER NOT NULL
                                    REFERENCES organizations(id) ON DELETE CASCADE,
                key             VARCHAR(64) NOT NULL,
                value           VARCHAR(256) NOT NULL,
                updated_at      DATETIME NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (organization_id, key)
            );

            INSERT INTO settings_new (organization_id, key, value, updated_at)
            SELECT 1, key, value, updated_at FROM settings;

            DROP TABLE settings;
            ALTER TABLE settings_new RENAME TO settings;

            COMMIT;
        """)
        print("  settings table rebuilt")
    else:
        print("settings.organization_id already exists, skipping")

    # Step 5: Verify foreign key integrity
    con.execute("PRAGMA foreign_keys = ON")
    violations = list(con.execute("PRAGMA foreign_key_check"))
    if violations:
        print(f"WARNING: foreign key violations: {violations}")
    else:
        print("foreign key check passed")

    con.close()
    print("migration complete")


if __name__ == "__main__":
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("storage/kicker.db")
    migrate(path)
