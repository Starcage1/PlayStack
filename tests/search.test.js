import test from "node:test";
import assert from "node:assert/strict";
import { searchLibrary } from "../js/search.js";

test("search groups case-insensitive video title, channel, tag, and playlist matches", () => {
  const videos = [
    { id: "a", title: "Night Drive", author: "Studio One", tags: ["Music"] },
    { id: "b", title: "Cooking", author: "Home Kitchen", tags: ["Food"] }
  ];
  const playlists = [{ id: "p", name: "Music for Work", videoIds: ["a"] }];
  assert.deepEqual(searchLibrary(videos, playlists, "STUDIO"), { videos: [videos[0]], playlists: [] });
  assert.deepEqual(searchLibrary(videos, playlists, "music"), { videos: [videos[0]], playlists: [playlists[0]] });
  assert.deepEqual(searchLibrary(videos, playlists, ""), { videos: [], playlists: [] });
});
