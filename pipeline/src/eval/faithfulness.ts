import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_FAITHFULNESS_MODEL = "claude-sonnet-4-6";
const MAX_OUTPUT_TOKENS = 256;

const SYSTEM_PROMPT = `You are a fact-checker for a weekly Neovim newsletter. For each (claim, cited source) pair, decide whether the claim is faithful to the source — i.e. whether a careful reader could verify the claim against the source text alone.

Rules:
- Faithful: the source clearly supports every factual statement in the claim. Paraphrasing and summarization are fine.
- Not faithful: the claim asserts a specific fact (number, name, date, behavior, capability) that the source does not contain or contradicts.
- Treat ambiguous or weakly supported claims as not faithful and explain why.

Respond with a single JSON object on one line: {"faithful": <bool>, "reason": <string>}
Do not include any other text.`;

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

export interface FaithfulnessClient {
  judge(args: {
    model: string;
    system: string;
    userMessage: string;
    maxTokens: number;
  }): Promise<{ text: string; usage: TokenUsage }>;
}

export interface SourceText {
  id: string;
  url: string;
  text: string;
}

export interface BulletJudgement {
  text: string;
  citation: string;
  faithful: boolean;
  reason: string;
}

export interface FaithfulnessReport {
  ok: boolean;
  bullets: BulletJudgement[];
  usage: TokenUsage;
}

export interface FaithfulnessOpts {
  client: FaithfulnessClient;
  model?: string;
  onUsage?: (delta: TokenUsage, cumulative: TokenUsage) => void;
}

const CITATION_RE = /\[\^([A-Za-z0-9._-]+)\]/g;
const FENCED_RE = /(^|\n)(```|~~~)[\s\S]*?\n\2(?=\n|$)/g;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const FOOTNOTE_DEF_RE = /^\[\^[^\]]+\]:/;
const HEADING_RE = /^#+\s/;
const BULLET_RE = /^\s*[-*]\s+(.*)$/;

export interface ExtractedClaim {
  text: string;
  citations: string[];
}

export function extractClaims(body: string): ExtractedClaim[] {
  const stripped = body.replace(FENCED_RE, "").replace(INLINE_CODE_RE, "");
  const lines = stripped.split("\n");
  const claims: ExtractedClaim[] = [];

  let buffer: string[] = [];

  function flushParagraph(): void {
    if (buffer.length === 0) return;
    const text = buffer.join(" ").trim();
    addIfCited(text);
    buffer = [];
  }

  function addIfCited(text: string): void {
    const ids = uniqueCitations(text);
    if (ids.length > 0) claims.push({ text, citations: ids });
  }

  for (const line of lines) {
    if (FOOTNOTE_DEF_RE.test(line) || HEADING_RE.test(line) || line.trim() === "") {
      flushParagraph();
      continue;
    }
    const bullet = line.match(BULLET_RE);
    if (bullet) {
      flushParagraph();
      addIfCited(bullet[1].trim());
      continue;
    }
    buffer.push(line.trim());
  }
  flushParagraph();
  return claims;
}

function uniqueCitations(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(CITATION_RE)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

export async function evaluateFaithfulness(
  body: string,
  sources: Map<string, SourceText>,
  opts: FaithfulnessOpts,
): Promise<FaithfulnessReport> {
  const model = opts.model ?? DEFAULT_FAITHFULNESS_MODEL;
  const claims = extractClaims(body);
  const bullets: BulletJudgement[] = [];
  const cumulative: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };

  for (const claim of claims) {
    for (const id of claim.citations) {
      const source = sources.get(id);
      if (!source) {
        bullets.push({
          text: claim.text,
          citation: id,
          faithful: false,
          reason: `no source content available for [^${id}]`,
        });
        continue;
      }
      const userMessage = renderUserMessage(source, claim.text);
      const resp = await opts.client.judge({
        model,
        system: SYSTEM_PROMPT,
        userMessage,
        maxTokens: MAX_OUTPUT_TOKENS,
      });
      accumulate(cumulative, resp.usage);
      opts.onUsage?.(resp.usage, { ...cumulative });

      const parsed = parseJudgement(resp.text);
      bullets.push({
        text: claim.text,
        citation: id,
        faithful: parsed.faithful,
        reason: parsed.reason,
      });
    }
  }

  return {
    ok: bullets.every((b) => b.faithful),
    bullets,
    usage: cumulative,
  };
}

function renderUserMessage(source: SourceText, claim: string): string {
  return `Source [${source.id}] (${source.url}):
${source.text}

---

Claim: ${claim}`;
}

function accumulate(target: TokenUsage, delta: TokenUsage): void {
  target.input += delta.input;
  target.output += delta.output;
  target.cacheRead += delta.cacheRead;
  target.cacheCreation += delta.cacheCreation;
}

function parseJudgement(text: string): { faithful: boolean; reason: string } {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return { faithful: false, reason: `judge returned non-JSON: ${trimmed.slice(0, 120)}` };
  }
  try {
    const obj = JSON.parse(trimmed.slice(start, end + 1));
    if (typeof obj !== "object" || obj === null) throw new Error("not an object");
    const faithful = obj.faithful === true;
    const reason = typeof obj.reason === "string" ? obj.reason : "";
    return { faithful, reason };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { faithful: false, reason: `judge JSON parse failed: ${msg}` };
  }
}

export interface CreateAnthropicClientOpts {
  apiKey?: string;
  client?: Anthropic;
}

export function createAnthropicClient(
  opts: CreateAnthropicClientOpts = {},
): FaithfulnessClient {
  const sdk = opts.client ?? new Anthropic({ apiKey: opts.apiKey });
  return {
    async judge({ model, system, userMessage, maxTokens }) {
      const resp = await sdk.messages.create({
        model,
        max_tokens: maxTokens,
        system: [
          { type: "text", text: system, cache_control: { type: "ephemeral" } },
        ],
        messages: [{ role: "user", content: userMessage }],
      });
      const text = resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      const u = resp.usage;
      return {
        text,
        usage: {
          input: u.input_tokens ?? 0,
          output: u.output_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          cacheCreation: u.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}
