import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../js/router.js";

test("hash routes resolve home, playlist grid, and playlist details", () => {
  assert.deepEqual(parseRoute("#/home"), { name: "home" });
  assert.deepEqual(parseRoute("#/favorites"), { name: "favorites" });
  assert.deepEqual(parseRoute("#/playlists"), { name: "playlists" });
  assert.deepEqual(parseRoute("#/watch"), { name: "watch" });
  assert.deepEqual(parseRoute("#/playlist/p-123"), { name: "playlist", id: "p-123" });
  assert.deepEqual(parseRoute("#/search/dragon%20ball%20%2F%20music"), { name: "search", query: "dragon ball / music" });
  assert.deepEqual(parseRoute("#/unknown"), { name: "home" });
});

test("a malformed encoded search query stays readable and does not crash", () => {
  assert.deepEqual(parseRoute("#/search/bad%ZZquery"), { name: "search", query: "bad%ZZquery" });
});
