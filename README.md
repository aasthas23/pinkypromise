# Pink Promise

This repo contains:

- Frontend: web app in `frontend/`
- Backend: Python API in `backend/`

The app's **Practice calls** are live AI scam-call simulations, set in fictional T-Mobile scenarios.
You talk to an AI caller as if it were a real phone call. Google Gemini runs the conversation and the speech,
so one `GEMINI_API_KEY` is all you need, and the scenarios draw on real FTC robocall transcripts. The **backend**
holds all keys, runs the conversation and saves transcripts. The **app** handles the microphone,
plays the caller's voice and shows the live transcript.

## Backend (start this first)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then set GEMINI_API_KEY (https://aistudio.google.com/apikey)
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --env-file .env
pytest                      # all tests use fake API clients: no network, no cost
```

- **Conversation:** Gemini `gemini-3.5-flash-lite` (`SCAM_COACH_GEMINI_MODEL`) with thinking at `MINIMAL`, for quick spoken replies.
  It gets the whole call history every turn and streams its replies sentence by sentence.
  Per-turn labels for scoring use JSON-schema output.
  Code: `app/simulator/live/gemini_llm.py`, with the prompts in `conversation.py`.
- **Speech:** Gemini transcribes what you say (`gemini-3.5-flash-lite`, audio sent inline).
  The caller's voice is `gemini-3.8-flash-lite-tts` (voice `Kore`), sent to the browser as WAV.
  Code: `app/simulator/live/gemini_speech.py`.
- **Other providers:** set `SCAM_COACH_LLM_PROVIDER` to `openai` or `anthropic`, and `SCAM_COACH_SPEECH_PROVIDER` to `openai`.
  `openai_llm.py`, the Claude code in `conversation.py`, and `speech.py` hold those implementations.
- **Grounding:** `data/robocall_transcripts.jsonl` holds 568 redacted real robocall transcripts from the FTC dataset (see `data/README.md`).
  Each call retrieves 4 transcripts that match its scenario and passes them to the model as patterns to adapt, never to quote.
  Code: `app/simulator/live/corpus.py`; scenarios in `app/simulator/live/scenarios.py`.
- **Scoring:** after each turn, the exchange is labelled with a fixed list of tactics and user actions.
  The debrief's outcomes come from those labels, the user's 🚩 taps and how the call ended, using fixed rules.
- **Transcripts:** saved automatically when a call ends, to `data/call_transcripts/<scenario>_<date>_<time>_<id>_transcript.txt`.
  This folder is ignored by git.
- **Privacy:** keys stay on the server. Numbers and emails are removed from what the user says before it reaches the model or the transcript.
  Recordings are transcribed and discarded. Caller lines with phone numbers, URLs or emails are dropped.
- **Without a key:** practice calls fall back to the scripted demo call.

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
