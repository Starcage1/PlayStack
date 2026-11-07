import { filterAndSortVideos, paginate } from "../utils.js";
import { VIDEO_PAGE_SIZE } from "../config.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// Render one card that plays on click and keeps actions separate from that click.
export function videoCard(video, { inPlaylist = false } = {}) {
  const tags = (video.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const duration = video.durationSec ? `<span>${formatTime(video.durationSec)}</span>` : "";
  return `<article class="video-card" data-video-id="${escapeHtml(video.id)}" tabindex="0" role="button" aria-label="Play ${escapeHtml(video.title)}">
    <img class="thumb" loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg" alt="">
    <div class="video-copy"><h3 class="video-title">${escapeHtml(video.title)}</h3>
      <p class="video-author">${escapeHtml(video.author || "YouTube video")}</p><p class="video-meta">${duration}</p>
      <div class="tag-list">${tags}</div>
      <div class="video-actions"><button data-action="favorite" data-id="${escapeHtml(video.id)}" aria-label="${video.favorite ? "Remove from" : "Add to"} favorites">${video.favorite ? "♥" : "♡"}</button>
        <details class="video-menu"><summary aria-label="Video options">•••</summary><div class="menu-items">
          <button data-action="add-to-playlist" data-id="${escapeHtml(video.id)}">Add to playlist</button>
          <button data-action="edit-tags" data-id="${escapeHtml(video.id)}">Edit tags</button>
          ${inPlaylist ? `<button data-action="remove-membership" data-id="${escapeHtml(video.id)}">Remove from playlist</button>` : ""}
          <button data-action="delete-video" data-id="${escapeHtml(video.id)}">Delete from library</button>
        </div></details></div>
    </div></article>`;
}

// Render the shuffled home list and its bottom pagination.
export function renderHome({ videos, order, filter = "", page = 1, query = "" }) {
  const ordered = order.map((id) => videos.find((video) => video.id === id)).filter(Boolean);
  let source = ordered;
  if (filter === "Favs") source = source.filter((video) => video.favorite);
  else if (filter === "Recently added") source = [...source].sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
  const result = filterAndSortVideos(source, { filter: ["Favs", "Recently added"].includes(filter) ? "" : filter, query });
  const pages = paginate(result, page, VIDEO_PAGE_SIZE);
  const cards = pages.items.map((video) => videoCard(video)).join("");
  return `<section class="screen-heading"><div><h2>Your videos</h2><p class="muted">A personal place for the videos you choose.</p></div>
    <div class="toolbar-group"><button data-action="shuffle">Shuffle</button><button data-action="open-add-video">+ Add video</button></div></section>
    <div class="chip-row" id="homeChips"></div>
    ${cards ? `<div class="video-grid">${cards}</div>` : `<div class="empty-state"><h3>${videos.length ? "No videos match this filter" : "Your vault is empty"}</h3><p>${videos.length ? "Choose another chip or clear the filter." : "Add your first video to get started."}</p>${videos.length ? `<button data-action="clear-home-filter">Clear filter</button>` : `<button data-action="open-add-video">Add your first video</button>`}</div>`}
    ${pages.totalPages > 1 ? `<nav class="pagination" aria-label="Video pages"><button data-action="home-page" data-page="${pages.page - 1}" ${pages.page === 1 ? "disabled" : ""}>Previous</button><span>Page ${pages.page} of ${pages.totalPages}</span><button data-action="home-page" data-page="${pages.page + 1}" ${pages.page === pages.totalPages ? "disabled" : ""}>Next</button></nav>` : ""}`;
}

export function formatTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(value / 3600), m = Math.floor((value % 3600) / 60), s = value % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

export function renderHomeChips(videos, selected = "") {
  const tags = [...new Set(videos.flatMap((video) => video.tags || []))].sort((a, b) => a.localeCompare(b));
  return ["Favs", "Recently added", ...tags].map((chip) => `<button class="chip ${selected === chip ? "active" : ""}" data-action="home-filter" data-filter="${escapeHtml(chip)}">${escapeHtml(chip)}</button>`).join("");
}
