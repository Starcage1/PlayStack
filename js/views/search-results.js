import { searchLibrary } from "../search.js";
import { videoRow } from "./playlist-detail.js";

const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

// Group matching videos and playlists on the routed search page.
export function renderSearchPage(videos, playlists, query) {
  const results = searchLibrary(videos, playlists, query);
  const videoRows = results.videos.map((video, index) => videoRow(video, index + 1, { inPlaylist: false })).join("");
  const videoMap = new Map(videos.map((video) => [video.id, video]));
  const playlistCards = results.playlists.map((playlist) => {
    const first = videoMap.get(playlist.videoIds[0]);
    const cover = first
      ? `<img src="https://i.ytimg.com/vi/${encodeURIComponent(first.id)}/hqdefault.jpg" loading="lazy" alt="">`
      : `<span class="search-playlist-placeholder" aria-hidden="true">▤</span>`;
    return `<button class="search-playlist-result" data-playlist-open="${escapeHtml(playlist.id)}">${cover}<span><strong>${escapeHtml(playlist.name)}</strong><small>${playlist.videoIds.length} ${playlist.videoIds.length === 1 ? "video" : "videos"}</small></span></button>`;
  }).join("");

  if (!results.videos.length && !results.playlists.length) {
    return `<section class="screen-heading"><div><h1>Search results</h1><p class="muted">For “${escapeHtml(query)}”</p></div></section><div class="empty-state"><h2>No results</h2><p>Try another title, channel, tag, or playlist name.</p></div>`;
  }
  return `<section class="screen-heading"><div><h1>Search results</h1><p class="muted">For “${escapeHtml(query)}”</p></div></section>
    ${videoRows ? `<section class="search-results-section"><h2>Videos</h2><div class="playlist-video-list">${videoRows}</div></section>` : ""}
    ${playlistCards ? `<section class="search-results-section"><h2>Playlists</h2><div class="search-playlist-grid">${playlistCards}</div></section>` : ""}`;
}
