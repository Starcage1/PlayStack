// Run parsed intents through the existing player, store, and router interfaces.
export function matchPlaylistName(spokenName, playlists) {
  const spoken = normalizeName(spokenName);
  if (!spoken) return { playlist: null, suggestions: closestNames(spoken, playlists) };
  const ranked = playlists.map((playlist) => ({ playlist, score: nameScore(spoken, normalizeName(playlist.name)) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score < 0.58) return { playlist: null, suggestions: ranked.slice(0, 3).map((item) => item.playlist.name) };
  return { playlist: best.playlist, suggestions: ranked.slice(1, 3).map((item) => item.playlist.name) };
}

export function createVoiceActions(services) {
  const {
    player, store, navigate, getContext, nextVideo, previousVideo, refresh,
    setPlaylistSort, setPlaylistsSort, openCreatedPlaylist, handlers = {}
  } = services;

  function needsVideo(context) {
    return context.currentVideoId ? null : { ok: false, reason: "no_current_video" };
  }

  function finish(result) {
    refresh?.();
    return { ok: true, ...result };
  }

  function choosePlaylist(name, context) {
    const match = matchPlaylistName(name, context.playlists || []);
    return match.playlist ? { playlist: match.playlist } : { reason: "playlist_not_found", suggestions: match.suggestions };
  }

  async function execute(parsed) {
    const context = getContext();
    const noVideo = needsVideo(context);
    switch (parsed.intent) {
      case "play": if (noVideo) return noVideo; player.play(); return { ok: true, reason: "played" };
      case "pause": if (noVideo) return noVideo; player.pause(); return { ok: true, reason: "paused" };
      case "next": if (noVideo) return noVideo; return nextVideo?.() ? { ok: true, reason: "next" } : { ok: false, reason: "queue_end" };
      case "previous": if (noVideo) return noVideo; return previousVideo?.() ? { ok: true, reason: "previous" } : { ok: false, reason: "queue_start" };
      case "set_volume": {
        const value = Math.max(0, Math.min(100, Number(parsed.args.value)));
        store.setVolume(value); player.setVolume(value);
        return finish({ reason: "volume_set", value });
      }
      case "change_volume": {
        const current = Number(context.volume ?? 100);
        const value = Math.max(0, Math.min(100, current + Number(parsed.args.direction) * Number(parsed.args.amount || 10)));
        store.setVolume(value); player.setVolume(value);
        return finish({ reason: "volume_set", value });
      }
      case "seek_relative": {
        if (noVideo) return noVideo;
        const time = Math.max(0, player.getTime() + Number(parsed.args.direction) * Number(parsed.args.seconds));
        player.seekTo(time, true);
        return { ok: true, reason: "seeked", seconds: time };
      }
      case "add_current_to_playlist": {
        if (noVideo) return noVideo;
        const choice = choosePlaylist(parsed.args.playlistName, context);
        if (!choice.playlist) return { ok: false, reason: choice.reason, suggestions: choice.suggestions, spokenName: parsed.args.playlistName };
        const added = store.addToPlaylist(choice.playlist.id, context.currentVideoId);
        if (added) refresh?.();
        return { ok: true, reason: added ? "added_to_playlist" : "already_in_playlist", playlist: choice.playlist };
      }
      case "tag_current": {
        if (noVideo) return noVideo;
        const video = store.getVideo(context.currentVideoId);
        const tag = String(parsed.args.tag || "").trim().toLocaleLowerCase();
        if (!video || !tag) return { ok: false, reason: "invalid_tag" };
        const exists = (video.tags || []).some((item) => item.toLocaleLowerCase() === tag);
        if (!exists) store.updateVideo(video.id, { tags: [...video.tags, tag] });
        refresh?.();
        return { ok: true, reason: exists ? "tag_exists" : "tagged", tag };
      }
      case "create_playlist": {
        const playlist = store.createPlaylist(parsed.args.name);
        if (!playlist) return { ok: false, reason: "playlist_name_used", name: parsed.args.name };
        openCreatedPlaylist?.(playlist);
        return { ok: true, reason: "playlist_created", playlist };
      }
      case "sort_playlist": {
        if (context.routeName === "playlist" || context.currentPlaylistId) {
          if (!context.currentPlaylistId) return { ok: false, reason: "not_in_playlist" };
          setPlaylistSort?.(parsed.args.sort, context.currentPlaylistId);
          return { ok: true, reason: "playlist_sorted", sort: parsed.args.sort };
        }
        if (context.routeName === "playlists") {
          const sort = parsed.args.sort === "title" ? "name" : parsed.args.sort === "count" ? "count" : "recent";
          setPlaylistsSort?.(sort);
          return { ok: true, reason: "playlists_sorted", sort };
        }
        return { ok: false, reason: "not_in_playlist" };
      }
      case "open_playlist": {
        const choice = choosePlaylist(parsed.args.playlistName, context);
        if (!choice.playlist) return { ok: false, reason: choice.reason, suggestions: choice.suggestions, spokenName: parsed.args.playlistName };
        navigate({ name: "playlist", id: choice.playlist.id });
        return { ok: true, reason: "playlist_opened", playlist: choice.playlist };
      }
      case "favorite_current": {
        if (noVideo) return noVideo;
        const video = store.getVideo(context.currentVideoId);
        store.updateVideo(video.id, { favorite: !video.favorite });
        refresh?.();
        return { ok: true, reason: video.favorite ? "unfavorited" : "favorited" };
      }
      case "go_home": navigate({ name: "home" }); return { ok: true, reason: "home_opened" };
      case "go_playlists": navigate({ name: "playlists" }); return { ok: true, reason: "playlists_opened" };
      default: return handlers[parsed.intent]
        ? await handlers[parsed.intent](parsed.args || {}, context)
        : { ok: false, reason: "unknown" };
    }
  }

  return { execute };
}

function normalizeName(value) {
  return String(value || "").toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(playlist|playlists|wali|waali|the|please)\b/g, " ").replace(/[^\p{L}\p{M}\p{N}]+/gu, " ").trim();
}

function closestNames(spoken, playlists) {
  return [...playlists].map((playlist) => ({ name: playlist.name, score: nameScore(spoken, normalizeName(playlist.name)) }))
    .sort((a, b) => b.score - a.score).slice(0, 3).map((item) => item.name);
}

function nameScore(left, right) {
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftWords = left.split(" ");
  const rightWords = right.split(" ");
  const matched = leftWords.filter((word) => rightWords.some((candidate) => word === candidate || editSimilarity(word, candidate) >= 0.72)).length;
  const coverage = matched / leftWords.length;
  const union = new Set([...leftWords, ...rightWords]).size;
  const overlap = matched / Math.max(1, union);
  return coverage * 0.72 + overlap * 0.28;
}

function editSimilarity(left, right) {
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
  return 1 - previous[right.length] / Math.max(left.length, right.length);
}
