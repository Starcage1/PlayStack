// Parse new registry commands first, then keep older commands on their stable parser.
import { parseLegacyCommand, parseNumber } from "./legacy-parser.js";
import { COMMANDS } from "./intents/registry.js";
import { normalizeIntentText } from "./intents/shared.js";

export { parseNumber, COMMANDS };

export function parseCommand(heard, context = {}) {
  const normalized = normalizeIntentText(heard);
  for (const item of COMMANDS) {
    const args = item.match?.(normalized, context);
    if (args) return { intent: item.id, args, heard: String(heard || "").trim() };
  }
  return parseLegacyCommand(heard, context);
}
