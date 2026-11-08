# Pink Promise

This repo contains:

- Frontend: Expo React Native app in `frontend/`
- Backend: Python API in `backend/`

## Frontend

```bash
cd frontend
npm install
npx expo start
```

The app opens on **Scam Coach**, a simulated scam-call trainer (see `CLAUDE_ScamSim.md`).
It runs in Expo Go. No backend, API keys or permissions are needed.

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # expo lint
npm test            # jest: scenario engine + debrief tests
```

Two scenarios open with real FTC robocall recordings from the
[Robocall Audio Dataset](https://github.com/wspr-ncsu/robocall-audio-dataset) (public domain).
Sources and the safety rule (no callback numbers) are in `frontend/assets/robocalls/SOURCES.md`.
To rebuild the clips (requires ffmpeg), run `python3 -I scripts/robocalls/build_clips.py --cache <empty dir>` from `frontend/`.

`frontend/.npmrc` sets `legacy-peer-deps=true` because a transitive `react-dom` peer range conflicts with React 19.3.

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## GitHub

```bash
git status
git add .
git commit -m "Initial project setup"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```
