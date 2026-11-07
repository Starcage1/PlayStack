import { createStore } from "./store.js";
import { extractVideoId } from "./video-id.js";
import { filterAndSortVideos, shuffle } from "./utils.js";
import { navigate, parseRoute, watchRoute } from "./router.js";
import * as yt from "./player.js";
import { formatTime, renderHome, renderHomeChips } from "./views/home.js";
import { renderPlaylists } from "./views/playlists.js";
import { renderPlaylistDetail } from "./views/playlist-detail.js";
import { searchLibrary } from "./search.js";

const app = document.querySelector("#app");
const sidebarContent = document.querySelector("#sidebarContent");
const sidebarScrim = document.querySelector("#sidebarScrim");
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
let youtubeApiReady = false;
let playerCreated = false;
let editingPlaylistId = null;
let pendingPlaylistVideoId = "";
let returnAfterPlaylistCreate = "";
let membershipVideoId = "";
let tagsEditingVideoId = "";
let sidebarShowAll = false;
let sidebarDrawerOpen = false;

// Use small original line icons instead of a third-party icon package.
const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  playlist: '<rect x="3" y="4" width="14" height="16" rx="2"/><path d="M7 8h6M7 12h6M7 16h3M20 7v10a3 3 0 1 1-2-2.8V7z"/>',
  favorite: '<path d="M20.8 8.8c0 5.2-8.8 11-8.8 11S3.2 14 3.2 8.8a4.3 4.3 0 0 1 8.8-1 4.3 4.3 0 0 1 8.8 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  shuffle: '<path d="m16 3 5 5-5 5M3 7h2c5 0 8 10 13 10h3M3 17h2c2.2 0 3.8-2 5.3-4.2M14 7c1.2-1.2 2.4-2 4-2h3"/>'
};
const icon = (name) => `<span class="sidebar-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${iconPaths[name] || iconPaths.playlist}</svg></span>`;

// Read the browser's storage safely; Store switches to memory if it fails.
let storage = null;
try { storage = window.localStorage; } catch (_) { storage = null; }
let sidebarCollapsed = window.innerWidth < 1300;
try {
  const savedSidebar = storage?.getItem("videovault:ui:sidebar-collapsed");
  if (savedSidebar !== null) sidebarCollapsed = savedSidebar === "true";
} catch (_) { /* Use the screen-width default. */ }
let store;
store = createStore(storage, { onWarning: (message) => { storageWarning = message; if (store) render(); } });
homeState.order = shuffle(store.getVideos().map((video) => video.id));

// Keep comments out of video names and text inserted into HTML.
const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const allVideos = () => store.getVideos();
const getCurrent = () => store.getVideo(playback.currentId);

// Show a short confirmation and an optional one-time Undo action.
function toast(message, action, actionLabel = "Undo") {
  clearTimeout(toastTimer);
  toastRegion.innerHTML = `<div class="toast"><p>${escapeHtml(message)}</p>${action ? `<button data-action="toast-action">${escapeHtml(actionLabel)}</button>` : ""}</div>`;
  toastRegion.querySelector("button[data-action='toast-action']")?.addEventListener("click", () => {
    toastRegion.innerHTML = ""; action(); render();
  }, { once: true });
  toastTimer = window.setTimeout(() => { toastRegion.innerHTML = ""; }, 5000);
}

// Build the common top bar and render the current hash route inside #app.
function render() {
  const route = parseRoute(location.hash);
  const warning = storageWarning ? `<p class="storage-warning">${escapeHtml(storageWarning)}</p>` : "";
  let content = "";
  if (route.name === "home") content = renderHome({ videos: allVideos(), order: homeState.order, filter: homeState.filter, page: homeState.page });
  else if (route.name === "favorites") content = renderHome({ videos: allVideos().filter((video) => video.favorite), order: homeState.order, filter: homeState.filter, page: homeState.page, title: "Favorites" });
  else if (route.name === "playlists") content = renderPlaylists(store.getPlaylists(), allVideos(), playlistState);
  else {
    if (detailState.id !== route.id) detailState = { id: route.id, query: "", filter: "", sort: "manual", page: 1 };
    const playlist = store.getPlaylist(route.id);
    content = playlist ? renderPlaylistDetail(playlist, allVideos(), detailState) : `<button data-action="back-playlists">← Playlists</button><div class="empty-state"><h3>Playlist not found</h3><button data-action="back-playlists">Back to playlists</button></div>`;
  }
  app.innerHTML = `${warning}<main id="routeView">${content}</main>`;
  renderSidebar(route);
  if (window.innerWidth < 800) sidebarDrawerOpen = false;
  applySidebarState();
  if (route.name === "home" || route.name === "favorites") {
    const chipHost = app.querySelector("#homeChips");
    if (chipHost) chipHost.innerHTML = renderHomeChips(route.name === "favorites" ? allVideos().filter((video) => video.favorite) : allVideos(), homeState.filter);
    setupChipScroller();
  }
  if (playback.currentId) updatePlayerLabels();
}

// Render fixed navigation separately from the routed page content.
function renderSidebar(route) {
  const playlists = store.getPlaylists();
  const shown = sidebarShowAll ? playlists : playlists.slice(0, 7);
  const playlistItems = shown.map((playlist) => `<button class="sidebar-link sidebar-playlist-link ${route.name === "playlist" && route.id === String(playlist.id) ? "active" : ""}" data-action="sidebar-playlist" data-id="${escapeHtml(playlist.id)}">${icon("playlist")}<span class="sidebar-playlist-copy"><span>${escapeHtml(playlist.name)}</span><small>${playlist.videoIds.length} ${playlist.videoIds.length === 1 ? "video" : "videos"}</small></span></button>`).join("");
  sidebarContent.innerHTML = `<div class="sidebar-section">
      <button class="sidebar-link ${route.name === "home" ? "active" : ""}" data-action="nav-home">${icon("home")}<span>Home</span></button>
      <button class="sidebar-link ${route.name === "playlists" ? "active" : ""}" data-action="nav-playlists">${icon("playlist")}<span>Playlists</span></button>
      <button class="sidebar-link ${route.name === "favorites" ? "active" : ""}" data-action="nav-favorites">${icon("favorite")}<span>Favorites</span></button>
    </div><div class="sidebar-section"><div class="sidebar-title">Your playlists</div>${playlistItems}
      ${playlists.length > 7 ? `<button class="sidebar-link sidebar-show-more" data-action="sidebar-show-more">${sidebarShowAll ? "Show less" : "Show more"}</button>` : ""}
      <button class="sidebar-link" data-action="new-playlist">${icon("plus")}<span>New playlist</span></button>
    </div>`;
}

// Apply and persist the desktop sidebar choice; phones use an overlay drawer.
function applySidebarState() {
  document.body.classList.toggle("sidebar-collapsed", sidebarCollapsed);
  document.body.classList.toggle("sidebar-expanded", !sidebarCollapsed);
  document.body.classList.toggle("sidebar-open", sidebarDrawerOpen);
  sidebarScrim.hidden = !sidebarDrawerOpen;
}

// Enable chip arrows only when the row has content outside its viewport.
function setupChipScroller() {
  const row = app.querySelector("#homeChips");
  if (!row) return;
  const update = () => {
    const overflow = row.scrollWidth > row.clientWidth + 2;
    app.querySelectorAll(".chip-arrow[data-action^='chips-']").forEach((button) => { button.hidden = !overflow; });
    app.querySelector(".chip-edge-left")?.classList.toggle("visible", row.scrollLeft > 0);
    app.querySelector(".chip-edge-right")?.classList.toggle("visible", row.scrollLeft + row.clientWidth < row.scrollWidth - 2);
  };
  row.addEventListener("scroll", update, { passive: true });
  window.requestAnimationFrame(update);
}

// Keep the same iframe and shell, changing only its CSS mode.
function setPlayerMode(mode) {
  playback.expanded = mode === "expanded";
  playerShell.classList.toggle("expanded", playback.expanded);
  playerShell.classList.toggle("mini", !playback.expanded);
  playerShell.classList.remove("is-hidden");
  document.body.classList.add("has-mini-player");
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
  initializePlayer();
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

// Build the playlist's full filtered and sorted queue, not just the current page.
function playPlaylist(id, randomize = false) {
  const playlist = store.getPlaylist(id);
  if (!playlist) return;
  const videos = playlist.videoIds.map((videoId) => store.getVideo(videoId)).filter(Boolean);
  let queue = filterAndSortVideos(videos, { query: detailState.query, filter: detailState.filter, sort: detailState.sort, order: playlist.videoIds }).map((video) => video.id);
  if (randomize) queue = shuffle(queue);
  if (!queue.length) return;
  playVideo(queue[0], queue);
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

// Edit a video's tags without changing its playlist memberships.
function openTagsDialog(videoId) {
  const video = store.getVideo(videoId);
  if (!video) return;
  tagsEditingVideoId = videoId;
  document.querySelector("#editTagsInput").value = video.tags.join(", ");
  document.querySelector("#tagsDialog").showModal();
}

function saveTags(event) {
  event.preventDefault();
  const tags = document.querySelector("#editTagsInput").value.split(",").map((tag) => tag.trim()).filter(Boolean);
  store.updateVideo(tagsEditingVideoId, { tags });
  tagsEditingVideoId = "";
  document.querySelector("#tagsDialog").close();
  render(); toast("Tags updated.");
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
  if (action === "toggle-sidebar") {
    if (window.innerWidth < 800) sidebarDrawerOpen = !sidebarDrawerOpen;
    else {
      sidebarCollapsed = !sidebarCollapsed;
      try { storage?.setItem("videovault:ui:sidebar-collapsed", String(sidebarCollapsed)); } catch (_) { /* Keep the choice for this page. */ }
    }
    applySidebarState();
  }
  else if (action === "close-sidebar") { sidebarDrawerOpen = false; applySidebarState(); }
  else if (action === "nav-home") { sidebarDrawerOpen = false; navigate({ name: "home" }); }
  else if (action === "nav-playlists") { sidebarDrawerOpen = false; navigate({ name: "playlists" }); }
  else if (action === "nav-favorites") { sidebarDrawerOpen = false; navigate({ name: "favorites" }); }
  else if (action === "sidebar-playlist") { sidebarDrawerOpen = false; navigate({ name: "playlist", id }); }
  else if (action === "sidebar-show-more") { sidebarShowAll = !sidebarShowAll; render(); }
  else if (action === "play-all-playlist") playPlaylist(parseRoute(location.hash).id);
  else if (action === "shuffle-playlist") playPlaylist(parseRoute(location.hash).id, true);
  else if (action === "open-add-video") openAddVideo();
  else if (action === "shuffle") { homeState.order = shuffle(allVideos().map((video) => video.id)); homeState.page = 1; render(); }
  else if (action === "home-filter") { const selected = filter === "All" ? "" : filter; homeState.filter = homeState.filter === selected ? "" : selected; homeState.page = 1; render(); }
  else if (action === "chips-left" || action === "chips-right") app.querySelector("#homeChips")?.scrollBy({ left: action === "chips-left" ? -260 : 260, behavior: "smooth" });
  else if (action === "clear-home-filter") { homeState.filter = ""; homeState.page = 1; render(); }
  else if (action === "home-page") { homeState.page = Number(page); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  else if (action === "open-search") openSearch();
  else if (action === "close-search") closeSearch();
  else if (action === "close-dialog") actionButton.closest("dialog")?.close();
  else if (action === "expand-player") setPlayerMode("expanded");
  else if (action === "minimize-player") setPlayerMode("mini");
  else if (action === "close-player") { yt.stop(); playerShell.classList.add("is-hidden"); document.body.classList.remove("has-mini-player"); playback.currentId = ""; playback.queue = []; }
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
    if (playback.currentId === id) { yt.stop(); playerShell.classList.add("is-hidden"); document.body.classList.remove("has-mini-player"); playback.currentId = ""; playback.queue = []; }
    render();
    if (removed) toast("Video deleted from your library.", () => { store.restoreVideo(removed); homeState.order.unshift(id); });
  }
  else if (action === "new-playlist") openPlaylistDialog();
  else if (action === "rename-playlist") openPlaylistDialog({ id });
  else if (action === "delete-playlist") confirmDeletePlaylist(id);
  else if (action === "playlist-page") { playlistState.page = Number(page); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  else if (action === "detail-page") { detailState.page = Number(page); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  else if (action === "add-to-playlist") openMembershipDialog(id);
  else if (action === "edit-tags") openTagsDialog(id);
  else if (action === "search-play-video") { closeSearch(); playVideo(id, [id]); }
  else if (action === "search-open-playlist") { closeSearch(); navigate({ name: "playlist", id }); }
  else if (action === "new-playlist-inline") { const videoId = membershipVideoId; document.querySelector("#membershipDialog").close(); openPlaylistDialog({ videoId, returnTo: "membership" }); }
  else if (action === "new-playlist-from-add") { document.querySelector("#addVideoDialog").close(); openPlaylistDialog({ returnTo: "add-video" }); }
});

// The global search surface is completed in its product phase.
function openSearch() {
  searchOverlay = document.querySelector("#searchOverlay");
  searchOverlay.hidden = false;
  const input = document.querySelector("#globalSearch");
  input.value = "";
  document.querySelector("#searchResults").innerHTML = `<p class="muted">Search by video title, channel, tag, or playlist name.</p>`;
  input.focus();
}
function closeSearch() { if (searchOverlay) searchOverlay.hidden = true; }

// Show video and playlist matches together as the user types.
function renderSearchResults(query) {
  const results = searchLibrary(allVideos(), store.getPlaylists(), query);
  const videoRows = results.videos.map((video) => `<button class="search-result" data-action="search-play-video" data-id="${escapeHtml(video.id)}">${escapeHtml(video.title)}<small>${escapeHtml(video.author || "YouTube video")} · ${(video.tags || []).map(escapeHtml).join(", ")}</small></button>`).join("");
  const playlistRows = results.playlists.map((playlist) => `<button class="search-result" data-action="search-open-playlist" data-id="${escapeHtml(playlist.id)}">${escapeHtml(playlist.name)}<small>${playlist.videoIds.length} ${playlist.videoIds.length === 1 ? "video" : "videos"}</small></button>`).join("");
  document.querySelector("#searchResults").innerHTML = results.videos.length || results.playlists.length
    ? `${videoRows ? `<section class="search-group"><h3>Videos</h3>${videoRows}</section>` : ""}${playlistRows ? `<section class="search-group"><h3>Playlists</h3>${playlistRows}</section>` : ""}`
    : `<div class="empty-state"><h3>No results</h3><p>Try a different title, channel, tag, or playlist name.</p></div>`;
}

// Wire the import preview and native dialog form.
document.querySelector("#previewVideo").addEventListener("click", previewVideo);
addForm.addEventListener("submit", saveVideo);
addUrl.addEventListener("input", () => { pendingVideo = null; saveVideoButton.disabled = true; });
document.querySelector("#playlistForm").addEventListener("submit", savePlaylist);
document.querySelector("#confirmForm").addEventListener("submit", deletePlaylistFromDialog);
document.querySelector("#tagsForm").addEventListener("submit", saveTags);
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
  if (event.target.id === "globalSearch") {
    const query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => renderSearchResults(query), 150);
  }
});
document.addEventListener("click", (event) => {
  const card = event.target.closest("[data-playlist-open]");
  if (card && !event.target.closest("[data-action]") && !event.target.closest("details")) navigate({ name: "playlist", id: card.dataset.playlistOpen });
});

// Create the one iframe only after its shell has its visible 200px viewport.
function initializePlayer() {
  if (!youtubeApiReady || playerCreated) return;
  playerCreated = true;
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
      if (code === 101 || code === 150) {
        const videoId = playback.currentId;
        toast("This video can't be embedded.", () => {
          const removed = store.deleteVideo(videoId);
          yt.stop(); playerShell.classList.add("is-hidden"); document.body.classList.remove("has-mini-player"); playback.currentId = ""; playback.queue = [];
          homeState.order = homeState.order.filter((id) => id !== videoId);
          if (removed) toast("Video removed from your library.", () => { store.restoreVideo(removed); homeState.order.unshift(videoId); });
        }, "Remove video");
      }
      else toast("YouTube could not play this video. Try another one.");
    }
  });
}

// The API callback is global by design. A player click reveals the shell first.
window.onYouTubeIframeAPIReady = () => { youtubeApiReady = true; initializePlayer(); };
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
  if ((event.key === "Enter" || event.key === " ") && !typing) {
    const videoCard = event.target.closest("[data-video-id]");
    const playlistCard = event.target.closest("[data-playlist-open]");
    if (videoCard && !event.target.closest("button, summary, details")) { event.preventDefault(); playFromCurrentScreen(videoCard.dataset.videoId); }
    else if (playlistCard && !event.target.closest("button, summary, details")) { event.preventDefault(); navigate({ name: "playlist", id: playlistCard.dataset.playlistOpen }); }
  }
  if (event.key === " " && !typing && !event.target.closest("button, a, summary, [data-video-id], [data-playlist-open]") && !playerShell.classList.contains("is-hidden")) { event.preventDefault(); if (yt.getState() === (window.YT?.PlayerState?.PLAYING ?? 1)) yt.pause(); else yt.play(); }
  if (event.key === "/" && !typing && !document.querySelector("dialog[open]")) { event.preventDefault(); openSearch(); }
  if (event.key === "Escape") {
    if (document.querySelector("dialog[open]")) return;
    if (searchOverlay && !searchOverlay.hidden) closeSearch();
    else if (playerShell.classList.contains("expanded")) setPlayerMode("mini");
  }
});

// Keep the thumbnail box in place when a video has no available thumbnail.
document.addEventListener("error", (event) => {
  if (event.target instanceof HTMLImageElement && (event.target.classList.contains("thumb-image") || event.target.classList.contains("playlist-cover"))) {
    event.target.removeAttribute("src");
    event.target.classList.add("thumbnail-missing");
    event.target.closest(".thumb-frame")?.classList.add("thumbnail-failed");
  }
}, true);
document.addEventListener("load", (event) => {
  if (event.target instanceof HTMLImageElement && event.target.classList.contains("thumb-image")) event.target.classList.add("is-loaded");
}, true);

// Initial route and short playback polling keep the app responsive.
watchRoute(render);
window.setInterval(updatePlayerControls, 250);
