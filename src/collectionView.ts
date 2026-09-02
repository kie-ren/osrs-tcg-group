import { combinePlayerCollection } from './collections';
import type { BetaTrade, PlayerCollection, VariantCounts } from './types';

export type CollectionRowSource = 'combined' | 'current' | 'beta';

export type CollectionViewRow = {
  key: string;
  name: string;
  source: CollectionRowSource;
  cards: Array<VariantCounts | undefined>;
};

function nonEmpty(counts: VariantCounts): VariantCounts | undefined {
  return counts.normal + counts.foil > 0 ? counts : undefined;
}

export function createCollectionViewRows(
  players: PlayerCollection[],
  trades: BetaTrade[],
  combineSources: boolean,
): CollectionViewRow[] {
  const byPlayer = players.map(
    (player) => new Map(combinePlayerCollection(player, trades).map((card) => [card.name, card])),
  );
  const names = new Set<string>();
  byPlayer.forEach((cards) => cards.forEach((_, name) => names.add(name)));

  const rows: CollectionViewRow[] = [];
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    if (combineSources) {
      rows.push({
        key: name,
        name,
        source: 'combined',
        cards: byPlayer.map((collection) => {
          const card = collection.get(name);
          return card ? nonEmpty(card.total) : undefined;
        }),
      });
      continue;
    }

    for (const source of ['current', 'beta'] as const) {
      const cards = byPlayer.map((collection) => {
        const card = collection.get(name);
        return card ? nonEmpty(card[source]) : undefined;
      });
      if (cards.some(Boolean)) rows.push({ key: `${name}:${source}`, name, source, cards });
    }
  }
  return rows;
}
