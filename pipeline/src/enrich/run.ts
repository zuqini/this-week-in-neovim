import { enrich, type EnrichItem, type EnrichedLink, type EnrichOpts } from "./index.js";

export interface EnrichedItem {
  url: string;
  linkedContent: EnrichedLink | null;
  [key: string]: unknown;
}

export interface EnrichBatchOpts extends EnrichOpts {
  concurrency?: number;
  onError?: (err: { url: string; error: string }) => void;
}

const DEFAULT_CONCURRENCY = 4;

export async function enrichBatch(
  items: EnrichItem[],
  opts: EnrichBatchOpts = {},
): Promise<EnrichedItem[]> {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const enrichOpts: EnrichOpts = {
    fetch: opts.fetch,
    userAgent: opts.userAgent,
    maxBytes: opts.maxBytes,
  };

  const results: EnrichedItem[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      const item = items[idx];
      try {
        const linked = await enrich(item, enrichOpts);
        results[idx] = { ...item, linkedContent: linked };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        opts.onError?.({ url: item.url, error: message });
        results[idx] = {
          ...item,
          linkedContent: { kind: "fetch-failed", url: item.url, error: message },
        };
      }
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}
