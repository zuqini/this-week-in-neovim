#!/usr/bin/env node
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { enrichBatch, type EnrichedItem } from "../src/enrich/run.js";
import type { EnrichItem } from "../src/enrich/index.js";
import { rawScrapeEnvelopeSchema } from "../src/types.js";

interface CliArgs {
  date: string;
  rawDir: string;
  outDir: string;
  concurrency: number;
}

function parseArgs(argv: string[]): CliArgs {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) {
        args.set(key, "true");
      } else {
        args.set(key, value);
        i++;
      }
    }
  }

  const date = args.get("date") ?? defaultUtcDate();
  const root = args.get("root") ?? path.resolve(process.cwd(), "pipeline/data");
  const rawDir = args.get("raw-dir") ?? path.join(root, "raw", date);
  const outDir = args.get("out-dir") ?? path.join(root, "enriched", date);
  const concurrency = Number(args.get("concurrency") ?? "4");

  return { date, rawDir, outDir, concurrency };
}

function defaultUtcDate(): string {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

interface FilePayload {
  items: EnrichItem[];
  envelope: Record<string, unknown>;
}

function parsePayload(file: string, raw: unknown): FilePayload {
  const parsed = rawScrapeEnvelopeSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.length === 0 ? "(root)" : issue.path.join(".");
    throw new Error(`${file}: invalid scrape envelope at ${path}: ${issue.message}`);
  }
  const env = parsed.data as Record<string, unknown>;
  const items = env.items as unknown as EnrichItem[];
  return { items, envelope: env };
}

function rebuildPayload(payload: FilePayload, enriched: EnrichedItem[]): unknown {
  return { ...payload.envelope, items: enriched };
}

function isAlreadyEnriched(item: EnrichItem): boolean {
  return Object.prototype.hasOwnProperty.call(item, "linkedContent");
}

export async function runCli(argv: string[]): Promise<number> {
  const args = parseArgs(argv);

  let entries: string[];
  try {
    entries = await readdir(args.rawDir);
  } catch (err) {
    process.stderr.write(`enrich-links: cannot read raw dir ${args.rawDir}: ${formatErr(err)}\n`);
    return 1;
  }

  const sourceFiles = entries.filter((f) => f.endsWith(".json"));
  if (sourceFiles.length === 0) {
    process.stderr.write(`enrich-links: no .json files in ${args.rawDir}\n`);
    return 1;
  }

  try {
    await mkdir(args.outDir, { recursive: true });
  } catch (err) {
    process.stderr.write(`enrich-links: cannot create out dir ${args.outDir}: ${formatErr(err)}\n`);
    return 1;
  }

  let enrichedTotal = 0;
  let skippedTotal = 0;
  let failedTotal = 0;

  for (const file of sourceFiles) {
    const inPath = path.join(args.rawDir, file);
    const outPath = path.join(args.outDir, file);

    let parsedIn: unknown;
    try {
      parsedIn = JSON.parse(await readFile(inPath, "utf8"));
    } catch (err) {
      process.stderr.write(`enrich-links: cannot read ${inPath}: ${formatErr(err)}\n`);
      return 1;
    }

    let existing: EnrichedItem[] = [];
    try {
      const prior = JSON.parse(await readFile(outPath, "utf8"));
      existing = parsePayload(file, prior).items as EnrichedItem[];
    } catch {
      existing = [];
    }
    const existingByUrl = new Map<string, EnrichedItem>();
    for (const e of existing) {
      if (isAlreadyEnriched(e)) existingByUrl.set(e.url, e);
    }

    let payload: FilePayload;
    try {
      payload = parsePayload(file, parsedIn);
    } catch (err) {
      process.stderr.write(`enrich-links: ${formatErr(err)}\n`);
      return 1;
    }
    const toEnrich: { item: EnrichItem; idx: number }[] = [];
    const merged: EnrichedItem[] = new Array(payload.items.length);
    let perFileSkipped = 0;
    payload.items.forEach((item, idx) => {
      const cached = existingByUrl.get(item.url);
      if (cached && isAlreadyEnriched(cached)) {
        merged[idx] = cached;
        perFileSkipped++;
      } else {
        toEnrich.push({ item, idx });
      }
    });

    let perFileFailed = 0;
    const enrichedSlice = await enrichBatch(
      toEnrich.map((t) => t.item),
      {
        concurrency: args.concurrency,
        onError: ({ url, error }) => {
          perFileFailed++;
          process.stderr.write(`enrich-links: ${file}: ${url}: ${error}\n`);
        },
      },
    );
    enrichedSlice.forEach((e, i) => {
      merged[toEnrich[i].idx] = e;
    });

    const enrichedThisFile = enrichedSlice.length - perFileFailed;

    try {
      const outPayload = rebuildPayload(payload, merged);
      await writeFile(outPath, JSON.stringify(outPayload, null, 2) + "\n", "utf8");
    } catch (err) {
      process.stderr.write(`enrich-links: cannot write ${outPath}: ${formatErr(err)}\n`);
      return 1;
    }

    enrichedTotal += enrichedThisFile;
    skippedTotal += perFileSkipped;
    failedTotal += perFileFailed;
  }

  process.stdout.write(
    `enriched ${enrichedTotal} items, skipped ${skippedTotal}, failed ${failedTotal}\n`,
  );
  return 0;
}

function formatErr(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const isMain = (() => {
  const arg = process.argv[1];
  if (!arg) return false;
  try {
    const url = new URL(import.meta.url);
    return url.pathname === arg || url.pathname.endsWith(arg);
  } catch {
    return false;
  }
})();

if (isMain) {
  runCli(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`enrich-links: fatal: ${formatErr(err)}\n`);
      process.exit(1);
    },
  );
}
