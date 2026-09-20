import type { Suggestion } from "./Suggestions.ts";

/** The deck the page deals suggestions from: no card comes up twice until every card has come up. */

export type Deck = { readonly shown: Suggestion | null; readonly left: readonly Suggestion[] };
export const EMPTY_DECK: Deck = { shown: null, left: [] };

/** Fisher-Yates; `random` is a parameter so a test can deal the same deck twice. */
const shuffled = <T,>(items: readonly T[], random: () => number): readonly T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** A fresh shuffle, cut so the first card up is never the one still on the table. */
const deal = (items: readonly Suggestion[], shown: Suggestion | null, random: () => number) => {
  const cards = shuffled(items, random);
  return cards.length > 1 && cards[0].said === shown?.said ? [...cards.slice(1), cards[0]] : cards;
};

/** Turns the next card; a spent deck is dealt afresh. */
export const draw = (deck: Deck, items: readonly Suggestion[], random: () => number = Math.random): Deck => {
  const [card, ...left] = deck.left.length > 0 ? deck.left : deal(items, deck.shown, random);
  return { shown: card ?? null, left };
};
