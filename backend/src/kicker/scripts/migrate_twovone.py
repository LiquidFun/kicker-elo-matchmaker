"""Migrate database to support 2v1 mode.

- Rebuilds match_players with PK (match_id, user_id, position) so the solo
  player can have two rows (attacker + defender).
- Rebuilds matches to update mode CHECK and add penalty_before column.

Idempotent: skips if penalty_before column already exists on matches.

Usage:
  uv run python -m kicker.scripts.migrate_twovone [db-path]
"""

from __future__ import annotations

import sqlite3
import sys
from pathlib import Path


def _has_column(con: sqlite3.Connection, table: str, column: str) -> bool:
    return any(row[1] == column for row in con.execute(f"PRAGMA table_info({table})"))


def migrate(db_path: Path) -> None:
    if not db_path.exists():
        raise SystemExit(f"db not found: {db_path}")

    con = sqlite3.connect(db_path)
    con.execute("PRAGMA foreign_keys = OFF")

    if _has_column(con, "matches", "penalty_before"):
        print("already migrated (matches.penalty_before exists), skipping")
        con.close()
        return

    # Step 1: Rebuild match_players with (match_id, user_id, position) PK
    print("rebuilding match_players with expanded PK...")
    con.executescript("""
        BEGIN;

        CREATE TABLE match_players_new (
            match_id      INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
            user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
            position      VARCHAR(16) NOT NULL,
            team          INTEGER NOT NULL,
            rating_before FLOAT NOT NULL,
            rating_after  FLOAT NOT NULL,
            rating_delta  FLOAT NOT NULL,
            PRIMARY KEY (match_id, user_id, position),
            CHECK (team IN (1, 2)),
            CHECK (position IN ('attacker', 'defender', 'singles'))
        );

        INSERT INTO match_players_new
            (match_id, user_id, position, team, rating_before, rating_after, rating_delta)
        SELECT match_id, user_id, position, team, rating_before, rating_after, rating_delta
        FROM match_players;

        DROP TABLE match_players;
        ALTER TABLE match_players_new RENAME TO match_players;

        CREATE INDEX ix_match_players_user ON match_players(user_id);

        COMMIT;
    """)
    n = con.execute("SELECT COUNT(*) FROM match_players").fetchone()[0]
    print(f"  migrated {n} match_player rows")

    # Step 2: Rebuild matches to update mode CHECK + add penalty_before
    print("rebuilding matches (add penalty_before, update mode CHECK)...")
    con.executescript("""
        BEGIN;

        CREATE TABLE matches_new (
            id                 INTEGER PRIMARY KEY,
            mode               VARCHAR(16) NOT NULL,
            goals_to_win       INTEGER NOT NULL,
            team1_score        INTEGER NOT NULL,
            team2_score        INTEGER NOT NULL,
            winner_team        INTEGER NOT NULL,
            created_at         DATETIME NOT NULL,
            created_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
            organization_id    INTEGER NOT NULL DEFAULT 1
                                   REFERENCES organizations(id) ON DELETE RESTRICT,
            penalty_before     FLOAT,
            CHECK (mode IN ('doubles', 'singles', '2v1')),
            CHECK (winner_team IN (1, 2))
        );

        INSERT INTO matches_new
            (id, mode, goals_to_win, team1_score, team2_score, winner_team,
             created_at, created_by_user_id, organization_id)
        SELECT id, mode, goals_to_win, team1_score, team2_score, winner_team,
               created_at, created_by_user_id, organization_id
        FROM matches;

        DROP TABLE matches;
        ALTER TABLE matches_new RENAME TO matches;

        CREATE INDEX ix_matches_created_at ON matches(created_at);
        CREATE INDEX ix_matches_org ON matches(organization_id);

        COMMIT;
    """)
    n = con.execute("SELECT COUNT(*) FROM matches").fetchone()[0]
    print(f"  migrated {n} matches")

    # Step 3: Verify foreign key integrity
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
