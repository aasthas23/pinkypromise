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
