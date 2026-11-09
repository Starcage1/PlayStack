import { parseNumber } from "../legacy-parser.js";
import { command, examples, hasAny } from "./shared.js";

function searchQuery(text) {
  if (hasAny(text, ["clear search", "reset the search", "show all results", "search hatao", "search clear", "sab videos"])) return null;
  if (!/\b(search|dhundo|dhoondo|find)\b|ढूंढ|खोज/u.test(text)) return null;
  const query = text.replace(/\b(search|for|karo|kar|please|find|dhundo|dhoondo|search karo|खोजो|ढूंढो|खोज)\b/gu, " ").trim();
  return query ? { query } : null;
}

function pageDirection(direction) {
  return (text) => hasAny(text, direction === "next" ? ["next page", "agla page", "agle page", "अगला पेज"] : ["previous page", "prev page", "prior page", "back page", "go back one page", "ek page peeche", "pichla page", "pichhla page", "pichhle page", "पिछला पेज"])
    ? { direction } : null;
}

function pageNumber(text) {
  if (hasAny(text, ["next page", "agla page", "agle page", "अगला पेज", "previous page", "prev page", "prior page", "back page", "go back one page", "ek page peeche", "ek page wapas", "pichla page", "pichhla page", "pichhle page", "पिछला पेज"])) return null;
  if (!/\bpage\b|पेज/u.test(text)) return null;
  const ordinal = text.match(/\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|teesra|pehla|doosra|dusra)\b|^(पहला|पहली|दूसरा|तीसरा)$/u)?.[0];
  const ordinalValues = { first: 1, "1st": 1, pehla: 1, pehli: 1, दूसरा: 2, doosra: 2, dusra: 2, second: 2, "2nd": 2, तीसरा: 3, teesra: 3, third: 3, "3rd": 3, fourth: 4, "4th": 4, fifth: 5, "5th": 5 };
  const number = ordinal ? ordinalValues[ordinal] : parseNumber(text);
  return number === null ? null : { page: number };
}

function scrollDirection(direction) {
  return (text) => {
    if (hasAny(text, ["go to the top", "scroll to top", "back to top", "upar se shuru", "page ke top", "sabse upar"])) return null;
    return hasAny(text, direction === "down" ? ["scroll down", "move down the page", "page neeche karo", "neeche jao", "neeche scroll", "नीचे जाओ"] : ["scroll up", "move up the page", "page upar karo", "upar jao", "upar scroll", "ऊपर जाओ"])
    ? { direction } : null;
  };
}

function simpleHas(words, args = {}) { return (text) => hasAny(text, words) ? args : null; }
function goBack(text) {
  if (hasAny(text, ["backward", "seconds", "second"])) return null;
  return hasAny(text, ["go back", "return to previous", "back", "wapas jao", "pichhe jao", "page wapas"]) ? {} : null;
}

export const libraryIntents = [
  command({ id: "search", category: "library", title: "Search your library", description: "Search everywhere, or search within the open playlist.", examples: examples(["search for lofi", "lofi search", "search coding videos"], ["lofi search karo", "coding dhundo", "search karo this"]), keywords: ["search", "dhundo", "find"], extractSlots: searchQuery, match: searchQuery, handler: "search", replies: { en: "Searching your library.", hi: "Aapki library mein dhoond raha hoon." } }),
  command({ id: "clear_search", category: "library", title: "Clear search", description: "Clear the current search query and return to the unfiltered list.", examples: examples(["clear search", "reset the search", "show all results"], ["search hatao", "search clear karo", "sab videos dikhao"]), keywords: ["clear search", "reset search", "search hatao"], extractSlots: simpleHas(["clear search", "reset the search", "show all results", "search hatao", "search clear", "sab videos"]), match: simpleHas(["clear search", "reset the search", "show all results", "search hatao", "search clear", "sab videos"]), handler: "clear_search", replies: { en: "Search cleared.", hi: "Search hata diya." } }),
  command({ id: "page_next", category: "library", title: "Next page", description: "Show the next page of the current list.", examples: examples(["next page", "show the next page", "go to next page"], ["agla page", "agla page dikhao", "next page kholo"]), keywords: ["next page", "agla page"], extractSlots: pageDirection("next"), match: pageDirection("next"), handler: "page_next", speak: "earcon", replies: { en: "Next page.", hi: "Agla page." } }),
  command({ id: "page_previous", category: "library", title: "Previous page", description: "Show the previous page of the current list.", examples: examples(["previous page", "go back one page", "show the prior page"], ["pichla page", "ek page peeche jao", "pichhla page dikhao"]), keywords: ["previous page", "pichla page"], extractSlots: pageDirection("previous"), match: pageDirection("previous"), handler: "page_previous", speak: "earcon", replies: { en: "Previous page.", hi: "Pichhla page." } }),
  command({ id: "page_number", category: "library", title: "Open page number", description: "Jump to a numbered page in the current list.", examples: examples(["go to page 3", "open page two", "show page 5"], ["page teen kholo", "page do dikhao", "teesra page kholo"]), keywords: ["page", "paj", "पेज"], extractSlots: pageNumber, match: pageNumber, handler: "page_number", speak: "earcon", replies: { en: "Opening that page.", hi: "Woh page khol raha hoon." } }),
  command({ id: "scroll", category: "library", title: "Scroll the page", description: "Scroll the current page up or down.", examples: examples(["scroll down", "scroll up", "move down the page"], ["neeche jao", "upar scroll karo", "page neeche karo"]), keywords: ["scroll down", "scroll up", "neeche", "upar"], extractSlots: (text) => scrollDirection("down")(text) || scrollDirection("up")(text), match: (text) => scrollDirection("down")(text) || scrollDirection("up")(text), handler: "scroll", speak: "earcon", replies: { en: "Okay.", hi: "Theek hai." } }),
  command({ id: "scroll_top", category: "library", title: "Go to top", description: "Scroll back to the top of the current page.", examples: examples(["go to the top", "scroll to top", "back to top"], ["upar se shuru karo", "page ke top par jao", "sabse upar jao"]), keywords: ["top", "upar"], extractSlots: simpleHas(["go to the top", "scroll to top", "back to top", "upar se shuru", "page ke top", "sabse upar"]), match: simpleHas(["go to the top", "scroll to top", "back to top", "upar se shuru", "page ke top", "sabse upar"]), handler: "scroll_top", speak: "earcon", replies: { en: "Back at the top.", hi: "Page sabse upar hai." } }),
  command({ id: "open_settings", category: "library", title: "Open settings", description: "Open the app settings page.", examples: examples(["open settings", "go to settings", "show my settings"], ["settings kholo", "settings par jao", "settings dikhao"]), keywords: ["settings", "सेटिंग"], extractSlots: simpleHas(["open settings", "go to settings", "show my settings", "settings kholo", "settings par", "settings dikhao"]), match: simpleHas(["open settings", "go to settings", "show my settings", "settings kholo", "settings par", "settings dikhao"]), handler: "open_settings", replies: { en: "Opening settings.", hi: "Settings khol raha hoon." } }),
  command({ id: "open_commands", category: "library", title: "Open Commands", description: "Open the searchable command guide.", examples: examples(["open the Commands page", "go to voice commands", "open commands page"], ["commands page kholo", "commands page par jao", "voice commands kholo"]), keywords: ["commands", "कमांड"], extractSlots: simpleHas(["commands page", "all commands", "voice commands", "commands kholo"]), match: simpleHas(["commands page", "all commands", "voice commands", "commands kholo"]), handler: "open_commands", replies: { en: "Opening the command guide.", hi: "Commands ki list khol raha hoon." } }),
  command({ id: "open_import", category: "library", title: "Open imports", description: "Open the video and playlist import window.", examples: examples(["open import", "import videos", "open playlist import"], ["import kholo", "playlist import karo", "multiple videos add karo"]), keywords: ["import", "add videos", "playlist import"], extractSlots: simpleHas(["open import", "import videos", "playlist import", "import kholo", "multiple videos add", "import karo"]), match: simpleHas(["open import", "import videos", "playlist import", "import kholo", "multiple videos add", "import karo"]), handler: "open_import", replies: { en: "Opening imports.", hi: "Import khol raha hoon." } }),
  command({ id: "go_back", category: "library", title: "Go back", description: "Return to the previous app page.", examples: examples(["go back", "return to previous screen", "back"], ["wapas jao", "pichhe jao", "ek page wapas"]), keywords: ["go back", "return", "wapas"], extractSlots: goBack, match: goBack, handler: "go_back", replies: { en: "Going back.", hi: "Pichhle page par ja raha hoon." } })
];
