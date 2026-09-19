import { Result, Schema } from "effect";
import type { NextRequest } from "next/server";
import { Catalog } from "@/core/Film";
import { allow, callerOf } from "@/server/RateLimiter";
import { makeReader, ReadRequest, readOrNull } from "@/server/read";
import { runtime } from "@/server/runtime";
import catalog from "@/data/catalog.json";

const read = makeReader(Schema.decodeUnknownSync(Catalog)(catalog));

/**
 * A failed read answers 200 with `{ read: null }`: an empty shelf, not an error — including a
 * runtime that failed to build, which is why that one is logged with `console`: there is no
 * Effect logger to log into yet.
 */
export async function POST(request: NextRequest) {
  const limit = allow(callerOf(request.headers));
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
