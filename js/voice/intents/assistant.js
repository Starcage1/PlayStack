import { command, examples, hasAny } from "./shared.js";

function help(text) {
  if (hasAny(text, ["open the commands page", "commands page", "voice commands"])) return null;
  if (!hasAny(text, ["help", "commands", "command", "सारे कमांड", "तुम क्या कर सकते हो", "मदद", "what can you do", "tum kya kar sakte ho", "tum kya karoge", "kya kar sakte"])) return null;
  const category = /\b(playback|player|library|assistant|info)\b/u.exec(text)?.[1] || null;
  return { category };
}

export const assistantIntents = [command({
  id: "help", category: "assistant", title: "Show commands", description: "Open the searchable Commands page, optionally filtered to a category.",
  examples: examples(["show me all commands", "what can you do", "help"], ["commands dikhao", "tum kya kar sakte ho", "help"], ["सारे कमांड दिखाओ", "तुम क्या कर सकते हो", "मदद"]),
  keywords: ["help", "commands", "what can you do"], extractSlots: help, match: help, handler: "help",
  replies: { en: "Here are the commands you can use.", hi: "Yeh rahe aapke commands." }
})];
