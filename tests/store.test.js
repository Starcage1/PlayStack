import test from "node:test";
import assert from "node:assert/strict";
import { createStore } from "../js/store.js";
import { MemoryStorage } from "./helpers.js";

const video = (id, extra = {}) => ({ id, title: `Video ${id}`, author: "Channel", tags: ["Music"], ...extra });

test("adds videos once, deduplicates, and persists the library", () => {
  const storage = new MemoryStorage();
  const store = createStore(storage);
  assert.equal(store.addVideo(video("a")).added, true);
  assert.equal(store.addVideo(video("a", { title: "Duplicate" })).added, false);
  const restored = createStore(storage);
  assert.equal(restored.getVideo("a").title, "Video a");
  assert.equal(restored.getState().version, 1);
});

test("playlist membership avoids duplicates and preserves removal position", () => {
  const store = createStore(new MemoryStorage());
  store.addVideo(video("a")); store.addVideo(video("b"));
  const playlist = store.createPlaylist("Mix");
  assert.equal(store.addToPlaylist(playlist.id, "a"), true);
  assert.equal(store.addToPlaylist(playlist.id, "a"), false);
  store.addToPlaylist(playlist.id, "b");
  const membership = store.removeFromPlaylist(playlist.id, "a");
  assert.deepEqual(store.getPlaylist(playlist.id).videoIds, ["b"]);
  store.restoreMembership(membership);
  assert.deepEqual(store.getPlaylist(playlist.id).videoIds, ["a", "b"]);
});

test("deleting a video cascades through playlists and can be undone", () => {
  const store = createStore(new MemoryStorage());
  store.addVideo(video("a"));
  const playlist = store.createPlaylist("Mix");
  store.addToPlaylist(playlist.id, "a");
  const deleted = store.deleteVideo("a");
  assert.equal(store.getVideo("a"), null);
  assert.deepEqual(store.getPlaylist(playlist.id).videoIds, []);
  store.restoreVideo(deleted);
  assert.equal(store.getVideo("a").title, "Video a");
  assert.deepEqual(store.getPlaylist(playlist.id).videoIds, ["a"]);
});

test("deleting a playlist leaves videos intact and can be undone", () => {
  const store = createStore(new MemoryStorage());
  store.addVideo(video("a"));
  const playlist = store.createPlaylist("Mix");
  store.addToPlaylist(playlist.id, "a");
  const deleted = store.deletePlaylist(playlist.id);
  assert.equal(store.getPlaylist(playlist.id), null);
  assert.equal(store.getVideo("a").title, "Video a");
  store.restorePlaylist(deleted);
  assert.deepEqual(store.getPlaylist(playlist.id).videoIds, ["a"]);
});

test("storage failures show a warning and keep session data in memory", () => {
  let warning = "";
  const storage = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const store = createStore(storage, { onWarning: (message) => { warning = message; } });
  store.addVideo(video("a"));
  assert.match(warning, /session/);
  assert.equal(store.getVideo("a").id, "a");
});
