import { STORAGE_KEY } from "./config.js";

const copy = (value) => JSON.parse(JSON.stringify(value));
const emptyState = () => ({ version: 1, videos: {}, playlists: [], settings: { volume: 100 } });
const newId = () => `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Keep all data changes in one place. Pass storage explicitly for easy testing.
export class Store {
  constructor(storage, { key = STORAGE_KEY, onWarning = () => {} } = {}) {
    this.storage = storage || null;
    this.key = key;
    this.onWarning = onWarning;
    this.persistent = Boolean(storage);
    this.state = emptyState();
    if (this.storage) {
      try {
        const saved = this.storage.getItem(this.key);
        if (saved) this.state = this._normalize(JSON.parse(saved));
      } catch (_) {
        this.persistent = false;
        this.onWarning("Saved data could not be read. Changes are kept only for this session.");
      }
    } else {
      this.onWarning("Browser storage is unavailable. Changes are kept only for this session.");
    }
  }

  _normalize(value) {
    if (!value || value.version !== 1 || !value.videos || !Array.isArray(value.playlists)) return emptyState();
    return {
      version: 1,
      videos: value.videos,
      playlists: value.playlists.map((playlist) => ({
        id: String(playlist.id || newId()), name: String(playlist.name || "Untitled playlist"),
        createdAt: playlist.createdAt || new Date().toISOString(),
        videoIds: Array.isArray(playlist.videoIds) ? playlist.videoIds.filter((id) => value.videos[id]) : [],
        autoplay: playlist.autoplay !== false
      })),
      settings: { volume: Number.isFinite(Number(value.settings?.volume)) ? Math.max(0, Math.min(100, Number(value.settings.volume))) : 100 }
    };
  }

  _save() {
    if (!this.storage || !this.persistent) return;
    try { this.storage.setItem(this.key, JSON.stringify(this.state)); }
    catch (_) {
      this.persistent = false;
      this.onWarning("Browser storage is unavailable. Changes are kept only for this session.");
    }
  }

  getState() { return copy(this.state); }
  getVideo(id) { return this.state.videos[id] ? copy(this.state.videos[id]) : null; }
  getVideos() { return Object.values(this.state.videos).map(copy); }
  getPlaylists() { return this.state.playlists.map(copy); }
  getPlaylist(id) { return copy(this.state.playlists.find((playlist) => String(playlist.id) === String(id)) || null); }

  // Add once by ID. Return the existing record when it is already saved.
  addVideo(video) {
    if (this.state.videos[video.id]) return { added: false, video: this.getVideo(video.id) };
    this.state.videos[video.id] = {
      id: video.id, title: video.title || "Untitled video", author: video.author || "",
      addedAt: video.addedAt || new Date().toISOString(),
      durationSec: Number.isFinite(Number(video.durationSec)) && video.durationSec !== null ? Number(video.durationSec) : null,
      tags: [...new Set((video.tags || []).map((tag) => String(tag).trim()).filter(Boolean))], favorite: Boolean(video.favorite)
    };
    this._save();
    return { added: true, video: this.getVideo(video.id) };
  }

  updateVideo(id, changes) {
    const current = this.state.videos[id];
    if (!current) return null;
    const next = { ...current, ...changes, id };
    if (changes.tags) next.tags = [...new Set(changes.tags.map((tag) => String(tag).trim()).filter(Boolean))];
    this.state.videos[id] = next;
    this._save();
    return copy(next);
  }

  // Delete a video everywhere and return enough data to undo it.
  deleteVideo(id) {
    const video = this.getVideo(id);
    if (!video) return null;
    const memberships = this.state.playlists.map((playlist) => ({ playlistId: playlist.id, index: playlist.videoIds.indexOf(id) }))
      .filter((entry) => entry.index >= 0);
    delete this.state.videos[id];
    this.state.playlists.forEach((playlist) => { playlist.videoIds = playlist.videoIds.filter((videoId) => videoId !== id); });
    this._save();
    return { video, memberships };
  }

  restoreVideo(snapshot) {
    if (!snapshot?.video) return false;
    this.state.videos[snapshot.video.id] = copy(snapshot.video);
    snapshot.memberships.forEach(({ playlistId, index }) => {
      const playlist = this.state.playlists.find((item) => String(item.id) === String(playlistId));
      if (playlist && !playlist.videoIds.includes(snapshot.video.id)) playlist.videoIds.splice(index, 0, snapshot.video.id);
    });
    this._save();
    return true;
  }

  createPlaylist(name) {
    const cleanName = String(name).trim();
    if (!cleanName || this.state.playlists.some((item) => item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return null;
    const playlist = { id: newId(), name: cleanName, createdAt: new Date().toISOString(), videoIds: [], autoplay: true };
    this.state.playlists.push(playlist);
    this._save();
    return copy(playlist);
  }

  renamePlaylist(id, name) {
    const cleanName = String(name).trim();
    const playlist = this.state.playlists.find((item) => String(item.id) === String(id));
    if (!playlist || !cleanName || this.state.playlists.some((item) => item.id !== playlist.id && item.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) return false;
    playlist.name = cleanName;
    this._save();
    return true;
  }

  deletePlaylist(id) {
    const index = this.state.playlists.findIndex((item) => String(item.id) === String(id));
    if (index < 0) return null;
    const [playlist] = this.state.playlists.splice(index, 1);
    this._save();
    return { playlist: copy(playlist), index };
  }

  restorePlaylist(snapshot) {
    if (!snapshot?.playlist || this.state.playlists.some((item) => item.id === snapshot.playlist.id)) return false;
    this.state.playlists.splice(snapshot.index, 0, copy(snapshot.playlist));
    this._save();
    return true;
  }

  addToPlaylist(playlistId, videoId) {
    const playlist = this.state.playlists.find((item) => String(item.id) === String(playlistId));
    if (!playlist || !this.state.videos[videoId] || playlist.videoIds.includes(videoId)) return false;
    playlist.videoIds.push(videoId);
    this._save();
    return true;
  }

  removeFromPlaylist(playlistId, videoId) {
    const playlist = this.state.playlists.find((item) => String(item.id) === String(playlistId));
    if (!playlist) return null;
    const index = playlist.videoIds.indexOf(videoId);
    if (index < 0) return null;
    playlist.videoIds.splice(index, 1);
    this._save();
    return { playlistId: playlist.id, videoId, index };
  }

  restoreMembership(snapshot) {
    const playlist = this.state.playlists.find((item) => String(item.id) === String(snapshot?.playlistId));
    if (!playlist || !this.state.videos[snapshot.videoId] || playlist.videoIds.includes(snapshot.videoId)) return false;
    playlist.videoIds.splice(snapshot.index, 0, snapshot.videoId);
    this._save();
    return true;
  }

  setAutoplay(id, enabled) {
    const playlist = this.state.playlists.find((item) => String(item.id) === String(id));
    if (!playlist) return false;
    playlist.autoplay = Boolean(enabled);
    this._save();
    return true;
  }

  setVolume(value) {
    this.state.settings.volume = Math.max(0, Math.min(100, Number(value) || 0));
    this._save();
  }
}

export function createStore(storage, options) { return new Store(storage, options); }
