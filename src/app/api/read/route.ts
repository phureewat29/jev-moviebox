import { Result, Schema } from "effect";
import type { NextRequest } from "next/server";
import { Catalog } from "@/core/Film";
import { allow } from "@/server/RateLimiter";
import { makeReader, ReadRequest, readOrNull } from "@/server/read";
import { runtime } from "@/server/runtime";
import catalog from "@/data/catalog.json";

const callerOf = (request: NextRequest) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";

/** Decoded once at module load, which also narrows `kind` to the literal union. */
const read = makeReader(Schema.decodeUnknownSync(Catalog)(catalog));

/**
 * A failed read answers 200 with `{ read: null }`: the page shows an empty shelf, not an error.
 * That covers a failure to build the runtime too — a missing key is logged and answered the
 * same way, never a 500 per request. It is logged with `console` on purpose: when the runtime
 * itself failed to build there is no Effect logger to log into.
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
  const parsed = Schema.decodeUnknownResult(ReadRequest)(body);
  if (Result.isFailure(parsed)) {
    return Response.json({ read: null, error: "bad_request" }, { status: 400 });
  }
  const person = await runtime.runPromise(readOrNull(read, parsed.success)).catch((error: unknown) => {
    console.error(error);
    return null;
  });
  return Response.json({ read: person });
}
