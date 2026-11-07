// Pure speech parsing: turn a transcript into one small command object.
const normalize = (value) => String(value || "")
  .replace(/[०-९]/g, (digit) => String("०१२३४५६७८९".indexOf(digit)))
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
  .trim();

const words = (value) => normalize(value).split(/\s+/).filter(Boolean);
const has = (tokens, values) => values.some((word) => tokens.includes(word));

const NUMBER_WORDS = new Map();
const addNumbers = (value, names) => names.split(" ").forEach((name) => name && NUMBER_WORDS.set(name, value));

[
  [0, "zero oh shunya शून्य"], [1, "one ek एक"], [2, "two do दो"], [3, "three teen tin तीन"],
  [4, "four char chaar चार"], [5, "five paanch panch पाँच"], [6, "six chhe che chay छह"],
  [7, "seven saat sat सात"], [8, "eight aath आठ"], [9, "nine nau नौ"], [10, "ten das दस"],
  [11, "eleven gyarah ग्यारह"], [12, "twelve barah बारह"], [13, "thirteen terah तेरह"],
  [14, "fourteen chaudah चौदह"], [15, "fifteen pandrah पंद्रह"], [16, "sixteen solah सोलह"],
  [17, "seventeen satrah सत्रह"], [18, "eighteen atharah अठारह"], [19, "nineteen unnis उन्नीस"],
  [20, "twenty bees बीस"], [21, "twentyone ikkis इक्कीस"], [22, "twentytwo bais बाईस"],
  [23, "twentythree teis तेईस"], [24, "twentyfour chaubis चौबीस"], [25, "twentyfive pachis पच्चीस"],
  [26, "twentysix chabbis छब्बीस"], [27, "twentyseven sattais सत्ताईस"], [28, "twentyeight atthais अट्ठाईस"],
  [29, "twentynine untis उनतीस"], [30, "thirty tees तीस"], [40, "forty chalis चालीस"],
  [50, "fifty pachaas पचास"], [60, "sixty saath साठ"], [70, "seventy sattar सत्तर"],
  [80, "eighty assi अस्सी"], [90, "ninety nabbe नब्बे"], [100, "hundred sau सौ"]
].forEach(([value, names]) => addNumbers(value, names));

[
  [31, "ikattis इकतीस"], [32, "battis बत्तीस"], [33, "taintis तैंतीस"], [34, "chauntis चौंतीस"], [35, "paintis पैंतीस"],
  [36, "chhattis छत्तीस"], [37, "saintis सैंतीस"], [38, "artis अड़तीस"], [39, "untalis उनतालीस"],
  [41, "iktalis इकतालीस"], [42, "bayalis बयालीस"], [43, "taintalis तैंतालीस"], [44, "chawalis चवालीस"],
  [45, "paintalis पैंतालीस"], [46, "chiyalis छियालीस"], [47, "saintalis सैंतालीस"], [48, "artalis अड़तालीस"], [49, "unchaas उनचास"],
  [51, "ikyavan इक्यावन"], [52, "bavan बावन"], [53, "tirpan तिरपन"], [54, "chauvan चौवन"], [55, "pachpan पचपन"],
  [56, "chhappan छप्पन"], [57, "satavan सत्तावन"], [58, "athavan अट्ठावन"], [59, "unsath उनसठ"],
  [61, "iksath इकसठ"], [62, "basath बासठ"], [63, "tirsath तिरसठ"], [64, "chaunsath चौंसठ"], [65, "painsath पैंसठ"],
  [66, "chhiyasath छियासठ"], [67, "sadsath सड़सठ"], [68, "adsath अड़सठ"], [69, "unhattar उनहत्तर"],
  [71, "ikhattar इकहत्तर"], [72, "bahattar बहत्तर"], [73, "tihattar तिहत्तर"], [74, "chauhattar चौहत्तर"], [75, "pachhattar पचहत्तर"],
  [76, "chhihattar छिहत्तर"], [77, "satahattar सतहत्तर"], [78, "athahattar अठहत्तर"], [79, "unasi उन्नासी"],
  [81, "ikyasi इक्यासी"], [82, "bayasi बयासी"], [83, "tirasi तिरासी"], [84, "chaurasi चौरासी"], [85, "pachasi पचासी"],
  [86, "chhiyasi छियासी"], [87, "satasi सत्तासी"], [88, "athasi अट्ठासी"], [89, "navasi नवासी"],
  [91, "ikyanve इक्यानवे"], [92, "baanve बानवे"], [93, "tiranve तिरानवे"], [94, "chauranve चौरानवे"],
  [95, "pachanve पचानवे"], [96, "chhiyanve छियानवे"], [97, "satanve सत्तानवे"], [98, "athanve अट्ठानवे"], [99, "ninyanve निन्यानवे"]
].forEach(([value, names]) => addNumbers(value, names));

const FILLER = new Set([
  "a", "an", "the", "please", "video", "current", "this", "that", "it", "is", "iss", "isse", "ise", "isko", "ko",
  "playlist", "wali", "waali", "to", "in", "mein", "me", "daal", "dal", "dalo", "daalo", "do", "karo", "add", "kar",
  "and", "naam", "rakho", "create", "make", "banao", "banado", "banaye", "open", "kholo", "khul", "theek", "my",
  "वीडियो", "प्लेलिस्ट", "को", "में", "डाल", "दो", "करो", "बनाओ", "नाम", "रखो", "खोलो", "मेरी", "इस", "इसको", "इसे"
]);

export function parseNumber(value) {
  const tokens = words(value);
  let current = 0;
  let total = 0;
  let found = false;
  for (const token of tokens) {
    if (/^\d+$/.test(token)) return Number(token);
    if (NUMBER_WORDS.has(token)) {
      const number = NUMBER_WORDS.get(token);
      found = true;
      if (number === 100) current = Math.max(1, current) * 100;
      else current += number;
    } else if (token === "and" || token === "seconds" || token === "second" || token === "sec") {
      continue;
    } else if (found) {
      break;
    }
  }
  return found ? total + current : null;
}

function cleanName(value) {
  return words(value).filter((word) => !FILLER.has(word)).join(" ").trim();
}

function playlistNameFrom(text) {
  const patterns = [
    /को\s+(.+?)\s+(?:प्लेलिस्ट\s+)?में\b/,
    /\bko\s+(.+?)\s+(?:playlist\s+)?(?:mein|me)\b/,
    /इसे\s+(.+?)\s+(?:प्लेलिस्ट\s+)?में\b/,
    /\bisse\s+(.+?)\s+(?:playlist\s+)?(?:mein|me)\b/,
    /\b(.+?)\s+(?:playlist\s+)?(?:mein|me)\s+(?:add|daal|dal|dalo|daalo)\b/,
    /\b(?:to|in)\s+(.+?)\s*$/,
    /\bplaylist\s+(.+?)\s*$/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const name = cleanName(match[1]);
      if (name) return name;
    }
  }
  return "";
}

function tagFrom(text) {
  const cleaned = text
    .replace(/^(?:is video ko|this video|current video|video)\s+/, "")
    .replace(/^(?:tag|add tag|tag karo|tag lagao|tag laga do|टैग करो|टैग लगाओ)\s+/, "")
    .replace(/\s+(?:tag|tag karo|tag lagao|lagao|laga do|क टैग|टैग लगाओ)$/, "")
    .replace(/\s+(?:karo|kar do|lagao|laga do|please)$/, "");
  return cleanName(cleaned).toLocaleLowerCase();
}

function command(intent, heard, args = {}) {
  return { intent, args, heard: String(heard || "").trim() };
}

export function parseCommand(heard, context = {}) {
  const text = normalize(heard);
  const tokens = text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return command("unknown", heard);

  if (has(tokens, ["pause", "roko", "ruko", "band", "रुको", "रोको", "बंद", "पॉज", "पॉज़"])) return command("pause", heard);
  if (has(tokens, ["next", "agla", "agli", "agle", "अगला", "अगली", "अगले", "नेक्स्ट"])) return command("next", heard);
  if (has(tokens, ["previous", "prev", "pichla", "pichhli", "pichle", "pichhala", "पिछला", "पिछली", "पिछले", "पीछला"])) return command("previous", heard);

  if (has(tokens, ["volume", "awaaz", "awaz", "आवाज", "आवाज़"])) {
    const number = parseNumber(text);
    if (has(tokens, ["badhao", "badao", "increase", "up", "बढ़ाओ", "बढाओ", "बढ़ा"])) return command("change_volume", heard, { direction: 1, amount: number || 10 });
    if (has(tokens, ["kam", "ghatao", "lower", "down", "कम", "घटाओ", "घटा"])) return command("change_volume", heard, { direction: -1, amount: number || 10 });
    if (number !== null) return command("set_volume", heard, { value: Math.max(0, Math.min(100, number)) });
  }

  if (has(tokens, ["second", "seconds", "sec", "secondi", "सेकंड", "सेकण्ड"]) && has(tokens, ["aage", "forward", "ahead", "peeche", "piche", "back", "backward", "आगे", "पीछे"])) {
    const seconds = parseNumber(text);
    if (seconds !== null) {
      const direction = has(tokens, ["peeche", "piche", "back", "backward", "पीछे"]) ? -1 : 1;
      return command("seek_relative", heard, { direction, seconds });
    }
  }

  const hasAddVerb = has(tokens, ["add", "daal", "dal", "dalo", "daalo", "jodo", "जोड़ो", "डाल", "डालो", "जोड़"]);
  if (hasAddVerb && (has(tokens, ["video", "this", "current", "it", "isse", "isko", "is", "वीडियो", "इसे", "इसको"]) || has(tokens, ["playlist", "प्लेलिस्ट"]))) {
    return command("add_current_to_playlist", heard, { playlistName: playlistNameFrom(text) });
  }

  if (has(tokens, ["tag", "tagging", "टैग"]) || has(tokens, ["lagao", "laga"]) && has(tokens, ["study", "tag"])) {
    const tag = tagFrom(text);
    if (tag) return command("tag_current", heard, { tag });
  }

  if (has(tokens, ["create", "make", "banao", "banado", "बनाओ"]) && has(tokens, ["playlist", "प्लेलिस्ट"])) {
    const match = text.match(/\b(?:naam\s+rakho|called|named|name\s+it)\s+(.+)$/)
      || text.match(/नाम\s+रखो\s+(.+)$/)
      || text.match(/\bplaylist\s+(?:banao|banado|create|बनाओ)\s+(.+)$/)
      || text.match(/प्लेलिस्ट\s+बनाओ\s+(.+)$/)
      || text.match(/\b(?:create|make)\s+(?:a\s+)?playlist\s+(.+)$/);
    const name = match ? cleanName(match[1]) : "";
    return name ? command("create_playlist", heard, { name }) : command("unknown", heard);
  }

  if (has(tokens, ["sort", "sorta", "क्रम", "सॉर्ट"]) && has(tokens, ["playlist", "playlists", "प्लेलिस्ट"])) {
    let sort = "manual";
    if (has(tokens, ["date", "recent", "recently", "new", "naya", "nayi", "recently", "तारीख", "नया", "नई"])) sort = "recent";
    else if (has(tokens, ["most", "count", "videos", "ज़्यादा", "ज्यादा"])) sort = "count";
    else if (has(tokens, ["name", "naam", "title", "alphabet", "अल्फाबेट", "नाम"])) sort = "title";
    else if (has(tokens, ["manual", "default", "क्रम", "मैनुअल"])) sort = "manual";
    return command("sort_playlist", heard, { sort });
  }

  if (has(tokens, ["open", "kholo", "khul", "खोलो", "खोल"]) && has(tokens, ["playlist", "प्लेलिस्ट"])) {
    const match = text.match(/\bplaylist\s+(.+?)\s+(?:kholo|khul|open|खोलो|खोल)\b/)
      || text.match(/प्लेलिस्ट\s+(.+?)\s+खोलो/)
      || text.match(/\b(?:open|kholo|खोलो)\s+playlist\s+(.+)$/)
      || text.match(/खोलो\s+प्लेलिस्ट\s+(.+)$/)
      || text.match(/^(.+?)\s+playlist\s+(?:kholo|khul|खोलो|खोल)$/)
      || text.match(/^(.+?)\s+प्लेलिस्ट\s+(?:खोलो|खोल)$/);
    const playlistName = match ? cleanName(match[1]) : "";
    return playlistName ? command("open_playlist", heard, { playlistName }) : command("unknown", heard);
  }

  if (has(tokens, ["favourite", "favorite", "fav", "pasand", "पसंद", "फेवरेट", "फेवरिट"])) return command("favorite_current", heard);
  if (has(tokens, ["home", "ghar", "होम"]) && has(tokens, ["go", "open", "chalo", "जाओ", "खोलो"])) return command("go_home", heard);
  if (has(tokens, ["playlists", "playlist", "प्लेलिस्ट"]) && has(tokens, ["open", "show", "kholo", "खोलो"]) && !has(tokens, ["sort"])) return command("go_playlists", heard);
  if (has(tokens, ["play", "chalao", "chala", "shuru", "resume", "start", "चलाओ", "चला", "शुरू", "बजाओ"])) return command("play", heard);

  return command("unknown", heard, { routeName: context.routeName || "" });
}
