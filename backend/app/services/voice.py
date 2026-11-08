from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

try:
    from twilio.twiml.voice_response import Gather, VoiceResponse
except Exception:  # pragma: no cover - dependency may be absent during local demo builds
    Gather = None
    VoiceResponse = None

router = APIRouter(prefix="/voice", tags=["voice"])

FREE_FALLBACK = (
    "Hi, this is the Pink Promise scam-defense coach. "
    "I’m here to help you spot pressure tactics and keep your information safe."
)


def voice_mode() -> str:
    if os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN"):
        return "live"
    return "demo"


def provider_ready() -> bool:
    return bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))


def get_scammer_reply(user_text: str, transcript_history: str = "") -> str:
    if not provider_ready():
        return (
            "I’m calling from your bank and I need to verify your account immediately. "
            "Please do not share your password or one-time code. I can help you pause this if you stay calm."
        )

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    prompt = (
        "You are a scammer in a short scam-awareness demo. "
        "Keep the response brief, natural, and slightly pressuring, but never abusive. "
        "Do not say you are an AI. The user is trying to practice detecting a scam. "
        "Respond as a real scam voice in one or two sentences.\n\n"
        f"Recent transcript:\n{transcript_history}\n\nUser says: {user_text}"
    )

    try:
        # Prefer the official Google SDK when installed; otherwise fall back to the scripted demo.
        from google import genai

        client = genai.Client(api_key=api_key)
        model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
        response = client.models.generate_content(model=model, contents=prompt)
        text = getattr(response, "text", None) or str(response)
        return text.strip() or FREE_FALLBACK
    except Exception:
        return (
            "I’m calling from your bank and I need to verify your account immediately. "
            "Please do not share your password or one-time code. I can help you pause this if you stay calm."
        )


def build_twilio_ttml(prompt: str) -> str:
    if Gather is None or VoiceResponse is None:
        raise RuntimeError("Twilio voice dependencies are not available.")

    response = VoiceResponse()
    gather = Gather(input="speech", action="/voice/next", method="POST", timeout=3, speechTimeout=3)
    gather.say(prompt, voice="man")
    response.append(gather)
    return str(response)


def build_twilio_xml_say(text: str) -> str:
    if VoiceResponse is None:
        raise RuntimeError("Twilio voice dependencies are not available.")
    return str(VoiceResponse().say(text, voice="man"))


@router.get("/status")
async def get_voice_status() -> dict[str, Any]:
    return {
        "mode": voice_mode(),
        "provider": "Twilio + Gemini" if provider_ready() else "demo-scripted",
        "free_demo_mode": not bool(os.getenv("TWILIO_ACCOUNT_SID") and os.getenv("TWILIO_AUTH_TOKEN")),
    }


@router.get("/start")
@router.post("/start")
async def start_call() -> Response:
    prompt = "Hello, this is the Pink Promise scam-awareness coach. Please say hello to start the call."
    xml = build_twilio_ttml(prompt) if voice_mode() == "live" else build_twilio_xml_say(prompt)
    return Response(content=xml, media_type="application/xml")


@router.post("/trigger-call")
async def trigger_call(request: Request) -> JSONResponse:
    if voice_mode() == "demo":
        return JSONResponse({
            "status": "demo",
            "message": "Twilio is not configured yet. The app is running in free demo mode.",
        })

    try:
        payload = await request.json()
    except Exception:
        payload = {}

    to_number = payload.get("to") or os.getenv("TWILIO_TO_NUMBER")
    if not to_number:
        return JSONResponse({
            "status": "error",
            "message": "Provide a destination number in the request body or set TWILIO_TO_NUMBER.",
        }, status_code=400)

    try:
        from twilio.base.exceptions import TwilioRestException
        from twilio.rest import Client

        base_url = os.getenv("TWILIO_WEBHOOK_BASE_URL", "http://localhost:8000").rstrip("/")
        client = Client(os.getenv("TWILIO_ACCOUNT_SID"), os.getenv("TWILIO_AUTH_TOKEN"))
        call = client.calls.create(
            to=to_number,
            from_=os.getenv("TWILIO_PHONE_NUMBER"),
            url=f"{base_url}/voice/start",
            method="POST",
        )
        return JSONResponse({
            "status": "live",
            "call_sid": call.sid,
            "to": to_number,
            "webhook": f"{base_url}/voice/start",
        })
    except TwilioRestException as exc:
        detail = exc.msg or str(exc)
        message = (
            "Twilio rejected the call request. This usually happens on a trial account when the webhook or parameter set is restricted. "
            "Use a paid Twilio account or a Twilio-hosted template URL, and make sure the destination number is verified."
        )
        if "trial" in detail.lower() or "limited parameter access" in detail.lower():
            message = (
                "This Twilio account is in trial mode and cannot use a custom webhook URL to start the call. "
                "Upgrade the account or switch to a Twilio-hosted template, then verify the destination number."
            )
        return JSONResponse({
            "status": "error",
            "message": message,
            "twilio_detail": detail,
        }, status_code=400)
    except Exception as exc:  # pragma: no cover - runtime dependency / creds required
        return JSONResponse({
            "status": "error",
            "message": str(exc),
        }, status_code=500)


@router.get("/next")
@router.post("/next")
async def next_turn(request: Request) -> Response:
    transcript = ""
    try:
        form = await request.form()
        transcript = form.get("SpeechResult") or form.get("Transcript") or ""
    except Exception:
        try:
            payload = await request.json()
            transcript = payload.get("SpeechResult") or payload.get("Transcript") or ""
        except Exception:
            transcript = ""

    reply = get_scammer_reply(transcript, transcript_history=transcript)

    if voice_mode() == "demo":
        return Response(content=build_twilio_xml_say(reply), media_type="application/xml")

    return Response(content=build_twilio_ttml(reply), media_type="application/xml")
