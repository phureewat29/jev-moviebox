import { describe, expect, it } from "vitest";
import { draw, drawHand, EMPTY_DECK, type Deck } from "@/core/Deck";
import { SUGGESTIONS } from "@/core/Suggestions";

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

  it("keeps what just went by to the back of a fresh deal", () => {
    // seven cards: the last three shown cannot return within the next four draws, cycle after cycle
    const last = new Map<string, number>();
    let deck = EMPTY_DECK;
    let gap = Infinity;
    for (let t = 0; t < items.length * 20; t += 1) {
      deck = draw(deck, items, Math.random);
      const said = deck.shown?.said ?? "";
      const seen = last.get(said);
      if (seen !== undefined) gap = Math.min(gap, t - seen);
      last.set(said, t);
    }
    expect(gap).toBeGreaterThan(Math.floor(items.length / 2));
  });

  it("is empty when there is nothing to deal", () => {
    expect(draw(EMPTY_DECK, [], Math.random)).toEqual(EMPTY_DECK);
  });
});

describe("a hand", () => {
  it("deals as many different cards as it is asked for", () => {
    const hand = drawHand(SUGGESTIONS, 3);
    expect(hand).toHaveLength(3);
    expect(new Set(hand.map((card) => card.said)).size).toBe(3);
  });

  it("deals what there is when the hand is larger than the deck", () => {
    expect(drawHand(SUGGESTIONS.slice(0, 2), 3)).toHaveLength(2);
  });

  it("deals the same hand for the same random", () => {
    const fixed = () => 0.5;
    expect(drawHand(SUGGESTIONS, 3, fixed)).toEqual(drawHand(SUGGESTIONS, 3, fixed));
  });
});
