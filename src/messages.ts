export type SyncPlayerMessage = {
  type: 'SYNC_PLAYER';
  slug: string;
};

export type SyncPlayerResponse =
  | { ok: true }
  | { ok: false; error: string };

