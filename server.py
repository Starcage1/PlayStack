"""Serve Video Vault and keep Gnani credentials on the local server."""

from __future__ import annotations

import io
import argparse
import json
import logging
import math
import os
import struct
import threading
import time
import wave
from collections import OrderedDict
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory


ROOT = Path(__file__).resolve().parent
load_dotenv(ROOT / ".env")

STT_URL = "https://api.vachana.ai/stt/v3"
TTS_URL = "https://api.vachana.ai/api/v1/tts/inference"
REQUEST_TIMEOUT = 15
MAX_TTS_CACHE_ITEMS = 64
MAX_TEXT_LENGTH = 1200
YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3/playlistItems"
MAX_PLAYLIST_PAGE_CACHE = 100
playlist_page_cache: OrderedDict[tuple[str, str], dict[str, Any]] = OrderedDict()

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
app.logger.setLevel(logging.INFO)

# One lock prevents simultaneous requests from exceeding account limits.
gnani_lock = threading.Lock()
tts_cache: OrderedDict[str, bytes] = OrderedDict()


class GnaniRequestError(Exception):
    """A safe, user-facing error that never contains request credentials."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.message = message
        self.status = status


def mock_enabled() -> bool:
    return os.getenv("MOCK_GNANI", "0").strip().lower() in {"1", "true", "yes", "on"}


def api_key() -> str:
    return os.getenv("GNANI_API_KEY", "").strip()


def friendly_error(status: int) -> str:
    """Convert provider status codes into short messages for the app."""
    if status == 401:
        return "Gnani rejected the API key. Check GNANI_API_KEY in your .env file."
    if status == 402:
        return "The Gnani account needs credits or activation."
    if status == 403:
        return "Gnani denied access to this API. Check your account permissions."
    if status == 429:
        return "Gnani is busy. Wait a moment, then try again."
    if status in {400, 413, 415, 422}:
        return "Gnani could not use this audio or request. Try recording again."
    return "Gnani could not complete the request. Check your connection and try again."


def _status_from_payload(payload: Any, fallback: int) -> int:
    """Read a provider error status without passing its raw message to logs."""
    if not isinstance(payload, dict):
        return fallback
    detail = payload.get("detail")
    error = payload.get("error")
    for item in (detail, error):
        if isinstance(item, dict):
            try:
                return int(item.get("status_code", fallback))
            except (TypeError, ValueError):
                pass
    return fallback


def _request_gnani(url: str, service: str, **kwargs: Any) -> requests.Response:
    """Call Gnani serially and retry a busy-account response once."""
    with gnani_lock:
        for attempt in range(2):
            try:
                response = requests.post(url, timeout=REQUEST_TIMEOUT, **kwargs)
            except requests.RequestException as exc:
                app.logger.warning("Gnani %s connection failed (%s)", service, type(exc).__name__)
                raise GnaniRequestError("Could not reach Gnani. Check your internet connection.", 502) from None

            if response.status_code == 429 and attempt == 0:
                time.sleep(1)
                continue
            if not response.ok:
                status = _status_from_payload(_json_or_none(response), response.status_code)
                app.logger.warning("Gnani %s request failed (HTTP %s)", service, status)
                raise GnaniRequestError(friendly_error(status), status)
            return response

    raise GnaniRequestError(friendly_error(429), 429)


def _json_or_none(response: requests.Response) -> Any:
    try:
        return response.json()
    except (ValueError, requests.JSONDecodeError):
        return None


def _configured_key_or_error() -> str:
    key = api_key()
    if not key:
        raise GnaniRequestError("Gnani is not configured. Add GNANI_API_KEY to your .env file.", 503)
    return key


def _mock_wav() -> bytes:
    """Create a brief beep WAV without installing an audio package."""
    sample_rate = 24_000
    duration = 0.18
    samples = bytearray()
    for index in range(int(sample_rate * duration)):
        fade = min(1.0, index / 250, (sample_rate * duration - index) / 500)
        value = int(5000 * max(0, fade) * math.sin(2 * math.pi * 880 * index / sample_rate))
        samples.extend(struct.pack("<h", value))

    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(samples)
    return output.getvalue()


@app.get("/api/health")
def health():
    # This reports configuration state only; it never returns the key.
    return jsonify({"key_configured": bool(api_key()), "mock": mock_enabled()})


@app.get("/api/youtube/playlist-items")
def youtube_playlist_items():
    """Fetch one quota-bounded page from a public YouTube playlist."""
    api_key = os.getenv("YOUTUBE_API_KEY", "").strip()
    if not api_key:
        return jsonify({"error": "Add YOUTUBE_API_KEY to the local .env file and restart PlayStack."}), 503
    playlist_id = request.args.get("playlistId", "").strip()
    if not playlist_id or len(playlist_id) > 128 or not all(ch.isalnum() or ch in "_-" for ch in playlist_id):
        return jsonify({"error": "Enter a valid YouTube playlist link."}), 400
    page_token = request.args.get("pageToken", "").strip()
    if len(page_token) > 2048:
        return jsonify({"error": "That playlist page token is invalid."}), 400
    cache_key = (playlist_id, page_token)
    cached = playlist_page_cache.get(cache_key)
    if cached is not None:
        playlist_page_cache.move_to_end(cache_key)
        return jsonify(cached)
    try:
        response = requests.get(YOUTUBE_API_URL, params={
            "part": "snippet", "playlistId": playlist_id, "maxResults": 50,
            "pageToken": page_token or None,
            "fields": "nextPageToken,items(snippet(title,channelTitle,resourceId/videoId))",
            "key": api_key,
            
        }, timeout=REQUEST_TIMEOUT)
        payload = response.json()
        if response.status_code >= 400:
            reason = (((payload.get("error") or {}).get("errors") or [{}])[0].get("reason", ""))
            if reason in {"quotaExceeded", "dailyLimitExceeded"}:
                return jsonify({"error": "YouTube API daily quota reached. Try again after the quota resets."}), 429
            if response.status_code == 403:
                return jsonify({"error": "YouTube API access was denied. Check that the API is enabled and the key is restricted to YouTube Data API v3."}), 403
            if response.status_code == 404:
                return jsonify({"error": "That YouTube playlist was not found or is not public."}), 404
            return jsonify({"error": "YouTube could not return this playlist. Check the link and try again."}), 502
        items = []
        for item in payload.get("items", []):
            snippet = item.get("snippet") or {}
            video_id = ((snippet.get("resourceId") or {}).get("videoId") or "").strip()
            if not video_id:
                continue
            items.append({"id": video_id, "title": snippet.get("title") or "Untitled video", "author": snippet.get("channelTitle") or "YouTube"})
        result = {"items": items, "nextPageToken": payload.get("nextPageToken", "")}
        playlist_page_cache[cache_key] = result
        while len(playlist_page_cache) > MAX_PLAYLIST_PAGE_CACHE:
            playlist_page_cache.popitem(last=False)
        return jsonify(result)
    except requests.RequestException:
        return jsonify({"error": "Could not reach YouTube. Check your internet connection and try again."}), 502
    except ValueError:
        return jsonify({"error": "YouTube returned an unreadable playlist response."}), 502

@app.post("/api/stt")
def stt():
    audio = request.files.get("audio_file")
    if audio is None:
        return jsonify({"error": "Add a WAV recording and try again."}), 400

    raw_keyterms = request.form.get("keyterms", "")
    keyterms: list[str] = []
    if raw_keyterms:
        try:
            parsed = json.loads(raw_keyterms)
        except json.JSONDecodeError:
            return jsonify({"error": "The playlist and tag hints were not valid."}), 400
        if not isinstance(parsed, list) or len(parsed) > 200 or not all(isinstance(term, str) for term in parsed):
            return jsonify({"error": "Use up to 200 text hints for recognition."}), 400
        keyterms = parsed

    if mock_enabled():
        return jsonify({"transcript": "agla video chalao", "detected_language_code": "hi-IN"})

    try:
        key = _configured_key_or_error()
        form: dict[str, str] = {
            "model": "prisma-v3.0",
            "language_code": "indic-auto",
            "format": "transliterate",
        }
        if keyterms:
            form["keyterms"] = json.dumps(keyterms, ensure_ascii=False)
        response = _request_gnani(
            STT_URL,
            "STT",
            headers={"X-API-Key-ID": key},
            data=form,
            files={"audio_file": (audio.filename or "command.wav", audio.stream, audio.mimetype or "audio/wav")},
        )
        payload = _json_or_none(response)
        if not isinstance(payload, dict):
            raise GnaniRequestError("Gnani returned an unreadable transcription. Try again.")
        if payload.get("success") is False or isinstance(payload.get("detail"), dict):
            status = _status_from_payload(payload, 502)
            app.logger.warning("Gnani STT returned an error result (HTTP %s)", status)
            raise GnaniRequestError(friendly_error(status), status)
        transcript = payload.get("transcript", "")
        if not isinstance(transcript, str):
            transcript = ""
        return jsonify({
            "transcript": transcript,
            "detected_language_code": payload.get("detected_language_code"),
        })
    except GnaniRequestError as exc:
        return jsonify({"error": exc.message}), exc.status
    except Exception as exc:
        app.logger.error("Gnani STT handler failed (%s)", type(exc).__name__)
        return jsonify({"error": "Voice recognition failed inside the local server. Check the server terminal."}), 500


@app.post("/api/tts")
def tts():
    payload = request.get_json(silent=True) or {}
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        return jsonify({"error": "Add a reply to speak."}), 400
    text = text.strip()
    if len(text) > MAX_TEXT_LENGTH:
        return jsonify({"error": "That reply is too long to speak."}), 400

    if mock_enabled():
        return app.response_class(_mock_wav(), mimetype="audio/wav")

    cached = tts_cache.get(text)
    if cached is not None:
        tts_cache.move_to_end(text)
        return app.response_class(cached, mimetype="audio/wav")

    try:
        key = _configured_key_or_error()
        request_body = {
            "text": text,
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
        response = _request_gnani(
            TTS_URL,
            "TTS",
            headers={"X-API-Key-ID": key, "Content-Type": "application/json"},
            json=request_body,
        )
        audio_bytes = response.content
        if not audio_bytes or ("json" in response.headers.get("Content-Type", "").lower()):
            status = _status_from_payload(_json_or_none(response), 502)
            app.logger.warning("Gnani TTS returned an error result (HTTP %s)", status)
            raise GnaniRequestError(friendly_error(status), status)
        tts_cache[text] = audio_bytes
        tts_cache.move_to_end(text)
        while len(tts_cache) > MAX_TTS_CACHE_ITEMS:
            tts_cache.popitem(last=False)
        return app.response_class(audio_bytes, mimetype="audio/wav")
    except GnaniRequestError as exc:
        return jsonify({"error": exc.message}), exc.status
    except Exception as exc:
        app.logger.error("Gnani TTS handler failed (%s)", type(exc).__name__)
        return jsonify({"error": "The spoken reply failed inside the local server. Check the server terminal."}), 500


@app.get("/")
@app.get("/<path:requested>")
def frontend(requested: str = "index.html"):
    # Expose only the frontend files, never .env, source control, or server code.
    if requested == "index.html":
        return send_from_directory(ROOT, "index.html")
    for folder in ("css", "js"):
        prefix = f"{folder}/"
        if requested.startswith(prefix):
            return send_from_directory(ROOT / folder, requested[len(prefix):])
    return jsonify({"error": "Not found."}), 404


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run the local Video Vault app server.")
    parser.add_argument("--port", type=int, default=8000, help="Local port to serve on (default: 8000).")
    args = parser.parse_args()
    app.run(host="127.0.0.1", port=args.port, debug=False)
