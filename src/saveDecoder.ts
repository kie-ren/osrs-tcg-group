import { createSourceSnapshot, incrementCard, normaliseCardName } from './collections';
import type { SourceSnapshot } from './types';

const V2_PREFIX = 'RLTCG_v2:';
const V3_PREFIX = 'RLTCG_v3:';
const XOR_SALT = new TextEncoder().encode('RLTCG|osrs-tcg!');

type SaveVariant = { foil?: boolean };
type SaveCardEntry = { cardName?: string; name?: string; variants?: SaveVariant[] };
type SaveCardInstance = { cardName?: string; name?: string; foil?: boolean };
type DecodedSave = {
  cardEntries?: SaveCardEntry[];
  cardInstances?: SaveCardInstance[];
};

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
  return result;
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress the save. Please use a current Chrome version.');
  }
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function decodeSaveText(contents: string): Promise<DecodedSave> {
  const text = contents.trim();
  if (text.startsWith('{')) return JSON.parse(text) as DecodedSave;

  let compressed: Uint8Array;
  if (text.startsWith(V2_PREFIX)) {
    compressed = decodeBase64(text.slice(V2_PREFIX.length));
    for (let index = 0; index < compressed.length; index += 1) {
      compressed[index] = compressed[index]! ^ XOR_SALT[index % XOR_SALT.length]!;
    }
  } else if (text.startsWith(V3_PREFIX)) {
    compressed = decodeBase64(text.slice(V3_PREFIX.length));
  } else {
    throw new Error('Unknown save format. Expected RLTCG_v2 or RLTCG_v3.');
  }

  return JSON.parse(await gunzip(compressed)) as DecodedSave;
}

export async function parseLegacySave(contents: string): Promise<SourceSnapshot> {
  const save = await decodeSaveText(contents);
  const cards: Record<string, { normal: number; foil: number }> = {};

  if (Array.isArray(save.cardEntries)) {
    for (const entry of save.cardEntries) {
      const name = normaliseCardName(entry.cardName ?? entry.name);
      if (!name) continue;
      for (const variant of entry.variants ?? []) incrementCard(cards, name, variant.foil === true);
    }
  } else if (Array.isArray(save.cardInstances)) {
    for (const instance of save.cardInstances) {
      const name = normaliseCardName(instance.cardName ?? instance.name);
      if (name) incrementCard(cards, name, instance.foil === true);
    }
  } else {
    throw new Error('The save decoded, but it does not contain recognised card data.');
  }

  return createSourceSnapshot(cards);
}
