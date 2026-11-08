import { playbackIntents } from "./playback.js";
import { libraryIntents } from "./library.js";
import { playerIntents } from "./player.js";
import { infoIntents } from "./info.js";
import { assistantIntents } from "./assistant.js";

// This list is the source for parsing, command help, and example tests.
export const COMMANDS = [...playbackIntents, ...assistantIntents, ...libraryIntents, ...playerIntents, ...infoIntents];
export const COMMAND_CATEGORIES = ["playback", "library", "player", "info", "assistant"];

export function commandExamples() {
  return COMMANDS.flatMap((item) => Object.entries(item.examples).flatMap(([language, entries]) =>
    entries.map((entry) => ({ ...entry, language, intent: item.id }))));
}
