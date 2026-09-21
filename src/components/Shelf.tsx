"use client";

import { PackageOpen } from "lucide-react";
import Image from "next/image";
import { useCallback, useState } from "react";
import { drawHand } from "@/core/Deck";
import { posterUrl } from "@/core/Film";
import type { Ranked } from "@/core/Rank";
import { SUGGESTIONS, type Suggestion } from "@/core/Suggestions";

/** One geometry for waiting, empty and full, so swapping states moves nothing around the shelf. */
const GRID = "grid grid-cols-2 gap-x-4 gap-y-8 pt-12 pb-24 sm:grid-cols-3 sm:pt-16 lg:grid-cols-4";

const OFFERED = 3;

const minutes = (runtime: number) =>
  runtime >= 60 ? `${Math.floor(runtime / 60)}h ${runtime % 60}m` : `${runtime}m`;

export function Shelf({
  rows,
  pending,
  onTry,
}: {
  rows: readonly Ranked[];
  pending: boolean;
  onTry: (suggestion: Suggestion) => void;
}) {
  if (pending) {
    return (
      <section className={GRID}>
        <Sleeves still={false} />
      </section>
    );
  }

  // the same eight sleeves, gone still, so nothing below the shelf moves; the message sits in the first screen of them
  if (rows.length === 0) {
    return (
      <section className={`${GRID} relative`}>
        <Sleeves still />
        <Empty onTry={onTry} />
      </section>
    );
  }

  return (
    <section className={GRID}>
      {rows.map((row, index) => (
        <Tile key={row.film.id} row={row} place={index + 1} />
      ))}
    </section>
  );
}

/** A dead end still offers a way on: three lines to try, each one a whole press. */
function Empty({ onTry }: { onTry: (suggestion: Suggestion) => void }) {
  /**
   * Dealt once, at mount. The shelf appears only after a press, so the server never renders
   * this and a shuffle here cannot come out different on the client.
   */
  const [hand] = useState(() => drawHand(SUGGESTIONS, OFFERED));

  return (
    <div className="absolute inset-x-0 top-0 flex min-h-[60vh] items-center justify-center pt-12 sm:pt-16">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-sm bg-screen/85 px-6 py-8 text-center backdrop-blur-sm">
        <PackageOpen size={28} strokeWidth={1.5} className="text-ink-faint" aria-hidden />
        <p role="status" className="text-base text-balance text-ink-dim">
          nothing in the box fits that. try one of these:
        </p>
        <ul className="flex flex-col gap-3">
          {hand.map((suggestion) => (
            <li key={suggestion.said}>
              <button
                type="button"
                onClick={() => onTry(suggestion)}
                aria-label={`Try this instead: ${suggestion.said}`}
                className="text-sm leading-snug text-balance text-ink underline decoration-edge underline-offset-4 transition-colors hover:decoration-marquee sm:text-base"
              >
                &ldquo;{suggestion.said}&rdquo;
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The shelf while it waits and, gone still and dim, the shelf when nothing fits. */
function Sleeves({ still }: { still: boolean }) {
  return Array.from({ length: 8 }, (_, i) => (
    <div key={i} className={`flex flex-col gap-2.5 ${still ? "opacity-40" : ""}`}>
      <div
        className="sleeve relative aspect-[2/3] overflow-hidden rounded-sm ring-1 ring-edge/60"
        data-loaded={still || undefined}
      />
      <div className="h-3.5 w-3/4 rounded-sm bg-edge/50" />
    </div>
  ));
}

function Tile({ row: { film }, place }: { row: Ranked; place: number }) {
  const [arrived, setArrived] = useState(false);

  /** A cached poster can be `complete` before `onLoad` attaches; the ref catches that case. */
  const settle = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setArrived(true);
  }, []);

  return (
    <article className="flex flex-col gap-2.5">
      <div className="relative aspect-[2/3] overflow-hidden rounded-sm bg-screen-raised ring-1 ring-edge/60">
        {/* under the poster, not in place of it: an opaque poster hides it without being told to */}
        <div aria-hidden className="sleeve absolute inset-0" data-loaded={arrived || undefined} />
        <Image
          ref={settle}
          onLoad={() => setArrived(true)}
          src={posterUrl(film.posterBase, place <= 8 ? 600 : 300)}
          alt=""
          fill
          sizes="(max-width: 640px) 46vw, (max-width: 1024px) 31vw, 23vw"
          className={`object-cover transition-opacity duration-500 motion-reduce:transition-none ${
            arrived ? "opacity-100" : "opacity-0"
          }`}
          priority={place <= 4}
        />
        <span className="numerals absolute top-0 left-0 bg-screen/85 px-2 py-0.5 text-sm text-marquee backdrop-blur-sm">
          {place}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm leading-snug font-medium text-ink">{film.title}</h2>
        <p className="text-[11px] tracking-wide text-ink-faint tabular-nums">
          {film.year} · {minutes(film.runtime)}
        </p>
      </div>
    </article>
  );
}
