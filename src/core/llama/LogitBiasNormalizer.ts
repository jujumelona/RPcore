import type { LogitBiasEntry } from './LlamaEngine';

type NormalizedLogitBiasEntry = [number, number | false];

function toFiniteTokenId(tokenId: unknown): number | null {
  if (typeof tokenId !== 'number' || !Number.isFinite(tokenId)) return null;
  return Math.trunc(tokenId);
}

export function extractTokenIdsFromTokenizeResult(result: unknown): number[] {
  const rawIds = Array.isArray(result)
    ? result
    : (result as { tokens?: unknown } | null | undefined)?.tokens;

  if (!Array.isArray(rawIds)) return [];

  const tokenIds: number[] = [];
  for (const rawId of rawIds) {
    const tokenId = toFiniteTokenId(rawId);
    if (tokenId !== null) tokenIds.push(tokenId);
  }
  return tokenIds;
}

export async function normalizeLogitBiasEntries(
  entries: LogitBiasEntry[] | undefined,
  tokenizeString: (token: string) => Promise<number[]>,
): Promise<NormalizedLogitBiasEntry[] | undefined> {
  if (!entries || entries.length === 0) return undefined;

  const normalized = new Map<number, number | false>();
  const stringTokenCache = new Map<string, Promise<number[]>>();

  const setBias = (tokenId: number, bias: number | false) => {
    normalized.delete(tokenId);
    normalized.set(tokenId, bias);
  };

  for (const [token, bias] of entries) {
    if (typeof token === 'number') {
      const tokenId = toFiniteTokenId(token);
      if (tokenId !== null) setBias(tokenId, bias);
      continue;
    }

    if (typeof token !== 'string' || token.length === 0) continue;

    let tokenIdsPromise = stringTokenCache.get(token);
    if (!tokenIdsPromise) {
      tokenIdsPromise = tokenizeString(token);
      stringTokenCache.set(token, tokenIdsPromise);
    }

    const tokenIds = await tokenIdsPromise;
    for (const tokenId of tokenIds) {
      setBias(tokenId, bias);
    }
  }

  return normalized.size > 0 ? Array.from(normalized.entries()) : undefined;
}
