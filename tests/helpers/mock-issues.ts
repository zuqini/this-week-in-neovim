import { afterEach, beforeEach, vi } from "vitest";
import type { IssueMeta } from "@/lib/issues";

export function withResetIssuesModule(): void {
  beforeEach(() => {
    vi.resetModules();
  });
  afterEach(() => {
    vi.doUnmock("@/lib/issues");
    vi.resetModules();
  });
}

export function withMockedIssues(issues: IssueMeta[]): void {
  vi.doMock("@/lib/issues", async () => {
    const real = await vi.importActual<typeof import("@/lib/issues")>(
      "@/lib/issues",
    );
    return { ...real, getAllIssues: () => issues };
  });
}

export async function typedImport<T>(specifier: string): Promise<T> {
  vi.resetModules();
  return (await import(specifier)) as T;
}
