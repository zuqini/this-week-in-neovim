import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import {
  createAnthropicClient,
  evaluateFaithfulness,
  extractClaims,
  type FaithfulnessClient,
  type SourceText,
  type TokenUsage,
} from "@/pipeline/src/eval/faithfulness";

function judgeMock(
  pattern: (claim: string, source: SourceText) => { faithful: boolean; reason: string },
  usage: TokenUsage = { input: 100, output: 20, cacheRead: 0, cacheCreation: 0 },
): FaithfulnessClient {
  return {
    judge: vi.fn().mockImplementation(async ({ userMessage }) => {
      const sourceMatch = userMessage.match(/Source \[([^\]]+)\] \(([^)]+)\):\n([\s\S]+?)\n\n---/);
      const claimMatch = userMessage.match(/Claim: (.+)$/);
      if (!sourceMatch || !claimMatch) {
        return { text: '{"faithful": false, "reason": "test setup error"}', usage };
      }
      const source: SourceText = {
        id: sourceMatch[1],
        url: sourceMatch[2],
        text: sourceMatch[3],
      };
      const verdict = pattern(claimMatch[1], source);
      return { text: JSON.stringify(verdict), usage };
    }),
  };
}

const SOURCES = new Map<string, SourceText>([
  [
    "s1",
    {
      id: "s1",
      url: "https://example.com/release",
      text: "Neovim 0.10 was released on May 15. The release adds tree-sitter highlighting by default.",
    },
  ],
  [
    "s2",
    {
      id: "s2",
      url: "https://example.com/post",
      text: "A blog post about plugin authoring conventions.",
    },
  ],
]);

describe("extractClaims", () => {
  it("extracts a paragraph claim with one citation", () => {
    expect(extractClaims("Some claim happened[^s1]. More detail.")).toEqual([
      { text: "Some claim happened[^s1]. More detail.", citations: ["s1"] },
    ]);
  });

  it("extracts each bullet as a separate claim", () => {
    const body = ["- bullet one[^s1]", "- bullet two[^s2]", ""].join("\n");
    expect(extractClaims(body)).toEqual([
      { text: "bullet one[^s1]", citations: ["s1"] },
      { text: "bullet two[^s2]", citations: ["s2"] },
    ]);
  });

  it("ignores citations in code spans and footnote definitions", () => {
    const body = [
      "real[^s1]",
      "",
      "see `[^s99]` placeholder",
      "",
      "[^s1]: A.",
    ].join("\n");
    expect(extractClaims(body)).toEqual([
      { text: "real[^s1]", citations: ["s1"] },
    ]);
  });

  it("dedupes citations within one claim", () => {
    expect(extractClaims("two refs[^s1] same source[^s1]")).toEqual([
      { text: "two refs[^s1] same source[^s1]", citations: ["s1"] },
    ]);
  });

  it("skips paragraphs without citations", () => {
    expect(extractClaims("Plain prose, no citations.")).toEqual([]);
  });
});

describe("evaluateFaithfulness", () => {
  it("passes when every cited bullet is judged faithful", async () => {
    const client = judgeMock(() => ({ faithful: true, reason: "supported" }));
    const report = await evaluateFaithfulness(
      "Neovim 0.10 was released[^s1].",
      SOURCES,
      { client },
    );
    expect(report.ok).toBe(true);
    expect(report.bullets).toHaveLength(1);
    expect(report.bullets[0].faithful).toBe(true);
  });

  it("flags fabricated facts as unfaithful", async () => {
    const client = judgeMock((claim, source) => {
      if (claim.includes("100x faster") && !source.text.includes("100x")) {
        return { faithful: false, reason: "no mention of 100x" };
      }
      return { faithful: true, reason: "ok" };
    });
    const report = await evaluateFaithfulness(
      "Neovim is now 100x faster than vim[^s1].",
      SOURCES,
      { client },
    );
    expect(report.ok).toBe(false);
    expect(report.bullets[0].faithful).toBe(false);
    expect(report.bullets[0].reason).toContain("100x");
  });

  it("flags missing source content as unfaithful", async () => {
    const client = judgeMock(() => ({ faithful: true, reason: "" }));
    const report = await evaluateFaithfulness(
      "Claim against unknown source[^s99].",
      SOURCES,
      { client },
    );
    expect(report.ok).toBe(false);
    expect(report.bullets[0].faithful).toBe(false);
    expect(report.bullets[0].reason).toMatch(/no source content/);
    expect(client.judge).not.toHaveBeenCalled();
  });

  it("aggregates token usage across bullets and reports per-call deltas", async () => {
    const client = judgeMock(
      () => ({ faithful: true, reason: "" }),
      { input: 50, output: 10, cacheRead: 200, cacheCreation: 0 },
    );
    const usageEvents: TokenUsage[] = [];
    const report = await evaluateFaithfulness(
      ["one[^s1]", "", "two[^s2]"].join("\n"),
      SOURCES,
      { client, onUsage: (delta) => usageEvents.push(delta) },
    );
    expect(report.bullets).toHaveLength(2);
    expect(report.usage).toEqual({
      input: 100,
      output: 20,
      cacheRead: 400,
      cacheCreation: 0,
    });
    expect(usageEvents).toHaveLength(2);
  });

  it("treats malformed JSON from the judge as not faithful", async () => {
    const client: FaithfulnessClient = {
      judge: vi.fn().mockResolvedValue({
        text: "not json at all",
        usage: { input: 10, output: 5, cacheRead: 0, cacheCreation: 0 },
      }),
    };
    const report = await evaluateFaithfulness(
      "Some claim[^s1].",
      SOURCES,
      { client },
    );
    expect(report.bullets[0].faithful).toBe(false);
    expect(report.bullets[0].reason).toMatch(/non-JSON|parse/);
  });

  it("forwards model + system prompt to the client", async () => {
    const client = judgeMock(() => ({ faithful: true, reason: "" }));
    await evaluateFaithfulness("claim[^s1]", SOURCES, {
      client,
      model: "claude-haiku-4-5-20251001",
    });
    const args = (client.judge as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(args.model).toBe("claude-haiku-4-5-20251001");
    expect(args.system).toContain("fact-checker");
  });
});

describe("createAnthropicClient", () => {
  it("sends system prompt with cache_control: ephemeral and maps usage", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [{ type: "text", text: '{"faithful":true,"reason":"ok"}' }],
      usage: {
        input_tokens: 5,
        output_tokens: 10,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 0,
      },
    });
    const sdkLike = { messages: { create } } as unknown as Anthropic;
    const client = createAnthropicClient({ client: sdkLike });

    const out = await client.judge({
      model: "claude-sonnet-4-6",
      system: "SYS",
      userMessage: "USER",
      maxTokens: 100,
    });

    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.model).toBe("claude-sonnet-4-6");
    expect(args.max_tokens).toBe(100);
    expect(args.system).toEqual([
      { type: "text", text: "SYS", cache_control: { type: "ephemeral" } },
    ]);
    expect(args.messages).toEqual([{ role: "user", content: "USER" }]);
    expect(out.text).toBe('{"faithful":true,"reason":"ok"}');
    expect(out.usage).toEqual({
      input: 5,
      output: 10,
      cacheRead: 0,
      cacheCreation: 200,
    });
  });
});
