// Keep navigation in the URL hash so browser Back works without a server router.
export function parseRoute(hash = "") {
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "favorites") return { name: "favorites" };
  if (parts[0] === "playlists") return { name: "playlists" };
  if (parts[0] === "playlist" && parts[1]) return { name: "playlist", id: decodeURIComponent(parts[1]) };
  return { name: "home" };
}

export function navigate(route) {
  const hash = route.name === "playlist" ? `#/playlist/${encodeURIComponent(route.id)}` : `#/${route.name}`;
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else location.hash = hash;
}

export function watchRoute(callback) {
  window.addEventListener("hashchange", callback);
  if (!location.hash) location.replace("#/home");
  callback();
  return () => window.removeEventListener("hashchange", callback);
}
