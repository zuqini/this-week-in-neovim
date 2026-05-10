import type { IssueMeta } from "./issues/schema";

const CITATION_RE = /\[\^([A-Za-z0-9._-]+)\]/g;
const FENCED_CODE_RE = /(^|\n)(```|~~~)[\s\S]*?\n\2(?=\n|$)/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;

export interface CitationOk {
  ok: true;
  errors: [];
}

export interface CitationFail {
  ok: false;
  errors: string[];
}

export type CitationResult = CitationOk | CitationFail;

function stripCode(body: string): string {
  return body.replace(FENCED_CODE_RE, "").replace(INLINE_CODE_RE, "");
}

export function extractCitationIds(body: string): Set<string> {
  const ids = new Set<string>();
  for (const m of stripCode(body).matchAll(CITATION_RE)) {
    ids.add(m[1]);
  }
  return ids;
}

export function validateCitations(
  meta: Pick<IssueMeta, "sources">,
  body: string,
): CitationResult {
  const errors: string[] = [];

  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const source of meta.sources) {
    if (seen.has(source.id)) duplicates.add(source.id);
    seen.add(source.id);
  }
  for (const id of [...duplicates].sort()) {
    errors.push(`Duplicate source id in sources[]: "${id}".`);
  }

  const sourceIds = new Set(meta.sources.map((s) => s.id));
  const citedIds = extractCitationIds(body);

  for (const id of [...citedIds].sort()) {
    if (!sourceIds.has(id)) {
      errors.push(
        `Citation [^${id}] in body has no matching entry in sources[].`,
      );
    }
  }

  for (const id of [...sourceIds].sort()) {
    if (!citedIds.has(id)) {
      errors.push(`Source "${id}" in sources[] is never cited in body.`);
    }
  }

  return errors.length === 0
    ? { ok: true, errors: [] }
    : { ok: false, errors };
}
