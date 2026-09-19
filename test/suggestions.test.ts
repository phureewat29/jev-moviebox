import { describe, expect, it } from "vitest";
import { COMPANY, SAID_LIMIT } from "@/core/Company";
import { draw, EMPTY_DECK, SUGGESTIONS, type Deck } from "@/core/Suggestions";

describe("the suggestions", () => {
  it("are short, distinct and well formed", () => {
    const seen = new Set<string>();
    for (const { said, company } of SUGGESTIONS) {
      expect(said.length, said).toBeGreaterThan(0);
      expect(said.length, said).toBeLessThanOrEqual(SAID_LIMIT);
      expect(seen.has(said.toLowerCase()), said).toBe(false);
      seen.add(said.toLowerCase());
      if (company !== null) expect(COMPANY).toContain(company);
    }
  });

  it("say who is watching about half the time", () => {
    const share = SUGGESTIONS.filter((s) => s.company !== null).length / SUGGESTIONS.length;
    expect(share).toBeGreaterThan(0.4);
    expect(share).toBeLessThan(0.6);
  });
});

describe("the deck", () => {
  const items = SUGGESTIONS.slice(0, 7);
  const turn = (deck: Deck, times: number, random: () => number) => {
    const shown: string[] = [];
    let current = deck;
    for (let i = 0; i < times; i += 1) {
      current = draw(current, items, random);
      shown.push(current.shown?.said ?? "");
    }
    return { shown, deck: current };
  };

  it("shows every card once before any repeats", () => {
    const { shown, deck } = turn(EMPTY_DECK, items.length, Math.random);
    expect(new Set(shown).size).toBe(items.length);
    expect(deck.left).toHaveLength(0);
  });

  it("never repeats the card on the table when it deals again", () => {
    for (let trial = 0; trial < 50; trial += 1) {
      const { shown } = turn(EMPTY_DECK, items.length + 1, Math.random);
      expect(shown[items.length]).not.toBe(shown[items.length - 1]);
    }
  });

  it("deals the same order for the same random", () => {
    const fixed = () => 0.5;
    expect(turn(EMPTY_DECK, items.length, fixed).shown).toEqual(turn(EMPTY_DECK, items.length, fixed).shown);
  });

  it("is empty when there is nothing to deal", () => {
    expect(draw(EMPTY_DECK, [], Math.random)).toEqual({ shown: null, left: [] });
  });
});
