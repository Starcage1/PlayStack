# Video Vault

Video Vault is a local-first web app for keeping YouTube videos you choose, arranging them into personal playlists, and controlling playback with buttons or Hinglish/English voice commands. It does not provide recommendations, accounts, comments, downloads, or a social feed. Playback stays inside YouTube's official embedded player.

## Run on Windows

Install Python 3.10 or newer and Node.js (only needed to run the tests). In PowerShell, from this folder:

```powershell
py -3 -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Open `.env` in a text editor. Add `GNANI_API_KEY` for real voice recognition and spoken replies. Add `YOUTUBE_API_KEY` only if you want to import YouTube playlists. Both keys remain on the local server. The keys are optional for browsing, saving individual video links, and embedded playback.

Start the app:

```powershell
python server.py
```

Open <http://127.0.0.1:8000/> in a browser. Keep the terminal window open while using the app. Do not open `index.html` as a file and do not use `python -m http.server`: voice and playlist-import requests need the Flask server. If port 8000 is already in use, run `python server.py --port 8001` and open <http://127.0.0.1:8001/>.

## Test the mobile layout

The easiest check needs no phone or extra setup:

1. Run the Flask server and open the local address above in Chrome or Edge.
2. Open Developer Tools with **F12**, then turn on the device toolbar with **Ctrl+Shift+M**.
3. Choose a phone preset or enter **390 × 844**. Reload once at that width.
4. Check the sidebar drawer, search, video cards, import dialog, playlist screens, mic button, and docked mini-player. Try opening and closing the sidebar and player while scrolling to the bottom of a long list.
5. Change the preview to **1280 × 800** to check the desktop layout. Switch the device toolbar off when done.

The voice button needs microphone permission and a working Gnani key for real recognition. YouTube playback and some embed permissions depend on the selected video and browser. Those external services may not work in automated or offline checks.

## What works

- Save individual YouTube videos in batches from pasted links, copied text, supported bookmark files, and Google Takeout CSVs. Previews use YouTube oEmbed when available; a failed lookup can still be saved as “Untitled video.”
- Import public YouTube playlist pages in batches of up to 50 items when `YOUTUBE_API_KEY` is set. Use **Load next 50** to continue through a large playlist. Private playlists are not supported.
- Curate playlists, tags, and favorites; search the library; and use the Commands page to browse voice and keyboard commands.
- Play videos in YouTube's embedded player, keep the player alive while changing screens, seek, change volume and playback speed, enable captions where the video supports them, and use theater/fullscreen/ambient modes.
- Use the floating Gnani mic or press **V** to start/stop voice input from any screen when focus is not in a text field and no dialog is open. The typed command box is available from the mic help panel.
- Data is stored in this browser's `localStorage`. Clearing browser data clears the library. This project does not sync data between browsers or devices.

## Environment keys

Copy `.env.example` to `.env` and keep `.env` private. `.gitignore` excludes it.

- `GNANI_API_KEY` enables Prisma speech recognition and Timbre spoken replies. It is read only by Flask and is never sent to browser JavaScript.
- `YOUTUBE_API_KEY` enables public playlist-item imports through YouTube Data API v3. Restrict the key to that API in Google Cloud.
- `MOCK_GNANI=1` enables a local test response and shows a **MOCK MODE** badge. Use `MOCK_GNANI=0` for real requests.

## Voice key check

With a real Gnani key in `.env`, run:

```powershell
python check_gnani.py
```

This sends a generated greeting to Timbre and the generated audio to Prisma, then prints the transcript and safe diagnostics. To transcribe a WAV file instead (a real request that may use account credits):

```powershell
python check_gnani.py --stt-file path\to\recording.wav
```

## Tests

The frontend has no build step and no npm dependencies. With Node.js installed, run the pure-logic suite:

```powershell
node --test
```

It checks video and playlist ID parsing, link/file import, import concurrency and deduplication, library persistence and playlist membership, routing, search, pagination/sorting, and voice command parsing/actions/WAV handling.

## Local server endpoints

- `GET /api/health` reports whether the Gnani key is configured and whether mock mode is active. It never returns the key.
- `POST /api/stt` accepts a WAV file and optional playlist/tag keyterms, then calls Prisma v3.0.
- `POST /api/tts` accepts a short reply, then calls Timbre v2.5. Recent audio replies are held in a bounded in-memory cache.
- `GET /api/youtube/playlist-items` fetches one public playlist page through YouTube Data API v3. Pages are cached in memory while the server runs.

The server does not save microphone recordings or transcripts. Keep this development server bound to `127.0.0.1`; do not expose it to a public network. API availability, embed permissions, and provider account limits remain external dependencies.

## Project map

See [SUBMISSION.md](SUBMISSION.md) for the pitch outline, user flows, architecture, and an explanation of each project file.
