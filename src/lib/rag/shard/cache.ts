import { INDEX_CONFIG_VERSION } from "./types";
import type { RouteDecision, SecurityScope } from "./types";
import { normalize } from "../text";

interface Entry {
  key: string;
  decision: RouteDecision;
  indexVersion: number;
  at: number;
}

const MAX = 128;
const store = new Map<string, Entry>();

export function routingCacheKey(
  scope: SecurityScope,
  query: string,
  indexVersion: number,
  mode: string,
): string {
  const cols = (scope.collections ?? []).slice().sort().join(",");
  return `${scope.tenant}|${cols}|${scope.maxClassification ?? ""}|${normalize(query)}|${mode}|${indexVersion}|${INDEX_CONFIG_VERSION}`;
}

export function getCachedRoute(key: string, indexVersion: number): RouteDecision | null {
  const hit = store.get(key);
  if (!hit) return null;
  if (hit.indexVersion !== indexVersion) {
    store.delete(key);
    return null;
  }
  return { ...hit.decision, cacheHit: true };
}

export function setCachedRoute(key: string, indexVersion: number, decision: RouteDecision): void {
  if (store.size >= MAX) {
    const first = store.keys().next().value;
    if (first) store.delete(first);
  }
  store.set(key, { key, decision, indexVersion, at: Date.now() });
}

export function invalidateRoutingCache(): void {
  store.clear();
}
