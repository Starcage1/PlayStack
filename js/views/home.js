import { filterAndSortVideos, paginate, timeAgo } from "../utils.js";
import { VIDEO_PAGE_SIZE } from "../config.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// Render one card that plays on click and keeps actions separate from that click.
export function videoCard(video, { inPlaylist = false } = {}) {
  const tags = (video.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const duration = video.durationSec > 0 ? `<span class="duration-badge">${formatTime(video.durationSec)}</span>` : "";
  const avatarText = escapeHtml((video.author || "V").trim().charAt(0).toLocaleUpperCase() || "V");
  const avatarHue = [...(video.author || "Video Vault")].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 0);
  return `<article class="video-card" data-video-id="${escapeHtml(video.id)}" tabindex="0" role="button" aria-label="Play ${escapeHtml(video.title)}">
    <div class="thumb-frame"><div class="thumb-skeleton" aria-hidden="true"></div><img class="thumb-image" loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg" alt="">${duration}</div>
    <div class="video-info-row"><div class="channel-avatar" style="--avatar-hue:${avatarHue}" aria-hidden="true">${avatarText}</div>
      <div class="video-copy"><div class="video-title-row"><h3 class="video-title">${escapeHtml(video.title)}</h3><div class="video-actions">
        <button class="favorite-button" data-action="favorite" data-id="${escapeHtml(video.id)}" aria-label="${video.favorite ? "Remove from" : "Add to"} favorites"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.2-8.8 11-8.8 11S3.2 14 3.2 8.8a4.3 4.3 0 0 1 8.8-1 4.3 4.3 0 0 1 8.8 1z" ${video.favorite ? "fill=\"currentColor\"" : ""}/></svg></button>
        <details class="video-menu"><summary aria-label="Video options"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></summary><div class="menu-items">
          <button data-action="add-to-playlist" data-id="${escapeHtml(video.id)}">Add to playlist</button>
          <button data-action="edit-tags" data-id="${escapeHtml(video.id)}">Edit tags</button>
          ${inPlaylist ? `<button data-action="remove-membership" data-id="${escapeHtml(video.id)}">Remove from playlist</button>` : ""}
          <button data-action="delete-video" data-id="${escapeHtml(video.id)}">Delete from library</button>
        </div></details></div></div>
        <p class="video-author">${escapeHtml(video.author || "YouTube")}</p><p class="video-meta">Added ${timeAgo(video.addedAt)}</p><div class="tag-list">${tags}</div>
      </div>
    </div></article>`;
}

// Render the shuffled home list and its bottom pagination.
export function renderHome({ videos, order, filter = "", page = 1, query = "", title = "Home" }) {
  const ordered = order.map((id) => videos.find((video) => video.id === id)).filter(Boolean);
  let source = ordered;
  if (filter === "Favs") source = source.filter((video) => video.favorite);
  else if (filter === "Recently added") source = [...source].sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
  const result = filterAndSortVideos(source, { filter: ["All", "Favs", "Recently added"].includes(filter) ? "" : filter, query });
  const pages = paginate(result, page, VIDEO_PAGE_SIZE);
  const cards = pages.items.map((video) => videoCard(video)).join("");
  return `<section class="screen-heading home-heading"><div><h2>${escapeHtml(title)}</h2></div></section>
    <div class="chip-sticky"><button class="chip-arrow" data-action="chips-left" aria-label="Scroll filters left" title="Scroll left"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg></button><div class="chip-edge chip-edge-left"></div><div class="chip-row" id="homeChips" tabindex="0" aria-label="Filter videos"></div><div class="chip-edge chip-edge-right"></div><button class="chip-arrow" data-action="chips-right" aria-label="Scroll filters right" title="Scroll right"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg></button><button class="chip-arrow refresh-button" data-action="shuffle" aria-label="Refresh video order" title="Refresh video order"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.6 9A7 7 0 0 1 18 6l2 2M4 16l2 2a7 7 0 0 0 12.4-3"/></svg></button></div>
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
  const current = selected || "All";
  return ["All", "Favs", "Recently added", ...tags].map((chip) => `<button class="chip ${current === chip ? "active" : ""}" data-action="home-filter" data-filter="${escapeHtml(chip)}">${escapeHtml(chip)}</button>`).join("");
}
