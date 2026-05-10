import { enrich, type EnrichItem, type EnrichedLink, type EnrichOpts } from "./index.js";
import { extractEnrichableExtraUrls } from "./selftext.js";

export interface EnrichedItem {
  url: string;
  linkedContent: EnrichedLink | null;
  linkedContentExtras?: EnrichedLink[];
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
      let linkedContent: EnrichedLink | null;
      try {
        linkedContent = await enrich(item, enrichOpts);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        opts.onError?.({ url: item.url, error: message });
        results[idx] = {
          ...item,
          linkedContent: { kind: "fetch-failed", url: item.url, error: message },
        };
        continue;
      }

      const extras = await enrichExtras(item, enrichOpts, opts.onError);
      results[idx] =
        extras.length > 0
          ? { ...item, linkedContent, linkedContentExtras: extras }
          : { ...item, linkedContent };
    }
  }

  async function enrichExtras(
    item: EnrichItem,
    enrichOpts: EnrichOpts,
    onError: EnrichBatchOpts["onError"],
  ): Promise<EnrichedLink[]> {
    const isSelf = (item as { is_self?: unknown }).is_self === true;
    const selftext = (item as { selftext?: unknown }).selftext;
    if (!isSelf || typeof selftext !== "string" || selftext === "") return [];
    const extraUrls = extractEnrichableExtraUrls(selftext, item.url);
    const extras: EnrichedLink[] = [];
    for (const url of extraUrls) {
      try {
        const linked = await enrich({ url }, enrichOpts);
        if (linked) extras.push(linked);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        onError?.({ url, error: message });
        extras.push({ kind: "fetch-failed", url, error: message });
      }
    }
    return extras;
  }

  const workerCount = Math.min(concurrency, items.length);
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}
