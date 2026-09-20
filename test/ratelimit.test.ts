import { describe, expect, it } from "vitest";
import { callerOf, make } from "@/server/RateLimiter";

const at = (seconds: number) => 1_700_000_000_000 + seconds * 1000;

describe("the rate limiter", () => {
  it("lets a burst through and then stops it, with a retry-after in seconds", () => {
    const { allow } = make();
    for (let i = 0; i < 5; i += 1) expect(allow("burst-ip", at(0))).toEqual({ ok: true });
    const sixth = allow("burst-ip", at(1));
    expect(sixth.ok).toBe(false);
    if (!sixth.ok) expect(sixth.retryAfter).toBe(9);
  });

  it("opens the burst window again once it has passed", () => {
    const { allow } = make();
    for (let i = 0; i < 5; i += 1) allow("patient-ip", at(0));
    expect(allow("patient-ip", at(11)).ok).toBe(true);
  });

  it("does not let a refused press spend the other windows", () => {
    const { allow } = make();
    for (let i = 0; i < 5; i += 1) allow("greedy-ip", at(0));
    // fifteen refusals inside the burst window; none of them may touch the minute's allowance
    for (let i = 0; i < 15; i += 1) expect(allow("greedy-ip", at(1)).ok).toBe(false);
    // the burst reopens, and the minute still has fifteen of its twenty left
    for (let i = 0; i < 5; i += 1) expect(allow("greedy-ip", at(11 + i * 2)).ok).toBe(true);
  });

  it("caps a slow drip at the sustained limit even when no burst is tripped", () => {
    const { allow } = make();
    for (let i = 0; i < 20; i += 1) expect(allow("drip-ip", at(i * 2.5)).ok).toBe(true);
    expect(allow("drip-ip", at(52)).ok).toBe(false);
  });

  it("counts every caller against one ceiling", () => {
    const { allow } = make();
    const blockedAt = (start: number) => {
      for (let i = 0; i < 20_000; i += 1) {
        if (!allow(`crowd-${start}-${i}`, at(0)).ok) return i;
      }
      return -1;
    };
    // the first crowd spends the ceiling; a second crowd is refused from its first press
    expect(blockedAt(0)).toBeGreaterThan(0);
    expect(blockedAt(1)).toBe(0);
  });
});

describe("who the caller is", () => {
  it("takes the address the proxy wrote, preferring the one it sets itself", () => {
    expect(callerOf(new Headers({ "x-real-ip": "10.0.0.1", "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("10.0.0.1");
    expect(callerOf(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" }))).toBe("9.9.9.9");
    expect(callerOf(new Headers())).toBe("local");
  });
});
