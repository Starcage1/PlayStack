# Video Vault — Hinglish Voice-Controlled Video Library

## Project

Video Vault is a local-first library for saving YouTube videos and arranging them into personal playlists. It gives viewers a quiet, curated place to keep videos they chose, without recommendations, accounts, or a social feed. A Hinglish voice layer lets a user control playback and organize the current video while keeping the existing web player and library intact.

## Problem and users

People save useful, educational, and personally meaningful videos across different places, then have trouble finding and organizing them. Video Vault helps an individual viewer keep those choices in a small library and group them into playlists. Voice commands make common playback and organization actions easier when the viewer does not want to reach for the controls.

## Gnani APIs actually used

- **Prisma v3.0 STT** — `POST https://api.vachana.ai/stt/v3`, called by the local Flask server. Current settings are `language_code=indic-auto` and `format=transliterate`; the app passes playlist names and tags as optional keyterms.
- **Timbre v2.5 TTS** — `POST https://api.vachana.ai/api/v1/tts/inference`, called by the local Flask server with voice `Poorvi`, language `hi-en`, and 24 kHz mono WAV output. Short replies are cached in memory.
- The browser calls only the local `/api/stt` and `/api/tts` endpoints. The Gnani key stays in the server-side `.env` file and is not sent to the browser.
- **Evon is not used.**

The user reported a successful run of `check_gnani.py`. No real microphone samples were provided to compare STT settings, so the three recognition profiles in the README remain unranked.

## Contribution

**Individual project; implemented solo.** Work includes the Flask proxy and key handling, the browser microphone-to-WAV capture, Gnani STT/TTS calls, a pure Hinglish command parser and tests, safe actions wired into the existing app, and the voice interaction UI.

## 60-second demo script

1. **0–8 sec:** Open Video Vault and show the saved library and one curated playlist. Explain that this is a personal library, not a recommendation feed.
2. **8–16 sec:** Start a video and press `V`. Say “pause karo,” then resume with “chalao.” Show the short heard/action status and spoken reply.
3. **16–24 sec:** Say “tees second aage,” then “awaaz fifty karo.” Show that seek and volume affect the embedded player.
4. **24–36 sec:** Say “is video ko Coding playlist mein daal do.” Open that playlist and show the new membership. Then say “tag karo study.”
5. **36–45 sec:** Say “agla video chalao” and “playlist sort karo by naam.” Show the next video and updated order.
6. **45–53 sec:** Open “What can I say?” and run a typed command to demonstrate the fallback path.
7. **53–60 sec:** Try a nonexistent playlist name. Show that Video Vault offers likely matches and does not create a playlist without a direct create command.

## Demo notes

- Use `python server.py` and keep `MOCK_GNANI=0` for the real Gnani demo. The development mock mode shows a visible badge and is not evidence of a real API response.
- Use an existing saved video and playlist so the demo does not spend time on setup.
- The app does not implement voice deletion. Unknown commands return a short clarification and examples.
