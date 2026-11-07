// One long-lived wrapper around YouTube's player. It contains no page UI code.
let player = null;
let ready = false;
let pending = null;
let callbacks = {};

// Create the YouTube iframe once; later screens never move or recreate it.
export function createPlayer(targetId, listeners = {}) {
  if (player) return player;
  callbacks = listeners;
  player = new YT.Player(targetId, {
    width: "100%", height: "100%",
    playerVars: { controls: 0, rel: 0, playsinline: 1, modestbranding: 1, enablejsapi: 1, origin: window.location.origin },
    events: {
      onReady: () => {
        ready = true;
        if (pending) loadVideo(pending.id, pending.autoplay);
        callbacks.onReady?.();
      },
      onStateChange: (event) => callbacks.onStateChange?.(event.data),
      onError: (event) => callbacks.onError?.(event.data)
    }
  });
  return player;
}

// Cue or play a selected video after the iframe is ready.
export function loadVideo(videoId, autoplay = false) {
  pending = { id: videoId, autoplay };
  if (!ready) return;
  pending = null;
  if (autoplay) player.loadVideoById(videoId);
  else player.cueVideoById(videoId);
}

// Keep the minimal player's original public methods available.
export function play() {
  if (!ready) return;
  if (getState() === YT.PlayerState.ENDED || (getDuration() > 0 && getTime() >= getDuration())) seekTo(0, true);
  player.playVideo();
}
export function pause() { if (ready) player.pauseVideo(); }
export function stop() { if (ready) player.stopVideo(); }
export function seekTo(seconds, allowSeekAhead = true) { if (ready) player.seekTo(Number(seconds), allowSeekAhead); }
export function setVolume(value) { if (ready) player.setVolume(Math.max(0, Math.min(100, Number(value)))); }
export function getState() { return ready ? player.getPlayerState() : -1; }
export function getTime() { return ready ? player.getCurrentTime() : 0; }
export function getDuration() { return ready ? player.getDuration() : 0; }
export function getVideoData() { return ready ? player.getVideoData() : {}; }

export const playerApi = { createPlayer, loadVideo, play, pause, stop, seekTo, setVolume, getState, getTime, getDuration, getVideoData };
if (typeof window !== "undefined") window.VaultPlayer = playerApi;
