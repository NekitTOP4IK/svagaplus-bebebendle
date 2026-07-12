/**
 * Scran type for client-side use (without database imports)
 */

export interface Scran {
  id: number;
  imageUrl: string;
  name: string;
  description: string | null;
  price: number;
  numberOfLikes: number;
  numberOfDislikes: number;
  approved?: boolean;
  // Queue / moderation enrichment (populated in ?view=queue)
  telegramId?: string | null;
  submittedByUserId?: number | null;
  isSubscriberAtSubmit?: boolean | null;
  authorUsername?: string | null;
  authorDisplayName?: string | null;
  pendingCount?: number;
}
