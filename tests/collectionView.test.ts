import { describe, expect, it } from 'vitest';
import { createCollectionViewRows } from '../src/collectionView';
import { createSourceSnapshot } from '../src/collections';
import type { PlayerCollection } from '../src/types';

const player: PlayerCollection = {
  slug: 'kie',
  displayName: 'Kie',
  albumUrl: 'https://osrs-tcg.net/album/kie',
  website: {
    capturedAt: '2026-09-02T12:00:00.000Z',
    beta: createSourceSnapshot({ Goblin: { normal: 1, foil: 0 } }),
    current: createSourceSnapshot({ Goblin: { normal: 1, foil: 1 }, Imp: { normal: 1, foil: 0 } }),
  },
};

describe('collection view rows', () => {
  it('combines beta and current counts by default view', () => {
    const rows = createCollectionViewRows([player], [], true);

    expect(rows).toEqual([
      { key: 'Goblin', name: 'Goblin', source: 'combined', cards: [{ normal: 2, foil: 1 }] },
      { key: 'Imp', name: 'Imp', source: 'combined', cards: [{ normal: 1, foil: 0 }] },
    ]);
  });

  it('creates a labelled beta row when sources are separated', () => {
    const rows = createCollectionViewRows([player], [], false);

    expect(rows).toEqual([
      { key: 'Goblin:current', name: 'Goblin', source: 'current', cards: [{ normal: 1, foil: 1 }] },
      { key: 'Goblin:beta', name: 'Goblin', source: 'beta', cards: [{ normal: 1, foil: 0 }] },
      { key: 'Imp:current', name: 'Imp', source: 'current', cards: [{ normal: 1, foil: 0 }] },
    ]);
  });
});
