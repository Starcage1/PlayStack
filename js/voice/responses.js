// Keep short spoken replies together so voice tone stays consistent.
const sortLabels = { manual: "manual order", recent: "recently added", title: "title A to Z", count: "most videos" };

export function responseFor(parsed, result) {
  if (result.reason === "no_current_video") return "Pehle koi video chalao.";
  if (result.reason === "no_visible_videos") return "Is page par koi video nahi hai.";
  if (result.reason === "visible_index_missing") return "Us number ka video abhi dikh nahi raha.";
  if (result.reason === "no_matching_videos" || result.reason === "video_not_found") return "Is naam se koi video nahi mila.";
  if (result.reason === "video_matches") return `Mujhe ${result.count} matching videos mile; search results mein dekho.`;
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
    case "named_playing": return `${result.title} chala diya.`;
    case "search_done": return "Search kar diya.";
    case "search_cleared": return "Search hata diya.";
    case "page_next": return "Agla page dikha raha hoon.";
    case "page_previous": return "Pichhla page dikha raha hoon.";
    case "page_opened": return `Page ${result.page} khol diya.`;
    case "scrolled": return "Page scroll kar diya.";
    case "scrolled_top": return "Page sabse upar kar diya.";
    case "settings_opened": return "Settings khol di.";
    case "commands_opened": return "Commands page khol diya.";
    case "import_opened": return "Import dialog khol diya.";
    case "went_back": return "Pichhle page par ja raha hoon.";
    case "sleep_timer_set": return `${result.minutes} minute ka sleep timer laga diya.`;
    case "sleep_timer_cancelled": return "Sleep timer cancel kar diya.";
    case "sleep_timer_status": return result.remaining ? `${result.remaining} minute baaki hain.` : "Koi sleep timer active nahi hai.";
    case "theater_updated": return result.enabled ? "Theater mode on kar diya." : "Theater mode off kar diya.";
    case "fullscreen_updated": return result.enabled ? "Fullscreen on kar diya." : "Fullscreen band kar diya.";
    case "fullscreen_fallback_theater": return "Theater view khol diya. Browser security needs a tap on Fullscreen to enter actual fullscreen.";
    case "ambient_updated": return result.enabled ? "Ambient mode on kar diya." : "Ambient mode off kar diya.";
    case "player_minimized": return "Player minimize kar diya.";
    case "player_expanded": return "Player expand kar diya.";
    case "help_opened": return "Commands page khol diya.";
    case "what_playing": return result.video ? `Abhi ${result.video.title} chal raha hai.` : "Abhi koi video nahi chal raha.";
    case "library_count": return `Aapki library mein ${result.count} videos hain.`;
    case "playlist_count": return `Aapki ${result.count} playlists hain.`;
    case "list_playlists": return result.names.length ? `Playlists: ${result.names.join(", ")}.` : "Abhi koi playlist nahi hai.";
    default: return "Command complete.";
  }
}
