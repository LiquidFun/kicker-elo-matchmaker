"""Create the initial admin user.

Usage: uv run python -m kicker.bootstrap <name> <password>
"""

import sys

from .auth import hash_password
from .db import SessionLocal, engine
from .models import Base, User


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("usage: bootstrap <name> <password>", file=sys.stderr)
        return 2
    _, name, password = argv
    name = name.strip()
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        if db.query(User).filter(User.name == name).first():
            print(f"user {name!r} already exists", file=sys.stderr)
            return 1
        db.add(
            User(
                name=name,
                role="admin",
                password_hash=hash_password(password),
            )
        )
        db.commit()
    print(f"created admin {name!r}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
