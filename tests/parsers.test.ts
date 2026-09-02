import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { fetchPublicPlayer, parsePublicPlayerPages } from '../src/publicPlayerApi';
import { parseLegacySave } from '../src/saveDecoder';
import type { PublicPlayerPage } from '../src/types';

describe('public album parser', () => {
  it('separates current, beta, normal, and foil variants', () => {
    const result = parsePublicPlayerPages([{
      displayName: 'Player',
      cardEntries: [
        { cardName: 'Goblin', variants: [{ beta: true }, { beta: true, foil: true }] },
        { cardName: 'Goblin', variants: [{ foil: true }] },
        { cardName: 'Cow', variants: [{}] },
      ],
      hasMore: false,
    }]);

    expect(result.website.beta.cards.Goblin).toEqual({ normal: 1, foil: 1 });
    expect(result.website.current.cards.Goblin).toEqual({ normal: 0, foil: 1 });
    expect(result.website.current.cards.Cow).toEqual({ normal: 1, foil: 0 });
  });

  it('follows pagination cursors and combines repeated card names', async () => {
    const requestedUrls: string[] = [];
    const pages = [
      {
        displayName: 'Player', revision: 7, hasMore: true, nextCursor: 'next-page',
        cardEntries: [{ cardName: 'Goblin', variants: [{ beta: true }] }],
      },
      {
        displayName: 'Player', revision: 7, hasMore: false,
        cardEntries: [{ cardName: 'Goblin', variants: [{ foil: true }] }],
      },
    ];
    const request = async (input: string | URL | Request) => {
      const url = String(input);
      requestedUrls.push(url);
      const page = url.includes('cursor=next-page') ? pages[1] : pages[0];
      return new Response(JSON.stringify(page), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    const result = await fetchPublicPlayer('player', request as typeof fetch);
    expect(requestedUrls).toHaveLength(2);
    expect(requestedUrls[1]).toContain('cursor=next-page');
    expect(result.website.beta.totalCopies).toBe(1);
    expect(result.website.current.foilCopies).toBe(1);
  });

  it('retries temporary server failures', async () => {
    let attempts = 0;
    const request = async () => {
      attempts += 1;
      if (attempts === 1) return new Response('Unavailable', { status: 503 });
      return new Response(JSON.stringify({
        displayName: 'Player', revision: 1, hasMore: false,
        cardEntries: [{ cardName: 'Coins', variants: [{ foil: true }] }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };
    const result = await fetchPublicPlayer('player', request as typeof fetch);
    expect(attempts).toBe(2);
    expect(result.website.current.cards.Coins).toEqual({ normal: 0, foil: 1 });
  });

  const publicPagePath = process.env.PUBLIC_PAGE_PATH;
  it.skipIf(!publicPagePath)('parses the supplied real public API page', async () => {
    const page = JSON.parse(await readFile(publicPagePath!, 'utf8')) as PublicPlayerPage;
    const result = parsePublicPlayerPages([page]);
    expect(result.displayName).toBe('TCGoonBigboy');
    expect(result.website.beta.totalCopies).toBe(500);
    expect(result.website.beta.foilCopies).toBe(6);
    expect(result.website.current.totalCopies).toBe(0);
  });

  const liveAlbum = process.env.LIVE_ALBUM;
  it.skipIf(!liveAlbum)('fetches every page of the supplied live public album', async () => {
    const result = await fetchPublicPlayer(liveAlbum!);
    expect(result.displayName).toBe('TCGoonBigboy');
    expect(result.website.current.totalCopies).toBe(35);
    expect(result.website.beta.totalCopies).toBe(4035);
  }, 240_000);
});

describe('legacy save parser', () => {
  const legacySavePath = process.env.LEGACY_SAVE_PATH;
  it.skipIf(!legacySavePath)('decodes the supplied real RLTCG_v2 save', async () => {
    const snapshot = await parseLegacySave(await readFile(legacySavePath!, 'utf8'));
    expect(snapshot.uniqueCards).toBe(3150);
    expect(snapshot.totalCopies).toBe(4400);
    expect(snapshot.foilCopies).toBe(43);
  });
});
