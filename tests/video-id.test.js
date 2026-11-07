import test from "node:test";
import assert from "node:assert/strict";
import { extractVideoId } from "../js/video-id.js";

const id = "dQw4w9WgXcQ";

test("extracts IDs from supported YouTube links", () => {
  assert.equal(extractVideoId(`https://www.youtube.com/watch?v=${id}&list=abc`), id);
  assert.equal(extractVideoId(`https://youtu.be/${id}?t=30`), id);
  assert.equal(extractVideoId(`https://youtube.com/embed/${id}`), id);
  assert.equal(extractVideoId(`https://youtube.com/shorts/${id}`), id);
  assert.equal(extractVideoId(id), id);
});

test("rejects malformed or unrelated links", () => {
  assert.equal(extractVideoId("https://example.com/watch?v=dQw4w9WgXcQ"), "");
  assert.equal(extractVideoId("https://youtube.com/watch?v=short"), "");
  assert.equal(extractVideoId("not a video"), "");
});
