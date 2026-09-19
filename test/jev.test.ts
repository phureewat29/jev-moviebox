import { AuthenticationError, TypeSafeClient, noul } from "@typesafe-ai/sdk";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { Jev, JevError } from "@/core/Jev";
import * as TypeSafe from "@/core/providers/TypeSafe";
import { canned } from "./helpers";

const askWarm = Effect.gen(function* () {
  const jev = yield* Jev;
  const { answers } = yield* jev.ask({
    state: "Long day. I want something warm.",
    questions: { warm: noul("Does this person want something warm tonight?") },
  });
  return answers.warm.noul;
});

describe("Jev", () => {
  it("threads typed answers through the service", async () => {
    const warm = await Effect.runPromise(
      askWarm.pipe(Effect.provide(canned({ warm: { type: "noul", noul: 0.92 } }))),
    );
    expect(warm).toBe(0.92);
  });

  it("wraps an API failure in JevError", async () => {
    const client = new TypeSafeClient({
      apiKey: "test",
      retry: { maxRetries: 0 },
      fetch: async () =>
        new Response('{"error":"bad key"}', {
          status: 401,
          headers: { "content-type": "application/json" },
        }),
    });
    const error = await Effect.runPromise(
      askWarm.pipe(Effect.provide(TypeSafe.layer(client)), Effect.flip),
    );
    expect(error).toBeInstanceOf(JevError);
    expect(error.cause).toBeInstanceOf(AuthenticationError);
  });
});
