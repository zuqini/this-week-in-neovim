import process from "node:process";

export interface Captured<T> {
  value: T;
  stdout: string;
  stderr: string;
}

export class CaptureError extends Error {
  constructor(
    cause: unknown,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = "CaptureError";
  }
}

type Write = typeof process.stdout.write;

export async function captureOutput<T>(fn: () => Promise<T>): Promise<Captured<T>> {
  const captured = { stdout: "", stderr: "" };
  const originalOut = process.stdout.write;
  const originalErr = process.stderr.write;
  process.stdout.write = tee(process.stdout, originalOut, (s) => (captured.stdout += s));
  process.stderr.write = tee(process.stderr, originalErr, (s) => (captured.stderr += s));
  try {
    const value = await fn();
    return { value, ...captured };
  } catch (err) {
    throw new CaptureError(err, captured.stdout, captured.stderr);
  } finally {
    process.stdout.write = originalOut;
    process.stderr.write = originalErr;
  }
}

function tee(stream: NodeJS.WriteStream, original: Write, append: (s: string) => void): Write {
  return ((chunk: unknown, ...rest: unknown[]) => {
    append(chunk instanceof Uint8Array ? Buffer.from(chunk).toString("utf8") : String(chunk));
    return (original as (...args: unknown[]) => boolean).apply(stream, [chunk, ...rest]);
  }) as Write;
}
