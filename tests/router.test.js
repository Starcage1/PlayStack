import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../js/router.js";

test("hash routes resolve home, playlist grid, and playlist details", () => {
  assert.deepEqual(parseRoute("#/home"), { name: "home" });
  assert.deepEqual(parseRoute("#/favorites"), { name: "favorites" });
  assert.deepEqual(parseRoute("#/playlists"), { name: "playlists" });
  assert.deepEqual(parseRoute("#/playlist/p-123"), { name: "playlist", id: "p-123" });
  assert.deepEqual(parseRoute("#/unknown"), { name: "home" });
});
