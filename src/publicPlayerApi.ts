import { createSourceSnapshot, incrementCard, normaliseCardName } from './collections';
import type { PublicPlayerPage, WebsiteSnapshot } from './types';

type ApiVariant = { beta?: unknown; foil?: unknown };
type ApiCardEntry = { cardName?: unknown; name?: unknown; variants?: unknown };

export type PublicPlayerResult = {
  displayName: string;
  website: WebsiteSnapshot;
};

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(url: URL, request: typeof fetch): Promise<Response> {
  const delays = [400, 1_000, 2_000];
  let response: Response | undefined;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    response = await request(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!RETRYABLE_STATUSES.has(response.status) || attempt === delays.length) return response;
    await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
  }
  return response!;
}

function addPageCards(
  page: PublicPlayerPage,
  current: Record<string, { normal: number; foil: number }>,
  beta: Record<string, { normal: number; foil: number }>,
): void {
  if (!Array.isArray(page.cardEntries)) throw new Error('The public album response has no cardEntries array.');

  for (const value of page.cardEntries) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as ApiCardEntry;
    const name = normaliseCardName(entry.cardName ?? entry.name);
    if (!name || !Array.isArray(entry.variants)) continue;
    for (const variantValue of entry.variants) {
      if (!variantValue || typeof variantValue !== 'object') continue;
      const variant = variantValue as ApiVariant;
      incrementCard(variant.beta === true ? beta : current, name, variant.foil === true);
    }
  }
}

export async function fetchPublicPlayer(
  slug: string,
  request: typeof fetch = fetch,
): Promise<PublicPlayerResult> {
  const current: Record<string, { normal: number; foil: number }> = {};
  const beta: Record<string, { normal: number; foil: number }> = {};
  const capturedAt = new Date().toISOString();
  let cursor: string | undefined;
  let displayName = slug;
  let expectedRevision: number | undefined;

  for (let pageNumber = 1; pageNumber <= 50; pageNumber += 1) {
    const url = new URL(`https://osrs-tcg.net/api/v1/players/${encodeURIComponent(slug)}`);
    url.searchParams.set('limit', '500');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetchWithRetry(url, request);
    if (response.status === 404) throw new Error(`No public album was found for ${slug}.`);
    if (!response.ok) throw new Error(`OSRS TCG returned ${response.status} while syncing ${slug}.`);
    const page = (await response.json()) as PublicPlayerPage;

    if (typeof page.displayName === 'string' && page.displayName.trim()) displayName = page.displayName.trim();
    const revision = typeof page.revision === 'number' ? page.revision : undefined;
    if (expectedRevision === undefined) expectedRevision = revision;
    else if (revision !== undefined && expectedRevision !== revision) {
      throw new Error('The collection changed during sync. Please sync it again.');
    }

    addPageCards(page, current, beta);
    if (page.hasMore !== true) {
      return {
        displayName,
        website: {
          capturedAt,
          current: createSourceSnapshot(current, capturedAt),
          beta: createSourceSnapshot(beta, capturedAt),
        },
      };
    }

    if (typeof page.nextCursor !== 'string' || !page.nextCursor) {
      throw new Error('The album says it has more cards but did not provide a cursor.');
    }
    cursor = page.nextCursor;
  }

  throw new Error('The album exceeded the 50-page safety limit.');
}

export function parsePublicPlayerPages(pages: PublicPlayerPage[]): PublicPlayerResult {
  if (pages.length === 0) throw new Error('No public album pages were supplied.');
  const current: Record<string, { normal: number; foil: number }> = {};
  const beta: Record<string, { normal: number; foil: number }> = {};
  for (const page of pages) addPageCards(page, current, beta);
  const capturedAt = new Date().toISOString();
  const firstPage = pages[0]!;
  const displayName = typeof firstPage.displayName === 'string' ? firstPage.displayName : 'Unknown player';
  return {
    displayName,
    website: {
      capturedAt,
      current: createSourceSnapshot(current, capturedAt),
      beta: createSourceSnapshot(beta, capturedAt),
    },
  };
}
