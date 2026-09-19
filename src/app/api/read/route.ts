import { Effect, Schema } from "effect";
import type { NextRequest } from "next/server";
import { allow } from "@/server/RateLimiter";
import { Catalog } from "@/core/Film";
import { makeReader, ReadRequest } from "@/server/read";
import catalog from "@/data/catalog.json";
import { runtime } from "@/server/runtime";

const callerOf = (request: NextRequest) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

/** Decoded once at module load, which also narrows `kind` to the literal union. */
const read = makeReader(Schema.decodeUnknownSync(Catalog)(catalog));

/**
 * A failed read answers 200 with `{ read: null }`, not an error status. The grid is useful
 * without Jev — it just stays in its current order — so a model outage is a quieter page, not
 * a broken one.
 */
export async function POST(request: NextRequest) {
  const limit = allow(callerOf(request));
  if (!limit.ok) {
    return Response.json(
      { read: null, error: "rate_limited" },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = Schema.decodeUnknownEither(ReadRequest)(body);
  if (parsed._tag === "Left") return Response.json({ read: null, error: "bad_request" }, { status: 400 });

  const started = Date.now();
  const person = await runtime.runPromise(
    read(parsed.right).pipe(
      Effect.timeoutTo({ duration: "12 seconds", onTimeout: () => null, onSuccess: (value) => value }),
      Effect.catchAll(() => Effect.succeed(null)),
    ),
  );
  return Response.json({ read: person, ms: Date.now() - started });
}
