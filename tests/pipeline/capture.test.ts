import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureError, captureOutput } from "@/pipeline/src/capture";

describe("captureOutput", () => {
  let forwardedOut: string;
  let forwardedErr: string;

  beforeEach(() => {
    forwardedOut = "";
    forwardedErr = "";
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      forwardedOut += String(chunk);
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      forwardedErr += String(chunk);
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("captures both streams while still forwarding them", async () => {
    const result = await captureOutput(async () => {
      process.stdout.write("out 1\n");
      process.stderr.write("err 1\n");
      process.stdout.write(new TextEncoder().encode("out 2\n"));
      return 42;
    });

    expect(result).toEqual({ value: 42, stdout: "out 1\nout 2\n", stderr: "err 1\n" });
    expect(forwardedOut).toContain("out 1\n");
    expect(forwardedErr).toBe("err 1\n");
  });

  it("restores the original writers after the callback throws, keeping the partial output", async () => {
    const out = process.stdout.write;
    const err = process.stderr.write;
    const boom = new Error("boom");

    const thrown = await captureOutput(async () => {
      process.stdout.write("progress\n");
      process.stderr.write("partial\n");
      throw boom;
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(CaptureError);
    expect(thrown).toMatchObject({ message: "boom", cause: boom, stdout: "progress\n", stderr: "partial\n" });
    expect(process.stdout.write).toBe(out);
    expect(process.stderr.write).toBe(err);
    process.stderr.write("after\n");
    expect(forwardedErr).toBe("partial\nafter\n");
  });
});
