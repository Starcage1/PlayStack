// Keep short spoken replies together so voice tone stays consistent.
const sortLabels = { manual: "manual order", recent: "recently added", title: "title A to Z", count: "most videos" };

export function responseFor(parsed, result) {
  if (result.reason === "no_current_video") return "Pehle koi video chalao.";
  if (result.reason === "unknown") return "Samajh nahi aaya, dobara bolo. Try agla video chalao, pause karo, or awaaz badhao.";
  if (result.reason === "playlist_not_found") {
    const names = result.suggestions?.length ? ` Shayad ${result.suggestions.join(", ")}.` : " Koi matching playlist nahi mili.";
    return `Playlist ${result.spokenName || ""} nahi mili.${names} Nayi playlist main khud se nahi banaunga.`;
  }
  if (result.reason === "playlist_name_used") return `${result.name} naam ki playlist pehle se hai.`;
  if (result.reason === "not_in_playlist") return "Playlist khol kar phir sort command bolo.";
  if (result.reason === "queue_end") return "Queue mein agla video nahi hai.";
  if (result.reason === "queue_start") return "Is queue mein pichla video nahi hai.";
  if (result.reason === "invalid_tag") return "Tag samajh nahi aaya. Ek chhota tag dobara bolo.";

  switch (result.reason) {
    case "played": return "Video chala diya.";
    case "paused": return "Video rok diya.";
    case "next": return "Agla video chala diya.";
    case "previous": return "Pichla video chala diya.";
    case "volume_set": return `Awaaz ${Math.round(result.value)} percent kar di.`;
    case "seeked": return "Video aage kar diya.";
    case "added_to_playlist": return `${result.playlist.name} mein add kar diya.`;
    case "already_in_playlist": return `Yeh video pehle se ${result.playlist.name} mein hai.`;
    case "tagged": return `${result.tag} tag laga diya.`;
    case "tag_exists": return `${result.tag} tag pehle se laga hai.`;
    case "playlist_created": return `${result.playlist.name} playlist bana di.`;
    case "playlist_sorted": return `Playlist ko ${sortLabels[result.sort] || "manual order"} mein sort kiya.`;
    case "playlists_sorted": return `Playlists ko ${sortLabels[result.sort] || "recently created"} se sort kiya.`;
    case "playlist_opened": return `${result.playlist.name} khol di.`;
    case "favorited": return "Video Favs mein add kar diya.";
    case "unfavorited": return "Video Favs se hata diya.";
    case "home_opened": return "Home khol diya.";
    case "playlists_opened": return "Playlists khol diye.";
    default: return "Command complete.";
  }
}
