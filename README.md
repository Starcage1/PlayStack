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

If another local server already owns port 8000, start Flask on another port with `python server.py --port 8001` and open <http://127.0.0.1:8001/> instead. The web page and `/api/stt` must come from the same Flask server; `python -m http.server` cannot handle the voice POST requests.

## Verify your Gnani key first

With the key saved in `.env`, run:

```powershell
python check_gnani.py
```

The check asks Timbre to synthesize “Namaste, yeh ek test hai” into `test.wav`, then asks Prisma to transcribe that file. It prints the transcript, never the key. It reports common authentication, credit, permission, and rate-limit errors in plain language. Do this before continuing with the microphone and command UI phase.

To send an existing browser recording directly to STT (a real API request that may use account credits), run `python check_gnani.py --stt-file path\to\recording.wav`. It prints the HTTP status and raw response, without printing the API key.

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

## Voice commands

Open **Commands** in the sidebar, press **?**, or say “help” to browse voice examples and keyboard shortcuts. The page is generated from the command registry; use its search, category filters, and **Try it** buttons to run examples through the typed-command path. Current commands cover selecting and finding videos, random playback, search and navigation, player modes, sleep timers, and library information.

## Voice slice

The microphone button records up to ten seconds, stops after 1.2 seconds of silence only after speech is detected, resamples the audio to mono 16 kHz PCM WAV, checks the WAV header, and sends it to the local `/api/stt` endpoint. Recognized Hinglish, English, or Devanagari commands are matched against a small safe command list, applied through the app's existing player and storage functions, and answered through `/api/tts`. Unsupported requests are not executed. Run the Python server rather than opening the HTML file directly.

For voice troubleshooting, open `http://127.0.0.1:8000/?voicedebug=1` in a new browser tab. The debug panel shows microphone permission, input level, recording length and peak, WAV header details, the local STT request and response, transcript, parsed intent, and timings. It can play or download the latest recording. The panel and console diagnostics do not include the Gnani key. A saved recording can be checked against STT separately with the command above.

The mic can be dragged and its position is saved in browser storage. Press `V` to start or stop a recording when you are not typing. The “What can I say?” panel also runs typed commands through the same parser and actions, so it remains useful if the mic or network is unavailable. While recording and speaking, the video volume is lowered to 15% of its saved level and restored afterward. The spoken response can fail offline, but the typed command still runs locally.

### Recognition settings comparison

`server.py` currently uses profile A. No real voice samples were supplied for this project, so these profiles have not been compared and no accuracy winner is claimed. The earlier credential check used generated speech; that does not measure recognition of the user's own Hinglish voice.

| Profile | `language_code` | `format` | Result |
| --- | --- | --- | --- |
| A (current default) | `indic-auto` | `transliterate` | Not tested with real voice samples |
| B | `hi-IN,en-IN` | `transliterate` | Not tested with real voice samples |
| C | `hi-IN,en-IN` | `codemix` | Not tested with real voice samples |

### Voice command checklist

Try each phrase with a video loaded where required. The phrases below are examples; playlist names should match your own collection.

| Action | Hinglish | English |
| --- | --- | --- |
| Play or resume | `chalao` | `play the video` |
| Pause | `roko` | `pause the video` |
| Next / previous | `agla video chalao` / `pichla video` | `next video` / `previous video` |
| Volume | `awaaz badhao`, `awaaz kam karo`, `volume fifty karo` | `volume up`, `volume down`, `volume fifty` |
| Seek | `tees second aage`, `das second peeche` | `30 seconds forward`, `10 seconds backward` |
| Add current video | `is video ko Music mein daal do` | `add this video to Music` |
| Tag current video | `tag karo study` | `add tag study` |
| Create / open playlist | `playlist banao naam rakho Exam Prep`, `Exam Prep playlist kholo` | `create playlist called Exam Prep`, `open playlist Exam Prep` |
| Sort / favorite | `playlist sort karo by naam`, `favourite karo` | `sort playlist by title`, `favorite this video` |

Also check a noisy room, deny microphone access (then use the typed box), disconnect the network (then use the typed box), name a playlist that does not exist, and try an unsupported request. The app should explain failures, suggest close playlist names, and never delete data by voice.

### Verification status

- `node --test`: 21 tests pass, including 56 command phrases and safe action checks.
- Python syntax check and local Flask page/API smoke check passed earlier in development.
- The user reported that the real Gnani credential check succeeded. It was not repeated in this pass to avoid another paid API call.
- The local browser check confirmed the Help panel and typed “open playlists” command navigate correctly. Real microphone recognition and speech playback were not exercised in this pass; no real voice samples were supplied for profile comparison.

## Main files

- `server.py` serves the app, protects the API key, and proxies the two Gnani calls.
- `check_gnani.py` performs a real TTS-then-STT credential check.
- `.env.example` is a safe template; put the actual key only in your ignored `.env` file.
- `requirements.txt` lists Flask, requests, and python-dotenv.
- `index.html`, `css/`, and `js/` are the existing web app. `js/environment-badge.js` checks the health endpoint and makes mock mode visible.
- `js/store.js` manages saved videos and playlists in browser storage.
- `js/player.js` wraps the embedded video player and keeps its existing public controls.
- `js/views/` draws the Home, playlist, playlist detail, and search screens.
- `js/voice/recorder.js` captures and converts a short mic command to WAV; `gnani-client.js` calls the local speech endpoints; `intents.js` parses phrases; `actions.js` runs safe app actions; `responses.js` keeps spoken replies together; and `voice-ui.js` draws the mic, help, and typed fallback.
- `tests/` covers pure ID parsing, routes, searching, list helpers, and store behavior with in-memory storage.

## Progress

The backend, microphone round trip, safe voice commands, draggable mic, typed fallback, keyboard toggle, and voice help are in place. The project submission draft and manual verification checklist are in `SUBMISSION.md` and this README.
