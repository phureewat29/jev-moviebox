import { Effect, Layer, Record } from "effect";
import { DecisionModel, type Decision } from "effect/unstable/ai";
import { describe, expect, it } from "vitest";
import { makeReader } from "@/server/read";

/** A model that answers every decision by its kind alone, so a test decides what Jev said. */
const canned = (answer: (decision: Decision.Any, key: string) => DecisionModel.ProviderAnswer) =>
  Layer.effect(
    DecisionModel.DecisionModel,
    DecisionModel.make({
      decide: ({ decisions }) =>
        Effect.succeed({
          answers: Record.map(decisions, answer),
          usage: { inputTokens: undefined, outputTokens: undefined },
        }),
    }),
  );

const uniform = (labels: readonly string[]) =>
  Object.fromEntries(labels.map((label) => [label, 1 / labels.length]));

/** Nothing said: every Choice lands on `none` where it can, every rating is flat, every noul is 0. */
const silence = (decision: Decision.Any): DecisionModel.ProviderAnswer => {
  if (decision._tag === "Rate") {
    return { _tag: "Rate", rating: 1.5, probabilities: uniform(decision.criteria), confidence: 0 };
  }
  if (decision._tag === "Probability") return { _tag: "Probability", probability: 0 };
  const labels = Object.keys(decision.criteria);
  const none = labels.find((label) => label === "none" || label === "either") ?? labels[0];
  return {
    _tag: "Classify",
    label: none,
    probabilities: Object.fromEntries(labels.map((label) => [label, label === none ? 1 : 0])),
    confidence: 1,
  };
};

const read = makeReader([
  { id: "tt1", kind: "movie", title: "One", year: 2001, plot: "First." },
  { id: "tt2", kind: "series", title: "Two", year: 2002, plot: "Second." },
]);

describe("reading a person through a DecisionModel", () => {
  it("reads silence as no constraint at all", async () => {
    const person = await Effect.runPromise(
      read({ said: "…", company: null }).pipe(Effect.provide(canned(silence))),
    );
    expect(person.wants).toBe("either");
    expect(person.country).toBeNull();
    expect(person.genres).toEqual([]);
    expect(person.genreNamed).toBe(false);
    expect(person.wantsSimilar).toBe(false);
    expect(person.ordering).toBe("none");
    expect(person.decade).toBe("none");
    expect(person.childrenWatching).toBe(false);
    expect(person.subject.weight).toBe(0);
    for (const axis of Object.values(person.axes)) {
      expect(axis.probabilities).toHaveLength(4);
      expect(axis.relevance).toBe(0);
    }
    expect(person.runtime.probabilities).toHaveLength(4);
  });

  it("reads a rate answer in level order, whatever order the provider keyed it", async () => {
    const skewed = (decision: Decision.Any, key: string): DecisionModel.ProviderAnswer =>
      key === "runtime" && decision._tag === "Rate"
        ? {
            _tag: "Rate",
            rating: 3,
            confidence: 1,
            // keyed last level first: the read must still come back in RUNTIME_LEVELS order
            probabilities: Object.fromEntries(
              [...decision.criteria].reverse().map((level, i) => [level, i === 0 ? 0.7 : 0.1]),
            ),
          }
        : silence(decision);
    const person = await Effect.runPromise(
      read({ said: "…", company: null }).pipe(Effect.provide(canned(skewed))),
    );
    expect(person.runtime.probabilities).toEqual([0.1, 0.1, 0.1, 0.7]);
  });

  it("falls back when a classify answer is not confident enough", async () => {
    const hesitant = (decision: Decision.Any, key: string): DecisionModel.ProviderAnswer =>
      key === "wants" && decision._tag === "Classify"
        ? { _tag: "Classify", label: "movie", confidence: 0.3, probabilities: { movie: 0.4, series: 0.3, either: 0.3 } }
        : silence(decision);
    const person = await Effect.runPromise(
      read({ said: "a film", company: null }).pipe(Effect.provide(canned(hesitant))),
    );
    expect(person.wants).toBe("either");
  });

  it("lets a hand-picked audience decide, in both directions", async () => {
    const kids = await Effect.runPromise(
      read({ said: "…", company: "kids" }).pipe(Effect.provide(canned(silence))),
    );
    expect(kids.childrenWatching).toBe(true);
    const speaksOfChildren = (decision: Decision.Any, key: string) =>
      key === "children_watching"
        ? ({ _tag: "Probability", probability: 0.95 } as const)
        : silence(decision);
    const solo = await Effect.runPromise(
      read({ said: "the kids are up", company: "solo" }).pipe(Effect.provide(canned(speaksOfChildren))),
    );
    expect(solo.childrenWatching).toBe(false);
    const nobodySaid = await Effect.runPromise(
      read({ said: "the kids are up", company: null }).pipe(Effect.provide(canned(speaksOfChildren))),
    );
    expect(nobodySaid.childrenWatching).toBe(true);
  });

  it("keeps a stated genre and the fact that it was stated", async () => {
    const western = (decision: Decision.Any, key: string) =>
      key === "genre_Western" || key === "genre_named"
        ? ({ _tag: "Probability", probability: 0.9 } as const)
        : silence(decision);
    const person = await Effect.runPromise(
      read({ said: "a western", company: null }).pipe(Effect.provide(canned(western))),
    );
    expect(person.genres).toEqual(["Western"]);
    expect(person.genreNamed).toBe(true);
  });
});
