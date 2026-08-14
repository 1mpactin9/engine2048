import { describe, it, expect } from "vitest";
import { SecureRng, createRngSeed } from "../src/core/rng";

describe("createRngSeed", () => {
  it("returns an array of exactly 8 numbers", () => {
    const seed = createRngSeed();
    expect(Array.isArray(seed)).toBe(true);
    expect(seed.length).toBe(8);
  });

  it("each number is in u32 range [0, 2^32)", () => {
    for (let i = 0; i < 20; i++) {
      const seed = createRngSeed();
      for (const v of seed) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(2 ** 32);
        expect(Number.isInteger(v)).toBe(true);
      }
    }
  });
});

describe("SecureRng determinism", () => {
  it("same seed produces identical sequence", () => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = new SecureRng(seed, 0);
    const b = new SecureRng(seed, 0);
    for (let i = 0; i < 50; i++) expect(a.next()).toBe(b.next());
  });

  it("different seeds produce different first values", () => {
    const a = new SecureRng([1, 2, 3, 4, 5, 6, 7, 8], 0);
    const b = new SecureRng([8, 7, 6, 5, 4, 3, 2, 1], 0);
    expect(a.next()).not.toBe(b.next());
  });
});

describe("SecureRng calls tracking and resume", () => {
  it("calls property advances with each next()", () => {
    const gen = new SecureRng([1, 2, 3, 4, 5, 6, 7, 8], 0);
    expect(gen.calls).toBe(0);
    gen.next();
    gen.next();
    expect(gen.calls).toBe(2);
  });

  it("resumes from saved calls position deterministically", () => {
    const seed = [1, 2, 3, 4, 5, 6, 7, 8];
    const gen1 = new SecureRng(seed, 0);
    for (let i = 0; i < 10; i++) gen1.next();
    const saved = gen1.calls;
    const gen2 = new SecureRng(seed, saved);
    expect(gen2.next()).toBe(gen1.next());
  });
});

describe("SecureRng stream position", () => {
  it("values at different positions are not equal", () => {
    const gen = new SecureRng(
      [
        0xdeadc0de, 0xbeefcafe, 0x12345678, 0x9abcdef0, 0xfedcba98, 0x76543210,
        0xdeadbeef, 0xcafebabe,
      ],
      0,
    );
    const before: number[] = [];
    for (let i = 0; i < 16; i++) before.push(gen.next());
    const afterFirst = gen.next();
    expect(afterFirst).not.toBe(before[0]);
  });

  it("produces the same value at the same offset across two positions", () => {
    const seed = [42, 42, 42, 42, 42, 42, 42, 42];
    const gen1 = new SecureRng(seed, 0);
    for (let i = 0; i < 16; i++) gen1.next();
    const a = gen1.next();
    const gen2 = new SecureRng(seed, 16);
    const b = gen2.next();
    expect(a).toBe(b);
  });
});

describe("SecureRng value range", () => {
  it("next() returns value in [0, 1)", () => {
    const gen = new SecureRng([0x12345678, 0, 0, 0, 0, 0, 0, 0], 0);
    for (let i = 0; i < 200; i++) {
      const v = gen.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
