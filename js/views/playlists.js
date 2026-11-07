import { PLAYLIST_PAGE_SIZE } from "../config.js";
import { paginate, sortPlaylists } from "../utils.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// Render a responsive grid of personal playlists with their first saved video as a cover.
export function renderPlaylists(playlists, videos, { sort = "recent", page = 1 } = {}) {
  const all = sortPlaylists(playlists, sort);
  const pages = paginate(all, page, PLAYLIST_PAGE_SIZE);
  const videoMap = new Map(videos.map((video) => [video.id, video]));
  const cards = pages.items.map((playlist) => {
    const first = videoMap.get(playlist.videoIds[0]);
    const cover = first
      ? `<img class="playlist-cover" loading="lazy" src="https://i.ytimg.com/vi/${encodeURIComponent(first.id)}/hqdefault.jpg" alt="">`
      : `<div class="playlist-cover" aria-hidden="true">♫</div>`;
    return `<article class="playlist-card" data-playlist-open="${escapeHtml(playlist.id)}" tabindex="0" role="link" aria-label="Open playlist ${escapeHtml(playlist.name)}">
      ${cover}<div class="playlist-card-row"><div><h3>${escapeHtml(playlist.name)}</h3><p>${playlist.videoIds.length} ${playlist.videoIds.length === 1 ? "video" : "videos"}</p></div>
      <details class="playlist-menu"><summary aria-label="Playlist options">•••</summary><div class="menu-items">
        <button data-action="rename-playlist" data-id="${escapeHtml(playlist.id)}">Rename</button>
        <button data-action="delete-playlist" data-id="${escapeHtml(playlist.id)}">Delete playlist</button>
      </div></details></div></article>`;
  }).join("");
  return `<section class="screen-heading"><div><h2>Playlists</h2><p class="muted">Your hand-picked collections.</p></div><div class="toolbar-group"><label>Sort <select id="playlistSort"><option value="recent" ${sort === "recent" ? "selected" : ""}>Recently created</option><option value="name" ${sort === "name" ? "selected" : ""}>Name A–Z</option><option value="count" ${sort === "count" ? "selected" : ""}>Most videos</option></select></label><button data-action="new-playlist">+ New playlist</button></div></section>
    ${cards ? `<div class="playlist-grid">${cards}</div>` : `<div class="empty-state"><h3>No playlists yet</h3><p>Create a playlist to start organizing videos you chose.</p><button data-action="new-playlist">+ New playlist</button></div>`}
    ${pages.totalPages > 1 ? `<nav class="pagination" aria-label="Playlist pages"><button data-action="playlist-page" data-page="${pages.page - 1}" ${pages.page === 1 ? "disabled" : ""}>Previous</button><span>Page ${pages.page} of ${pages.totalPages}</span><button data-action="playlist-page" data-page="${pages.page + 1}" ${pages.page === pages.totalPages ? "disabled" : ""}>Next</button></nav>` : ""}`;
}
