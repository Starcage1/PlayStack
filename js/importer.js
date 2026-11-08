import { extractVideoId } from "./video-id.js";

// Pull supported links and strict bare IDs out of copied text.
export function extractYouTubeLinks(text = "") {
  const found = new Map();
  const urlPattern = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be|m\.youtube\.com|music\.youtube\.com)\/[^\s<>"']+/giu;
  for (const match of String(text).matchAll(urlPattern)) {
    const clean = match[0].replace(/[.,!?;:)}\]]+$/u, "");
    const url = /^https?:\/\//iu.test(clean) ? clean : `https://${clean}`;
    const id = extractVideoId(url);
    if (!id) continue;
    const playlistId = extractPlaylistId(url);
    if (!found.has(id)) found.set(id, { id, url, playlistId });
    else if (playlistId && !found.get(id).playlistId) found.get(id).playlistId = playlistId;
  }
  for (const line of String(text).split(/\r?\n/u)) {
    const value = line.trim();
    if (/^[A-Za-z0-9_-]{11}$/u.test(value) && /[0-9A-Z_-]/u.test(value)) {
      if (!found.has(value)) found.set(value, { id: value, url: `https://www.youtube.com/watch?v=${value}`, playlistId: "" });
    }
  }
  return [...found.values()];
}

// Read a playlist ID from any YouTube link that includes list=.
export function extractPlaylistId(text = "") {
  try {
    const source = String(text).trim();
    const url = new URL(/^https?:\/\//iu.test(source) ? source : `https://${source}`);
    return url.searchParams.get("list") || "";
  } catch (_) {
    return "";
  }
}

// Takeout CSV uses its explicit Video ID column; other files contain links.
export function extractImportFileLinks(filename, text) {
  if (/\.csv$/iu.test(filename)) {
    const rows = parseCsv(text);
    const header = rows[0]?.map((cell) => cell.trim().replace(/^"|"$/gu, "").toLocaleLowerCase()) || [];
    const column = header.findIndex((cell) => cell === "video id");
    if (column >= 0) {
      const ids = rows.slice(1).map((row) => (row[column] || "").trim()).filter((id) => /^[A-Za-z0-9_-]{11}$/u.test(id));
      return [...new Set(ids)].map((id) => ({ id, url: `https://www.youtube.com/watch?v=${id}`, playlistId: "" }));
    }
  }
  return extractYouTubeLinks(text);
}

// Parse quoted CSV cells without a dependency.
function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"' && quoted && text[index + 1] === '"') { value += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += char;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  return rows;
}

// Run independent lookups with a small, predictable concurrency cap.
export async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, limit)) }, worker));
  return results;
}

// Get names with oEmbed when available; failed lookups remain importable.
export async function previewVideoImports(items, { knownVideos = {}, fetcher = globalThis.fetch, concurrency = 4, onProgress = () => {} } = {}) {
  let completed = 0;
  return mapWithConcurrency(items, concurrency, async (item) => {
    const known = knownVideos[item.id];
    if (known) {
      completed += 1; onProgress(completed, items.length);
      return { ...item, title: known.title, author: known.author || "", status: "Already in library", selected: false, existing: true };
    }
    try {
      const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(item.url)}&format=json`;
      const response = await fetcher(endpoint);
      if (!response.ok) throw new Error("Video details unavailable");
      const info = await response.json();
      completed += 1; onProgress(completed, items.length);
      return { ...item, title: info.title || "Untitled video", author: info.author_name || "", status: "New", selected: true, existing: false };
    } catch (_) {
      completed += 1; onProgress(completed, items.length);
      return { ...item, title: "Untitled video", author: "", status: "Failed lookup", selected: false, existing: false };
    }
  });
}

// Add checked videos and playlist memberships, keeping a narrow Undo list.
export function saveVideoImportBatch(store, videos, selectedIds, { tags = [], playlistIds = [] } = {}) {
  const selected = new Set(selectedIds);
  const addedIds = [];
  let addedCount = 0;
  const existingCount = videos.filter((item) => item.existing || store.getVideo(item.id)).length;
  const failedCount = videos.filter((item) => item.status === "Failed lookup").length;
  for (const item of videos.filter((video) => selected.has(video.id))) {
    const result = store.addVideo({ ...item, title: item.title || "Untitled video", tags });
    if (result.added) { addedCount += 1; addedIds.push(item.id); }
    for (const playlistId of playlistIds) store.addToPlaylist(playlistId, item.id);
  }
  return {
    addedCount, existingCount, failedCount, addedIds,
    undo: () => addedIds.forEach((id) => store.deleteVideo(id))
  };
}
