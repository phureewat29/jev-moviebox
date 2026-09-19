import type { Questions, SystemOneResult } from "@typesafe-ai/sdk";
import { Effect, Layer } from "effect";
import { Jev } from "@/core/Jev";

/**
 * A Jev that gives every request the same fixed answers. The cast is the one
 * place a test decides what Jev saw; pass answers shaped like the questions asked.
 */
export const canned = (answers: SystemOneResult<Questions>["answers"]) =>
  Layer.succeed(
    Jev,
    Jev.of({
      ask: () =>
        Effect.succeed({
          model: "canned",
          answers: answers as never,
          usage: { input_tokens: 0, output_tokens: 0 },
        }),
    }),
  );
