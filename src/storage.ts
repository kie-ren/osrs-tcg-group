import { emptyState } from './collections';
import type { AppState } from './types';

const STORAGE_KEY = 'osrsTcgGroupState';

export async function loadState(): Promise<AppState> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as {
    schemaVersion?: number;
    players?: AppState['players'];
    trades?: AppState['trades'];
  } | undefined;
  if (!value?.players) return emptyState();
  if (value.schemaVersion === 1) {
    const migrated: AppState = { schemaVersion: 2, players: value.players, trades: [] };
    await saveState(migrated);
    return migrated;
  }
  if (value.schemaVersion !== 2) return emptyState();
  return { schemaVersion: 2, players: value.players, trades: value.trades ?? [] };
}

export async function saveState(state: AppState): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: state });
}

export function watchState(callback: (state: AppState) => void): () => void {
  const listener = (changes: Record<string, Browser.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local' || !changes[STORAGE_KEY]?.newValue) return;
    callback(changes[STORAGE_KEY].newValue as AppState);
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
