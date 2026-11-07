"""Check Gnani TTS and STT credentials using one short synthesized phrase."""

from __future__ import annotations

import os
import sys
from pathlib import Path

import requests
from dotenv import load_dotenv


ROOT = Path(__file__).resolve().parent
TTS_URL = "https://api.vachana.ai/api/v1/tts/inference"
STT_URL = "https://api.vachana.ai/stt/v3"
TIMEOUT = 15
TEST_PHRASE = "Namaste, yeh ek test hai"


def show_http_error(status: int) -> str:
    """Explain common account setup errors without printing provider bodies."""
    if status == 401:
        return "Gnani rejected the API key. Check GNANI_API_KEY in .env."
    if status == 402:
        return "The Gnani account needs credits or activation."
    if status == 403:
        return "Gnani denied access. Check that the key is enabled for these APIs."
    if status == 429:
        return "Gnani is busy or another request is active. Wait, then run this check again."
    return f"Gnani returned HTTP {status}. Check the endpoint and account settings."


def main() -> int:
    load_dotenv(ROOT / ".env")
    key = os.getenv("GNANI_API_KEY", "").strip()
    if not key:
        print("GNANI_API_KEY is missing. Copy .env.example to .env and add your key there.")
        return 1

    headers = {"X-API-Key-ID": key}
    tts_body = {
        "text": TEST_PHRASE,
        "voice": "Poorvi",
        "model": "timbre-v2.5",
        "language": "hi-en",
        "speed": 1.0,
        "audio_config": {
            "sample_rate": 24_000,
            "num_channels": 1,
            "sample_width": 2,
            "encoding": "linear_pcm",
            "container": "wav",
        },
    }

    print("Checking Gnani Timbre TTS…")
    try:
        tts_response = requests.post(TTS_URL, headers=headers, json=tts_body, timeout=TIMEOUT)
    except requests.RequestException as exc:
        print(f"Could not reach Gnani TTS ({type(exc).__name__}). Check your connection.")
        return 1
    if not tts_response.ok:
        print(show_http_error(tts_response.status_code))
        return 1
    if not tts_response.content or "json" in tts_response.headers.get("Content-Type", "").lower():
        print("Gnani TTS did not return audio. Check the voice and model settings.")
        return 1

    wav_path = ROOT / "test.wav"
    wav_path.write_bytes(tts_response.content)
    print(f"TTS succeeded. Audio saved to {wav_path.name}.")

    print("Checking Gnani Prisma STT…")
    stt_form = {"model": "prisma-v3.0", "language_code": "indic-auto", "format": "transliterate"}
    try:
        with wav_path.open("rb") as audio_file:
            stt_response = requests.post(
                STT_URL,
                headers=headers,
                data=stt_form,
                files={"audio_file": (wav_path.name, audio_file, "audio/wav")},
                timeout=TIMEOUT,
            )
    except requests.RequestException as exc:
        print(f"Could not reach Gnani STT ({type(exc).__name__}). Check your connection.")
        return 1
    if not stt_response.ok:
        print(show_http_error(stt_response.status_code))
        return 1

    try:
        result = stt_response.json()
    except requests.JSONDecodeError:
        print("Gnani STT returned an unreadable response.")
        return 1
    if not isinstance(result, dict):
        print("Gnani STT returned an unreadable response.")
        return 1
    if result.get("success") is False or isinstance(result.get("detail"), dict):
        detail = result.get("detail") or result.get("error") or {}
        try:
            status = int(detail.get("status_code", 502))
        except (AttributeError, TypeError, ValueError):
            status = 502
        print(show_http_error(status))
        return 1

    transcript = result.get("transcript", "")
    if not isinstance(transcript, str):
        transcript = ""
    print(f"STT succeeded. Transcript: {transcript or '(empty transcript)'}")
    print("Gnani TTS and STT are reachable with this key.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
