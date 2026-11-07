# Video Vault

Video Vault is a local-first app for collecting YouTube videos into playlists you curate. It has no recommendations, accounts, backend, downloads, voice feature, build step, or installed web packages. Videos play through YouTube's official embedded player.

## Run the app

Open a terminal in this folder and run:

```text
python -m http.server 8000 --bind 127.0.0.1
```

Then open <http://127.0.0.1:8000/> in a browser. Keep the terminal open while using the app. You need an internet connection for YouTube playback and oEmbed details. If port 8000 is busy, use another port in both the command and the address, for example 8001.

## Run the tests

With Node.js installed, run:

```text
node --test
```

The app itself does not need Node.js or npm; `package.json` only marks these files as ES modules and provides the test command. There are no npm dependencies.

## Files

- `index.html` contains the routed app mount, one persistent YouTube player shell, and native dialogs.
- `css/style.css` defines the dark purple colors, spacing, cards, responsive layouts, dialogs, and mini/expanded player modes.
- `js/app.js` connects screens, dialogs, keyboard shortcuts, storage, and player controls. It keeps the iframe outside the routed content so navigation does not restart playback.
- `js/player.js` wraps YouTube's IFrame API. Its public `play`, `pause`, `seekTo`, `setVolume`, `getState`, `getTime`, and `getDuration` functions remain available on `window.VaultPlayer` and as ES module exports.
- `js/store.js` owns the versioned local library and playlist operations. It receives storage as an argument and falls back to in-memory data with a visible warning if browser storage fails.
- `js/router.js` parses and changes the `#/home`, `#/playlists`, and `#/playlist/<id>` routes.
- `js/video-id.js` extracts a YouTube ID from watch, short, embed, Shorts, and bare-ID inputs.
- `js/utils.js` contains pure shuffle, filtering, sorting, and pagination helpers.
- `js/search.js` searches video titles, channels, tags, and playlist names without touching the page.
- `js/config.js` holds storage and page-size settings.
- `js/views/home.js` draws the Home feed and shared video cards.
- `js/views/playlists.js` draws the playlist grid.
- `js/views/playlist-detail.js` draws the playlist controls and video list.
- `tests/` covers ID parsing, routing, search, pagination, sorting, persistence, deduplication, playlist membership, and delete/undo operations using in-memory storage.

## Data and playback notes

Library data is stored under `videovault:v1` in the browser's localStorage. It belongs to that browser profile on that device. Adding a video first tries YouTube oEmbed for its title and channel; if that request fails, the video can still be saved as “Untitled video” and filled in when it is played. Some owners disable embedding, and those videos cannot play in this app.

The mini player remains visible during navigation and is not moved in the DOM. Playlist playback queues the full filtered and sorted playlist, including items on later pages. Autoplay Seq is on by default for each playlist and can be switched off in its detail view.

## Manual check

1. Add a video by link, then add the same one again. Confirm it is not duplicated and can be added to a playlist.
2. Create a playlist, add multiple videos, and open it.
3. Play a video from the playlist and let it finish. Confirm Autoplay Seq plays the next item. Turn Autoplay Seq off and confirm playback stops at the end.
4. Navigate between Home, Playlists, and a playlist while a video is playing. Confirm the video does not restart.
5. Expand and minimize the player, then close the mini player.
6. Search globally, try Favs/Recently added/tag chips, and reload to confirm data persists.
