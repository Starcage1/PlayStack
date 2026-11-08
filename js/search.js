// Search saved videos and playlists without needing browser or page objects.
export function searchLibrary(videos, playlists, query) {
  const needle = String(query || "").trim().toLocaleLowerCase();
  if (!needle) return { videos: [], playlists: [] };
  const matches = (values) => values.join(" ").toLocaleLowerCase().includes(needle);
  const rankedVideos = rankVideoMatches(videos, needle);
  return {
    videos: rankedVideos.map((item) => item.video),
    playlists: playlists.filter((playlist) => matches([playlist.name]))
  };
}

// Rank title, channel, and tag matches, allowing small recognition errors.
export function rankVideoMatches(videos, query) {
  const needle = String(query || "").trim().toLocaleLowerCase();
  if (!needle) return [];
  const queryWords = needle.split(/\s+/u);
  return videos.map((video) => {
    const text = [video.title, video.author, ...(video.tags || [])].join(" ").toLocaleLowerCase();
    if (text.includes(needle)) return { video, score: 1 };
    const words = text.split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
    const scores = queryWords.map((queryWord) => Math.max(0, ...words.map((word) => {
      if (word.startsWith(queryWord) || queryWord.startsWith(word)) return 0.85;
      return 1 - editDistance(queryWord, word) / Math.max(queryWord.length, word.length);
    })));
    const score = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    return { video, score };
  }).filter((item) => item.score >= 0.58).sort((a, b) => b.score - a.score);
}

function editDistance(left, right) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0];
    previous[0] = row;
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column];
      previous[column] = Math.min(previous[column] + 1, previous[column - 1] + 1, diagonal + (left[row - 1] === right[column - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[right.length];
}
