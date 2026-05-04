export interface Memoized<T> {
  (): T;
  reset: () => void;
}

export function memoize<T>(
  fn: () => T,
  opts: { when: () => boolean },
): Memoized<T> {
  let cached: T | null = null;
  const memo = (() => {
    if (!opts.when()) return fn();
    if (cached === null) cached = fn();
    return cached;
  }) as Memoized<T>;
  memo.reset = () => {
    cached = null;
  };
  return memo;
}
