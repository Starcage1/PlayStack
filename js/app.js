import { createStore } from "./store.js";
import { extractVideoId } from "./video-id.js";
import { filterAndSortVideos, shuffle } from "./utils.js";
import { navigate, parseRoute, watchRoute } from "./router.js";
import * as yt from "./player.js";
import { formatTime, renderHome, renderHomeChips } from "./views/home.js";
import { renderPlaylists } from "./views/playlists.js";
import { renderPlaylistDetail } from "./views/playlist-detail.js";

const app = document.querySelector("#app");
const playerShell = document.querySelector("#playerShell");
const toastRegion = document.querySelector("#toastRegion");
const addDialog = document.querySelector("#addVideoDialog");
const addForm = document.querySelector("#addVideoForm");
const addUrl = document.querySelector("#addVideoUrl");
const addMessage = document.querySelector("#addVideoMessage");
const preview = document.querySelector("#videoPreview");
const saveVideoButton = document.querySelector("#saveVideo");
const addChoices = document.querySelector("#addPlaylistChoices");
const homeState = { filter: "", page: 1, order: [] };
const playlistState = { sort: "recent", page: 1 };
let detailState = { id: "", query: "", filter: "", sort: "manual", page: 1 };
const playback = { queue: [], index: 0, currentId: "", autoplayPlaylistId: null, expanded: false, seeking: false, miniSeeking: false };
let toastTimer = 0;
let searchTimer = 0;
let pendingVideo = null;
let searchOverlay;
let storageWarning = "";
let editingPlaylistId = null;
let pendingPlaylistVideoId = "";
let returnAfterPlaylistCreate = "";
let membershipVideoId = "";

// Read the browser's storage safely; Store switches to memory if it fails.
let storage = null;
try { storage = window.localStorage; } catch (_) { storage = null; }
let store;
store = createStore(storage, { onWarning: (message) => { storageWarning = message; if (store) render(); } });
homeState.order = shuffle(store.getVideos().map((video) => video.id));

// Keep comments out of video names and text inserted into HTML.
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const allVideos = () => store.getVideos();
const getCurrent = () => store.getVideo(playback.currentId);

// Show a short confirmation and an optional one-time Undo action.
function toast(message, undo) {
  clearTimeout(toastTimer);
  toastRegion.innerHTML = `<div class="toast"><p>${escapeHtml(message)}</p>${undo ? `<button data-action="undo">Undo</button>` : ""}</div>`;
  toastRegion.querySelector("button[data-action='undo']")?.addEventListener("click", () => {
    undo(); toastRegion.innerHTML = ""; render();
  }, { once: true });
  toastTimer = window.setTimeout(() => { toastRegion.innerHTML = ""; }, 5000);
}

// Build the common top bar and render the current hash route inside #app.
function render() {
  const route = parseRoute(location.hash);
  const warning = storageWarning ? `<p class="storage-warning">${escapeHtml(storageWarning)}</p>` : "";
  let content = "";
  if (route.name === "home") content = renderHome({ videos: allVideos(), order: homeState.order, filter: homeState.filter, page: homeState.page });
  else if (route.name === "playlists") content = renderPlaylists(store.getPlaylists(), allVideos(), playlistState);
  else {
    if (detailState.id !== route.id) detailState = { id: route.id, query: "", filter: "", sort: "manual", page: 1 };
    const playlist = store.getPlaylist(route.id);
    content = playlist ? renderPlaylistDetail(playlist, allVideos(), detailState) : `<button data-action="back-playlists">← Playlists</button><div class="empty-state"><h3>Playlist not found</h3><button data-action="back-playlists">Back to playlists</button></div>`;
  }
  app.innerHTML = `<div class="app-frame"><header class="topbar"><h1 class="brand">VIDEO VAULT</h1><button class="icon-button" data-action="open-search" aria-label="Search your vault">⌕</button></header>
    <nav class="tabs" aria-label="Main navigation"><a href="#/home" class="${route.name === "home" ? "active" : ""}">Home</a><a href="#/playlists" class="${route.name !== "home" ? "active" : ""}">Playlist</a></nav>${warning}<main id="routeView">${content}</main></div>`;
  if (route.name === "home") {
    const chipHost = app.querySelector("#homeChips");
    if (chipHost) chipHost.innerHTML = renderHomeChips(allVideos(), homeState.filter);
  }
  if (playback.currentId) updatePlayerLabels();
}

// Keep the same iframe and shell, changing only its CSS mode.
function setPlayerMode(mode) {
  playback.expanded = mode === "expanded";
  playerShell.classList.toggle("expanded", playback.expanded);
  playerShell.classList.toggle("mini", !playback.expanded);
  playerShell.classList.remove("is-hidden");
}

function updatePlayerLabels() {
  const video = getCurrent();
  if (!video) return;
  document.querySelector("#miniTitle").textContent = video.title;
  document.querySelector("#expandedTitle").textContent = video.title;
  document.querySelector("#expandedAuthor").textContent = video.author || "YouTube";
  document.querySelector("#playerShell [data-action='favorite-current']").textContent = video.favorite ? "♥ Favorited" : "♡ Favorite";
  const hasQueue = playback.queue.length > 1;
  document.querySelector("[data-action='previous-video']").hidden = !hasQueue;
  document.querySelector("[data-action='next-video']").hidden = !hasQueue;
}

// Start playback from a click and remember the full queue provided by the view.
function playVideo(videoId, queueIds = [videoId]) {
  const ids = queueIds.filter((id) => store.getVideo(id));
  if (!ids.includes(videoId)) ids.unshift(videoId);
  playback.queue = ids;
  playback.index = ids.indexOf(videoId);
  playback.currentId = videoId;
  playback.autoplayPlaylistId = null;
  updatePlayerLabels();
  setPlayerMode("mini");
  yt.loadVideo(videoId, true);
}

// Playlist playback queues the whole filtered and sorted list, across every page.
function playFromCurrentScreen(videoId) {
  const route = parseRoute(location.hash);
  if (route.name !== "playlist") { playVideo(videoId, [videoId]); return; }
  const playlist = store.getPlaylist(route.id);
  if (!playlist) { playVideo(videoId, [videoId]); return; }
  const videos = playlist.videoIds.map((id) => store.getVideo(id)).filter(Boolean);
  const visible = filterAndSortVideos(videos, { query: detailState.query, filter: detailState.filter, sort: detailState.sort, order: playlist.videoIds });
  playVideo(videoId, visible.map((video) => video.id));
  playback.autoplayPlaylistId = playlist.id;
}

// Learn missing title, channel, and duration when YouTube provides its player data.
function updateRealMetadata() {
  const video = getCurrent();
  if (!video) return;
  const data = yt.getVideoData();
  const duration = yt.getDuration();
  const changes = {};
  if ((video.title === "Untitled video" || !video.title) && data.title) changes.title = data.title;
  if (!video.author && data.author) changes.author = data.author;
  if (!video.durationSec && duration > 0) changes.durationSec = Math.floor(duration);
  if (Object.keys(changes).length) {
    store.updateVideo(video.id, changes);
    updatePlayerLabels();
    render();
  }
}

// Update both timelines and play buttons without re-rendering routed content.
function updatePlayerControls() {
  if (playerShell.classList.contains("is-hidden")) return;
  const duration = yt.getDuration();
  const current = yt.getTime();
  if (duration > 0) {
    const slider = document.querySelector("#expandedSeek");
    slider.max = String(Math.floor(duration));
    document.querySelector("#playerTime").textContent = `${formatTime(current)} / ${formatTime(duration)}`;
    if (!playback.seeking) slider.value = String(Math.floor(current));
    const mini = document.querySelector("#miniProgress");
    if (!playback.miniSeeking) mini.value = String(Math.floor(current / duration * 1000));
  }
  const isPlaying = yt.getState() === (window.YT?.PlayerState?.PLAYING ?? 1);
  playerShell.querySelectorAll("[data-action='toggle-playback']").forEach((button) => { button.textContent = isPlaying ? "Pause" : "Play"; });
  updateRealMetadata();
}

// Move through the queue after an explicit Prev/Next click or enabled autoplay.
function moveQueue(step, autoplay = true) {
  const nextIndex = playback.index + step;
  if (nextIndex < 0 || nextIndex >= playback.queue.length) return;
  playback.index = nextIndex;
  playback.currentId = playback.queue[nextIndex];
  updatePlayerLabels();
  yt.loadVideo(playback.currentId, autoplay);
}

// Create a playlist checkbox for the Add video dialog.
function fillPlaylistChoices(videoId = "") {
  const playlists = store.getPlaylists();
  const route = parseRoute(location.hash);
  addChoices.innerHTML = playlists.length ? `<p class="muted">Add to playlists</p>${playlists.map((playlist) => `<label><input type="checkbox" data-add-playlist="${escapeHtml(playlist.id)}" ${((videoId && playlist.videoIds.includes(videoId)) || (route.name === "playlist" && String(playlist.id) === route.id)) ? "checked" : ""}> ${escapeHtml(playlist.name)}</label>`).join("")}` : "";
}

// Open the create or rename dialog with the right title and optional follow-up.
function openPlaylistDialog({ id = null, videoId = "", returnTo = "" } = {}) {
  editingPlaylistId = id;
  pendingPlaylistVideoId = videoId;
  returnAfterPlaylistCreate = returnTo;
  document.querySelector("#playlistDialogTitle").textContent = id ? "Rename playlist" : "New playlist";
  document.querySelector("#playlistName").value = id ? (store.getPlaylist(id)?.name || "") : "";
  document.querySelector("#playlistMessage").textContent = "";
  document.querySelector("#playlistDialog").showModal();
  document.querySelector("#playlistName").focus();
}

// Let one video belong to any number of playlists.
function openMembershipDialog(videoId) {
  membershipVideoId = videoId;
  const video = store.getVideo(videoId);
  document.querySelector("#membershipChoices").innerHTML = store.getPlaylists().length
    ? store.getPlaylists().map((playlist) => `<label><input type="checkbox" data-membership-playlist="${escapeHtml(playlist.id)}" ${playlist.videoIds.includes(videoId) ? "checked" : ""}> ${escapeHtml(playlist.name)}</label>`).join("")
    : `<p class="muted">No playlists yet. Create one to organize ${escapeHtml(video?.title || "this video")}.</p>`;
  document.querySelector("#membershipDialog").showModal();
}

// Create or rename and keep the user's current task moving.
function savePlaylist(event) {
  event.preventDefault();
  const nameInput = document.querySelector("#playlistName");
  const message = document.querySelector("#playlistMessage");
  const name = nameInput.value.trim();
  if (!name) { message.textContent = "Enter a playlist name."; return; }
  const id = editingPlaylistId;
  const changed = id ? store.renamePlaylist(id, name) : store.createPlaylist(name);
  if (!changed) { message.textContent = "That playlist name is empty or already in use."; return; }
  const created = id ? store.getPlaylist(id) : changed;
  if (!id && pendingPlaylistVideoId) store.addToPlaylist(created.id, pendingPlaylistVideoId);
  const followUp = returnAfterPlaylistCreate;
  const videoId = pendingPlaylistVideoId;
  document.querySelector("#playlistDialog").close();
  editingPlaylistId = null; pendingPlaylistVideoId = ""; returnAfterPlaylistCreate = "";
  render();
  toast(id ? "Playlist renamed." : "Playlist created.");
  if (followUp === "membership") openMembershipDialog(videoId);
  else if (followUp === "add-video") {
    fillPlaylistChoices(pendingVideo?.id || "");
    const choice = addChoices.querySelector(`[data-add-playlist="${CSS.escape(created.id)}"]`);
    if (choice) choice.checked = true;
    addDialog.showModal();
  }
}

// Show a confirmation before deleting a playlist; videos remain in the library.
let playlistToDelete = "";
function confirmDeletePlaylist(id) {
  const playlist = store.getPlaylist(id);
  if (!playlist) return;
  playlistToDelete = id;
  document.querySelector("#confirmTitle").textContent = `Delete “${playlist.name}”?`;
  document.querySelector("#confirmText").textContent = "The playlist will be deleted. Its videos will stay in your library.";
  document.querySelector("#confirmDialog").showModal();
}

function deletePlaylistFromDialog(event) {
  event.preventDefault();
  const confirm = event.submitter?.value === "confirm";
  document.querySelector("#confirmDialog").close();
  if (!confirm) { playlistToDelete = ""; return; }
  const removed = store.deletePlaylist(playlistToDelete);
  playlistToDelete = "";
  if (!removed) return;
  if (parseRoute(location.hash).name === "playlist") navigate({ name: "playlists" });
  render();
  toast("Playlist deleted.", () => store.restorePlaylist(removed));
}

// Open the import dialog and reset its one-use preview state.
function openAddVideo() {
  addForm.reset(); preview.hidden = true; preview.innerHTML = ""; saveVideoButton.disabled = true;
  addMessage.textContent = ""; pendingVideo = null; fillPlaylistChoices();
  const route = parseRoute(location.hash);
  if (route.name === "playlist") {
    const choice = addChoices.querySelector(`[data-add-playlist="${CSS.escape(route.id)}"]`);
    if (choice) choice.checked = true;
  }
  addDialog.showModal(); addUrl.focus();
}

// Fetch only YouTube's public oEmbed title and author; importing still works offline.
async function previewVideo() {
  const id = extractVideoId(addUrl.value);
  if (!id) { addMessage.textContent = "Paste a valid YouTube video link or ID."; saveVideoButton.disabled = true; return; }
  pendingVideo = { id, title: "Untitled video", author: "", durationSec: null, tags: [] };
  addMessage.textContent = "Looking up the video…";
  try {
    const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}&format=json`;
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error("oEmbed unavailable");
    const info = await response.json();
    pendingVideo.title = info.title || pendingVideo.title;
    pendingVideo.author = info.author_name || "";
  } catch (_) {
    addMessage.textContent = "Could not fetch details. You can still save this as Untitled video.";
  }
  preview.innerHTML = `<img src="https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg" alt=""><p>${escapeHtml(pendingVideo.title)}${pendingVideo.author ? `<br><span class="muted">${escapeHtml(pendingVideo.author)}</span>` : ""}</p>`;
  preview.hidden = false;
  saveVideoButton.disabled = false;
  fillPlaylistChoices(id);
}

// Save a new video or add an existing one to selected playlists.
function saveVideo(event) {
  event.preventDefault();
  if (!pendingVideo) return;
  const tags = document.querySelector("#videoTags").value.split(",").map((tag) => tag.trim()).filter(Boolean);
  const result = store.addVideo({ ...pendingVideo, tags });
  const chosen = [...addChoices.querySelectorAll("[data-add-playlist]:checked")].map((input) => input.dataset.addPlaylist);
  chosen.forEach((playlistId) => store.addToPlaylist(playlistId, pendingVideo.id));
  if (!homeState.order.includes(pendingVideo.id)) homeState.order.unshift(pendingVideo.id);
  addDialog.close();
  render();
  toast(result.added ? "Video added to your library." : "Already in your library. Playlist choices updated.");
}

// Handle clicks through data-action so screen content can be replaced freely.
document.addEventListener("click", (event) => {
  const actionButton = event.target.closest("[data-action]");
  const videoCardElement = event.target.closest("[data-video-id]");
  if (videoCardElement && !actionButton && !event.target.closest("details")) {
    const id = videoCardElement.dataset.videoId;
    playFromCurrentScreen(id);
    return;
  }
  if (!actionButton) return;
  const { action, id, filter, page } = actionButton.dataset;
  if (action === "open-add-video") openAddVideo();
  else if (action === "shuffle") { homeState.order = shuffle(allVideos().map((video) => video.id)); homeState.page = 1; render(); }
  else if (action === "home-filter") { homeState.filter = homeState.filter === filter ? "" : filter; homeState.page = 1; render(); }
  else if (action === "clear-home-filter") { homeState.filter = ""; homeState.page = 1; render(); }
  else if (action === "home-page") { homeState.page = Number(page); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  else if (action === "open-search") openSearch();
  else if (action === "close-search") closeSearch();
  else if (action === "close-dialog") actionButton.closest("dialog")?.close();
  else if (action === "expand-player") setPlayerMode("expanded");
  else if (action === "minimize-player") setPlayerMode("mini");
  else if (action === "close-player") { yt.stop(); playerShell.classList.add("is-hidden"); playback.currentId = ""; playback.queue = []; }
  else if (action === "toggle-playback") { if (yt.getState() === (window.YT?.PlayerState?.PLAYING ?? 1)) yt.pause(); else yt.play(); }
  else if (action === "favorite-current") { const video = getCurrent(); if (video) store.updateVideo(video.id, { favorite: !video.favorite }); render(); updatePlayerLabels(); }
  else if (action === "favorite") { const video = store.getVideo(id); if (video) { store.updateVideo(id, { favorite: !video.favorite }); render(); toast(video.favorite ? "Removed from Favs." : "Added to Favs."); } }
  else if (action === "previous-video") moveQueue(-1, true);
  else if (action === "next-video") moveQueue(1, true);
  else if (action === "back-playlists") navigate({ name: "playlists" });
  else if (action === "rename-current-playlist") { const route = parseRoute(location.hash); if (route.name === "playlist") openPlaylistDialog({ id: route.id }); }
  else if (action === "remove-membership") {
    const route = parseRoute(location.hash);
    const removed = route.name === "playlist" ? store.removeFromPlaylist(route.id, id) : null;
    render();
    if (removed) toast("Video removed from playlist.", () => store.restoreMembership(removed));
  }
  else if (action === "delete-video") {
    const removed = store.deleteVideo(id);
    homeState.order = homeState.order.filter((videoId) => videoId !== id);
    render();
    if (removed) toast("Video deleted from your library.", () => { store.restoreVideo(removed); homeState.order.unshift(id); });
  }
  else if (action === "new-playlist") openPlaylistDialog();
  else if (action === "rename-playlist") openPlaylistDialog({ id });
  else if (action === "delete-playlist") confirmDeletePlaylist(id);
  else if (action === "playlist-page") { playlistState.page = Number(page); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  else if (action === "detail-page") { detailState.page = Number(page); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  else if (action === "add-to-playlist") openMembershipDialog(id);
  else if (action === "new-playlist-inline") { const videoId = membershipVideoId; document.querySelector("#membershipDialog").close(); openPlaylistDialog({ videoId, returnTo: "membership" }); }
  else if (action === "new-playlist-from-add") { document.querySelector("#addVideoDialog").close(); openPlaylistDialog({ returnTo: "add-video" }); }
});

// The global search surface is completed in its product phase.
function openSearch() {
  searchOverlay = document.querySelector("#searchOverlay");
  searchOverlay.hidden = false;
  document.querySelector("#globalSearch").focus();
}
function closeSearch() { if (searchOverlay) searchOverlay.hidden = true; }

// Wire the import preview and native dialog form.
document.querySelector("#previewVideo").addEventListener("click", previewVideo);
addForm.addEventListener("submit", saveVideo);
addUrl.addEventListener("input", () => { pendingVideo = null; saveVideoButton.disabled = true; });
document.querySelector("#playlistForm").addEventListener("submit", savePlaylist);
document.querySelector("#confirmForm").addEventListener("submit", deletePlaylistFromDialog);
document.querySelector("#membershipForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const selected = new Set([...document.querySelectorAll("[data-membership-playlist]")].filter((input) => input.checked).map((input) => input.dataset.membershipPlaylist));
  store.getPlaylists().forEach((playlist) => {
    if (selected.has(String(playlist.id))) store.addToPlaylist(playlist.id, membershipVideoId);
    else store.removeFromPlaylist(playlist.id, membershipVideoId);
  });
  document.querySelector("#membershipDialog").close();
  render(); toast("Playlist choices saved.");
});
document.addEventListener("change", (event) => {
  if (event.target.id === "playlistSort") { playlistState.sort = event.target.value; playlistState.page = 1; render(); }
  if (event.target.id === "playlistFilter") { detailState.filter = event.target.value; detailState.page = 1; render(); }
  if (event.target.id === "playlistVideoSort") { detailState.sort = event.target.value; detailState.page = 1; render(); }
  if (event.target.id === "autoplayToggle") {
    const route = parseRoute(location.hash);
    if (route.name === "playlist") store.setAutoplay(route.id, event.target.checked);
    render();
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "playlistSearch") {
    detailState.query = event.target.value;
    detailState.page = 1;
    const cursor = event.target.selectionStart;
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { render(); const input = document.querySelector("#playlistSearch"); input?.focus(); input?.setSelectionRange(cursor, cursor); }, 150);
  }
});
document.addEventListener("click", (event) => {
  const card = event.target.closest("[data-playlist-open]");
  if (card && !event.target.closest("[data-action]") && !event.target.closest("details")) navigate({ name: "playlist", id: card.dataset.playlistOpen });
});

// The API callback is global by design. This one iframe lives outside #app.
window.onYouTubeIframeAPIReady = () => {
  yt.createPlayer("youtubePlayer", {
    onReady: () => { yt.setVolume(store.getState().settings.volume); updatePlayerControls(); },
    onStateChange: (state) => {
      if (state === (window.YT?.PlayerState?.ENDED ?? 0)) {
        const playlist = playback.autoplayPlaylistId ? store.getPlaylist(playback.autoplayPlaylistId) : null;
        if (playlist?.autoplay && playback.index < playback.queue.length - 1) moveQueue(1, true);
      }
      updatePlayerControls();
    },
    onError: (code) => {
      if (code === 101 || code === 150) toast("This video can't be embedded.");
      else toast("YouTube could not play this video. Try another one.");
    }
  });
};
const apiScript = document.createElement("script");
apiScript.src = "https://www.youtube.com/iframe_api";
apiScript.async = true;
apiScript.onerror = () => toast("Could not load YouTube's player. Check your internet connection.");
document.head.appendChild(apiScript);

// Keep both seek bars synchronized without interrupting a drag.
document.querySelector("#expandedSeek").addEventListener("pointerdown", () => { playback.seeking = true; });
document.querySelector("#expandedSeek").addEventListener("input", (event) => { playback.seeking = true; document.querySelector("#playerTime").textContent = `${formatTime(event.target.value)} / ${formatTime(yt.getDuration())}`; });
document.querySelector("#expandedSeek").addEventListener("change", (event) => { playback.seeking = false; yt.seekTo(event.target.value, true); });
document.querySelector("#miniProgress").addEventListener("pointerdown", () => { playback.miniSeeking = true; });
document.querySelector("#miniProgress").addEventListener("change", (event) => { playback.miniSeeking = false; yt.seekTo(Number(event.target.value) / 1000 * yt.getDuration(), true); });
document.addEventListener("pointerup", () => { playback.seeking = false; playback.miniSeeking = false; });
document.querySelector("#playerVolume").value = String(store.getState().settings.volume);
document.querySelector("#playerVolume").addEventListener("input", (event) => { store.setVolume(event.target.value); yt.setVolume(event.target.value); });

// Space toggles playback unless typing; Escape closes the topmost surface.
document.addEventListener("keydown", (event) => {
  const typing = event.target.matches("input, textarea, select, [contenteditable='true']");
  if (event.key === " " && !typing && !playerShell.classList.contains("is-hidden")) { event.preventDefault(); if (yt.getState() === (window.YT?.PlayerState?.PLAYING ?? 1)) yt.pause(); else yt.play(); }
  if (event.key === "/" && !typing) { event.preventDefault(); openSearch(); }
  if (event.key === "Escape") {
    if (searchOverlay && !searchOverlay.hidden) closeSearch();
    else if (playerShell.classList.contains("expanded")) setPlayerMode("mini");
  }
});

// Initial route and short playback polling keep the app responsive.
watchRoute(render);
window.setInterval(updatePlayerControls, 250);
