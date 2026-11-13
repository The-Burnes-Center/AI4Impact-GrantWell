const ZONES: Record<string, string> = {
  pacific: "America/Los_Angeles",
  pt: "America/Los_Angeles",
  pst: "America/Los_Angeles",
  pdt: "America/Los_Angeles",
  mountain: "America/Denver",
  mt: "America/Denver",
  mst: "America/Denver",
  mdt: "America/Denver",
  central: "America/Chicago",
  ct: "America/Chicago",
  cst: "America/Chicago",
  cdt: "America/Chicago",
  alaska: "America/Anchorage",
  akt: "America/Anchorage",
  akst: "America/Anchorage",
  akdt: "America/Anchorage",
  hawaii: "Pacific/Honolulu",
  "hawaii-aleutian": "Pacific/Honolulu",
  hst: "Pacific/Honolulu",
};

const TIME =
  /\b(1[0-2]|0?[1-9])(?::([0-5]\d))?\s*([ap])\.?\s?m\.?(?:\s+|\s*\(\s*)(?:(pacific|mountain|central|alaska|hawai['ʻ]?i(?:-aleutian)?)(?:\s+(?:standard|daylight|prevailing))?\s+time|(pst|pdt|pt|mst|mdt|mt|cst|cdt|ct|akst|akdt|akt|hst))\b\)?/gi;
const MONTHS = "january february march april may june july august september october november december".split(" ");
const DATE = /\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i;

function offsetMinutes(zone: string, utc: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(utc);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"));
  return Math.round((local - utc.getTime()) / 60000);
}

function dateIn(text: string): Date | null {
  const m = text.match(DATE);
  if (!m) return null;
  if (m[4]) return new Date(Date.UTC(Number(m[6]), Number(m[4]) - 1, Number(m[5]), 12));
  const month = MONTHS.findIndex((name) => name.startsWith(m[1].toLowerCase().slice(0, 3)));
  return new Date(Date.UTC(Number(m[3]), month, Number(m[2]), 12));
}

function clock(minutes: number): string {
  const h24 = Math.floor(minutes / 60);
  const h = h24 % 12 || 12;
  return `${h}:${String(minutes % 60).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;
}

/**
 * Adds the Eastern Time in brackets after a time the grant gives in another US zone, e.g.
 * "5:00 PM MT" → "5:00 PM MT (7:00 PM ET)". Worked out here, not by the model, so the stored text
 * stays exactly as the grant states it.
 */
export function withEasternTime(text: string): string {
  const day = dateIn(text) ?? new Date();
  return text.replace(TIME, (match, hour, minute, ampm, name, abbr, at: number, whole: string) => {
    if (/^\s*\(?\s*\d{1,2}(?::\d{2})?\s*[ap]\.?\s?m\.?\s+(?:ET|EST|EDT|Eastern)\b/i.test(whole.slice(at + match.length))) return match;
    const zone = ZONES[String(name ?? abbr).toLowerCase().replace(/['ʻ]/g, "")];
    if (!zone) return match;
    const local = ((Number(hour) % 12) + (ampm.toLowerCase() === "p" ? 12 : 0)) * 60 + Number(minute ?? 0);
    const shift = offsetMinutes("America/New_York", day) - offsetMinutes(zone, day);
    const eastern = local + shift;
    const note = eastern >= 24 * 60 ? " the next day" : "";
    return `${match} (${clock(eastern % (24 * 60))} ET${note})`;
  });
}
