# Video Vault

Video Vault is a personal library for videos you choose and playlists you curate. The interface uses an original stacked-card mark and hand-drawn inline SVG icons. Video Vault is not affiliated with YouTube; playback uses YouTube's embedded player.

## Run it

Open a terminal in this folder and run:

```text
python -m http.server 8000 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8000/>. Keep the terminal open while using the app. Internet access is needed for YouTube playback and video details. If port 8000 is busy, change `8000` in both places.

## Tests

With Node.js installed, run:

```text
node --test
```

The app itself needs no Node.js, npm, framework, or installed packages. `package.json` only enables JavaScript modules and provides a test shortcut.

## Files

- `index.html` holds the top bar, navigation, one persistent player shell, and the native dialogs.
- `css/tokens.css` defines the purple accent, dark palette, spacing, and shape sizes.
- `css/style.css` styles the home feed, playlist screens, search results, player, dialogs, and responsive layouts.
- `js/app.js` connects the screens, dialogs, shortcuts, persistent player, and user actions.
- `js/router.js` reads and changes hash routes so browser Back works.
- `js/player.js` wraps YouTube's IFrame API. Its `play`, `pause`, `seekTo`, `setVolume`, `getState`, `getTime`, and `getDuration` functions remain available.
- `js/store.js` handles saved videos, playlists, and browser storage, with an in-memory fallback and visible warning.
- `js/video-id.js` reads a video ID from YouTube links or a bare ID.
- `js/utils.js` contains shuffle, list filtering, sorting, pagination, and `timeAgo` helpers.
- `js/search.js` searches saved video and playlist details without page or browser APIs.
- `js/config.js` contains page-size and storage settings.
- `js/views/home.js` draws the video cards and Home chips.
- `js/views/playlists.js` draws and sorts the playlist grid.
- `js/views/playlist-detail.js` draws playlist controls and numbered video rows.
- `js/views/search-results.js` groups matching videos and playlists on the search page.
- `tests/` checks ID parsing, routes, search, list helpers, persistence, and playlist operations using in-memory storage.

## Data and playback

The library is stored in browser `localStorage` under `videovault:v1`. Adding a video tries YouTube oEmbed for its title and channel; if that request is unavailable, the app still saves it and can fill in details when playback starts. Some videos cannot be embedded because their owners disabled embedding.

The iframe is created once outside the routed content. On `#/watch`, the same player is expanded; after navigating away, it stays visible as a mini player and playback continues. Playlist playback uses the full filtered and sorted queue. Autoplay Seq is enabled by default on each playlist.

## Manual check

1. Collapse the sidebar, reload, and confirm the choice remains saved. Try the drawer on a narrow screen.
2. Scroll the Home chips with their arrows and hover or focus a video to reveal its menu.
3. Play a video, press browser Back, and confirm it keeps playing in the mini player. Expand it again.
4. Play all from a playlist and check the Up next list. Let a video end, then turn Autoplay Seq off and confirm it stops at the end.
5. Search from the top bar and open a video or playlist result.
6. Resize to phone, laptop, and desktop widths and check that the layout adapts.
