import { Record, Schema } from "effect";
import { COMPANY } from "./Company.ts";
import { Subject } from "./Subject.ts";
import { AXES, COUNTRIES, DECADES, GENRES, ORDERING_IDS, STUDIOS, WANTS_IDS } from "./Taste.ts";

/** The read's wire contract, decoded at both ends: what the page sends, what the reader answers, what the cache holds. */

export const ReadRequest = Schema.Struct({
  said: Schema.String.check(Schema.isMaxLength(4000)),
  company: Schema.NullOr(Schema.Literals(COMPANY)),
});
export type ReadRequest = typeof ReadRequest.Type;

export const AxisRead = Schema.Struct({
  probabilities: Schema.Array(Schema.Number),
  confidence: Schema.Number,
  relevance: Schema.Number,
});
export type AxisRead = typeof AxisRead.Type;

export const PersonRead = Schema.Struct({
  axes: Schema.Struct(Record.map(AXES, () => AxisRead)),
  runtime: AxisRead,
  subject: Subject,
  country: Schema.NullOr(Schema.Literals(COUNTRIES)),
  studio: Schema.NullOr(Schema.Literals(STUDIOS)),
  genres: Schema.Array(Schema.Literals(GENRES)),
  genreNamed: Schema.Boolean,
  wantsSimilar: Schema.Boolean,
  wants: Schema.Literals(WANTS_IDS),
  ordering: Schema.Literals(ORDERING_IDS),
  decade: Schema.Literals([...DECADES, "none"]),
  childrenWatching: Schema.Boolean,
});
export type PersonRead = typeof PersonRead.Type;

/** A failed read is `null`, not an error: the page reads the status; `error` is for a human reading a 4xx. */
export const ReadResponse = Schema.Struct({
  read: Schema.NullOr(PersonRead),
  error: Schema.optional(Schema.Literals(["rate_limited", "bad_request"])),
});
export type ReadResponse = typeof ReadResponse.Type;

/** One row of `src/data/reads.cache.json`, the file the golden and the offline suite run on. */
export const Cached = Schema.Struct({ ...ReadRequest.fields, read: PersonRead });
export type Cached = typeof Cached.Type;
