// Extract an 11-character ID from the YouTube link shapes we support.
export function extractVideoId(text = "") {
  const value = String(text).trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(value)) return value;
  try {
    const link = new URL(value);
    const host = link.hostname.toLowerCase().replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = link.pathname.split("/").filter(Boolean)[0] || "";
    if (["youtube.com", "m.youtube.com", "youtube-nocookie.com"].includes(host)) {
      if (link.pathname === "/watch") id = link.searchParams.get("v") || "";
      else {
        const parts = link.pathname.split("/").filter(Boolean);
        if (["embed", "shorts"].includes(parts[0])) id = parts[1] || "";
      }
    }
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
  } catch (_) {
    return "";
  }
}
