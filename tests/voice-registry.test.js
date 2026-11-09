import test from "node:test";
import assert from "node:assert/strict";
import { COMMANDS, parseCommand } from "../js/voice/intents.js";
import { normalizeIntentText } from "../js/voice/intents/shared.js";

test(`registry command examples all parse to their intent (${COMMANDS.length} commands)`, () => {
  for (const item of COMMANDS) {
    assert.ok(item.title && item.category && item.description && item.keywords.length && item.handler && item.replies.en && item.replies.hi, item.id);
    assert.ok(item.examples.en.length >= 3 && item.examples.hi.length >= 3, `${item.id} needs English and Hinglish examples`);
    for (const entry of Object.values(item.examples).flat()) {
      const result = parseCommand(entry.text);
      assert.equal(result.intent, item.id, `${item.id}: ${entry.text}`);
      const expectedArgs = item.extractSlots(normalizeIntentText(entry.text));
      assert.deepEqual(result.args, expectedArgs || {}, `${item.id} slots: ${entry.text}`);
    }
  }
});

test("registry keeps command categories and parser metadata available for the guide", () => {
  assert.ok(COMMANDS.some((item) => item.category === "playback"));
  assert.ok(COMMANDS.some((item) => item.category === "library"));
  assert.ok(COMMANDS.some((item) => item.category === "player"));
  assert.ok(COMMANDS.some((item) => item.category === "info"));
  assert.ok(COMMANDS.some((item) => item.category === "assistant"));
});
