import { createServerFn } from "@tanstack/react-start";

export const getSportsDay = createServerFn({ method: "GET" })
  .inputValidator((input: { date: string }) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Invalid date");
    return input;
  })
  .handler(async ({ data }) => {
    const { getSportListings } = await import("./epg.server");
    const { getMatchesForDay } = await import("./apisports.server");

    const listings = await getSportListings();
    const dayStart = Date.parse(`${data.date}T00:00:00Z`) - 1000 * 60 * 60 * 3;
    const dayEnd = dayStart + 1000 * 60 * 60 * 30;

    const onTv = listings
      .filter((l) => {
        const ms = Date.parse(l.start);
        return ms >= dayStart && ms <= dayEnd;
      })
      .map((l) => ({
        title: l.title,
        desc: l.desc.slice(0, 220),
        start: l.start,
        stop: l.stop,
        channel: l.channel,
        channelIcon: l.channelIcon,
        region: l.region,
        categories: l.categories.slice(0, 3),
      }));

    const allMatches = await getMatchesForDay(data.date, listings);
    // Only keep matches we could verify against the SA/UK EPG feeds.
    const matches = allMatches.filter((m) => m.channels.length > 0);

    return { date: data.date, matches, onTv };
  });
