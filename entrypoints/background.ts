import { fetchPublicPlayer } from '../src/publicPlayerApi';
import { loadState, saveState } from '../src/storage';
import type { SyncPlayerMessage, SyncPlayerResponse } from '../src/messages';

async function syncPlayer(slug: string): Promise<SyncPlayerResponse> {
  const initialState = await loadState();
  const existing = initialState.players[slug];
  initialState.players[slug] = {
    slug,
    displayName: existing?.displayName ?? slug,
    albumUrl: `https://osrs-tcg.net/album/${slug}`,
    legacy: existing?.legacy,
    website: existing?.website,
  };
  await saveState(initialState);

  try {
    const result = await fetchPublicPlayer(slug);
    const latestState = await loadState();
    const latest = latestState.players[slug] ?? initialState.players[slug];
    latestState.players[slug] = {
      ...latest,
      displayName: result.displayName,
      website: result.website,
      lastError: undefined,
    };
    await saveState(latestState);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sync this album.';
    const latestState = await loadState();
    if (latestState.players[slug]) latestState.players[slug].lastError = message;
    await saveState(latestState);
    return { ok: false, error: message };
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message: unknown) => {
    const candidate = message as Partial<SyncPlayerMessage>;
    if (candidate.type !== 'SYNC_PLAYER' || typeof candidate.slug !== 'string') return undefined;
    return syncPlayer(candidate.slug);
  });
});
