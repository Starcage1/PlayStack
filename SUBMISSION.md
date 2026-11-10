# Video Vault — project map and pitch notes

## 1. The idea

**One-line pitch:** Video Vault is a personal, local-first home for YouTube videos you choose, with playlists and hands-free Hinglish controls.

**Problem:** Videos people want to keep are scattered across watch history, chat links, and bookmarks. A recommendation feed is not the same as a deliberately curated library.

**Solution:** Save links in batches, organize them into named playlists, and play them using YouTube's official embedded player. Optional Gnani voice input handles common library and playback tasks.

**Who it is for:** Individual learners, hobbyists, and fans who want a small, organized collection they control in their own browser.

**What makes it different:** It focuses on chosen videos and user-made playlists. There are no accounts, recommendations, comments, downloads, or social feed.

## 2. Demo flow

### 60-second version

1. **0–8 seconds:** Show Home and a curated playlist. Say: “Video Vault is a personal library for videos I choose, not a recommendation feed.”
2. **8–18 seconds:** Open a saved video. Press **V**, say “pause karo,” then press **V** and say “chalao.” Point out that voice uses the same player actions as the buttons.
3. **18–30 seconds:** Seek, change volume, and show captions or playback speed in the player controls.
4. **30–42 seconds:** Use **+ Add video** to paste several links. Show deduplication, the preview, and optional playlist/tag selection.
5. **42–52 seconds:** Open the Commands page and search for a phrase; run a typed example to show the fallback path.
6. **52–60 seconds:** Show the About & privacy page: the library stays in this browser, and playback stays in YouTube's embedded player.

Use the development mock only to rehearse UI navigation. For a real voice demo, configure a valid Gnani key and confirm real STT/TTS access beforehand. Use an already saved video to avoid setup delays.

### Longer demo talking points

- **Library:** import one or multiple video links; duplicate IDs are not saved twice.
- **Curation:** add videos to playlists, tag and favorite them, sort and search the collection.
- **Playback:** the one persistent iframe remains alive as the user navigates; playlist playback keeps a queue and can advance automatically.
- **Voice:** a short browser recording is converted to mono 16 kHz PCM WAV, sent to the local Flask endpoint, transcribed by Gnani Prisma, mapped to a safe command, and optionally answered by Gnani Timbre.
- **Privacy:** the browser holds the library; `.env` credentials stay server-side; the local server does not persist audio or transcripts.

## 3. Architecture at a glance

```text
Browser
  index.html + css/
  js/app.js ── routes, screens, dialogs, player shell, event coordination
    ├── store.js ── localStorage library and preferences
    ├── importer.js / video-id.js ── link/file parsing and preview batches
    ├── views/ ── Home, playlists, detail, search, command guide
    ├── player.js ── YouTube IFrame Player API wrapper
    └── voice/ ── recording → WAV → local STT → safe action → spoken reply
                    │ same-origin HTTP
                    ▼
Local Flask server (server.py)
  serves the web files; keeps keys on the server
  /api/stt ── Gnani Prisma
  /api/tts ── Gnani Timbre (small in-memory audio cache)
  /api/youtube/playlist-items ── YouTube Data API v3
```

The frontend is plain JavaScript ES modules with no build step or npm runtime dependencies. Hash routes (`#/home`, `#/playlists`, `#/playlist/<id>`, and others) let browser Back work. The YouTube iframe and its shell live outside the routed content so a route render does not replace the iframe.

## 4. Data and external services

### Library data

The browser stores one JSON record under `videovault:v1`: version, video records, playlists, and settings. A video record includes its YouTube ID, title, channel/author when known, date added, known duration, user tags, and favorite state. A playlist stores its name, creation time, ordered video IDs, and autoplay setting. Volume is saved in settings.

The store accepts a storage object so its behavior can be tested with an in-memory implementation. If browser storage is blocked or full, it warns the user and continues in memory for the current page session.

### APIs the code calls

- **YouTube IFrame Player API:** loads and controls the official embedded player. Playback is subject to the video's embed permissions, YouTube availability, and browser network policy.
- **YouTube oEmbed:** the browser requests public video title/channel for import previews. If it fails, the video can still be saved as “Untitled video.”
- **YouTube Data API v3 `playlistItems.list`:** the server fetches pages of public playlist items when `YOUTUBE_API_KEY` is configured. One request returns up to 50 rows; page responses are cached in memory while the server runs. The app does not call `search.list`.
- **Gnani Prisma v3.0 STT:** the browser sends a WAV recording to the local Flask server, which forwards it to `https://api.vachana.ai/stt/v3` using `indic-auto` and `transliterate`.
- **Gnani Timbre v2.5 TTS:** the local server forwards short spoken replies to `https://api.vachana.ai/api/v1/tts/inference` using Poorvi, `hi-en`, and 24 kHz mono WAV output. Up to 64 recent audio responses are cached in process memory.

The browser never receives either API key. The server does not write microphone audio or transcripts to disk or application logs. The client only writes transcript diagnostics to the console when voice diagnostics are enabled; the on-screen voice result is temporary page state.

## 5. Source and project files

### Root files

- `index.html` — application shell, navigation frame, persistent player iframe container, and native HTML dialogs for video import, playlist editing, membership, tags, and confirmations.
- `server.py` — local Flask web server; serves only `index.html`, `css/`, and `js/`, exposes the health/STT/TTS/playlist endpoints, keeps credentials server-side, returns friendly errors, serializes Gnani calls, and bounds its in-memory caches.
- `check_gnani.py` — optional command-line check for the configured key. It synthesizes a short test phrase and transcribes it, or accepts an existing WAV with `--stt-file`.
- `.env.example` — safe variable-name template. Copy it to ignored `.env` and add keys there.
- `.gitignore` — keeps `.env`, Python caches, virtual environments, and generated `test.wav` out of version control.
- `requirements.txt` — Python runtime dependencies: Flask, Requests, and python-dotenv.
- `package.json` — marks browser files as ES modules and provides the `node --test` script; it defines no frontend dependencies.
- `README.md` — install/run instructions, mobile layout check, key setup, test instructions, and user-facing limitations.
- `SUBMISSION.md` — this pitch outline, architecture map, API/data explanation, and file guide.

### Stylesheets

- `css/tokens.css` — shared dark palette, spacing, sizing, and typography variables.
- `css/style.css` — responsive layout and components: sidebar, grids, cards, dialogs, player, voice dock, empty states, and mobile rules.

### Core JavaScript modules

- `js/app.js` — application coordinator: renders hash routes, connects clicks and keyboard commands, manages playlist/import dialogs, controls the player, and wires voice intents to app actions.
- `js/config.js` — shared storage key, page sizes, and search delay.
- `js/router.js` — parses and updates hash routes and notifies the app when navigation changes.
- `js/store.js` — localStorage-backed videos, playlists, favorites, tags, membership, autoplay, volume, and undo snapshots; contains no DOM code.
- `js/utils.js` — pure helpers for pagination, filtering, sorting, shuffle, and elapsed-time labels.
- `js/search.js` — case-insensitive library search and fuzzy matching for voice-selected video names.
- `js/video-id.js` — strict parsing of supported YouTube video URL forms and IDs.
- `js/importer.js` — extracts/deduplicates links from text and files, parses CSV, runs limited-concurrency oEmbed previews, and saves import batches with narrow undo behavior.
- `js/player.js` — single YouTube IFrame API wrapper; exposes play, pause, seek, volume, state, time, duration, metadata, captions, and playback rate functions.
- `js/environment-badge.js` — asks `/api/health` whether development mock speech is enabled and displays its badge.

### Screen modules in `js/views/`

- `home.js` — Home video grid, filter chips, shuffle control, and paging.
- `playlists.js` — playlist cards, sorting, and pagination.
- `playlist-detail.js` — playlist summary and its searchable/filterable/sortable video rows.
- `search-results.js` — global search result groups for videos and playlists.
- `commands.js` — searchable generated voice command catalog and keyboard shortcut guide.

### Voice modules in `js/voice/`

- `voice-ui.js` — draggable microphone dock, help panel, typed command entry, recording status, and opt-in diagnostics.
- `recorder.js` — microphone permission, short recording, silence detection, audio conversion, and restoration of player volume.
- `wav.js` — PCM WAV encoder and inspector used by recording and tests.
- `gnani-client.js` — browser-to-local-server STT/TTS requests; does not contain API credentials.
- `intents.js` — stable parser entry point that tries registry intents and preserves the legacy parser fallback.
- `legacy-parser.js` — compatibility parser for previously supported voice phrases.
- `actions.js` — pure, guarded command-to-action operations against passed-in player/store/navigation interfaces.
- `responses.js` — short spoken response text for command outcomes.
- `intents/shared.js` — shared command schema, examples, and phrase helper functions.
- `intents/registry.js` — combines the command groups into the searchable command registry.
- `intents/assistant.js` — help and command-guide intents.
- `intents/info.js` — library and playlist information intents.
- `intents/library.js` — playlist, tag, favorite, import, settings, search, and navigation intents.
- `intents/playback.js` — play, pause, seek, volume, video selection, and queue intents.
- `intents/player.js` — timer and player-mode intents.

### Tests in `tests/`

- `helpers.js` — in-memory storage used to test persistence without browser storage.
- `store.test.js` — deduplication, persistence, playlist membership, cascade deletion, and undo.
- `utils.test.js` — pagination, filters, sorting, shuffle, and relative time.
- `video-id.test.js` — accepted and rejected YouTube URL forms.
- `importer.test.js` — link and file extraction, bare-ID rules, concurrency, lookup failures, deduplication, and import undo.
- `router.test.js` — valid/malformed route handling and grouped search.
- `search.test.js` — fuzzy voice matching of titles, channels, and tags.
- `intents.test.js` — command phrases, extracted arguments, and safe unknown commands.
- `voice-registry.test.js` — generated command examples and command catalog metadata.
- `voice-actions.test.js` — guarded action behavior when there is no active video and playlist matching.
- `voice-wav.test.js` — WAV header, sample format, and corruption handling.

## 6. Verification notes and known boundaries

Run `node --test` from this folder. It checks pure logic and does not contact YouTube or Gnani. A passing suite does not prove that an individual video allows embedding or that a provider key has account access.

- YouTube oEmbed is best-effort; private, removed, or network-blocked videos may be saved without their title.
- Playlist import is for public playlists and requires a restricted YouTube Data API key. Each fetched page contains at most 50 items.
- The library is local to one browser profile. There is no database sync, account, or cross-device backup in the current app.
- The app currently does not refresh YouTube metadata on a 30-day schedule or remove stale metadata automatically. If distributing the app or retaining Data API metadata long term, implement the applicable YouTube API Services data-retention requirements before claiming full policy compliance.
- A video owner can disable embedding, and browser extensions/network filters can block YouTube's iframe. The app shows a friendly playback error in those cases.
- Real microphone, STT, and TTS verification needs a working device, browser permission, network, and active Gnani account. Mock mode is useful only for local UI checks.

## 7. Pitch-ready close

“Video Vault makes online video feel like a library I chose for myself. I can collect individual links or a public playlist, organize them into my own lists, and control playback by touch or voice. My collection stays in this browser, and video playback stays with YouTube's embedded player.”
