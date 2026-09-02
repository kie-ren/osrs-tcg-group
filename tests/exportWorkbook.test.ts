import { describe, expect, it } from 'vitest';
import { addBetaTrade, createSourceSnapshot } from '../src/collections';
import { createGroupWorkbook } from '../src/exportWorkbook';
import type { AppState } from '../src/types';

describe('group workbook', () => {
  it('exports adjusted ownership and an auditable trade-history sheet', async () => {
    const base: AppState = {
      schemaVersion: 2,
      trades: [],
      players: {
        alice: {
          slug: 'alice', displayName: 'Alice', albumUrl: 'https://osrs-tcg.net/album/alice',
          legacy: createSourceSnapshot({ Goblin: { normal: 3, foil: 0 } }),
        },
        bob: {
          slug: 'bob', displayName: 'Bob', albumUrl: 'https://osrs-tcg.net/album/bob',
        },
      },
    };
    const state = addBetaTrade(
      base,
      { cardName: 'Goblin', fromSlug: 'alice', toSlug: 'bob', variant: 'normal', quantity: 1 },
      'trade-1',
      '2026-09-02T12:00:00.000Z',
    );

    const workbook = await createGroupWorkbook(state);
    const collection = workbook.getWorksheet('Group Collection')!;
    const history = workbook.getWorksheet('Trade History')!;

    expect(collection.getRow(3).values).toEqual([
      undefined, 'Goblin', 2, 1, 0, 0, 1, 0, 0, 0, 3, 0,
    ]);
    expect(history.rowCount).toBe(2);
    expect(history.getRow(2).getCell(2).value).toBe('Goblin');
    expect(history.getRow(2).getCell(5).value).toBe('Alice');
    expect(history.getRow(2).getCell(6).value).toBe('Bob');
    expect(history.getRow(2).getCell(7).value).toBe('Active');
  });
});

