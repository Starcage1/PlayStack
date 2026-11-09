// Keep registry entries consistent for parsing, help, and generated tests.
export function command({ id, category, title, description, examples, keywords, extractSlots, match, handler = id, replies, speak = "voice" }) {
  return { id, category, title, description, examples, keywords, extractSlots, match, handler, replies, speak };
}

export function normalizeIntentText(value) {
  return String(value || "").replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}:]+/gu, " ").trim().replace(/\s+/g, " ");
}

export function examples(en, hi, deva = []) {
  return { en: en.map(text => ({ text })), hi: hi.map(text => ({ text })), deva: deva.map(text => ({ text })) };
}

export function hasAny(text, words) { return words.some((word) => text.includes(word)); }
