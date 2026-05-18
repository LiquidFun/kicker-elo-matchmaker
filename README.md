# Kicker - try the public instance at [kicker-public.brutenis.net](https://kicker-public.brutenis.net)

Foosball elo tracker used to find the fairest matching.

Players have three independent ratings (attacker, defender, singles) so the guy who anchors defense isn't penalized for being dragged onto offense once. The rating update isn't pure win/loss either - a 5-4 loss against a much stronger team can still gain you points, which keeps the math honest on a small roster where the same pair would otherwise farm easy wins forever.

There's also a balance helper: drop in four players and it enumerates the three possible team splits (and which side plays which position) and ranks them by how close to 50/50 the predicted win probability is.

## Stack

- Backend: FastAPI + SQLAlchemy + Alembic, SQLite by default. Argon2 for passwords, signed cookies for sessions.
- Frontend: React + Vite + Tailwind, React Query for data, Zustand for local UI state.

## Running it locally

You need `uv`, `npm`, and (for the convenience script) `firejail`.

```sh
./start.sh
```

That brings up the backend on `:8000` and the frontend on `:5173`, both sandboxed, with logs in `./logs/`. Ctrl+C kills both.

If you'd rather run them by hand:

```sh
# backend
cd backend && uv run uvicorn kicker.main:app --reload

# frontend
cd frontend && npm install && npm run dev
```

## Tests

```sh
cd backend && uv run pytest
```

The Elo math lives in `backend/src/kicker/elo.py` and is pure - no DB, no I/O - so most of the interesting test coverage is there.

## Config

Backend settings are read from `backend/.env` with the `KICKER_` prefix. The defaults are fine for local dev; for anything reachable from outside localhost you'll at least want to set `KICKER_SECRET_KEY`, `KICKER_COOKIE_SECURE=true`, and the right `KICKER_CORS_ORIGINS` / `KICKER_PUBLIC_BASE_URL`.

Uploaded avatars and the SQLite file go under `backend/storage/` and `backend/kicker.db` respectively. Back those up if you care about the data.
