import { TypeSafeClient, TypeSafeDecisionModel } from "@effect/ai-typesafe";
import { Effect, Layer, Record, type Redacted } from "effect";
import { FetchHttpClient, Headers, HttpClient, HttpClientResponse } from "effect/unstable/http";

/** Reads and labels alike follow the latest model, owner's call; the label file records which one answered. */
export const MODEL = "jev-latest";

/** Further than this from 1 is not rounding but a fault, and stays visible. */
const ROUNDING = 0.05;

type Probabilities = Readonly<Record<string, number>>;
type Answer = { readonly probabilities?: Probabilities };
type Answers = Readonly<Record<string, Answer>>;

const sumOf = (probabilities: Probabilities) => Object.values(probabilities).reduce((sum, p) => sum + p, 0);

const unit = (probabilities: Probabilities) => {
  const total = sumOf(probabilities);
  return total > 0 && Math.abs(total - 1) <= ROUNDING
    ? Record.map(probabilities, (p) => p / total)
    : probabilities;
};

const isAnswers = (value: unknown): value is Answers => typeof value === "object" && value !== null;
const hasAnswers = (body: unknown): body is { readonly answers: Answers } =>
  typeof body === "object" && body !== null && "answers" in body && isAnswers(body.answers);

export const drift = (body: unknown): number =>
  hasAnswers(body)
    ? Math.max(
        0,
        ...Object.values(body.answers).map((answer) =>
          answer.probabilities === undefined ? 0 : Math.abs(sumOf(answer.probabilities) - 1),
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
  if (!hasAnswers(body)) return body;
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
    Effect.gen(function* () {
      const incoming = yield* response;
      const body = yield* incoming.json;
      const drifted = drift(body);
      if (drifted > EXPECTED_DRIFT) yield* Effect.logDebug(`jev distribution drift ${drifted.toFixed(3)}`);
      return HttpClientResponse.fromWeb(
        incoming.request,
        new Response(JSON.stringify(renormalize(body)), {
          status: incoming.status,
          // the body was re-encoded, so what described the old one must not travel with it
          headers: Headers.removeMany(incoming.headers, ["content-length", "content-encoding"]),
        }),
      );
    }),
  );

/** Without an `apiKey`, `TYPESAFE_API_KEY` from the environment; the data jobs pass theirs as a constant. */
export const layer = (options: { readonly model: string; readonly apiKey?: Redacted.Redacted<string> }) =>
  TypeSafeDecisionModel.layer({ model: options.model }).pipe(
    Layer.provide(
      options.apiKey === undefined
        ? TypeSafeClient.layerConfig({ transformClient: renormalized })
        : TypeSafeClient.layer({ apiKey: options.apiKey, transformClient: renormalized }),
    ),
    Layer.provide(FetchHttpClient.layer),
  );
