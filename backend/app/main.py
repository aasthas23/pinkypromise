import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.simulator.api import router as simulator_router
from app.simulator.dialogue import create_dialogue
from app.simulator.service import SimulatorService

logging.basicConfig(level=os.environ.get('LOG_LEVEL', 'INFO'))

app = FastAPI(title="Pink Promise API")

# The API uses no cookies or auth headers, so a wildcard origin is safe for local
# dev and Expo web. Set ALLOWED_ORIGINS (comma-separated) to lock it down.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.environ.get('ALLOWED_ORIGINS', '*').split(',')],
    allow_methods=['GET', 'POST', 'DELETE'],
    allow_headers=['Content-Type'],
    expose_headers=['Content-Disposition'],  # lets the app read the transcript filename
)

app.state.simulator = SimulatorService(create_dialogue())
app.include_router(simulator_router)


@app.get("/")
async def read_root() -> dict[str, str]:
    return {"message": "Pink Promise backend is running"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
