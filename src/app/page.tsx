import { Schema } from "effect";
import { Cards } from "@/core/Film";
import { Tonight } from "@/components/Tonight";
import cards from "@/data/films.json";

/** Decoded once at build time; the cards are what the browser ranks. */
const films = Schema.decodeUnknownSync(Cards)(cards);

export default function Home() {
  return <Tonight films={films} />;
}
