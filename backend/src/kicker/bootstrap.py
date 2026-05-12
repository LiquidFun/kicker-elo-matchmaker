"""Create the initial admin user.

Usage: uv run python -m kicker.bootstrap <username> <display_name> <password>
"""

import sys

from .auth import hash_password
from .db import SessionLocal, engine
from .models import Base, User


def main(argv: list[str]) -> int:
    if len(argv) != 4:
        print("usage: bootstrap <username> <display_name> <password>", file=sys.stderr)
        return 2
    _, username, display_name, password = argv
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if db.query(User).filter(User.username == username).first():
            print(f"user {username!r} already exists", file=sys.stderr)
            return 1
        db.add(
            User(
                username=username,
                display_name=display_name,
                role="admin",
                password_hash=hash_password(password),
            )
        )
        db.commit()
    print(f"created admin {username!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
