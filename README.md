# Video Vault

Video Vault is a local-first app for collecting YouTube videos into personal playlists. It uses the official YouTube embedded player and stores the library in this browser. It does not download videos or need an account, backend, build step, or installed packages.

## Run locally

Open a terminal in this folder and run:

```text
python -m http.server 8000 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8000/>. Keep the terminal open while using the app. You need an internet connection for YouTube playback and video details.

## Files

- `index.html` contains the routed app mount, persistent YouTube player, and native dialogs.
- `css/style.css` contains the dark purple theme, shared layout, responsive styles, and player modes.
- `js/app.js` connects screens, dialogs, storage, and player controls.
- `js/player.js` is the small wrapper around YouTube's IFrame Player API.
- `js/store.js` keeps versioned library data in browser storage and offers plain data operations.
- `js/router.js` handles hash-based navigation.
- `js/video-id.js` parses supported YouTube URLs.
- `js/utils.js` contains shuffle, filtering, sorting, and pagination helpers.
- `js/config.js` holds shared settings such as page sizes.
- `js/views/` contains the screen renderers.

## Notes

The app stores data under `videovault:v1` in localStorage. Browser storage is private to that browser profile and device. Some YouTube videos do not allow embedding; the app will show a message when that happens.
