# Video Vault

Video Vault is a personal library for videos you choose and playlists you curate. The interface uses an original stacked-card mark and hand-drawn inline SVG icons. Video Vault is not affiliated with YouTube; playback uses YouTube's embedded player.

## Run locally

Python 3.10 or newer is recommended. From this folder:

```powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Open `.env` in a text editor and add your Gnani key to `GNANI_API_KEY`. Keep `.env` private; Git ignores it. Then start the app:

```powershell
python server.py
```

Open <http://127.0.0.1:8000/>. The Python server hosts both the static app and its same-origin API endpoints. Keep the terminal open. YouTube playback and Gnani services need internet access.

## Verify your Gnani key first

With the key saved in `.env`, run:

```powershell
python check_gnani.py
```

The check asks Timbre to synthesize “Namaste, yeh ek test hai” into `test.wav`, then asks Prisma to transcribe that file. It prints the transcript, never the key. It reports common authentication, credit, permission, and rate-limit errors in plain language. Do this before continuing with the microphone and command UI phase.

For local backend work without sending audio to Gnani, set `MOCK_GNANI=1` in `.env` and restart the server. `/api/stt` returns a canned command, `/api/tts` returns a short beep, and the page displays a visible **MOCK MODE** badge. Mock mode is development-only. Set `MOCK_GNANI=0` for real API requests.

## Server endpoints

- `GET /api/health` returns only whether a key is configured and whether mock mode is on. It never returns the key.
- `POST /api/stt` accepts multipart `audio_file` and optional JSON-array `keyterms`; it calls Prisma v3.0 using transliterated output and automatic Indic language detection.
- `POST /api/tts` accepts `{ "text": "..." }`; it calls Timbre v2.5 with Poorvi in `hi-en`, returns WAV audio, and keeps a small in-memory cache of recent phrases.

Gnani calls are serialized in this local server. A 429 is retried once after one second, and requests time out after 15 seconds. Provider failures are converted into short messages without logging request contents or credentials.

The [Gnani API documentation index](https://docs.gnani.ai/llms.txt) links the Prisma v3.0, STT REST, Timbre voice catalog, and TTS REST references. The request settings above follow the API details supplied in this project brief.

## Frontend checks

The app itself has no JavaScript build step or npm dependencies. With Node.js installed, run its pure-logic tests:

```text
node --test
```

## Main files

- `server.py` serves the app, protects the API key, and proxies the two Gnani calls.
- `check_gnani.py` performs a real TTS-then-STT credential check.
- `.env.example` is a safe template; put the actual key only in your ignored `.env` file.
- `requirements.txt` lists Flask, requests, and python-dotenv.
- `index.html`, `css/`, and `js/` are the existing web app. `js/environment-badge.js` checks the health endpoint and makes mock mode visible.
- `js/store.js` manages saved videos and playlists in browser storage.
- `js/player.js` wraps the embedded video player and keeps its existing public controls.
- `js/views/` draws the Home, playlist, playlist detail, and search screens.
- `tests/` covers pure ID parsing, routes, searching, list helpers, and store behavior with in-memory storage.

## Current phase boundary

This phase prepares the safe backend and verifies the Gnani account. It does not yet add a microphone, voice command parser, spoken replies, or voice controls. Run `check_gnani.py` and confirm its result before the next phase.
