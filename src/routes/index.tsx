import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getSportsDay } from "@/lib/sports.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sport on TV — SA & UK Fixtures, Results and Channels" },
      {
        name: "description",
        content:
          "Every fixture and past result with the exact DStv or UK channel showing it. Football, rugby, cricket, tennis, golf and more, day by day.",
      },
      { property: "og:title", content: "Sport on TV — SA & UK Fixtures and Channels" },
      {
        property: "og:description",
        content:
          "Fixtures, past results and the channel each match is on, across South African and UK sports channels.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const SPORT_TABS = [
  "All",
  "Soccer",
  "Rugby",
  "Cricket",
  "Basketball",
  "Motorsport",
  "Tennis",
  "Golf",
  "Fighting",
  "American Football",
];

function isoDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function dayLabel(offset: number): { top: string; bottom: string } {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  if (offset === 0) return { top: "Today", bottom: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
  if (offset === -1) return { top: "Yest.", bottom: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
  if (offset === 1) return { top: "Tomo.", bottom: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) };
  return {
    top: d.toLocaleDateString(undefined, { weekday: "short" }),
    bottom: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }),
  };
}

function time(iso: string | null): string {
  if (!iso) return "TBC";
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function Index() {
  const [offset, setOffset] = useState(0);
  const [sport, setSport] = useState("All");
  const [onlyTv, setOnlyTv] = useState(false);
  const date = isoDay(offset);
  const fetchDay = useServerFn(getSportsDay);

  const { data, isPending, isError } = useQuery({
    queryKey: ["sports-day", date],
    queryFn: () => fetchDay({ data: { date } }),
    staleTime: 1000 * 60 * 5,
  });

  const matches = useMemo(() => {
    let list = data?.matches ?? [];
    if (sport !== "All") list = list.filter((m) => m.sport === sport);
    if (onlyTv) list = list.filter((m) => m.channels.length > 0);
    return list;
  }, [data, sport, onlyTv]);

  const onTv = useMemo(() => {
    const list = data?.onTv ?? [];
    if (sport === "All") return list;
    return list.filter((l) =>
      l.categories.some((c) => c.toLowerCase().includes(sport.toLowerCase().split(" ")[0]!)),
    );
  }, [data, sport]);

  const isPast = offset < 0;

  return (
    <div className="min-h-screen pb-24">
      <header className="border-b border-border/70 bg-card/40 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-7">
          <p className="font-display text-sm tracking-[0.35em] text-primary">SPORT ON TV</p>
          <h1 className="mt-1 text-4xl leading-none sm:text-6xl">
            Fixtures, results &amp; the channel it&apos;s on
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Live from the DStv South Africa guide and the UK listings, matched against fixtures and
            past results across football, rugby, cricket, tennis, golf, motorsport and more.
          </p>
        </div>
      </header>

      <div className="sticky top-0 z-10 border-b border-border/70 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4">
          <div className="flex gap-2 overflow-x-auto py-3">
            {Array.from({ length: 15 }, (_, i) => i - 7).map((o) => {
              const l = dayLabel(o);
              const active = o === offset;
              return (
                <button
                  key={o}
                  onClick={() => setOffset(o)}
                  className={cn(
                    "flex min-w-16 shrink-0 flex-col items-center rounded-lg border px-3 py-2 text-xs transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <span className="font-display text-sm tracking-wide">{l.top}</span>
                  <span>{l.bottom}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2 pb-3">
            {SPORT_TABS.map((s) => (
              <button
                key={s}
                onClick={() => setSport(s)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  sport === s
                    ? "border-gold bg-gold text-gold-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {s}
              </button>
            ))}
            <button
              onClick={() => setOnlyTv((v) => !v)}
              className={cn(
                "ml-auto rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                onlyTv
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              On TV only
            </button>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl px-4">
        <section className="pt-8">
          <h2 className="text-2xl">{isPast ? "Past matches" : "Fixtures"}</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {isPast ? "Final scores, with the channel that carried it." : "Kick-off times in your local time."}
          </p>

          {isPending && <SkeletonList />}
          {isError && (
            <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm">
              Couldn&apos;t load this day. Try another date.
            </p>
          )}

          {!isPending && !isError && matches.length === 0 && (
            <p className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
              Nothing listed for this day and filter.
            </p>
          )}

          <ul className="space-y-3">
            {matches.map((m) => (
              <li
                key={m.id}
                className="rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  {m.leagueBadge && (
                    <img src={m.leagueBadge} alt="" className="h-5 w-5 object-contain" loading="lazy" />
                  )}
                  <span className="font-medium text-foreground/80">{m.league}</span>
                  <span className="rounded bg-secondary px-2 py-0.5">{m.sport}</span>
                  <span className="ml-auto font-display text-base tracking-wide text-gold">
                    {time(m.kickoff)}
                  </span>
                </div>

                {m.home && m.away ? (
                  <div className="mt-3 flex items-center gap-3">
                    <span className="flex-1 text-right text-base font-semibold sm:text-lg">{m.home}</span>
                    <span className="min-w-20 rounded-md bg-pitch px-3 py-1 text-center font-display text-2xl tracking-wider">
                      {m.homeScore === null || m.awayScore === null ? "vs" : `${m.homeScore}–${m.awayScore}`}
                    </span>
                    <span className="flex-1 text-base font-semibold sm:text-lg">{m.away}</span>
                  </div>
                ) : (
                  <p className="mt-3 text-base font-semibold sm:text-lg">{m.event}</p>
                )}

                {m.channels.length > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/70 pt-3">
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      {isPast ? "Was on" : "Watch on"}
                    </span>
                    {m.channels.map((c) => (
                      <span
                        key={c.channel}
                        className="flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-medium"
                      >
                        {c.icon && <img src={c.icon} alt="" className="h-4 w-6 object-contain" loading="lazy" />}
                        {c.channel}
                        <span className="text-muted-foreground">
                          {c.region} · {time(c.start)}
                        </span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                    No matching channel found in the SA or UK guide.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>

        <section className="pt-12">
          <h2 className="text-2xl">Everything sporty on TV</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            The full sports schedule for this day across South African and UK channels.
          </p>
          {isPending && <SkeletonList rows={4} />}
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {onTv.map((l, i) => (
              <li key={`${l.channel}-${l.start}-${i}`} className="flex gap-3 p-3">
                <div className="w-14 shrink-0 text-center">
                  <span className="font-display text-lg tracking-wide text-gold">{time(l.start)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{l.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{l.desc}</p>
                </div>
                <div className="flex w-40 shrink-0 items-center justify-end gap-2 text-right">
                  {l.channelIcon && (
                    <img src={l.channelIcon} alt="" className="h-5 w-8 object-contain" loading="lazy" />
                  )}
                  <span className="truncate text-xs font-medium">{l.channel}</span>
                  <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">{l.region}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}

function SkeletonList({ rows = 6 }: { rows?: number }) {
  return (
    <ul className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="h-24 animate-pulse rounded-xl border border-border bg-card" />
      ))}
    </ul>
  );
}
