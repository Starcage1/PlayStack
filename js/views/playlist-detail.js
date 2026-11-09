import { filterAndSortVideos, paginate, timeAgo } from "../utils.js";
import { VIDEO_PAGE_SIZE } from "../config.js";
import { formatTime } from "./home.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// Draw one compact row for a playlist video.
export function videoRow(video, number, { inPlaylist = true } = {}) {
  const duration = video.durationSec > 0 ? `<span class="duration-badge">${formatTime(video.durationSec)}</span>` : "";
  const tags = (video.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
  const hue = [...(video.author || "Video Vault")].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 360, 0);
  const initial = escapeHtml((video.author || "V").trim().charAt(0).toLocaleUpperCase() || "V");
  return `<article class="playlist-video-row" draggable="true" data-video-id="${escapeHtml(video.id)}" tabindex="0" role="button" aria-label="Play ${escapeHtml(video.title)}">
    <span class="row-number">${number}</span>
    <div class="row-thumb thumb-frame"><div class="thumb-skeleton" aria-hidden="true"></div><img class="thumb-image" loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(video.id)}/hqdefault.jpg" alt="">${duration}</div>
    <div class="row-copy"><h3>${escapeHtml(video.title)}</h3><div class="row-channel"><span class="channel-avatar small-avatar" style="--avatar-hue:${hue}" aria-hidden="true">${initial}</span><span>${escapeHtml(video.author || "YouTube")}</span></div><p>Added ${timeAgo(video.addedAt)}</p><div class="tag-list">${tags}</div></div>
    <div class="row-actions"><button class="favorite-button" data-action="favorite" data-id="${escapeHtml(video.id)}" aria-label="${video.favorite ? "Remove from" : "Add to"} favorites"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 8.8c0 5.2-8.8 11-8.8 11S3.2 14 3.2 8.8a4.3 4.3 0 0 1 8.8-1 4.3 4.3 0 0 1 8.8 1z" ${video.favorite ? "fill=\"currentColor\"" : ""}/></svg></button>
      <details class="video-menu"><summary aria-label="Video options"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg></summary><div class="menu-items"><button data-action="add-to-playlist" data-id="${escapeHtml(video.id)}">Add to playlist</button><button data-action="edit-tags" data-id="${escapeHtml(video.id)}">Edit tags</button>${inPlaylist ? `<button data-action="remove-membership" data-id="${escapeHtml(video.id)}">Remove from playlist</button>` : ""}<button data-action="delete-video" data-id="${escapeHtml(video.id)}">Delete from library</button></div></details>
    </div>
  </article>`;
}

// Render the playlist summary at left and its filtered, paged list at right.
export function renderPlaylistDetail(playlist, videos, state = {}) {
  const byId = new Map(videos.map((video) => [video.id, video]));
  const orderedVideos = playlist.videoIds.map((id) => byId.get(id)).filter(Boolean);
  const visible = filterAndSortVideos(orderedVideos, { query: state.query, filter: state.filter, sort: state.sort, order: playlist.videoIds });
  const pages = paginate(visible, state.page, VIDEO_PAGE_SIZE);
  const tags = [...new Set(orderedVideos.flatMap((video) => video.tags || []))].sort((a, b) => a.localeCompare(b));
  const first = orderedVideos[0];
  const cover = first
    ? `<div class="detail-cover thumb-frame"><div class="thumb-skeleton" aria-hidden="true"></div><img class="thumb-image" loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(first.id)}/hqdefault.jpg" alt=""></div>`
    : `<div class="detail-cover cover-empty">▤</div>`;
  const rows = pages.items.map((video, index) => videoRow(video, (pages.page - 1) * VIDEO_PAGE_SIZE + index + 1)).join("");
  return `<div class="playlist-detail-layout">
    <aside class="playlist-summary">${cover}<button class="playlist-title-button" data-action="rename-current-playlist" aria-label="Rename playlist">${escapeHtml(playlist.name)} <span aria-hidden="true">✎</span></button>
      <p class="muted">${playlist.videoIds.length} ${playlist.videoIds.length === 1 ? "video" : "videos"}</p>
      <div class="summary-actions"><button data-action="repeat-mode">Repeat: off</button><button data-action="play-all-playlist" ${visible.length ? "" : "disabled"}>Play all</button><button class="secondary" data-action="shuffle-playlist" ${visible.length ? "" : "disabled"}>Shuffle</button></div>
      <label class="toggle-label"><input id="autoplayToggle" type="checkbox" ${playlist.autoplay ? "checked" : ""}> Autoplay Seq</label>
      <button class="summary-delete" data-action="delete-playlist" data-id="${escapeHtml(playlist.id)}">Delete playlist</button>
    </aside>
    <section class="playlist-detail-list"><div class="detail-toolbar toolbar">
      <button class="secondary back-button" data-action="back-playlists">← Playlists</button>
      <input class="detail-search" id="playlistSearch" type="search" value="${escapeHtml(state.query || "")}" placeholder="Search this playlist" aria-label="Search in this playlist">
      <label>Filter <select id="playlistFilter"><option value="">All tags</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}" ${state.filter === tag ? "selected" : ""}>${escapeHtml(tag)}</option>`).join("")}</select></label>
      <label>Sort <select id="playlistVideoSort"><option value="manual" ${state.sort === "manual" ? "selected" : ""}>Manual order</option><option value="title" ${state.sort === "title" ? "selected" : ""}>Title A–Z</option><option value="recent" ${state.sort === "recent" ? "selected" : ""}>Recently added</option></select></label>
    </div>
    ${rows ? `<div class="playlist-video-list">${rows}</div>` : `<div class="empty-state"><h3>${orderedVideos.length ? "No videos match" : "This playlist is empty"}</h3><p>${orderedVideos.length ? "Try another search or filter." : "Add videos from Home using the video menu."}</p><button data-action="nav-home">Go to Home</button></div>`}
    ${pages.totalPages > 1 ? `<nav class="pagination" aria-label="Playlist video pages"><button data-action="detail-page" data-page="${pages.page - 1}" ${pages.page === 1 ? "disabled" : ""}>Previous</button><span>Page ${pages.page} of ${pages.totalPages}</span><button data-action="detail-page" data-page="${pages.page + 1}" ${pages.page === pages.totalPages ? "disabled" : ""}>Next</button></nav>` : ""}</section>
  </div>`;
}
