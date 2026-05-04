export interface Memoized<T> {
  (): T;
  reset: () => void;
}

export function memoize<T>(
  fn: () => T,
  opts: { when: () => boolean },
): Memoized<T> {
  let cached: T;
  let hasValue = false;
  const memo = (() => {
    if (!opts.when()) return fn();
    if (!hasValue) {
      cached = fn();
      hasValue = true;
    }
    return cached;
  }) as Memoized<T>;
  memo.reset = () => {
    hasValue = false;
  };
  return memo;
}
