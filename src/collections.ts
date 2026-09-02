import type {
  AppState,
  BetaTrade,
  CombinedCard,
  PlayerCollection,
  PlayerProfileExport,
  SourceSnapshot,
  VariantCounts,
} from './types';

export function emptyState(): AppState {
  return { schemaVersion: 2, players: {}, trades: [] };
}

export function normaliseCardName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().replace(/\s+/g, ' ');
  return name || undefined;
}

export function parseAlbumSlug(value: string): string {
  const input = value.trim();
  if (!input) throw new Error('Enter an album URL or player name.');

  let slug = input;
  if (/^https?:\/\//i.test(input)) {
    const url = new URL(input);
    if (!/(^|\.)osrs-tcg\.net$/i.test(url.hostname)) throw new Error('That is not an OSRS TCG album URL.');
    const match = url.pathname.match(/^\/album\/([^/]+)\/?$/i);
    if (!match) throw new Error('Use a public album URL such as osrs-tcg.net/album/playername.');
    slug = decodeURIComponent(match[1]!);
  }

  slug = slug.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(slug)) {
    throw new Error('The album name may only contain letters, numbers, hyphens, and underscores.');
  }
  return slug;
}

export function incrementCard(
  cards: Record<string, VariantCounts>,
  cardName: string,
  foil: boolean,
): void {
  const counts = cards[cardName] ?? { normal: 0, foil: 0 };
  if (foil) counts.foil += 1;
  else counts.normal += 1;
  cards[cardName] = counts;
}

export function createSourceSnapshot(
  cards: Record<string, VariantCounts>,
  capturedAt = new Date().toISOString(),
): SourceSnapshot {
  const entries = Object.entries(cards).filter(([, counts]) => counts.normal + counts.foil > 0);
  entries.sort(([a], [b]) => a.localeCompare(b));
  return {
    capturedAt,
    cards: Object.fromEntries(entries),
    totalCopies: entries.reduce((sum, [, counts]) => sum + counts.normal + counts.foil, 0),
    uniqueCards: entries.length,
    foilCopies: entries.reduce((sum, [, counts]) => sum + counts.foil, 0),
  };
}

export function combinePlayerCollection(player: PlayerCollection, trades: BetaTrade[] = []): CombinedCard[] {
  // The public album already contains the migrated beta collection, so prefer
  // it whenever a website snapshot exists. An imported save is only a fallback
  // for players whose public beta collection is unavailable.
  const sourceBetaCards = player.website?.beta.cards ?? player.legacy?.cards ?? {};
  const betaCards: Record<string, VariantCounts> = Object.fromEntries(
    Object.entries(sourceBetaCards).map(([name, counts]) => [name, { ...counts }]),
  );

  for (const trade of trades) {
    if (trade.reversedAt || (trade.fromSlug !== player.slug && trade.toSlug !== player.slug)) continue;
    const counts = betaCards[trade.cardName] ?? { normal: 0, foil: 0 };
    const direction = trade.toSlug === player.slug ? 1 : -1;
    counts[trade.variant] = Math.max(0, counts[trade.variant] + direction * trade.quantity);
    betaCards[trade.cardName] = counts;
  }
  const currentCards = player.website?.current.cards ?? {};
  const names = new Set([...Object.keys(betaCards), ...Object.keys(currentCards)]);

  return [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => {
      const beta = betaCards[name] ?? { normal: 0, foil: 0 };
      const current = currentCards[name] ?? { normal: 0, foil: 0 };
      return {
        name,
        beta: { ...beta },
        current: { ...current },
        total: {
          normal: beta.normal + current.normal,
          foil: beta.foil + current.foil,
        },
      };
    });
}

export function getGroupFoilNames(state: AppState): string[] {
  const names = new Set<string>();
  for (const player of Object.values(state.players)) {
    for (const card of combinePlayerCollection(player, state.trades)) {
      if (card.total.foil > 0) names.add(card.name);
    }
  }
  return [...names].sort((a, b) => a.localeCompare(b));
}

export type NewBetaTrade = {
  cardName: string;
  fromSlug: string;
  toSlug: string;
  variant: 'normal' | 'foil';
  quantity: number;
};

export function addBetaTrade(
  state: AppState,
  input: NewBetaTrade,
  id: string = crypto.randomUUID(),
  createdAt = new Date().toISOString(),
): AppState {
  const from = state.players[input.fromSlug];
  const to = state.players[input.toSlug];
  if (!from || !to) throw new Error('Choose two players already in the group.');
  if (from.slug === to.slug) throw new Error('The receiving player must be different.');
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Trade quantity must be a whole number greater than zero.');

  const requestedName = normaliseCardName(input.cardName);
  if (!requestedName) throw new Error('Choose a beta card to trade.');
  const ownedCard = combinePlayerCollection(from, state.trades).find(
    (card) => card.name.toLocaleLowerCase() === requestedName.toLocaleLowerCase(),
  );
  const available = ownedCard?.beta[input.variant] ?? 0;
  if (!ownedCard || available < quantity) {
    throw new Error(`${from.displayName} only has ${available} beta ${input.variant} ${requestedName} card${available === 1 ? '' : 's'} available.`);
  }

  const trade: BetaTrade = {
    id,
    cardName: ownedCard.name,
    fromSlug: from.slug,
    toSlug: to.slug,
    variant: input.variant,
    quantity,
    createdAt,
  };
  return { ...state, trades: [...state.trades, trade] };
}

export function reverseBetaTrade(state: AppState, tradeId: string, reversedAt = new Date().toISOString()): AppState {
  const trade = state.trades.find((candidate) => candidate.id === tradeId);
  if (!trade) throw new Error('That trade could not be found.');
  if (trade.reversedAt) throw new Error('That trade has already been reversed.');
  const recipient = state.players[trade.toSlug];
  if (!recipient) throw new Error('The receiving player is no longer in the group.');
  const recipientCard = combinePlayerCollection(recipient, state.trades).find((card) => card.name === trade.cardName);
  const available = recipientCard?.beta[trade.variant] ?? 0;
  if (available < trade.quantity) {
    throw new Error(
      `${recipient.displayName} no longer holds enough ${trade.variant} beta copies to reverse this trade. Reverse later movements first.`,
    );
  }
  return {
    ...state,
    trades: state.trades.map((candidate) => candidate.id === tradeId ? { ...candidate, reversedAt } : candidate),
  };
}

export function createProfileExport(player: PlayerCollection): PlayerProfileExport {
  return {
    kind: 'osrs-tcg-group-profile',
    schemaVersion: 1,
    slug: player.slug,
    displayName: player.displayName,
    exportedAt: new Date().toISOString(),
    legacy: player.legacy,
  };
}

export function parseProfileExport(value: unknown): PlayerProfileExport {
  if (!value || typeof value !== 'object') throw new Error('This is not a player profile export.');
  const candidate = value as Partial<PlayerProfileExport>;
  if (
    candidate.kind !== 'osrs-tcg-group-profile' ||
    candidate.schemaVersion !== 1 ||
    typeof candidate.slug !== 'string' ||
    typeof candidate.displayName !== 'string'
  ) {
    throw new Error('Unsupported player profile export.');
  }
  const slug = parseAlbumSlug(candidate.slug);
  return {
    kind: 'osrs-tcg-group-profile',
    schemaVersion: 1,
    slug,
    displayName: candidate.displayName.trim() || slug,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : new Date().toISOString(),
    legacy: candidate.legacy,
  };
}
