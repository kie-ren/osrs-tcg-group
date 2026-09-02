export type VariantCounts = {
  normal: number;
  foil: number;
};

export type SourceSnapshot = {
  capturedAt: string;
  cards: Record<string, VariantCounts>;
  totalCopies: number;
  uniqueCards: number;
  foilCopies: number;
};

export type WebsiteSnapshot = {
  capturedAt: string;
  current: SourceSnapshot;
  beta: SourceSnapshot;
};

export type CombinedCard = {
  name: string;
  beta: VariantCounts;
  current: VariantCounts;
  total: VariantCounts;
};

export type PlayerCollection = {
  slug: string;
  displayName: string;
  albumUrl: string;
  legacy?: SourceSnapshot;
  website?: WebsiteSnapshot;
  lastError?: string;
};

export type PlayerProfileExport = {
  kind: 'osrs-tcg-group-profile';
  schemaVersion: 1;
  slug: string;
  displayName: string;
  exportedAt: string;
  legacy?: SourceSnapshot;
};

export type TradeVariant = 'normal' | 'foil';

export type BetaTrade = {
  id: string;
  cardName: string;
  fromSlug: string;
  toSlug: string;
  variant: TradeVariant;
  quantity: number;
  createdAt: string;
  reversedAt?: string;
};

export type AppState = {
  schemaVersion: 2;
  players: Record<string, PlayerCollection>;
  trades: BetaTrade[];
};

export type PublicPlayerPage = {
  displayName?: unknown;
  revision?: unknown;
  cardEntries?: unknown;
  hasMore?: unknown;
  nextCursor?: unknown;
};
