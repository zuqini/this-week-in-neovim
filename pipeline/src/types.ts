import { z } from "zod";

export interface ScrapeItem {
  id: string;
  url: string;
  title?: string;
}

export interface RawScrapePayload<T, P = Record<string, unknown>> {
  source: string;
  fetchedAt: string;
  params: P;
  items: T[];
}

export const rawScrapeEnvelopeSchema = z
  .object({
    source: z.string(),
    fetchedAt: z.string(),
    params: z.record(z.unknown()),
    items: z.array(z.record(z.unknown())),
  })
  .passthrough();

export type RawScrapeEnvelope = z.infer<typeof rawScrapeEnvelopeSchema>;
