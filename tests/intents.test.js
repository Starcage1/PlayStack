import test from "node:test";
import assert from "node:assert/strict";
import { parseCommand, parseNumber } from "../js/voice/intents.js";

const phrases = [
  ["chalao", "play"], ["play karo", "play"], ["shuru karo", "play"], ["resume video", "play"], ["start playing", "play"], ["वीडियो चलाओ", "play"],
  ["roko", "pause"], ["ruko", "pause"], ["pause karo", "pause"], ["band karo", "pause"], ["pause the video", "pause"], ["वीडियो रोको", "pause"],
  ["agla video chalao", "next"], ["next video", "next"], ["next please", "next"], ["agle video", "next"], ["अगला वीडियो चलाओ", "next"], ["नेक्स्ट वीडियो", "next"],
  ["pichla video", "previous"], ["previous video", "previous"], ["prev please", "previous"], ["pichhli video chalao", "previous"], ["पिछला वीडियो", "previous"], ["पिछली वीडियो चलाओ", "previous"],
  ["awaaz badhao", "change_volume"], ["awaaz kam karo", "change_volume"], ["volume up", "change_volume"], ["volume down", "change_volume"], ["volume fifty karo", "set_volume"], ["आवाज़ बढ़ाओ", "change_volume"], ["आवाज कम करो", "change_volume"],
  ["tees second aage", "seek_relative"], ["das second peeche", "seek_relative"], ["30 seconds forward", "seek_relative"], ["10 seconds backward", "seek_relative"], ["३० सेकंड आगे", "seek_relative"], ["बीस सेकंड पीछे", "seek_relative"],
  ["is video ko coding playlist mein daal do", "add_current_to_playlist"], ["isse exam prep mein add karo", "add_current_to_playlist"], ["add this video to Coding Dev Talks", "add_current_to_playlist"], ["add current video to playlist Coding", "add_current_to_playlist"],
  ["tag karo study", "tag_current"], ["study tag lagao", "tag_current"], ["add tag research", "tag_current"],
  ["ek playlist banao naam rakho exam prep", "create_playlist"], ["create playlist called Coding", "create_playlist"], ["playlist banao Anime", "create_playlist"],
  ["playlist sort karo by date", "sort_playlist"], ["playlist sort karo by naam", "sort_playlist"], ["sort playlist by title", "sort_playlist"], ["coding playlist kholo", "open_playlist"], ["open playlist Coding Dev Talks", "open_playlist"],
  ["favourite karo", "favorite_current"], ["favorite this video", "favorite_current"],
  ["एक प्लेलिस्ट बनाओ नाम रखो परीक्षा तैयारी", "create_playlist"], ["कोडिंग प्लेलिस्ट खोलो", "open_playlist"]
];

test(`recognizes ${phrases.length} Hinglish, English, and Devanagari command phrases`, () => {
  const context = { currentVideoId: "video-1", routeName: "playlist", currentPlaylistId: "p1" };
  for (const [phrase, expected] of phrases) {
    assert.equal(parseCommand(phrase, context).intent, expected, phrase);
  }
});

test("extracts playlist names, tags, sort modes, volume, and seek direction", () => {
  assert.equal(parseCommand("is video ko coding playlist mein daal do").args.playlistName, "coding");
  assert.equal(parseCommand("isse exam prep mein add karo").args.playlistName, "exam prep");
  assert.equal(parseCommand("tag karo Study").args.tag, "study");
  assert.equal(parseCommand("study tag lagao").args.tag, "study");
  assert.equal(parseCommand("एक प्लेलिस्ट बनाओ नाम रखो परीक्षा तैयारी").args.name, "परीक्षा तैयारी");
  assert.equal(parseCommand("playlist sort karo by naam").args.sort, "title");
  assert.equal(parseCommand("playlist sort karo by date").args.sort, "recent");
  assert.deepEqual(parseCommand("volume fifty karo").args, { value: 50 });
  assert.deepEqual(parseCommand("tees second aage").args, { direction: 1, seconds: 30 });
  assert.deepEqual(parseCommand("das second peeche").args, { direction: -1, seconds: 10 });
});

test("reads English and Hindi number words plus numeric digits", () => {
  assert.equal(parseNumber("fifty"), 50);
  assert.equal(parseNumber("thirty five seconds"), 35);
  assert.equal(parseNumber("ek sau pachaas"), 150);
  assert.equal(parseNumber("chauntis"), 34);
  assert.equal(parseNumber("३०"), 30);
});

test("unknown phrases are safe and unsupported delete requests are not intents", () => {
  assert.equal(parseCommand("delete this video").intent, "unknown");
  assert.equal(parseCommand("summarize this video").intent, "unknown");
});

test("recognizes natural player mode and exact or relative volume phrases", () => {
  const cases = [
    ["go fullscreen", "fullscreen_mode", { enabled: null }],
    ["fullscreen band karo", "fullscreen_mode", { enabled: false }],
    ["theater mode on", "theater_mode", { enabled: true }],
    ["wide player kholo", "theater_mode", { enabled: true }],
    ["minimize the player", "minimize_player", {}],
    ["volume 50%", "set_volume", { value: 50 }],
    ["set volume to 50", "set_volume", { value: 50 }],
    ["awaaz 50 karo", "set_volume", { value: 50 }],
    ["volume fifty karo", "set_volume", { value: 50 }],
    ["lower the volume by 15%", "change_volume", { direction: -1, amount: 15 }],
    ["increase volume by 20 points", "change_volume", { direction: 1, amount: 20 }],
    ["volume 15 points kam karo", "change_volume", { direction: -1, amount: 15 }],
    ["awaaz 10 badhao", "change_volume", { direction: 1, amount: 10 }]
  ];
  for (const [phrase, intent, args] of cases) {
    const parsed = parseCommand(phrase);
    assert.equal(parsed.intent, intent, phrase);
    assert.deepEqual(parsed.args, args, phrase);
  }
});
