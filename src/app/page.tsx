import { Schema } from "effect";
import { Cards } from "@/core/Film";
import { Tonight } from "@/components/Tonight";
import cards from "@/data/films.json";

/**
 * The catalog is decoded once at build time and handed to the client, so the grid renders in
 * IMDb order before any JavaScript runs and before Jev has been asked anything.
 */
const films = Schema.decodeUnknownSync(Cards)(cards);

export default function Home() {
  return <Tonight films={films} />;
}
