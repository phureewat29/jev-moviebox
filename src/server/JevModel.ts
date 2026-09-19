import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import { Effect, Layer, Record, type Redacted } from "effect";
import { FetchHttpClient, Headers, HttpClient, HttpClientResponse } from "effect/unstable/http";

/** The labels' model: relabelling is the only thing that may move it. */
export const PINNED_MODEL = "jev-1.13.0";
/** The reads follow the latest model, owner's call; a read from a newer model than the labels is accepted drift. */
export const READ_MODEL = "jev-latest";

/** Further than this from 1 is not rounding but a fault, and stays visible. */
const ROUNDING = 0.05;

const unit = (probabilities: Readonly<Record<string, number>>) => {
  const total = Object.values(probabilities).reduce((sum, p) => sum + p, 0);
  return total > 0 && Math.abs(total - 1) <= ROUNDING
    ? Record.map(probabilities, (p) => p / total)
    : probabilities;
};

type Answer = { readonly probabilities?: Readonly<Record<string, number>> };
const isAnswers = (value: unknown): value is Readonly<Record<string, Answer>> =>
  typeof value === "object" && value !== null;

export const drift = (body: unknown): number =>
  typeof body === "object" && body !== null && "answers" in body && isAnswers(body.answers)
    ? Math.max(
        0,
        ...Object.values(body.answers).map((answer) =>
          answer.probabilities === undefined
            ? 0
            : Math.abs(Object.values(answer.probabilities).reduce((sum, p) => sum + p, 0) - 1),
        ),
      )
    : 0;

/** Measured on 4-level answers; a wider drift is worth seeing before it reaches `ROUNDING`. */
const EXPECTED_DRIFT = 0.01;

/**
 * Jev rounds, so a distribution arrives summing to 0.99 or 1.00, and `DecisionModel` refuses
 * anything further than 1e-6 from 1. Renormalizing on the wire keeps the official provider
 * untouched; a total that is not rounding-sized passes through and fails as it should.
 */
export const renormalize = (body: unknown): unknown => {
  if (typeof body !== "object" || body === null || !("answers" in body) || !isAnswers(body.answers)) {
    return body;
  }
  return {
    ...body,
    answers: Record.map(body.answers, (answer) =>
      answer.probabilities === undefined
        ? answer
        : { ...answer, probabilities: unit(answer.probabilities) },
    ),
  };
};

/** The provider applies `filterStatusOk` first, so only a 2xx body is parsed here. */
const renormalized = (client: HttpClient.HttpClient): HttpClient.HttpClient =>
  HttpClient.transformResponse(client, (response) =>
    Effect.flatMap(response, (incoming) =>
      Effect.flatMap(incoming.json, (body) =>
        Effect.as(
          drift(body) > EXPECTED_DRIFT
            ? Effect.logDebug(`jev distribution drift ${drift(body).toFixed(3)}`)
            : Effect.void,
          HttpClientResponse.fromWeb(
            incoming.request,
            new Response(JSON.stringify(renormalize(body)), {
              status: incoming.status,
              // the body was re-encoded, so what described the old one must not travel with it
              headers: Headers.removeMany(incoming.headers, ["content-length", "content-encoding"]),
            }),
          ),
        ),
      ),
    ),
  );

/** With an `apiKey` (the data jobs hold theirs as a constant); without one, `TYPESAFE_API_KEY` from the environment. */
export const layer = (options: { readonly model: string; readonly apiKey?: Redacted.Redacted<string> }) =>
  TypeSafeDecisionModel.layer({ model: options.model }).pipe(
    Layer.provide(
      options.apiKey === undefined
        ? TypeSafeClient.layerConfig({ transformClient: renormalized })
        : TypeSafeClient.layer({ apiKey: options.apiKey, transformClient: renormalized }),
    ),
    Layer.provide(FetchHttpClient.layer),
  );
