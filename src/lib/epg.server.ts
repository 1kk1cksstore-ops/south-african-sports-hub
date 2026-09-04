// Server-only XMLTV parsing for the DStv (South Africa) and UK EPG feeds.

export type Listing = {
  title: string;
  desc: string;
  start: string; // ISO
  stop: string; // ISO
  channel: string;
  channelIcon: string | null;
  region: "ZA" | "UK";
  categories: string[];
};

const FEEDS: { region: "ZA" | "UK"; url: string }[] = [
  {
    region: "ZA",
    url: "https://raw.githubusercontent.com/matthuisman/i.mjh.nz/refs/heads/master/DStv/za.xml",
  },
  {
    region: "UK",
    url: "https://raw.githubusercontent.com/apprealtv/UK-EPG/refs/heads/main/epg_ripper_UK1.xml",
  },
];

const SPORT_CATEGORIES = new Set([
  "all sport",
  "sport",
  "sports",
  "football",
  "soccer",
  "rugby",
  "cricket",
  "tennis",
  "golf",
  "motorsport",
  "motor sport",
  "basketball",
  "boxing",
  "wwe",
  "wrestling",
  "athletics",
  "cycling",
  "netball",
  "hockey",
  "swimming",
  "racing",
  "horse racing",
  "american football",
  "baseball",
  "mma",
  "darts",
  "snooker",
  "extreme sports",
  "water sports",
  "combat sports",
]);

function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

// "20260905170000 +0200" -> ISO string
function xmltvToIso(v: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?/.exec(v);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, off] = m;
  const tz = off ? `${off.slice(0, 3)}:${off.slice(3)}` : "+00:00";
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${tz}`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function firstTag(block: string, tag: string): string {
  const i = block.indexOf(`<${tag}`);
  if (i === -1) return "";
  const open = block.indexOf(">", i);
  const close = block.indexOf(`</${tag}>`, open);
  if (open === -1 || close === -1) return "";
  return decode(block.slice(open + 1, close));
}

function parseChannels(xml: string): Map<string, { name: string; icon: string | null }> {
  const map = new Map<string, { name: string; icon: string | null }>();
  const re = /<channel id="([^"]+)"[^>]*>([\s\S]*?)<\/channel>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[2]!;
    const icon = /<icon src="([^"]+)"/.exec(block);
    map.set(m[1]!, {
      name: firstTag(block, "display-name") || m[1]!,
      icon: icon ? icon[1]! : null,
    });
  }
  return map;
}

function parseSportProgrammes(
  xml: string,
  region: "ZA" | "UK",
  fromMs: number,
  toMs: number,
): Listing[] {
  const channels = parseChannels(xml);
  const out: Listing[] = [];
  let cursor = xml.indexOf("<programme");
  while (cursor !== -1) {
    const end = xml.indexOf("</programme>", cursor);
    if (end === -1) break;
    const block = xml.slice(cursor, end);
    cursor = xml.indexOf("<programme", end);

    const lower = block.toLowerCase();
    if (lower.includes("<category")) {
      const cats: string[] = [];
      const catRe = /<category[^>]*>([^<]*)<\/category>/g;
      let c: RegExpExecArray | null;
      while ((c = catRe.exec(block))) cats.push(decode(c[1]!));
      const isSport = cats.some((x) => SPORT_CATEGORIES.has(x.toLowerCase()));
      if (isSport) {
        const attrEnd = block.indexOf(">");
        const attrs = block.slice(0, attrEnd);
        const start = xmltvToIso(/start="([^"]+)"/.exec(attrs)?.[1] ?? "");
        const stop = xmltvToIso(/stop="([^"]+)"/.exec(attrs)?.[1] ?? "");
        const chId = /channel="([^"]+)"/.exec(attrs)?.[1] ?? "";
        if (start) {
          const ms = Date.parse(start);
          if (ms >= fromMs && ms <= toMs) {
            const ch = channels.get(chId);
            const sub = firstTag(block, "sub-title");
            const title = firstTag(block, "title");
            out.push({
              title: sub && !title.toLowerCase().includes(sub.toLowerCase()) ? `${title}: ${sub}` : title,
              desc: firstTag(block, "desc"),
              start,
              stop: stop ?? start,
              channel: ch?.name ?? chId,
              channelIcon: ch?.icon ?? null,
              region,
              categories: cats.filter((x) => x.toLowerCase() !== "all sport"),
            });
          }
        }
      }
    }
  }
  return out;
}

let cache: { at: number; data: Listing[] } | null = null;
let inflight: Promise<Listing[]> | null = null;
const TTL = 1000 * 60 * 60 * 3;

async function load(): Promise<Listing[]> {
  const now = Date.now();
  const fromMs = now - 1000 * 60 * 60 * 24 * 9;
  const toMs = now + 1000 * 60 * 60 * 24 * 10;
  const all: Listing[] = [];
  for (const feed of FEEDS) {
    try {
      const res = await fetch(feed.url);
      if (!res.ok) continue;
      const xml = await res.text();
      all.push(...parseSportProgrammes(xml, feed.region, fromMs, toMs));
    } catch {
      // A single failing feed should not break the guide.
    }
  }
  all.sort((a, b) => a.start.localeCompare(b.start));
  return all;
}

export async function getSportListings(): Promise<Listing[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  if (!inflight) {
    inflight = load()
      .then((data) => {
        cache = { at: Date.now(), data };
        return data;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}
