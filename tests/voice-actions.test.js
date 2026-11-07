import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceActions, matchPlaylistName } from "../js/voice/actions.js";

const playlists = [
  { id: "p1", name: "Coding Dev Talks", videoIds: [] },
  { id: "p2", name: "Exam Prep", videoIds: [] },
  { id: "p3", name: "Music", videoIds: [] }
];

test("fuzzy playlist matching handles short names and offers alternatives", () => {
  assert.equal(matchPlaylistName("coding playlist", playlists).playlist.id, "p1");
  assert.equal(matchPlaylistName("exam", playlists).playlist.id, "p2");
  const unmatched = matchPlaylistName("gardening", playlists);
  assert.equal(unmatched.playlist, null);
  assert.equal(unmatched.suggestions.length, 3);
});

test("video-specific commands stop safely when nothing is loaded", async () => {
  let played = false;
  const actions = createVoiceActions({
    player: { play: () => { played = true; } },
    store: {},
    navigate: () => {},
    getContext: () => ({ currentVideoId: "", playlists: [], routeName: "home" })
  });
  assert.deepEqual(await actions.execute({ intent: "play", args: {} }), { ok: false, reason: "no_current_video" });
  assert.equal(played, false);
  assert.equal((await actions.execute({ intent: "delete_video", args: {} })).reason, "unknown");
});
