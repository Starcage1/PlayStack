import { filterAndSortVideos, paginate } from "../utils.js";
import { VIDEO_PAGE_SIZE } from "../config.js";
import { videoCard } from "./home.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// Render all controls and one page of a playlist's filtered video list.
export function renderPlaylistDetail(playlist, videos, state = {}) {
  const byId = new Map(videos.map((video) => [video.id, video]));
  const orderedVideos = playlist.videoIds.map((id) => byId.get(id)).filter(Boolean);
  const visible = filterAndSortVideos(orderedVideos, { query: state.query, filter: state.filter, sort: state.sort, order: playlist.videoIds });
  const pages = paginate(visible, state.page, VIDEO_PAGE_SIZE);
  const tags = [...new Set(orderedVideos.flatMap((video) => video.tags || []))].sort((a, b) => a.localeCompare(b));
  const cards = pages.items.map((video) => videoCard(video, { inPlaylist: true })).join("");
  return `<div class="detail-heading"><button data-action="back-playlists">← Playlists</button><button class="playlist-title-button" data-action="rename-current-playlist" aria-label="Rename playlist">${escapeHtml(playlist.name)} ✎</button></div>
    <div class="toolbar detail-toolbar">
      <input class="detail-search" id="playlistSearch" type="search" value="${escapeHtml(state.query || "")}" placeholder="Search in this playlist" aria-label="Search in this playlist">
      <label>Filter <select id="playlistFilter"><option value="">All tags</option>${tags.map((tag) => `<option value="${escapeHtml(tag)}" ${state.filter === tag ? "selected" : ""}>${escapeHtml(tag)}</option>`).join("")}</select></label>
      <label>Sort <select id="playlistVideoSort"><option value="manual" ${state.sort === "manual" ? "selected" : ""}>Manual order</option><option value="title" ${state.sort === "title" ? "selected" : ""}>Title A–Z</option><option value="recent" ${state.sort === "recent" ? "selected" : ""}>Recently added</option></select></label>
      <label class="toggle-label"><input id="autoplayToggle" type="checkbox" ${playlist.autoplay ? "checked" : ""}> Autoplay Seq</label>
      <button data-action="open-add-video">+ Add video</button>
    </div>
    ${cards ? `<div class="video-grid">${cards}</div>` : `<div class="empty-state"><h3>${orderedVideos.length ? "No videos match" : "This playlist is empty"}</h3><p>${orderedVideos.length ? "Try another search or filter." : "Add a video to start this collection."}</p><button data-action="open-add-video">+ Add video</button></div>`}
    ${pages.totalPages > 1 ? `<nav class="pagination" aria-label="Playlist video pages"><button data-action="detail-page" data-page="${pages.page - 1}" ${pages.page === 1 ? "disabled" : ""}>Previous</button><span>Page ${pages.page} of ${pages.totalPages}</span><button data-action="detail-page" data-page="${pages.page + 1}" ${pages.page === pages.totalPages ? "disabled" : ""}>Next</button></nav>` : ""}`;
}
