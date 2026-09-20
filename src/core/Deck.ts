import type { Suggestion } from "./Suggestions.ts";

/** The deck the page deals suggestions from: every card comes up once before any comes up again, and none comes back within half a cycle. */

export type Deck = {
  readonly shown: Suggestion | null;
  readonly left: readonly Suggestion[];
  /** The last half-cycle shown, so a fresh deal cannot open on what just went by. */
  readonly recent: readonly Suggestion[];
};
export const EMPTY_DECK: Deck = { shown: null, left: [], recent: [] };

const RECENT_SHARE = 0.5;

/** Fisher-Yates; `random` is a parameter so a test can deal the same deck twice. */
const shuffled = <T,>(items: readonly T[], random: () => number): readonly T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** A fresh shuffle with the cards seen most recently moved to the back. */
const deal = (items: readonly Suggestion[], recent: readonly Suggestion[], random: () => number) => {
  const seen = new Set(recent.map((card) => card.said));
  const cards = shuffled(items, random);
  return [...cards.filter((card) => !seen.has(card.said)), ...cards.filter((card) => seen.has(card.said))];
};

/** Turns the next card; a spent deck is dealt afresh. */
export const draw = (deck: Deck, items: readonly Suggestion[], random: () => number = Math.random): Deck => {
  const [card, ...left] = deck.left.length > 0 ? deck.left : deal(items, deck.recent, random);
  const shown = card ?? null;
  const keep = Math.floor(items.length * RECENT_SHARE);
  const recent = shown === null || keep === 0 ? [] : [...deck.recent, shown].slice(-keep);
  return { shown, left, recent };
};
