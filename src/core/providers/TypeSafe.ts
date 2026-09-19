import { TypeSafeClient, type Questions, type SystemOneRequest } from "@typesafe-ai/sdk";
import { Config, Effect, Layer, Redacted } from "effect";
import { Jev, JevError } from "../Jev.ts";

export const make = (client: TypeSafeClient) =>
  Jev.of({
    ask: <const Q extends Questions>(request: SystemOneRequest<Q>) =>
      Effect.tryPromise({
        try: (signal) => client.systemOne(request, { signal }),
        catch: (cause) => new JevError({ cause }),
      }).pipe(Effect.withSpan("Jev.ask")),
  });

export const layer = (client: TypeSafeClient) => Layer.succeed(Jev, make(client));

const config = Config.all({
  apiKey: Config.redacted("TYPESAFE_API_KEY"),
  model: Config.string("TYPESAFE_MODEL").pipe(Config.withDefault("jev-latest")),
  timeoutMs: Config.integer("TYPESAFE_TIMEOUT_MS").pipe(Config.withDefault(10_000)),
});

export const layerConfig = Layer.effect(
  Jev,
  Effect.map(config, ({ apiKey, model, timeoutMs }) =>
    make(
      new TypeSafeClient({
        apiKey: Redacted.value(apiKey),
        defaultModel: model,
        timeout: timeoutMs,
      }),
    ),
  ),
);
