import { parseNumber } from "../legacy-parser.js";
import { command, examples, normalizeIntentText, hasAny } from "./shared.js";

const ORDINALS = new Map([["first", 1], ["1st", 1], ["pehla", 1], ["pehli", 1], ["doosra", 2], ["dusra", 2], ["second", 2], ["2nd", 2], ["teesra", 3], ["third", 3], ["3rd", 3], ["chautha", 4], ["fourth", 4], ["4th", 4], ["fifth", 5], ["5th", 5], ["sixth", 6], ["7th", 7], ["8th", 8], ["9th", 9], ["10th", 10], ["last", -1], ["aakhri", -1], ["आखिरी", -1], ["पहला", 1], ["पहली", 1], ["दूसरा", 2], ["तीसरा", 3]]);

function visibleIndex(text) {
  if (!hasAny(text, ["video", "one", "wala", "wali", "वीडियो"])) return null;
  const word = [...ORDINALS.keys()].find((item) => new RegExp(`(^| )${item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}( |$)`, "u").test(text));
  if (word) return { index: ORDINALS.get(word) };
  const explicitNumber = text.match(/(?:video|वीडियो) (?:number )?(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|ek|do|teen|char|chaar|paanch|छह|सात|आठ|नौ|दस)\b/u)?.[1];
  const number = explicitNumber ? parseNumber(explicitNumber) : null;
  return number !== null ? { index: number } : null;
}

function randomSource(text) {
  if (!hasAny(text, ["random", "something", "surprise", "koi bhi", "kuch", "koyi", "random", "कुछ", "कोई भी"])) return null;
  let source = "current";
  const fromHinglish = text.match(/^(.+?) (?:mein se|me se) (?:kuch|koi bhi|something) /u);
  if (fromHinglish?.[1]) source = fromHinglish[1].replace(/\b(?:my|meri|mere|playlist|videos?)\b/gu, " ").trim();
  const from = text.match(/(?:from|mein se|me se|से) (?:my |meri |mere )?(.+?)(?: playlist| list| videos?)?(?: play| chalao| chala| चला| चलाओ)?$/u);
  if (source === "current" && from?.[1]) source = from[1].replace(/\bplaylist\b|\blist\b|\bvideos?\b|\bmy\b|\bmeri\b|\bmere\b/g, " ").trim();
  if (source === "current" && !hasAny(text, ["play", "chalao", "chala", "चलाओ", "चला", "चला दो", "surprise"])) return null;
  return { source };
}

function titleQuery(text) {
  if (!/\b(play|chalao|chala)\b|चलाओ/u.test(text)) return null;
  if (hasAny(text, ["random", "something", "surprise", "koi bhi", "कोई भी", "kuch", "कुछ", "next", "agla", "agle", "previous", "prev", "pichla", "pichhli", "pichle", "pehla", "pehli", "first", "second", "third", "last", "अगला", "अगली", "पिछला", "पिछली", "पहला", "तीसरा"])) return null;
  const query = text.replace(/\b(play|chalao|chala|karo|kar|do|video|song|wala|wali|waala|waali|one|the|please)\b/gu, " ").replace(/चलाओ|वीडियो/gu, " ").trim();
  return query.length >= 2 ? { query } : null;
}

const visible = command({
  id: "play_visible", category: "playback", title: "Play a visible video", description: "Play a video by its position on the current filtered page.",
  examples: examples(["play the first video", "play the third one", "play the last video"], ["pehla video chalao", "teesra wala chalao", "aakhri video chalao"], ["पहला वीडियो चलाओ", "तीसरा वीडियो चलाओ", "आखिरी वीडियो चलाओ"]),
  keywords: ["first", "third", "last", "pehla", "teesra", "aakhri"], extractSlots: visibleIndex, match: visibleIndex, handler: "play_visible", speak: "earcon",
  replies: { en: "Playing that video.", hi: "Yeh video chala diya." }
});

const random = command({
  id: "play_random", category: "playback", title: "Play something random", description: "Choose a random video from the current view or a named source.",
  examples: examples(["play something", "surprise me with a video", "play something from my coding playlist"], ["koi bhi video chalao", "kuch random chalao", "games mein se kuch chalao"], ["कोई भी वीडियो चलाओ", "कुछ भी चला दो", "गेम्स में से कुछ चलाओ"]),
  keywords: ["random", "something", "surprise", "koi bhi", "kuch"], extractSlots: randomSource, match: randomSource, handler: "play_random", speak: "earcon",
  replies: { en: "Here’s a random pick.", hi: "Ek random video chala diya." }
});

const named = command({
  id: "play_named", category: "playback", title: "Play by name", description: "Find videos by title, channel, or tag and play a strong match.",
  examples: examples(["play Chicken Fettuccine", "play the Dokkan one", "play a video about coding"], ["chicken wala video chalao", "dokkan wala chalao", "coding wala video chalao"], ["चिकन वाला वीडियो चलाओ", "डोक्कन वाला चलाओ", "कोडिंग वाला वीडियो चलाओ"]),
  keywords: ["play", "chalao", "wala", "title", "channel"], extractSlots: titleQuery, match: titleQuery, handler: "play_named", speak: "voice",
  replies: { en: "I found a matching video.", hi: "Milta-julta video chala diya." }
});

export const playbackIntents = [visible, random, named];
