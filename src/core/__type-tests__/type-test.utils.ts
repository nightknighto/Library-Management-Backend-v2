/**
 * Compile-only helpers for framework inference tests.
 * These types are intentionally zero-runtime and validated by `tsc`.
 */
export type IsAny<T> = 0 extends (1 & T) ? true : false;

export type Extends<A, B> = [A] extends [B] ? true : false;

export type Equal<A, B> =
    (<T>() => T extends A ? 1 : 2) extends
    (<T>() => T extends B ? 1 : 2)
    ? (<T>() => T extends B ? 1 : 2) extends
    (<T>() => T extends A ? 1 : 2)
    ? true
    : false
    : false;

export type Not<T extends boolean> = T extends true ? false : true;

export type Expect<T extends true> = T;

export type ExpectFalse<T extends false> = T;
