import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  competitiveDailies,
  competitiveRounds,
  competitiveSeasonFinalRanks,
  competitiveStandings,
  db,
  scrans,
  users,
} from "@/db/schema";
import { leaderboardLabel } from "@/lib/competitive/display-name";
import { getSeason } from "@/lib/competitive/seasons";

function parseSeasonId(id: number): number | null {
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function loadFinalRanks(seasonId: number) {
  return db
    .select({
      rank: competitiveSeasonFinalRanks.rank,
      userId: competitiveSeasonFinalRanks.userId,
      displayNameSnapshot: competitiveSeasonFinalRanks.displayNameSnapshot,
      points: competitiveSeasonFinalRanks.points,
      daysPlayed: competitiveSeasonFinalRanks.daysPlayed,
      hits: competitiveSeasonFinalRanks.hits,
    })
    .from(competitiveSeasonFinalRanks)
    .where(eq(competitiveSeasonFinalRanks.seasonId, seasonId))
    .orderBy(asc(competitiveSeasonFinalRanks.rank));
}

async function loadLiveStandings(seasonId: number) {
  const rows = await db
    .select({
      userId: competitiveStandings.userId,
      points: competitiveStandings.points,
      daysPlayed: competitiveStandings.daysPlayed,
      hits: competitiveStandings.hits,
      competitiveDisplayName: users.competitiveDisplayName,
      telegramUsername: users.telegramUsername,
    })
    .from(competitiveStandings)
    .innerJoin(users, eq(competitiveStandings.userId, users.id))
    .where(eq(competitiveStandings.seasonId, seasonId))
    .orderBy(
      desc(competitiveStandings.points),
      desc(competitiveStandings.daysPlayed),
      desc(competitiveStandings.hits),
      asc(competitiveStandings.userId),
    );
  return rows.map((row, index) => ({
    rank: index + 1,
    userId: row.userId,
    displayNameSnapshot: leaderboardLabel({
      id: row.userId,
      competitiveDisplayName: row.competitiveDisplayName,
      telegramUsername: row.telegramUsername,
    }),
    points: row.points,
    daysPlayed: row.daysPlayed,
    hits: row.hits,
  }));
}

async function loadDailies(seasonId: number) {
  const dailies = await db
    .select({ id: competitiveDailies.id, date: competitiveDailies.date })
    .from(competitiveDailies)
    .where(eq(competitiveDailies.seasonId, seasonId))
    .orderBy(asc(competitiveDailies.date));
  if (dailies.length === 0) return [];

  const rounds = await db
    .select({
      dailyId: competitiveRounds.dailyId,
      roundNumber: competitiveRounds.roundNumber,
      scranAId: competitiveRounds.scranAId,
      scranBId: competitiveRounds.scranBId,
      likesA: competitiveRounds.likesA,
      dislikesA: competitiveRounds.dislikesA,
      likesB: competitiveRounds.likesB,
      dislikesB: competitiveRounds.dislikesB,
    })
    .from(competitiveRounds)
    .where(inArray(competitiveRounds.dailyId, dailies.map((daily) => daily.id)))
    .orderBy(asc(competitiveRounds.roundNumber));
  const scranIds = [...new Set(rounds.flatMap((round) => [round.scranAId, round.scranBId]))];
  const scranRows = scranIds.length
    ? await db
        .select({ id: scrans.id, name: scrans.name, imageUrl: scrans.imageUrl })
        .from(scrans)
        .where(inArray(scrans.id, scranIds))
    : [];
  const scranById = new Map(scranRows.map((scran) => [scran.id, scran]));
  const roundsByDaily = new Map<number, Array<Record<string, unknown>>>();

  for (const round of rounds) {
    const scranA = scranById.get(round.scranAId);
    const scranB = scranById.get(round.scranBId);
    if (!scranA || !scranB) continue;
    const dailyRounds = roundsByDaily.get(round.dailyId) ?? [];
    dailyRounds.push({
      roundNumber: round.roundNumber,
      scranA,
      scranB,
      likesA: round.likesA,
      dislikesA: round.dislikesA,
      likesB: round.likesB,
      dislikesB: round.dislikesB,
    });
    roundsByDaily.set(round.dailyId, dailyRounds);
  }

  return dailies.map((daily) => ({
    date: daily.date,
    rounds: roundsByDaily.get(daily.id) ?? [],
  }));
}

export async function getCompetitiveSeasonDetail(seasonId: number) {
  const id = parseSeasonId(seasonId);
  if (id === null) throw new Error("Invalid id");
  const season = await getSeason(id);
  if (!season) return null;

  let finalRanks = season.status === "ended"
    ? await loadFinalRanks(id)
    : await loadLiveStandings(id);
  if (finalRanks.length === 0) finalRanks = await loadFinalRanks(id);
  return {
    season: {
      id: season.id,
      name: season.name,
      status: season.status,
      startsAt: season.startsAt.toISOString(),
      endsAt: season.endsAt.toISOString(),
      themeKey: season.themeKey,
    },
    finalRanks,
    dailies: await loadDailies(id),
  };
}
