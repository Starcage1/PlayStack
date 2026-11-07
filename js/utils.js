// Reorder a copied list so the stored order never changes.
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

// Return one page and its page count, always using page numbers from one.
export function paginate(items, page = 1, pageSize = 10) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), page: safePage, totalPages, totalItems: items.length };
}

// Filter and sort library videos for home or playlist views.
export function filterAndSortVideos(videos, { query = "", filter = "", sort = "manual", order = [] } = {}) {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  let result = videos.filter((video) => {
    const matchesQuery = !normalizedQuery || [video.title, video.author, ...(video.tags || [])]
      .join(" ").toLocaleLowerCase().includes(normalizedQuery);
    const matchesFilter = !filter || (video.tags || []).some((tag) => tag.toLocaleLowerCase() === filter.toLocaleLowerCase());
    return matchesQuery && matchesFilter;
  });
  if (sort === "title") result.sort((a, b) => a.title.localeCompare(b.title));
  else if (sort === "recent") result.sort((a, b) => Date.parse(b.addedAt) - Date.parse(a.addedAt));
  else if (sort === "manual") {
    const positions = new Map(order.map((id, index) => [id, index]));
    result.sort((a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  }
  return result;
}

// Sort playlists by one of the controls shown in the app.
export function sortPlaylists(playlists, sort = "recent") {
  const result = [...playlists];
  if (sort === "name") result.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "count") result.sort((a, b) => b.videoIds.length - a.videoIds.length || a.name.localeCompare(b.name));
  else result.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return result;
}

// Turn an ISO date or timestamp into a short age label.
export function timeAgo(value, now = Date.now()) {
  const timestamp = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(timestamp)) return "just now";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} ${months === 1 ? "month" : "months"} ago`;
  const years = Math.floor(days / 365);
  return `${years} ${years === 1 ? "year" : "years"} ago`;
}
