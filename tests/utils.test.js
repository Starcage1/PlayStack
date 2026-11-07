import test from "node:test";
import assert from "node:assert/strict";
import { filterAndSortVideos, paginate, shuffle, sortPlaylists } from "../js/utils.js";

const videos = [
  { id: "a", title: "Zebra", author: "One", tags: ["Music"], addedAt: "2026-01-01" },
  { id: "b", title: "Apple", author: "Two", tags: ["Games"], addedAt: "2026-03-01" },
  { id: "c", title: "Mango", author: "One", tags: ["Music"], addedAt: "2026-02-01" }
];

test("pagination clamps page numbers and returns the selected slice", () => {
  assert.deepEqual(paginate(videos, 2, 2), { items: [videos[2]], page: 2, totalPages: 2, totalItems: 3 });
  assert.equal(paginate(videos, 99, 2).page, 2);
});

test("filters tags case-insensitively and sorts by title or recent date", () => {
  assert.deepEqual(filterAndSortVideos(videos, { filter: "music" }).map((video) => video.id), ["a", "c"]);
  assert.deepEqual(filterAndSortVideos(videos, { sort: "title" }).map((video) => video.title), ["Apple", "Mango", "Zebra"]);
  assert.deepEqual(filterAndSortVideos(videos, { sort: "recent" }).map((video) => video.id), ["b", "c", "a"]);
});

test("shuffle returns a copy containing each item once", () => {
  const source = [1, 2, 3, 4];
  const result = shuffle(source, () => 0.5);
  assert.notEqual(result, source);
  assert.deepEqual([...result].sort(), source);
});

test("playlist sort orders by name or video count", () => {
  const playlists = [{ name: "Z", videoIds: ["1"] }, { name: "A", videoIds: ["1", "2"] }];
  assert.deepEqual(sortPlaylists(playlists, "name").map((item) => item.name), ["A", "Z"]);
  assert.deepEqual(sortPlaylists(playlists, "count").map((item) => item.name), ["A", "Z"]);
});
