import { describe, expect, it } from 'vitest';
import {
  addBetaTrade,
  combinePlayerCollection,
  createSourceSnapshot,
  getGroupFoilNames,
  parseAlbumSlug,
  reverseBetaTrade,
} from '../src/collections';
import type { AppState, PlayerCollection } from '../src/types';

describe('parseAlbumSlug', () => {
  it('accepts a public album URL', () => {
    expect(parseAlbumSlug('https://osrs-tcg.net/album/TCGoonBigboy')).toBe('tcgoonbigboy');
  });

  it('accepts a plain slug', () => {
    expect(parseAlbumSlug('tcgoonbigboy')).toBe('tcgoonbigboy');
  });

  it('rejects unrelated URLs', () => {
    expect(() => parseAlbumSlug('https://example.com/album/test')).toThrow('not an OSRS TCG');
  });
});

describe('combinePlayerCollection', () => {
  it('uses public beta instead of double-counting an imported beta save', () => {
    const player: PlayerCollection = {
      slug: 'kie',
      displayName: 'Kie',
      albumUrl: 'https://osrs-tcg.net/album/kie',
      legacy: createSourceSnapshot({ 'Abyssal potato': { normal: 3, foil: 1 } }),
      website: {
        capturedAt: new Date().toISOString(),
        beta: createSourceSnapshot({ 'Abyssal potato': { normal: 1, foil: 0 } }),
        current: createSourceSnapshot({ 'Abyssal potato': { normal: 2, foil: 1 } }),
      },
    };

    expect(combinePlayerCollection(player)[0]).toMatchObject({
      beta: { normal: 1, foil: 0 },
      total: { normal: 3, foil: 1 },
    });
  });

  it('uses an imported beta save when no public snapshot is available', () => {
    const player: PlayerCollection = {
      slug: 'kie',
      displayName: 'Kie',
      albumUrl: 'https://osrs-tcg.net/album/kie',
      legacy: createSourceSnapshot({ Goblin: { normal: 3, foil: 1 } }),
    };

    expect(combinePlayerCollection(player)[0]).toMatchObject({
      beta: { normal: 3, foil: 1 },
      total: { normal: 3, foil: 1 },
    });
  });
});

describe('beta trade ledger', () => {
  const createState = (): AppState => ({
    schemaVersion: 2,
    trades: [],
    players: {
      alice: {
        slug: 'alice', displayName: 'Alice', albumUrl: 'https://osrs-tcg.net/album/alice',
        legacy: createSourceSnapshot({ Goblin: { normal: 3, foil: 1 } }),
      },
      bob: {
        slug: 'bob', displayName: 'Bob', albumUrl: 'https://osrs-tcg.net/album/bob',
        legacy: createSourceSnapshot({ Goblin: { normal: 0, foil: 0 } }),
      },
    },
  });

  it('moves only beta copies between players and preserves the group total', () => {
    const state = addBetaTrade(
      createState(),
      { cardName: 'Goblin', fromSlug: 'alice', toSlug: 'bob', variant: 'normal', quantity: 2 },
      'trade-1',
      '2026-09-02T12:00:00.000Z',
    );
    expect(combinePlayerCollection(state.players.alice!, state.trades)[0]?.beta.normal).toBe(1);
    expect(combinePlayerCollection(state.players.bob!, state.trades)[0]?.beta.normal).toBe(2);
  });

  it('does not allow more beta copies to move than the sender owns', () => {
    expect(() => addBetaTrade(
      createState(),
      { cardName: 'Goblin', fromSlug: 'alice', toSlug: 'bob', variant: 'foil', quantity: 2 },
    )).toThrow('only has 1 beta foil');
  });

  it('reverses a movement without deleting its history', () => {
    const traded = addBetaTrade(
      createState(),
      { cardName: 'Goblin', fromSlug: 'alice', toSlug: 'bob', variant: 'normal', quantity: 1 },
      'trade-1',
    );
    const reversed = reverseBetaTrade(traded, 'trade-1', '2026-09-03T12:00:00.000Z');
    expect(reversed.trades[0]?.reversedAt).toBe('2026-09-03T12:00:00.000Z');
    expect(combinePlayerCollection(reversed.players.alice!, reversed.trades)[0]?.beta.normal).toBe(3);
    expect(combinePlayerCollection(reversed.players.bob!, reversed.trades)[0]).toBeUndefined();
  });

  it('requires later movements to be reversed first', () => {
    const first = addBetaTrade(
      createState(),
      { cardName: 'Goblin', fromSlug: 'alice', toSlug: 'bob', variant: 'normal', quantity: 1 },
      'trade-1',
    );
    const withCarol: AppState = {
      ...first,
      players: {
        ...first.players,
        carol: { slug: 'carol', displayName: 'Carol', albumUrl: 'https://osrs-tcg.net/album/carol' },
      },
    };
    const second = addBetaTrade(
      withCarol,
      { cardName: 'Goblin', fromSlug: 'bob', toSlug: 'carol', variant: 'normal', quantity: 1 },
      'trade-2',
    );
    expect(() => reverseBetaTrade(second, 'trade-1')).toThrow('Reverse later movements first');
  });
});

describe('foil export', () => {
  it('returns a sorted unique list of foil card names across the group', () => {
    const state: AppState = {
      schemaVersion: 2,
      trades: [],
      players: {
        alice: {
          slug: 'alice', displayName: 'Alice', albumUrl: 'https://osrs-tcg.net/album/alice',
          legacy: createSourceSnapshot({ Spade: { normal: 0, foil: 2 }, Coins: { normal: 0, foil: 1 } }),
        },
        bob: {
          slug: 'bob', displayName: 'Bob', albumUrl: 'https://osrs-tcg.net/album/bob',
          legacy: createSourceSnapshot({ Spade: { normal: 0, foil: 1 }, Knife: { normal: 1, foil: 1 } }),
        },
      },
    };
    expect(getGroupFoilNames(state)).toEqual(['Coins', 'Knife', 'Spade']);
  });
});
