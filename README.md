# Pink Promise

This repo contains:

- Frontend: web app in `frontend/`
- Backend: Python API in `backend/`

The app opens on **Scam Coach**, a simulated scam-call trainer (see `CLAUDE_ScamSim.md`).
The **backend** owns the scenarios, the step-by-step call flow and the debrief. It uses Claude to
write the scam caller's lines and to understand what the user types. The **app** plays the call
and shows what the backend returns.

## Backend (start this first)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then set ANTHROPIC_API_KEY
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file .env
pytest                      # engine, safety and API tests (no real model calls)
```

- **With a key:** Claude writes the caller's wording and maps typed replies to the scenario's allowed choices.
  The model defaults to `claude-opus-5-5` at low effort (`SCAM_COACH_MODEL`, `SCAM_COACH_EFFORT`).
  Server-side refusal fallback is on.
- **Without a key, or if the model fails or times out:** the caller uses the scripted lines and the user taps suggested replies.
  The call never stops because of the model.
- **What the model never decides:** which step comes next, or how choices are scored.
  Both come from the scenario files in `backend/app/simulator/scenarios/`.
- **Privacy:** numbers and emails in typed replies are removed before they reach the model.
  Caller lines that contain phone numbers, URLs or emails are replaced with the scripted line.
  Sessions live only in memory and expire after 30 minutes.
- **Transcripts:** when a call ends, the app saves a `.txt` transcript in its documents folder on the device
  (`call-transcripts/`), or downloads it on web. The debrief can share or delete it.
  The backend builds the text on request (`GET /simulator/sessions/{id}/transcript.txt`) and never writes it to disk.

## Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 4173
```

The web app looks for the backend on port 8000 of the local machine.
Set the API URL in your frontend config if it runs somewhere else.

```bash
npm run build
npm run lint
npm test
```

Two scenarios open with real FTC robocall recordings from the
[Robocall Audio Dataset](https://github.com/wspr-ncsu/robocall-audio-dataset) (public domain).
Sources and the safety rule (no callback numbers) are in `frontend/assets/robocalls/SOURCES.md`.
To rebuild the clips (requires ffmpeg), run `python3 -I scripts/robocalls/build_clips.py --cache <empty dir>` from `frontend/`.
The script writes the audio, the app's clip catalog and the backend's `recordings.json`.

`frontend/.npmrc` sets `legacy-peer-deps=true` because a transitive `react-dom` peer range conflicts with React 19.3.

## GitHub

```bash
git status
git add .
git commit -m "Initial project setup"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```
