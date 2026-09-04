// API-Sports (api-sports.io) fixtures/results + matching each match to the TV channel showing it.
import type { Listing } from "./epg.server";

export const SPORTS = [
  "Soccer",
  "Rugby",
  "Basketball",
  "American Football",
  "Hockey",
  "Baseball",
  "Volleyball",
  "Handball",
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

const PRIORITY_LEAGUES = [
  "premier league",
  "la liga",
  "serie a",
  "bundesliga",
  "ligue 1",
  "champions league",
  "europa league",
  "betway premiership",
  "championship",
  "premiership",
  "primeira liga",
  "eredivisie",
  "united rugby championship",
  "currie cup",
  "rugby championship",
  "nba",
  "nfl",
  "nhl",
  "mlb",
];

function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/&apos;/g, "")
    .replace(/[’'`]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "fc","afc","cf","sc","ac","the","and","utd","club","team","women","womens","mens","men","live",
  "hls","hll","vs","national","under","basketball","football","soccer","rugby","cricket",
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
  basketball: ["basketball", "nba", "espn", "fiba", "events", "variety", "select"],
  hockey: ["hockey", "nhl", "espn", "events", "variety", "select"],
  baseball: ["baseball", "mlb", "espn", "events", "variety", "select"],
  volleyball: ["volleyball", "espn", "events", "variety", "select"],
  handball: ["handball", "espn", "events", "variety", "select"],
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

function decode(s: string): string {
  return s
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

function iso(date: string | null | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

type Json = Record<string, unknown>;

function get(obj: unknown, ...path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Json)[k];
  }
  return cur;
}

function str(v: unknown): string {
  return typeof v === "string" ? decode(v) : "";
}

const HOSTS: Record<string, { host: string; path: string }> = {
  Soccer: { host: "v3.football.api-sports.io", path: "fixtures" },
  Rugby: { host: "v1.rugby.api-sports.io", path: "games" },
  Basketball: { host: "v1.basketball.api-sports.io", path: "games" },
  "American Football": { host: "v1.american-football.api-sports.io", path: "games" },
  Hockey: { host: "v1.hockey.api-sports.io", path: "games" },
  Baseball: { host: "v1.baseball.api-sports.io", path: "games" },
  Volleyball: { host: "v1.volleyball.api-sports.io", path: "games" },
  Handball: { host: "v1.handball.api-sports.io", path: "games" },
  Fighting: { host: "v1.mma.api-sports.io", path: "fights" },
};

function mapEntry(sport: string, e: unknown): Match {
  if (sport === "Soccer") {
    return {
      id: `soccer-${String(get(e, "fixture", "id"))}`,
      sport,
      league: str(get(e, "league", "name")),
      leagueBadge: (get(e, "league", "logo") as string) ?? null,
      event: `${str(get(e, "teams", "home", "name"))} vs ${str(get(e, "teams", "away", "name"))}`,
      home: str(get(e, "teams", "home", "name")),
      away: str(get(e, "teams", "away", "name")),
      homeScore: num(get(e, "goals", "home")),
      awayScore: num(get(e, "goals", "away")),
      kickoff: iso(get(e, "fixture", "date") as string),
      status: str(get(e, "fixture", "status", "long")),
      thumb: null,
      channels: [],
    };
  }

  if (sport === "American Football") {
    return {
      id: `af-${String(get(e, "game", "id"))}`,
      sport,
      league: str(get(e, "league", "name")),
      leagueBadge: (get(e, "league", "logo") as string) ?? null,
      event: `${str(get(e, "teams", "home", "name"))} vs ${str(get(e, "teams", "away", "name"))}`,
      home: str(get(e, "teams", "home", "name")),
      away: str(get(e, "teams", "away", "name")),
      homeScore: num(get(e, "scores", "home", "total")),
      awayScore: num(get(e, "scores", "away", "total")),
      kickoff: iso(
        `${String(get(e, "game", "date", "date"))}T${String(get(e, "game", "date", "time"))}:00Z`,
      ),
      status: str(get(e, "game", "status", "long")),
      thumb: null,
      channels: [],
    };
  }

  if (sport === "Fighting") {
    const a = str(get(e, "fighters", "first", "name"));
    const b = str(get(e, "fighters", "second", "name"));
    return {
      id: `mma-${String(get(e, "id"))}`,
      sport,
      league: str(get(e, "category")) || "MMA",
      leagueBadge: null,
      event: a && b ? `${a} vs ${b}` : str(get(e, "slug")),
      home: a,
      away: b,
      homeScore: null,
      awayScore: null,
      kickoff: iso(get(e, "date") as string),
      status: str(get(e, "status", "long")),
      thumb: null,
      channels: [],
    };
  }

  // Rugby / Basketball / Hockey / Baseball / Volleyball / Handball share one shape.
  const homeScore =
    num(get(e, "scores", "home")) ?? num(get(e, "scores", "home", "total"));
  const awayScore =
    num(get(e, "scores", "away")) ?? num(get(e, "scores", "away", "total"));
  return {
    id: `${sport.toLowerCase()}-${String(get(e, "id"))}`,
    sport,
    league: str(get(e, "league", "name")),
    leagueBadge: (get(e, "league", "logo") as string) ?? null,
    event: `${str(get(e, "teams", "home", "name"))} vs ${str(get(e, "teams", "away", "name"))}`,
    home: str(get(e, "teams", "home", "name")),
    away: str(get(e, "teams", "away", "name")),
    homeScore,
    awayScore,
    kickoff: iso(get(e, "date") as string),
    status: str(get(e, "status", "long")),
    thumb: null,
    channels: [],
  };
}

const dayCache = new Map<string, { at: number; data: Match[] }>();
const DAY_TTL = 1000 * 60 * 10;

async function fetchSportDay(sport: string, date: string, key: string): Promise<Match[]> {
  const cfg = HOSTS[sport];
  if (!cfg) return [];
  try {
    const res = await fetch(`https://${cfg.host}/${cfg.path}?date=${date}`, {
      headers: { "x-apisports-key": key },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { response?: unknown[] };
    return (json.response ?? []).map((e) => mapEntry(sport, e));
  } catch {
    return [];
  }
}

export async function getMatchesForDay(date: string, listings: Listing[]): Promise<Match[]> {
  const key = process.env["APISPORTS_KEY"] ?? "";
  const cached = dayCache.get(date);
  let raw: Match[];
  if (cached && Date.now() - cached.at < DAY_TTL) {
    raw = cached.data;
  } else {
    const results = await Promise.all(SPORTS.map((s) => fetchSportDay(s, date, key)));
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
