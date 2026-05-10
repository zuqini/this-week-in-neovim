import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  defaultSinceIso,
  projectRelease,
  scrapeReleases,
} from "@/pipeline/src/sources/github/releases";

const FIXTURE = path.resolve(
  import.meta.dirname,
  "../fixtures/github/releases-neovim.json",
);

async function loadFixture(): Promise<unknown[]> {
  return JSON.parse(await readFile(FIXTURE, "utf8")) as unknown[];
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("projectRelease", () => {
  it("maps the live API shape to GithubRelease and projects the documented fields", async () => {
    const raw = (await loadFixture())[0] as Record<string, unknown>;
    const projected = projectRelease(raw);
    expect(projected).not.toBeNull();
    if (projected === null) return;
    expect(projected.id).toBe(raw.tag_name);
    expect(projected.url).toBe(raw.html_url);
    expect(projected.tag_name).toBe(raw.tag_name);
    expect(projected.body).toBe(raw.body);
    expect(projected.published_at).toBe(raw.published_at);
    expect(projected.title).toBe(raw.name);
    expect(projected.draft).toBe(false);
    expect(projected.prerelease).toBe(raw.prerelease);
  });

  it("falls back to tag_name when name is empty", () => {
    const projected = projectRelease({
      tag_name: "v1.0.0",
      html_url: "https://github.com/o/r/releases/tag/v1.0.0",
      published_at: "2026-01-01T00:00:00Z",
      name: "",
      body: "",
      draft: false,
      prerelease: false,
    });
    expect(projected?.title).toBe("v1.0.0");
  });

  it("returns null on missing required fields", () => {
    expect(projectRelease({})).toBeNull();
    expect(projectRelease({ tag_name: "v1" })).toBeNull();
  });
});

describe("scrapeReleases", () => {
  it("returns the envelope with source/fetchedAt/params/items", async () => {
    const raw = await loadFixture();
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(raw));

    const result = await scrapeReleases(
      { owner: "neovim", repo: "neovim" },
      { fetch: fetchMock },
    );

    expect(result.source).toBe("github-releases");
    expect(result.params).toEqual({
      owner: "neovim",
      repo: "neovim",
      since: null,
      perPage: 30,
    });
    expect(typeof result.fetchedAt).toBe("string");
    expect(result.items.length).toBeGreaterThan(0);
    for (const item of result.items) {
      expect(item.id).toBeTypeOf("string");
      expect(item.url).toMatch(/^https:\/\//);
      expect(item.tag_name).toBeTypeOf("string");
      expect(item.published_at).toBeTypeOf("string");
    }
  });

  it("calls the API with the configured per_page", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    await scrapeReleases(
      { owner: "neovim", repo: "neovim", perPage: 5 },
      { fetch: fetchMock },
    );
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toBe(
      "https://api.github.com/repos/neovim/neovim/releases?per_page=5",
    );
  });

  it("includes Authorization when a token is provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
    await scrapeReleases(
      { owner: "o", repo: "r" },
      { fetch: fetchMock, token: "secret" },
    );
    const init = fetchMock.mock.calls[0][1] as { headers: Record<string, string> };
    expect(init.headers.Authorization).toBe("Bearer secret");
  });

  it("filters items older than the --since cutoff", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        {
          tag_name: "fresh",
          html_url: "https://x/fresh",
          published_at: "2026-05-09T00:00:00Z",
          name: "Fresh",
          body: "",
          draft: false,
          prerelease: false,
        },
        {
          tag_name: "old",
          html_url: "https://x/old",
          published_at: "2026-04-01T00:00:00Z",
          name: "Old",
          body: "",
          draft: false,
          prerelease: false,
        },
      ]),
    );

    const result = await scrapeReleases(
      { owner: "o", repo: "r", since: "2026-05-01T00:00:00Z" },
      { fetch: fetchMock },
    );
    expect(result.items.map((i) => i.id)).toEqual(["fresh"]);
  });

  it("throws a clear error on 401/403", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("Bad credentials", { status: 401 }),
    );
    await expect(
      scrapeReleases({ owner: "o", repo: "r" }, { fetch: fetchMock }),
    ).rejects.toThrow(/auth failed.*GITHUB_TOKEN/);
  });

  it("throws on non-array JSON", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ message: "x" }));
    await expect(
      scrapeReleases({ owner: "o", repo: "r" }, { fetch: fetchMock }),
    ).rejects.toThrow(/expected JSON array/);
  });
});

describe("defaultSinceIso", () => {
  it("returns 7 days before now in UTC ISO by default", () => {
    const now = new Date("2026-05-10T12:00:00.000Z");
    expect(defaultSinceIso(now)).toBe("2026-05-03T12:00:00.000Z");
  });

  it("respects custom days", () => {
    const now = new Date("2026-05-10T00:00:00.000Z");
    expect(defaultSinceIso(now, 30)).toBe("2026-04-10T00:00:00.000Z");
  });
});
