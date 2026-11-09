import test from "node:test";
import assert from "node:assert/strict";
import { extractYouTubeLinks, extractPlaylistId, extractImportFileLinks, mapWithConcurrency, previewVideoImports, saveVideoImportBatch } from "../js/importer.js";
import { createStore } from "../js/store.js";
import { MemoryStorage } from "./helpers.js";

test("extracts YouTube URL types from copied text, dedupes, and preserves playlist IDs", () => {
  const links = extractYouTubeLinks([
    "Watch https://www.youtube.com/watch?v=AbC_1234567&list=PL1234567890.",
    "https://youtu.be/AbC_1234567?t=20",
    "https://m.youtube.com/shorts/ZYX_1234567",
    "https://music.youtube.com/watch?v=QWE_1234567",
    "https://www.youtube.com/live/RTY_1234567",
    "https://youtube.com/embed/FGH_1234567"
  ].join("\n"));
  assert.deepEqual(links.map((item) => item.id), ["AbC_1234567", "ZYX_1234567", "QWE_1234567", "RTY_1234567", "FGH_1234567"]);
  assert.equal(links[0].playlistId, "PL1234567890");
});

test("bare ID imports require a distinctive uppercase, digit, underscore, or hyphen character", () => {
  assert.deepEqual(extractYouTubeLinks("programming\nAbcdefghijk\nabcdefghijk\nabc_defghij").map((item) => item.id), ["Abcdefghijk", "abc_defghij"]);
  assert.equal(extractPlaylistId("https://youtube.com/watch?v=AbC_1234567&list=PL1234567890"), "PL1234567890");
});

test("Takeout CSV uses the Video ID header and text files extract links", () => {
  const takeout = extractImportFileLinks("watch-history.csv", 'Title,Video ID\nSong,Abcdefghijk\nOther,abcdefghijk');
  assert.deepEqual(takeout.map((item) => item.id), ["Abcdefghijk", "abcdefghijk"]);
  assert.deepEqual(extractImportFileLinks("bookmarks.html", '<a href="https://youtu.be/AbC_1234567">video</a>').map((item) => item.id), ["AbC_1234567"]);
});

test("bulk worker respects its concurrency limit and retains input order", async () => {
  let active = 0, maximum = 0;
  const values = await mapWithConcurrency([4, 3, 2, 1, 0], 2, async (value) => {
    active += 1; maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, value));
    active -= 1; return value * 2;
  });
  assert.equal(maximum, 2);
  assert.deepEqual(values, [8, 6, 4, 2, 0]);
});

test("preview marks duplicates, new videos, and failures without blocking imports", async () => {
  const items = extractYouTubeLinks("https://youtu.be/AbC_1234567\nhttps://youtu.be/ZYX_1234567\nhttps://youtu.be/QWE_1234567");
  const progress = [];
  const results = await previewVideoImports(items, {
    knownVideos: { AbC_1234567: { title: "Saved already", author: "Channel" } },
    fetcher: async (url) => {
      if (url.includes("QWE_1234567")) throw new Error("offline");
      return { ok: true, json: async () => ({ title: "Real title", author_name: "Real channel" }) };
    },
    onProgress: (done, total) => progress.push([done, total])
  });
  assert.deepEqual(results.map(({ status, selected }) => [status, selected]), [["Already in library", false], ["New", true], ["Failed lookup", false]]);
  assert.equal(results[1].title, "Real title");
  assert.equal(progress.length, 3);
});

test("batch save dedupes, adds memberships, counts failures, and undo removes only new videos", () => {
  const store = createStore(new MemoryStorage());
  store.addVideo({ id: "AbC_1234567", title: "Saved already" });
  const playlist = store.createPlaylist("Mix");
  const videos = [
    { id: "AbC_1234567", title: "Saved already", status: "Already in library", existing: true },
    { id: "ZYX_1234567", title: "New title", status: "New", existing: false },
    { id: "QWE_1234567", title: "Untitled video", status: "Failed lookup", existing: false }
  ];
  const result = saveVideoImportBatch(store, videos, ["AbC_1234567", "ZYX_1234567"], { tags: ["Music"], playlistIds: [playlist.id] });
  assert.deepEqual([result.addedCount, result.existingCount, result.failedCount], [1, 1, 1]);
  assert.deepEqual(store.getPlaylist(playlist.id).videoIds, ["AbC_1234567", "ZYX_1234567"]);
  result.undo();
  assert.ok(store.getVideo("AbC_1234567"));
  assert.equal(store.getVideo("ZYX_1234567"), null);
  assert.deepEqual(store.getPlaylist(playlist.id).videoIds, ["AbC_1234567"]);
});
