// TheSportsDB fixtures/results + matching each match to the TV channel showing it.
import type { Listing } from "./epg.server";

const KEY = "123"; // TheSportsDB free public test key
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;

export const SPORTS = [
  "Soccer",
  "Rugby",
  "Cricket",
  "Basketball",
  "Motorsport",
  "Tennis",
  "Golf",
  "American Football",
  "Fighting",
] as const;

export type Match = {
  id: string;
  sport: string;
  league: string;
  leagueBadge: string | null;
  event: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  kickoff: string | null; // ISO
  status: string;
  thumb: string | null;
  channels: { channel: string; region: "ZA" | "UK"; start: string; title: string; icon: string | null }[];
};

type RawEvent = Record<string, string | null>;

const PRIORITY_LEAGUES = [
  "english premier league",
  "spanish la liga",
  "italian serie a",
  "german bundesliga",
  "french ligue 1",
  "uefa champions league",
  "uefa europa league",
  "south african premier division",
  "south african premiership",
  "betway premiership",
  "english league championship",
  "scottish premiership",
  "portuguese primeira liga",
  "dutch eredivisie",
  "rugby",
  "united rugby championship",
  "currie cup",
  "the rugby championship",
  "test match",
  "nba",
  "nfl",
  "formula 1",
  "atp",
  "wta",
  "pga",
  "ufc",
  "t20",
  "one day",
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "fc","afc","cf","sc","ac","the","and","utd","club","team","women","womens","mens","men","live",
  "hls","hll","vs","and","national","under","basketball","football","soccer","rugby","cricket",
  "tennis","golf","hockey","league","cup","world","international","match","test","round","day",
  "highlights","final","semi","group","series","open","tour","championship","championships",
]);

function tokens(s: string): string[] {
  return norm(s)
    .split(" ")
    .filter((t) => t.length >= 4 && !STOP.has(t));
}

function isSubsequence(a: string, b: string): boolean {
  let i = 0;
  for (let j = 0; j < b.length && i < a.length; j++) if (a[i] === b[j]) i++;
  return i === a.length;
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length < 5 || b.length < 5) return false;
  if (a.slice(0, 2) !== b.slice(0, 2)) return false;
  // Guide titles abbreviate ("Sund'land" for Sunderland, "N Forest" for Nottingham Forest).
  return isSubsequence(a, b) || isSubsequence(b, a);
}

function teamInTitle(teamTokens: string[], titleTokens: string[]): boolean {
  return teamTokens.some((t) => titleTokens.some((l) => tokenMatches(t, l)));
}

// A cricket channel never carries a basketball game: keep the sport consistent.
const SPORT_KEYWORDS: Record<string, string[]> = {
  soccer: ["football", "soccer", "premier", "liga", "psl", "kickoff", "uefa", "laliga", "serie", "bundesliga", "mtn8", "blitz", "maximo", "variety", "grandstand", "events", "select"],
  rugby: ["rugby", "urc", "currie", "grandstand", "events", "variety", "select", "action", "blitz"],
  cricket: ["cricket", "t20", "odi", "proteas", "grandstand", "events", "variety", "select"],
  basketball: ["basketball", "nba", "espn", "fiba", "events", "variety", "select"],
  motorsport: ["motorsport", "racing", "formula", "moto", "nascar", "rally", "speed", "espn", "variety", "select"],
  tennis: ["tennis", "wimbledon", "atp", "wta", "espn", "variety", "select"],
  golf: ["golf", "pga", "dp world", "espn", "variety", "select"],
  fighting: ["wwe", "boxing", "ufc", "mma", "fight", "wrestling", "espn", "variety", "select"],
  "american football": ["nfl", "american football", "espn", "variety", "select"],
};

function sportCompatible(sport: string, listing: Listing): boolean {
  const keys = SPORT_KEYWORDS[sport.toLowerCase()];
  if (!keys) return true;
  const hay = `${listing.categories.join(" ")} ${listing.channel} ${listing.title}`.toLowerCase();
  return keys.some((k) => hay.includes(k));
}

function findChannels(ev: Match, listings: Listing[]): Match["channels"] {
  if (!ev.kickoff) return [];
  const kick = Date.parse(ev.kickoff);
  const home = tokens(ev.home);
  const away = tokens(ev.away);
  const eventTokens = tokens(ev.event);
  const hits: Match["channels"] = [];

  for (const l of listings) {
    const diff = Date.parse(l.start) - kick;
    if (diff < -1000 * 60 * 60 * 2.5 || diff > 1000 * 60 * 60 * 3) continue;
    if (!sportCompatible(ev.sport, l)) continue;
    const t = tokens(l.title);
    if (!t.length) continue;

    let ok = false;
    if (home.length && away.length) {
      ok = teamInTitle(home, t) && teamInTitle(away, t);
    } else if (eventTokens.length >= 2) {
      // Single-competitor events (races, tournaments): need two distinctive words.
      const overlap = eventTokens.filter((x) => t.some((y) => tokenMatches(x, y))).length;
      ok = overlap >= 2;
    }
    if (ok) {
      hits.push({
        channel: l.channel,
        region: l.region,
        start: l.start,
        title: l.title,
        icon: l.channelIcon,
      });
    }
  }

  const seen = new Set<string>();
  return hits
    .filter((h) => (seen.has(h.channel) ? false : (seen.add(h.channel), true)))
    .sort((a, b) => a.start.localeCompare(b.start))
    .slice(0, 6);
}

function toMatch(e: RawEvent): Match {
  const ts = e["strTimestamp"];
  let kickoff: string | null = null;
  if (ts) {
    const d = new Date(ts.endsWith("Z") ? ts : `${ts}Z`);
    if (!Number.isNaN(d.getTime())) kickoff = d.toISOString();
  }
  const hs = e["intHomeScore"];
  const as = e["intAwayScore"];
  return {
    id: e["idEvent"] ?? crypto.randomUUID(),
    sport: e["strSport"] ?? "",
    league: e["strLeague"] ?? "",
    leagueBadge: e["strLeagueBadge"] ?? null,
    event: e["strEvent"] ?? "",
    home: e["strHomeTeam"] ?? "",
    away: e["strAwayTeam"] ?? "",
    homeScore: hs === null || hs === undefined || hs === "" ? null : Number(hs),
    awayScore: as === null || as === undefined || as === "" ? null : Number(as),
    kickoff,
    status: e["strStatus"] ?? "",
    thumb: e["strThumb"] || null,
    channels: [],
  };
}

const dayCache = new Map<string, { at: number; data: Match[] }>();
const DAY_TTL = 1000 * 60 * 10;

async function fetchSportDay(sport: string, date: string): Promise<Match[]> {
  try {
    const res = await fetch(
      `${BASE}/eventsday.php?d=${date}&s=${encodeURIComponent(sport)}`,
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { events: RawEvent[] | null };
    return (json.events ?? []).map(toMatch);
  } catch {
    return [];
  }
}

export async function getMatchesForDay(date: string, listings: Listing[]): Promise<Match[]> {
  const cached = dayCache.get(date);
  let raw: Match[];
  if (cached && Date.now() - cached.at < DAY_TTL) {
    raw = cached.data;
  } else {
    const results = await Promise.all(SPORTS.map((s) => fetchSportDay(s, date)));
    raw = results.flat();
    dayCache.set(date, { at: Date.now(), data: raw });
  }

  const withChannels = raw.map((m) => ({ ...m, channels: findChannels(m, listings) }));

  const rank = (m: Match) => {
    if (m.channels.length) return 0;
    const l = m.league.toLowerCase();
    return PRIORITY_LEAGUES.some((p) => l.includes(p)) ? 1 : 2;
  };

  return withChannels
    .sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      return (a.kickoff ?? "").localeCompare(b.kickoff ?? "");
    })
    .slice(0, 200);
}
