// Keep navigation in the URL hash so browser Back works without a server router.
function decodePart(value) {
  try { return decodeURIComponent(value); } catch (_) { return value; }
}

export function parseRoute(hash = "") {
  const [path, queryString = ""] = hash.replace(/^#\/?/, "").split("?", 2);
  const parts = path.split("/").filter(Boolean);
  const query = new URLSearchParams(queryString);
  if (parts[0] === "import") return { name: "import", url: query.get("u") || "" };
  if (parts[0] === "favorites") return { name: "favorites" };
  if (parts[0] === "watch") return { name: "watch" };
  if (parts[0] === "commands") return { name: "commands" };
  if (parts[0] === "settings") return { name: "settings" };
  if (parts[0] === "search") return { name: "search", query: decodePart(parts.slice(1).join("/")) };
  if (parts[0] === "playlists") return { name: "playlists" };
  if (parts[0] === "playlist" && parts[1]) return { name: "playlist", id: decodePart(parts[1]) };
  return { name: "home" };
}

export function navigate(route) {
  const hash = route.name === "playlist" ? `#/playlist/${encodeURIComponent(route.id)}`
    : route.name === "search" ? `#/search/${encodeURIComponent(route.query || "")}`
      : `#/${route.name}`;
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
}

export function watchRoute(callback) {
  window.addEventListener("hashchange", callback);
  if (!location.hash) location.replace("#/home");
  callback();
  return () => window.removeEventListener("hashchange", callback);
}
