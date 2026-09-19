import type { Questions, SystemOneRequest, SystemOneResult } from "@typesafe-ai/sdk";
import { Context, Effect, Schema } from "effect";

export class JevError extends Schema.TaggedError<JevError>()("JevError", {
  cause: Schema.Defect,
}) {}

/**
 * Jev answers typed questions about a piece of state. It labels; it never writes.
 * The live implementation is providers/TypeSafe.ts; tests provide a canned one.
 */
export class Jev extends Context.Tag("Jev")<
  Jev,
  {
    readonly ask: <const Q extends Questions>(
      request: SystemOneRequest<Q>,
    ) => Effect.Effect<SystemOneResult<Q>, JevError>;
  }
>() {}
