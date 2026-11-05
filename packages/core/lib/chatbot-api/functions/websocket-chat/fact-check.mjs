/**
 * Code-only check that every date, dollar amount, percentage, time and number in a model's text
 * appears in its sources (the grant, the user's documents, the user's own words). Formats are
 * normalized both ways: "$1.5 million" matches "$1,500,000", "20%" matches "20 percent", "March 14"
 * matches "March 14, 2026", "12" matches "twelve". Byte-identical copy in websocket-chat/ (which has no layer); test/lambda/fact-check.test.ts keeps them equal.
 */

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6,
  jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11,
  november: 11, dec: 12, december: 12,
};
const MONTH = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?";
const NUM = "\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?";
const SCALE = { thousand: 1e3, k: 1e3, million: 1e6, m: 1e6, mm: 1e6, billion: 1e9, b: 1e9, bn: 1e9 };
const WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, hundred: 100,
};

const pad = (n) => String(n).padStart(2, "0");
const num = (s) => Number(String(s).replace(/,/g, ""));
const year = (y) => (y.length === 2 ? 2000 + Number(y) : Number(y));

/** Ordered patterns; each match is consumed so a date's day is not also counted as a number. */
const PATTERNS = [
  // March 14, 2026 · Mar. 14 2026 · March 14th, 2026
  [new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, "gi"), (m) => [`date:${m[3]}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}`]],
  // 14 March 2026
  [new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+${MONTH},?\\s+(\\d{4})\\b`, "gi"), (m) => [`date:${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}`]],
  // 2026-03-14
  [/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => [`date:${m[1]}-${m[2]}-${m[3]}`]],
  // 3/14/2026 · 3/14/26
  [/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/g, (m) => [`date:${year(m[3])}-${pad(m[1])}-${pad(m[2])}`]],
  // March 2026
  [new RegExp(`\\b${MONTH}\\s+(\\d{4})\\b`, "gi"), (m) => [`month:${m[2]}-${pad(MONTHS[m[1].toLowerCase()])}`]],
  // March 14 (no year)
  [new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "gi"), (m) => [`md:${pad(MONTHS[m[1].toLowerCase()])}-${pad(m[2])}`]],
  // $1.5 million · $415,000 · $2M · 1.5 million dollars
  [new RegExp(`\\$\\s?(${NUM})(?:\\s*(thousand|million|billion|mm|bn|[kmb])\\b)?`, "gi"), (m) => [`money:${num(m[1]) * (SCALE[m[2]?.toLowerCase()] ?? 1)}`]],
  [new RegExp(`\\b(${NUM})\\s*(thousand|million|billion)?\\s+(?:dollars|usd)\\b`, "gi"), (m) => [`money:${num(m[1]) * (SCALE[m[2]?.toLowerCase()] ?? 1)}`]],
  // 20% · 20 percent
  [new RegExp(`\\b(${NUM})\\s?(?:%|percent\\b|per cent\\b)`, "gi"), (m) => [`pct:${num(m[1])}`]],
  // 5:00 p.m. · 11:59 PM · 5 pm
  [/\b(\d{1,2})(?::(\d{2}))?\s?([ap])\.?\s?m\b\.?/gi, (m) => [`time:${pad((Number(m[1]) % 12) + (m[3].toLowerCase() === "p" ? 12 : 0))}:${m[2] ?? "00"}`]],
  // 17:00
  [/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, (m) => [`time:${pad(m[1])}:${m[2]}`]],
  // any other number, with an optional scale word: 2 million, 12, 3.5, 1st
  [new RegExp(`\\b(${NUM})(?:st|nd|rd|th)?(?:\\s+(thousand|million|billion)\\b)?`, "gi"), (m) => [`num:${num(m[1]) * (SCALE[m[2]?.toLowerCase()] ?? 1)}`]],
];

function clean(text) {
  return String(text ?? "")
    .replace(/https?:\/\/\S+|\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, " ")
    .replace(/^\s{0,3}(?:\d+[.)]|[-*+])\s+/gm, " ")
    .replace(/[*_`#>|]/g, " ")
    .replace(/[‒-―−]/g, "-")
    .replace(/ /g, " ");
}

/** The facts in `text`: `{ key, raw }`, where key is the normalized value ("money:1500000"). */
export function extractFacts(text) {
  let rest = clean(text);
  const facts = [];
  for (const [re, keys] of PATTERNS) {
    rest = rest.replace(re, (...args) => {
      const m = args.slice(0, -2);
      for (const key of keys(m)) if (!/NaN|undefined/.test(key)) facts.push({ key, raw: m[0].trim() });
      return " ".repeat(m[0].length);
    });
  }
  return facts;
}

/** Every key a source supports, including the looser forms its facts imply (a date's year and day). */
export function sourceKeys(sources) {
  const keys = new Set();
  for (const source of sources) {
    const text = String(source ?? "");
    for (const { key } of extractFacts(text)) {
      keys.add(key);
      const [kind, value] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
      if (kind === "date") {
        const [y, mo, d] = value.split("-");
        keys.add(`md:${mo}-${d}`).add(`month:${y}-${mo}`).add(`num:${Number(y)}`);
      }
      if (kind === "month") keys.add(`num:${Number(value.slice(0, 4))}`);
      if (kind === "money" || kind === "pct") keys.add(`num:${value}`);
      if (kind === "num") keys.add(`money:${value}`);
    }
    for (const [word, n] of Object.entries(WORDS)) {
      if (new RegExp(`\\b${word}\\b`, "i").test(text)) keys.add(`num:${n}`);
    }
  }
  return keys;
}

/**
 * Facts in `text` that no source supports. `sources` are strings: the grant text, the user's
 * documents, quoted passages, and the user's own messages (facts they gave are theirs to repeat).
 */
export function unsupportedFacts(text, sources, keys = sourceKeys(sources)) {
  const seen = new Set();
  return extractFacts(text).filter((f) => {
    if (keys.has(f.key) || seen.has(f.key)) return false;
    seen.add(f.key);
    return true;
  });
}
