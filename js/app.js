import { createStore } from "./store.js";
import { filterAndSortVideos, shuffle, paginate, sortPlaylists } from "./utils.js";
import { searchLibrary, rankVideoMatches } from "./search.js";
import { VIDEO_PAGE_SIZE, PLAYLIST_PAGE_SIZE } from "./config.js";
import { extractYouTubeLinks, extractPlaylistId, extractImportFileLinks, previewVideoImports, saveVideoImportBatch } from "./importer.js";
import { navigate, parseRoute, watchRoute } from "./router.js";
import * as yt from "./player.js";
import { formatTime, renderHome, renderHomeChips } from "./views/home.js";
import { renderPlaylists } from "./views/playlists.js";
import { renderPlaylistDetail } from "./views/playlist-detail.js";
import { renderSearchPage } from "./views/search-results.js";
import { renderCommands } from "./views/commands.js";
import { initVoiceUI } from "./voice/voice-ui.js";
import { parseCommand } from "./voice/intents.js";
import { createVoiceActions } from "./voice/actions.js";
import { responseFor } from "./voice/responses.js";
import { COMMANDS } from "./voice/intents.js";

const app = document.querySelector("#app");
const sidebarContent = document.querySelector("#sidebarContent");
const sidebarScrim = document.querySelector("#sidebarScrim");
const globalSearchForm = document.querySelector("#globalSearchForm");
const globalSearchInput = document.querySelector("#globalSearch");
const clearGlobalSearch = document.querySelector("#clearGlobalSearch");
const playerShell = document.querySelector("#playerShell");
const toastRegion = document.querySelector("#toastRegion");
const addDialog = document.querySelector("#addVideoDialog");
const addForm = document.querySelector("#addVideoForm");
const addLinks = document.querySelector("#addVideoLinks");
const addMessage = document.querySelector("#addVideoMessage");
const preview = document.querySelector("#videoPreview");
const saveVideoButton = document.querySelector("#saveVideo");
const addChoices = document.querySelector("#addPlaylistChoices");
const importProgress = document.querySelector("#importProgress");
const importProgressBar = document.querySelector("#importProgressBar");
const importProgressText = document.querySelector("#importProgressText");
const importFile = document.querySelector("#importFile");
const importPlaylistUrl = document.querySelector("#importPlaylistUrl");
const homeState = { filter: "", page: 1, order: [] };
const commandsState = { query: "", category: "", tab: "voice" };
const playlistState = { sort: "recent", page: 1 };
let detailState = { id: "", query: "", filter: "", sort: "manual", page: 1 };
const playback = { queue: [], index: 0, currentId: "", autoplayPlaylistId: null, expanded: false, seeking: false, miniSeeking: false };
let toastTimer = 0;
let searchTimer = 0;
let pendingVideos = [];
let importTab = "links";
let storageWarning = "";
let youtubeApiReady = false;
let playerCreated = false;
let handledImportHash = "";
let editingPlaylistId = null;
let pendingPlaylistVideoId = "";
let returnAfterPlaylistCreate = "";
let membershipVideoId = "";
let tagsEditingVideoId = "";
let sidebarShowAll = false;
let sidebarDrawerOpen = false;
let watchNavigationPushed = false;
let watchLibraryOrder = [];
let voiceUI = null;
let sleepTimer = { timeout: 0, deadline: 0, minutes: 0 };
let theaterMode = false;
let ambientMode = true;
let volumeBeforeMute = 100;
playerShell.classList.add("ambient-on");

// Use small original line icons instead of a third-party icon package.
const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z"/>',
  playlist: '<rect x="3" y="4" width="14" height="16" rx="2"/><path d="M7 8h6M7 12h6M7 16h3M20 7v10a3 3 0 1 1-2-2.8V7z"/>',
  favorite: '<path d="M20.8 8.8c0 5.2-8.8 11-8.8 11S3.2 14 3.2 8.8a4.3 4.3 0 0 1 8.8-1 4.3 4.3 0 0 1 8.8 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  shuffle: '<path d="m16 3 5 5-5 5M3 7h2c5 0 8 10 13 10h3M3 17h2c2.2 0 3.8-2 5.3-4.2M14 7c1.2-1.2 2.4-2 4-2h3"/>',
  commands: '<path d="M5 5h14v14H5zM8 9h8M8 12h8M8 15h5"/>',
  settings: '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/><path d="m19.4 15 .1.1 1.5 1.2-1.5 2.6-1.8-.7a7.7 7.7 0 0 1-1.5.9l-.3 1.9h-3l-.3-1.9a7.7 7.7 0 0 1-1.5-.9l-1.8.7-1.5-2.6 1.5-1.2a7.5 7.5 0 0 1 0-1.8l-1.5-1.2 1.5-2.6 1.8.7a7.7 7.7 0 0 1 1.5-.9l.3-1.9h3l.3 1.9a7.7 7.7 0 0 1 1.5.9l1.8-.7 1.5 2.6-1.5 1.2a7.5 7.5 0 0 1 0 1.8z"/>'
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
watchLibraryOrder = shuffle(store.getVideos().map((video) => video.id));

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
  else if (route.name === "import") content = renderHome({ videos: allVideos(), order: homeState.order, filter: homeState.filter, page: homeState.page });
  else if (route.name === "favorites") content = renderHome({ videos: allVideos().filter((video) => video.favorite), order: homeState.order, filter: homeState.filter, page: homeState.page, title: "Favorites" });
  else if (route.name === "playlists") content = renderPlaylists(store.getPlaylists(), allVideos(), playlistState);
  else if (route.name === "commands") content = renderCommands(COMMANDS, commandsState);
  else if (route.name === "settings") content = `<section class="screen-heading"><div><h1>Settings</h1><p class="muted">Personalize your player and voice controls.</p></div></section><div class="empty-state"><p>Settings options are being organized.</p></div>`;
  else if (route.name === "watch") content = playback.currentId ? "" : `<div class="empty-state"><h2>Nothing is playing</h2><p>Choose a video from Home or a playlist.</p><button data-action="nav-home">Go to Home</button></div>`;
  else if (route.name === "search") content = renderSearchPage(allVideos(), store.getPlaylists(), route.query);
  else {
    if (detailState.id !== route.id) detailState = { id: route.id, query: "", filter: "", sort: "manual", page: 1 };
    const playlist = store.getPlaylist(route.id);
    content = playlist ? renderPlaylistDetail(playlist, allVideos(), detailState) : `<button data-action="back-playlists">← Playlists</button><div class="empty-state"><h3>Playlist not found</h3><button data-action="back-playlists">Back to playlists</button></div>`;
  }
  app.innerHTML = `${warning}<main id="routeView">${content}</main>`;
  app.classList.toggle("watch-route", route.name === "watch");
  document.body.classList.toggle("watch-route", route.name === "watch");
  if (route.name === "search") { globalSearchInput.value = route.query; clearGlobalSearch.hidden = !route.query; }
  renderSidebar(route);
  if (window.innerWidth < 800) sidebarDrawerOpen = false;
  applySidebarState();
  syncPlayerRoute(route);
  if (route.name === "home" || route.name === "favorites" || route.name === "import") {
    const chipHost = app.querySelector("#homeChips");
    if (chipHost) chipHost.innerHTML = renderHomeChips(route.name === "favorites" ? allVideos().filter((video) => video.favorite) : allVideos(), homeState.filter);
    setupChipScroller();
  }
  if (playback.currentId) updatePlayerLabels();
  if (route.name === "import" && handledImportHash !== location.hash) {
    handledImportHash = location.hash;
    window.setTimeout(() => openAddVideo(route.url), 0);
  }
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
      <button class="sidebar-link ${route.name === "commands" ? "active" : ""}" data-action="nav-commands">${icon("commands")}<span>Commands</span></button>
      <button class="sidebar-link ${route.name === "settings" ? "active" : ""}" data-action="nav-settings">${icon("settings")}<span>Settings</span></button>
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
function syncPlayerRoute(route = parseRoute(location.hash)) {
  if (!playback.currentId) return;
  const expanded = route.name === "watch";
  playerShell.classList.toggle("expanded", expanded);
  playerShell.classList.toggle("mini", !expanded);
  playerShell.classList.remove("is-hidden");
  document.body.classList.add("has-mini-player");
  if (!expanded) watchNavigationPushed = false;
}

function setPlayerMode(mode) {
  if (mode === "expanded") {
    if (parseRoute(location.hash).name !== "watch") {
      watchNavigationPushed = true;
      navigate({ name: "watch" });
    }
    syncPlayerRoute({ name: "watch" });
  } else if (parseRoute(location.hash).name === "watch") {
    if (watchNavigationPushed) { watchNavigationPushed = false; history.back(); }
    else navigate({ name: "home" });
  }
}

function updatePlayerLabels() {
  const video = getCurrent();
  if (!video) return;
  document.querySelector("#miniTitle").textContent = video.title;
  document.querySelector("#expandedTitle").textContent = video.title;
  document.querySelector("#expandedAuthor").textContent = video.author || "YouTube";
  const hue = [...(video.author || "Video Vault")].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 0);
  const avatar = document.querySelector("#watchAvatar");
  avatar.textContent = (video.author || "V").trim().charAt(0).toLocaleUpperCase() || "V";
  avatar.style.setProperty("--avatar-hue", hue);
  document.querySelector("#playerShell [data-action='favorite-current']").textContent = video.favorite ? "♥ Favorited" : "♡ Favorite";
  const hasQueue = playback.queue.length > 1;
  document.querySelector("[data-action='previous-video']").hidden = !hasQueue;
  document.querySelector("[data-action='next-video']").hidden = !hasQueue;
  renderWatchQueue();
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
  if (parseRoute(location.hash).name !== "watch") {
    watchNavigationPushed = true;
    navigate({ name: "watch" });
  }
  syncPlayerRoute({ name: "watch" });
  initializePlayer();
  yt.loadVideo(videoId, true);
}

// Keep Up next tied to the active queue, or offer a shuffled personal fallback.
function renderWatchQueue() {
  const panel = document.querySelector("#watchQueuePanel");
  if (!panel || !playback.currentId) return;
  const playlist = playback.autoplayPlaylistId ? store.getPlaylist(playback.autoplayPlaylistId) : null;
  const queued = playback.queue.length > 1;
  const videos = queued
    ? playback.queue.map((id) => store.getVideo(id)).filter(Boolean)
    : watchLibraryOrder.map((id) => store.getVideo(id)).filter((video) => video && video.id !== playback.currentId).slice(0, 12);
  const heading = queued ? (playlist?.name || "Up next") : "From your library";
  const toggle = queued && playlist ? `<label><input id="watchAutoplay" type="checkbox" ${playlist.autoplay ? "checked" : ""}> Autoplay Seq</label>` : "";
  const rows = videos.map((video) => `<button class="queue-row ${video.id === playback.currentId ? "current" : ""}" data-action="watch-queue-video" data-id="${escapeHtml(video.id)}"><img loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg" alt=""><span>${escapeHtml(video.title)}<small>${escapeHtml(video.author || "YouTube")}${video.id === playback.currentId ? " · Playing" : ""}</small></span></button>`).join("");
  panel.innerHTML = `<div class="queue-heading"><h2>${escapeHtml(heading)}</h2>${toggle}</div><div class="queue-list">${rows || `<p class="muted">No other saved videos yet.</p>`}</div>`;
}

function playQueueItem(id) {
  if (!playback.queue.includes(id)) { playVideo(id, [id]); return; }
  playback.index = playback.queue.indexOf(id);
  playback.currentId = id;
  updatePlayerLabels();
  yt.loadVideo(id, true);
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
  if (nextIndex < 0 || nextIndex >= playback.queue.length) return false;
  playback.index = nextIndex;
  playback.currentId = playback.queue[nextIndex];
  updatePlayerLabels();
  yt.loadVideo(playback.currentId, autoplay);
  return true;
}

// Update the same app state and controls used by regular mouse actions.
function createVoiceActionRunner() {
  return createVoiceActions({
    player: yt,
    store,
    navigate,
    getContext: () => {
      const route = parseRoute(location.hash);
      return {
        currentVideoId: playback.currentId,
        currentPlaylistId: route.name === "playlist" ? route.id : playback.autoplayPlaylistId,
        routeName: route.name,
        volume: store.getState().settings.volume,
        playlists: store.getPlaylists()
      };
    },
    nextVideo: () => moveQueue(1, true),
    previousVideo: () => moveQueue(-1, true),
    refresh: () => {
      render();
      if (playback.currentId) updatePlayerLabels();
      document.querySelector("#playerVolume").value = String(store.getState().settings.volume);
    },
    setPlaylistSort: (sort, playlistId) => {
      detailState.sort = sort;
      detailState.page = 1;
      const playlist = store.getPlaylist(playlistId);
      if (playlist && String(playback.autoplayPlaylistId) === String(playlistId)) {
        const videos = playlist.videoIds.map((id) => store.getVideo(id)).filter(Boolean);
        const sortedIds = filterAndSortVideos(videos, { query: detailState.query, filter: detailState.filter, sort, order: playlist.videoIds }).map((video) => video.id);
        playback.queue = sortedIds.length ? sortedIds : [playback.currentId];
        playback.index = Math.max(0, playback.queue.indexOf(playback.currentId));
      }
      render();
      if (playback.currentId) updatePlayerLabels();
    },
    setPlaylistsSort: (sort) => { playlistState.sort = sort; playlistState.page = 1; render(); },
    openCreatedPlaylist: (playlist) => { render(); navigate({ name: "playlist", id: playlist.id }); },
    handlers: createExtendedVoiceHandlers()
  });
}

function createExtendedVoiceHandlers() {
  return {
    play_visible: ({ index }) => {
      const cards = [...document.querySelectorAll("#routeView [data-video-id]")];
      if (!cards.length) return { ok: false, reason: "no_visible_videos" };
      const position = Number(index) < 0 ? cards.length : Number(index);
      const video = store.getVideo(cards[position - 1]?.dataset.videoId);
      if (!video) return { ok: false, reason: "visible_index_missing" };
      playFromCurrentScreen(video.id);
      return { ok: true, reason: "named_playing", title: video.title };
    },
    play_random: ({ source }) => {
      let videos = allVideos();
      let sourcePlaylist = null;
      if (source && source !== "current") {
        sourcePlaylist = store.getPlaylists().find((item) => item.name.toLowerCase().includes(source.toLowerCase())) || null;
        videos = sourcePlaylist ? sourcePlaylist.videoIds.map((id) => store.getVideo(id)).filter(Boolean)
          : videos.filter((video) => (video.title + " " + video.author + " " + video.tags.join(" ")).toLowerCase().includes(source.toLowerCase()));
      } else if (parseRoute(location.hash).name === "playlist") {
        const playlist = store.getPlaylist(parseRoute(location.hash).id);
        videos = playlist ? filterAndSortVideos(playlist.videoIds.map((id) => store.getVideo(id)).filter(Boolean), { query: detailState.query, filter: detailState.filter, sort: detailState.sort, order: playlist.videoIds }) : [];
      } else if (parseRoute(location.hash).name === "home") {
        videos = homeState.order.map((id) => store.getVideo(id)).filter(Boolean);
        if (homeState.filter === "Favs") videos = videos.filter((item) => item.favorite);
        else if (homeState.filter !== "Recently added" && homeState.filter) videos = videos.filter((item) => item.tags.some((tag) => tag.toLowerCase() === homeState.filter.toLowerCase()));
      }
      if (!videos.length) return { ok: false, reason: "no_matching_videos" };
      const video = videos[Math.floor(Math.random() * videos.length)];
      if (sourcePlaylist) {
        playVideo(video.id, sourcePlaylist.videoIds);
        playback.autoplayPlaylistId = sourcePlaylist.id;
      } else playFromCurrentScreen(video.id);
      return { ok: true, reason: "named_playing", title: video.title };
    },
    play_named: ({ query }) => {
      const matches = rankVideoMatches(allVideos(), query);
      if (!matches.length) return { ok: false, reason: "video_not_found", query };
      if (matches.length > 1 && (matches[0].score < 0.9 || matches[0].score - matches[1].score < 0.2)) {
        navigate({ name: "search", query });
        return { ok: true, reason: "video_matches", count: matches.length, query };
      }
      playFromCurrentScreen(matches[0].video.id);
      return { ok: true, reason: "named_playing", title: matches[0].video.title };
    },
    search: ({ query }) => {
      if (parseRoute(location.hash).name === "playlist") { detailState.query = query; detailState.page = 1; render(); }
      else navigate({ name: "search", query });
      return { ok: true, reason: "search_done" };
    },
    clear_search: () => {
      if (parseRoute(location.hash).name === "playlist") { detailState.query = ""; detailState.page = 1; render(); }
      else { homeState.filter = ""; homeState.page = 1; navigate({ name: "home" }); }
      return { ok: true, reason: "search_cleared" };
    },
    page_next: () => changeVoicePage(1),
    page_previous: () => changeVoicePage(-1),
    page_number: ({ page }) => setVoicePage(page),
    scroll: ({ direction }) => { window.scrollBy({ top: (direction === "down" ? 1 : -1) * window.innerHeight * 0.75, behavior: "smooth" }); return { ok: true, reason: "scrolled" }; },
    scroll_top: () => { window.scrollTo({ top: 0, behavior: "smooth" }); return { ok: true, reason: "scrolled_top" }; },
    open_settings: () => { navigate({ name: "settings" }); return { ok: true, reason: "settings_opened" }; },
    open_commands: () => { commandsState.category = ""; navigate({ name: "commands" }); return { ok: true, reason: "commands_opened" }; },
    open_import: () => { openAddVideo(); return { ok: true, reason: "import_opened" }; },
    go_back: () => { if (history.length > 1) history.back(); else navigate({ name: "home" }); return { ok: true, reason: "went_back" }; },
    sleep_timer_set: ({ minutes }) => {
      clearTimeout(sleepTimer.timeout); sleepTimer.minutes = Number(minutes); sleepTimer.deadline = Date.now() + sleepTimer.minutes * 60000;
      sleepTimer.timeout = window.setTimeout(() => { yt.pause(); sleepTimer = { timeout: 0, deadline: 0, minutes: 0 }; toast("Sleep timer paused playback."); }, sleepTimer.minutes * 60000);
      return { ok: true, reason: "sleep_timer_set", minutes: sleepTimer.minutes };
    },
    sleep_timer_cancel: () => { clearTimeout(sleepTimer.timeout); sleepTimer = { timeout: 0, deadline: 0, minutes: 0 }; return { ok: true, reason: "sleep_timer_cancelled" }; },
    sleep_timer_status: () => ({ ok: true, reason: "sleep_timer_status", remaining: Math.max(0, Math.ceil((sleepTimer.deadline - Date.now()) / 60000)) }),
    theater_mode: ({ enabled }) => { theaterMode = enabled ?? !theaterMode; document.body.classList.toggle("theater-mode", theaterMode); return { ok: true, reason: "theater_updated", enabled: theaterMode }; },
    fullscreen_mode: async ({ enabled }) => {
      if (enabled === false && document.fullscreenElement) await document.exitFullscreen();
      else if (enabled !== false && !document.fullscreenElement) await playerShell.requestFullscreen?.();
      return { ok: true, reason: "fullscreen_updated" };
    },
    ambient_mode: ({ enabled }) => { ambientMode = enabled ?? !ambientMode; playerShell.classList.toggle("ambient-on", ambientMode); return { ok: true, reason: "ambient_updated", enabled: ambientMode }; },
    minimize_player: () => { setPlayerMode("mini"); return { ok: true, reason: "player_minimized" }; },
    expand_player: () => { setPlayerMode("expanded"); return { ok: true, reason: "player_expanded" }; },
    help: ({ category }) => { commandsState.category = category || ""; commandsState.tab = "voice"; navigate({ name: "commands" }); return { ok: true, reason: "help_opened" }; },
    what_playing: () => ({ ok: true, reason: "what_playing", video: getCurrent() }),
    library_count: () => ({ ok: true, reason: "library_count", count: allVideos().length }),
    playlist_count: () => ({ ok: true, reason: "playlist_count", count: store.getPlaylists().length }),
    list_playlists: () => ({ ok: true, reason: "list_playlists", names: store.getPlaylists().map((item) => item.name) })
  };
}

function changeVoicePage(step) {
  const route = parseRoute(location.hash);
  applyVoicePage(route, currentVoicePage(route) + step);
  render(); window.scrollTo({ top: 0, behavior: "smooth" });
  return { ok: true, reason: step > 0 ? "page_next" : "page_previous" };
}

function setVoicePage(page) {
  const route = parseRoute(location.hash);
  const value = Math.max(1, Math.min(currentVoicePageCount(route), Number(page) || 1));
  applyVoicePage(route, value);
  render(); window.scrollTo({ top: 0, behavior: "smooth" });
  return { ok: true, reason: "page_opened", page: value };
}

function currentVoicePage(route) {
  if (route.name === "playlist") return detailState.page;
  if (route.name === "playlists") return playlistState.page;
  return homeState.page;
}

function currentVoicePageCount(route) {
  if (route.name === "playlist") {
    const playlist = store.getPlaylist(route.id);
    const videos = playlist ? filterAndSortVideos(playlist.videoIds.map((id) => store.getVideo(id)).filter(Boolean), { query: detailState.query, filter: detailState.filter, sort: detailState.sort, order: playlist.videoIds }) : [];
    return paginate(videos, 1, VIDEO_PAGE_SIZE).totalPages;
  }
  if (route.name === "playlists") return paginate(sortPlaylists(store.getPlaylists(), playlistState.sort), 1, PLAYLIST_PAGE_SIZE).totalPages;
  let videos = allVideos();
  if (route.name === "favorites") videos = videos.filter((video) => video.favorite);
  else {
    videos = homeState.order.map((id) => store.getVideo(id)).filter(Boolean);
    if (homeState.filter === "Favs") videos = videos.filter((video) => video.favorite);
    else if (!["", "All", "Recently added"].includes(homeState.filter)) videos = videos.filter((video) => video.tags.some((tag) => tag.toLowerCase() === homeState.filter.toLowerCase()));
  }
  return paginate(videos, 1, VIDEO_PAGE_SIZE).totalPages;
}

function applyVoicePage(route, page) {
  const value = Math.max(1, Math.min(currentVoicePageCount(route), Number(page) || 1));
  if (route.name === "playlist") detailState.page = value;
  else if (route.name === "playlists") playlistState.page = value;
  else homeState.page = value;
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
    const selected = new Set([...addChoices.querySelectorAll("[data-add-playlist]:checked")].map((input) => input.dataset.addPlaylist));
    fillPlaylistChoices();
    selected.add(String(created.id));
    addChoices.querySelectorAll("[data-add-playlist]").forEach((choice) => { choice.checked = selected.has(choice.dataset.addPlaylist); });
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
function openAddVideo(prefill = "") {
  addForm.reset(); preview.hidden = true; preview.innerHTML = ""; saveVideoButton.disabled = true;
  importProgress.hidden = true; importProgressBar.value = 0;
  addMessage.textContent = ""; pendingVideos = []; fillPlaylistChoices();
  const playlistOnly = Boolean(extractPlaylistId(prefill)) && extractYouTubeLinks(prefill).length === 0;
  addLinks.value = playlistOnly ? "" : prefill;
  importPlaylistUrl.value = playlistOnly ? prefill : "";
  setImportTab(playlistOnly ? "playlist" : "links");
  document.querySelector("#bookmarklet").href = makeBookmarklet();
  const route = parseRoute(location.hash);
  if (route.name === "playlist") {
    const choice = addChoices.querySelector(`[data-add-playlist="${CSS.escape(route.id)}"]`);
    if (choice) choice.checked = true;
  }
  addDialog.showModal(); addLinks.focus();
  if (prefill && !playlistOnly) window.setTimeout(previewVideo, 0);
}

function setImportTab(tab) {
  importTab = tab;
  document.querySelectorAll("[data-import-panel]").forEach((panel) => { panel.hidden = panel.dataset.importPanel !== tab; });
  document.querySelectorAll(".import-tabs [data-action='import-tab']").forEach((button) => { button.setAttribute("aria-selected", String(button.dataset.tab === tab)); });
}

function makeBookmarklet() {
  const base = location.origin.replace(/'/g, "%27");
  return `javascript:(()=>window.open('${base}/#/import?u='+encodeURIComponent(location.href),'_blank'))()`;
}

function renderImportPreview(items) {
  preview.innerHTML = items.map((item) => `<article class="import-preview-row" data-import-row="${escapeHtml(item.id)}">
    <input type="checkbox" data-import-id="${escapeHtml(item.id)}" aria-label="Select ${escapeHtml(item.title)}" ${item.selected ? "checked" : ""}>
    <div class="import-thumb"><img loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(item.id)}/hqdefault.jpg" alt=""></div>
    <div class="import-copy"><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.author || "YouTube")}</span><small class="import-status">${escapeHtml(item.status)}</small></div>
    ${item.playlistId ? `<button type="button" data-action="import-playlist" data-url="${escapeHtml(item.url)}">Playlist found</button>` : ""}
    <button type="button" data-action="import-remove" data-id="${escapeHtml(item.id)}" aria-label="Remove ${escapeHtml(item.title)}">×</button>
  </article>`).join("");
  preview.hidden = items.length === 0;
  saveVideoButton.disabled = items.length === 0;
}

// Preview each unique video without stopping the import when public metadata is unavailable.
async function previewVideo() {
  const previewButton = document.querySelector("#previewVideo");
  const items = extractYouTubeLinks(addLinks.value);
  if (!items.length) { addMessage.textContent = "Paste a YouTube link, a supported video ID, or copied text containing links."; saveVideoButton.disabled = true; return; }
  previewButton.disabled = true;
  pendingVideos = [];
  preview.hidden = false; preview.textContent = "";
  saveVideoButton.disabled = true;
  importProgress.hidden = false; importProgressBar.max = items.length; importProgressBar.value = 0;
  importProgressText.textContent = `Looking up 0 of ${items.length}…`;
  addMessage.textContent = `Review ${items.length} unique video${items.length === 1 ? "" : "s"} before adding.`;
  const knownVideos = Object.fromEntries(allVideos().map((video) => [video.id, video]));
  const results = await previewVideoImports(items, {
    knownVideos,
    concurrency: 4,
    onProgress: (done, total) => { importProgressBar.value = done; importProgressText.textContent = `Looking up ${done} of ${total}…`; }
  });
  pendingVideos = results.map((item) => ({ ...item, durationSec: null, tags: [] }));
  renderImportPreview(pendingVideos);
  importProgress.hidden = true;
  previewButton.disabled = false;
  const playlistId = items.find((item) => item.playlistId)?.playlistId;
  if (playlistId) addMessage.textContent += ` This link also includes playlist ${playlistId}; it is kept with this preview.`;
}

// Save checked records once and let Undo remove only records created by this batch.
function saveVideo(event) {
  event.preventDefault();
  const selected = new Set([...preview.querySelectorAll("[data-import-id]:checked")].map((input) => input.dataset.importId));
  if (!selected.size) { addMessage.textContent = "Select at least one video to add."; return; }
  const tags = document.querySelector("#videoTags").value.split(",").map((tag) => tag.trim()).filter(Boolean);
  const chosen = [...addChoices.querySelectorAll("[data-add-playlist]:checked")].map((input) => input.dataset.addPlaylist);
  const outcome = saveVideoImportBatch(store, pendingVideos, selected, { tags, playlistIds: chosen });
  pendingVideos.filter((item) => selected.has(item.id)).forEach((item) => {
    if (!homeState.order.includes(item.id)) homeState.order.unshift(item.id);
  });
  addDialog.close();
  pendingVideos = [];
  render();
  const summary = `Added ${outcome.addedCount}, ${outcome.existingCount} already in the library, ${outcome.failedCount} lookup${outcome.failedCount === 1 ? "" : "s"} failed.`;
  toast(summary, outcome.addedIds.length ? () => {
    outcome.undo();
    homeState.order = homeState.order.filter((id) => !outcome.addedIds.includes(id));
  } : null);
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
  else if (action === "nav-settings") { sidebarDrawerOpen = false; navigate({ name: "settings" }); }
  else if (action === "nav-commands") { navigate({ name: "commands" }); }
  else if (action === "sidebar-playlist") { sidebarDrawerOpen = false; navigate({ name: "playlist", id }); }
  else if (action === "sidebar-show-more") { sidebarShowAll = !sidebarShowAll; render(); }
  else if (action === "play-all-playlist") playPlaylist(parseRoute(location.hash).id);
  else if (action === "shuffle-playlist") playPlaylist(parseRoute(location.hash).id, true);
  else if (action === "open-add-video") openAddVideo();
  else if (action === "import-tab") setImportTab(actionButton.dataset.tab || "links");
  else if (action === "import-playlist") { importPlaylistUrl.value = actionButton.dataset.url || ""; setImportTab("playlist"); }
  else if (action === "import-remove") {
    pendingVideos = pendingVideos.filter((item) => item.id !== id);
    renderImportPreview(pendingVideos);
    if (!pendingVideos.length) addMessage.textContent = "Paste links or choose a file to review videos.";
  }
  else if (action === "commands-category") { commandsState.category = actionButton.dataset.category || ""; commandsState.query = ""; render(); }
  else if (action === "commands-tab") { commandsState.tab = actionButton.dataset.tab || "voice"; render(); }
  else if (action === "commands-try") voiceUI?.runTextCommand(actionButton.dataset.example || "");
  else if (action === "shuffle") { homeState.order = shuffle(allVideos().map((video) => video.id)); homeState.page = 1; render(); }
  else if (action === "home-filter") { const selected = filter === "All" ? "" : filter; homeState.filter = homeState.filter === selected ? "" : selected; homeState.page = 1; render(); }
  else if (action === "chips-left" || action === "chips-right") app.querySelector("#homeChips")?.scrollBy({ left: action === "chips-left" ? -260 : 260, behavior: "smooth" });
  else if (action === "clear-home-filter") { homeState.filter = ""; homeState.page = 1; render(); }
  else if (action === "home-page") { homeState.page = Number(page); render(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  else if (action === "toggle-mobile-search") {
    document.body.classList.toggle("mobile-search-open");
    if (document.body.classList.contains("mobile-search-open")) globalSearchInput.focus();
    else globalSearchInput.blur();
  }
  else if (action === "close-dialog") actionButton.closest("dialog")?.close();
  else if (action === "expand-player") setPlayerMode("expanded");
  else if (action === "minimize-player") setPlayerMode("mini");
  else if (action === "close-player") { yt.stop(); playerShell.classList.add("is-hidden"); document.body.classList.remove("has-mini-player"); playback.currentId = ""; playback.queue = []; }
  else if (action === "toggle-playback") { if (yt.getState() === (window.YT?.PlayerState?.PLAYING ?? 1)) yt.pause(); else yt.play(); }
  else if (action === "favorite-current") { const video = getCurrent(); if (video) store.updateVideo(video.id, { favorite: !video.favorite }); render(); updatePlayerLabels(); }
  else if (action === "favorite") { const video = store.getVideo(id); if (video) { store.updateVideo(id, { favorite: !video.favorite }); render(); toast(video.favorite ? "Removed from Favs." : "Added to Favs."); } }
  else if (action === "previous-video") moveQueue(-1, true);
  else if (action === "next-video") moveQueue(1, true);
  else if (action === "watch-queue-video") playQueueItem(id);
  else if (action === "add-current-playlist") { if (playback.currentId) openMembershipDialog(playback.currentId); }
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
  else if (action === "search-play-video") playVideo(id, [id]);
  else if (action === "search-open-playlist") navigate({ name: "playlist", id });
  else if (action === "new-playlist-inline") { const videoId = membershipVideoId; document.querySelector("#membershipDialog").close(); openPlaylistDialog({ videoId, returnTo: "membership" }); }
  else if (action === "new-playlist-from-add") { document.querySelector("#addVideoDialog").close(); openPlaylistDialog({ returnTo: "add-video" }); }
});

// Send a non-empty query to its own hash route.
globalSearchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = globalSearchInput.value.trim();
  if (!query) { toast("Type something to search your vault."); globalSearchInput.focus(); return; }
  document.body.classList.remove("mobile-search-open");
  navigate({ name: "search", query });
});
globalSearchInput.addEventListener("input", () => { clearGlobalSearch.hidden = !globalSearchInput.value; });
clearGlobalSearch.addEventListener("click", () => { globalSearchInput.value = ""; clearGlobalSearch.hidden = true; globalSearchInput.focus(); });

// Wire the import preview and native dialog form.
document.querySelector("#previewVideo").addEventListener("click", previewVideo);
addForm.addEventListener("submit", saveVideo);
addLinks.addEventListener("input", () => {
  pendingVideos = []; preview.hidden = true; preview.innerHTML = ""; saveVideoButton.disabled = true;
  addMessage.textContent = "";
});
importFile.addEventListener("change", async () => {
  const files = [...(importFile.files || [])];
  if (files.length) await handleImportFiles(files);
});
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

async function handleImportFiles(files) {
  const links = [];
  for (const file of files) {
    try {
      links.push(...extractImportFileLinks(file.name, await file.text()));
    } catch (_) {
      addMessage.textContent = `Could not read ${file.name}. Choose a text, CSV, JSON, HTML, or Markdown file.`;
      return;
    }
  }
  addLinks.value = [...new Map(links.map((item) => [item.id, item])).values()].map((item) => item.url).join("\n");
  if (!addLinks.value) {
    addMessage.textContent = "No supported YouTube links were found in that file.";
    return;
  }
  setImportTab("links");
  await previewVideo();
}

// Dropped links open the import form; pasted links offer a non-intrusive review action.
window.addEventListener("dragover", (event) => {
  if (event.dataTransfer?.types?.length) event.preventDefault();
});
window.addEventListener("drop", async (event) => {
  const files = [...(event.dataTransfer?.files || [])];
  const text = event.dataTransfer?.getData("text/uri-list") || event.dataTransfer?.getData("text/plain") || "";
  if (!files.length && !extractYouTubeLinks(text).length) return;
  event.preventDefault();
  if (files.length) {
    openAddVideo(); setImportTab("file"); await handleImportFiles(files);
  } else openAddVideo(text);
});
document.addEventListener("paste", (event) => {
  if (event.target.matches("input, textarea, select, [contenteditable='true']")) return;
  const text = event.clipboardData?.getData("text/plain") || "";
  const count = extractYouTubeLinks(text).length;
  if (!count) return;
  event.preventDefault();
  toast(`Found ${count} YouTube link${count === 1 ? "" : "s"}, ready to review and add.`, () => openAddVideo(text), "Review and add");
});
document.addEventListener("change", (event) => {
  if (event.target.matches("[data-import-id]")) {
    const item = pendingVideos.find((video) => video.id === event.target.dataset.importId);
    if (item) item.selected = event.target.checked;
  }
  if (event.target.id === "playlistSort") { playlistState.sort = event.target.value; playlistState.page = 1; render(); }
  if (event.target.id === "playlistFilter") { detailState.filter = event.target.value; detailState.page = 1; render(); }
  if (event.target.id === "playlistVideoSort") { detailState.sort = event.target.value; detailState.page = 1; render(); }
  if (event.target.id === "autoplayToggle") {
    const route = parseRoute(location.hash);
    if (route.name === "playlist") store.setAutoplay(route.id, event.target.checked);
    render();
  }
  if (event.target.id === "watchAutoplay" && playback.autoplayPlaylistId) {
    store.setAutoplay(playback.autoplayPlaylistId, event.target.checked);
    renderWatchQueue();
  }
});
document.addEventListener("input", (event) => {
  if (event.target.id === "commandSearch") {
    commandsState.query = event.target.value;
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => { render(); const input = document.querySelector("#commandSearch"); input?.focus(); input?.setSelectionRange(commandsState.query.length, commandsState.query.length); }, 120);
  }
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

// Keep shortcuts out of text fields and let focused buttons use their normal keys.
document.addEventListener("keydown", (event) => {
  const typing = event.target.matches("input, textarea, select, [contenteditable='true']");
  const key = event.key.toLocaleLowerCase();
  const playerVisible = !playerShell.classList.contains("is-hidden");
  const hasDialog = Boolean(document.querySelector("dialog[open]"));
  if ((event.key === "Enter" || event.key === " ") && !typing) {
    const videoCard = event.target.closest("[data-video-id]");
    const playlistCard = event.target.closest("[data-playlist-open]");
    if (videoCard && !event.target.closest("button, summary, details")) { event.preventDefault(); playFromCurrentScreen(videoCard.dataset.videoId); }
    else if (playlistCard && !event.target.closest("button, summary, details")) { event.preventDefault(); navigate({ name: "playlist", id: playlistCard.dataset.playlistOpen }); }
  }
  if (!typing && !hasDialog && key === "k" && playerVisible) { event.preventDefault(); togglePlayback(); }
  if (!typing && !hasDialog && event.key === " " && !event.target.closest("button, a, summary, [data-video-id], [data-playlist-open]") && playerVisible) { event.preventDefault(); togglePlayback(); }
  if (!typing && !hasDialog && playerVisible && ["j", "l", "arrowleft", "arrowright"].includes(key)) {
    event.preventDefault();
    const amount = key === "j" || key === "arrowleft" ? -10 : key === "l" ? 10 : key === "arrowright" ? 5 : -5;
    yt.seekTo(Math.max(0, Math.min(yt.getDuration(), yt.getTime() + amount)), true);
  }
  if (!typing && !hasDialog && playerVisible && ["arrowup", "arrowdown"].includes(key)) {
    event.preventDefault();
    const value = Math.max(0, Math.min(100, Number(store.getState().settings.volume) + (key === "arrowup" ? 5 : -5)));
    store.setVolume(value); yt.setVolume(value); document.querySelector("#playerVolume").value = String(value);
  }
  if (!typing && !hasDialog && playerVisible && key === "m") {
    event.preventDefault();
    const current = Number(store.getState().settings.volume);
    if (current > 0) { volumeBeforeMute = current; store.setVolume(0); yt.setVolume(0); }
    else { store.setVolume(volumeBeforeMute || 100); yt.setVolume(volumeBeforeMute || 100); }
    document.querySelector("#playerVolume").value = String(store.getState().settings.volume);
  }
  if (!typing && !hasDialog && playerVisible && key === "f") { event.preventDefault(); if (document.fullscreenElement) document.exitFullscreen?.(); else playerShell.requestFullscreen?.().catch(() => toast("Fullscreen is not available in this browser.")); }
  if (!typing && !hasDialog && playerVisible && key === "t") { theaterMode = !theaterMode; document.body.classList.toggle("theater-mode", theaterMode); }
  if (!typing && !hasDialog && playerVisible && key === "i") setPlayerMode("mini");
  if (!typing && !hasDialog && playerVisible && key === "c" && !yt.toggleCaptions()) toast("Captions are not available yet for this video.");
  if (!typing && !hasDialog && event.shiftKey && key === "n") moveQueue(1, true);
  if (!typing && !hasDialog && event.shiftKey && key === "p") moveQueue(-1, true);
  if (!typing && !hasDialog && playerVisible && /^[0-9]$/.test(event.key)) yt.seekTo(yt.getDuration() * Number(event.key) / 10, true);
  if (event.key === "/" && !typing && !hasDialog) { event.preventDefault(); if (window.innerWidth < 800) document.body.classList.add("mobile-search-open"); globalSearchInput.focus(); }
  if (event.key === "?" && !typing && !hasDialog) { event.preventDefault(); commandsState.tab = "voice"; navigate({ name: "commands" }); }
  if (key === "v" && !typing && !hasDialog) {
    event.preventDefault();
    voiceUI?.start();
  }
  if (event.key === "Escape") {
    if (document.querySelector("dialog[open]")) return;
    const voiceHelp = document.querySelector(".voice-help:not([hidden])");
    if (voiceHelp) { voiceHelp.hidden = true; return; }
    if (document.activeElement === globalSearchInput || document.body.classList.contains("mobile-search-open")) {
      globalSearchInput.value = ""; clearGlobalSearch.hidden = true; globalSearchInput.blur(); document.body.classList.remove("mobile-search-open");
    }
    else if (playerShell.classList.contains("expanded")) setPlayerMode("mini");
  }
});

function togglePlayback() {
  if (yt.getState() === (window.YT?.PlayerState?.PLAYING ?? 1)) yt.pause();
  else yt.play();
}

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
const voiceActions = createVoiceActionRunner();
voiceUI = initVoiceUI({
  commands: COMMANDS,
  getKeyterms: () => [...new Set([
    ...store.getPlaylists().map((playlist) => playlist.name),
    ...allVideos().flatMap((video) => video.tags || [])
  ])].slice(0, 200),
  handleTranscript: async (heard) => {
    const parsed = parseCommand(heard, {
      routeName: parseRoute(location.hash).name,
      currentVideoId: playback.currentId
    });
    voiceUI?.reportIntent(parsed);
    const result = await voiceActions.execute(parsed);
    const reply = responseFor(parsed, result);
    toast(reply);
    return reply;
  },
  getVolume: () => store.getState().settings.volume,
  setPlaybackVolume: (value) => yt.setVolume(value)
});
watchRoute(render);
window.setInterval(updatePlayerControls, 250);
