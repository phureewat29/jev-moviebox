"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { posterUrl } from "@/core/Film";
import type { Ranked } from "@/core/Rank";

/** One geometry for waiting, empty and full, so swapping states moves nothing around the shelf. */
const GRID = "grid grid-cols-2 gap-x-4 gap-y-8 pt-12 pb-24 sm:grid-cols-3 sm:pt-16 lg:grid-cols-4";

const minutes = (runtime: number) =>
  runtime >= 60 ? `${Math.floor(runtime / 60)}h ${runtime % 60}m` : `${runtime}m`;

export function Shelf({ rows, pending }: { rows: readonly Ranked[]; pending: boolean }) {
  if (pending) {
    return (
      <section className={GRID}>
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <div className="sleeve relative aspect-[2/3] overflow-hidden rounded-sm ring-1 ring-edge/60" />
            <div className="h-3.5 w-3/4 rounded-sm bg-edge/50" />
          </div>
        ))}
      </section>
    );
  }

  if (rows.length === 0) {
    return (
      <section className={`${GRID} text-center`}>
        <p className="col-span-full text-base text-ink-dim">nothing in the box fits that.</p>
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

function Tile({ row: { film }, place }: { row: Ranked; place: number }) {
  const [arrived, setArrived] = useState(false);

  /** A cached poster can be `complete` before `onLoad` attaches; the ref catches that case. */
  const settle = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setArrived(true);
  }, []);

  return (
    <article className="flex flex-col gap-2.5">
      <div className="relative aspect-[2/3] overflow-hidden rounded-sm bg-screen-raised ring-1 ring-edge/60">
        {/** Under the poster, not in place of it: an opaque poster hides it without being told to. */}
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
