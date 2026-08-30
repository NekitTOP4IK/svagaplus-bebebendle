/**
 * Game-specific types for the daily scrandle game
 */

export interface Scran {
  id: number;
  imageUrl: string;
  name: string;
  description: string | null;
  price: number;
  /** Omitted on public daily payload (would spoil answers). */
  numberOfLikes?: number;
  numberOfDislikes?: number;
  approved?: boolean;
  icon: string;
  /** Snapshot at submit: true = paid SVAGA+ subscriber dish */
  isSubscriberAtSubmit?: boolean | null;
}

export interface Round {
  roundNumber: number;
  scrandleId: number;
  scranA: Scran;
  scranB: Scran;
}

export interface DailyData {
  date: string;
  totalRounds: number;
  rounds: Round[];
  /** Present only for a published themed Daily replacing the regular rotation. */
  eventId?: number;
  eventName?: string;
}

export interface UserAnswer {
  roundNumber: number;
  isCorrect: boolean;
  chosenScranId: number;
  correctScranId: number;
  percentageA: number;
  percentageB: number;
}

export interface DailyResult {
  date: string;
  score: number;
  totalRounds: number;
  userAnswers: UserAnswer[];
}

export interface ScoreDistributionItem {
  score: number;
  count: number;
}

export type GameState =
  | { type: "loading" }
  | { type: "already-played"; result: DailyResult }
  | { type: "error"; message: string }
  | { type: "playing"; data: DailyData }
  | {
      type: "complete";
      score: number;
      averageScore: number | null;
      scoreDistribution: ScoreDistributionItem[];
    };
