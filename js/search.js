// Search saved videos and playlists without needing browser or page objects.
export function searchLibrary(videos, playlists, query) {
  const needle = String(query || "").trim().toLocaleLowerCase();
  if (!needle) return { videos: [], playlists: [] };
  const matches = (values) => values.join(" ").toLocaleLowerCase().includes(needle);
  return {
    videos: videos.filter((video) => matches([video.title, video.author, ...(video.tags || [])])),
    playlists: playlists.filter((playlist) => matches([playlist.name]))
  };
}
