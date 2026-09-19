"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { posterUrl } from "@/core/Film";
import type { Ranked } from "@/core/Rank";

const PAGE = 30;

const minutes = (runtime: number) =>
  runtime >= 60 ? `${Math.floor(runtime / 60)}h ${runtime % 60}m` : `${runtime}m`;

/**
 * Browsing shows the whole shelf and grows as you scroll. A recommendation shows only what
 * cleared the bar, which is usually a handful, so the sentinel rarely comes into play.
 */
export function Shelf({
  rows,
  ranked,
  pending,
  failed,
}: {
  rows: readonly Ranked[];
  ranked: boolean;
  pending: boolean;
  failed: boolean;
}) {
  const [shown, setShown] = useState(PAGE);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => setShown(PAGE), [rows]);

  useEffect(() => {
    const node = sentinel.current;
    if (node === null || shown >= rows.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setShown((count) => count + PAGE);
      },
      { rootMargin: "600px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [shown, rows.length]);

  if (pending) {
    return (
      <section className="grid grid-cols-2 gap-x-4 gap-y-8 pt-10 pb-24 sm:grid-cols-3 sm:pt-14 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5">
            <div className="aspect-[2/3] animate-pulse rounded-sm bg-screen-raised motion-reduce:animate-none" />
            <div className="h-3.5 w-3/4 animate-pulse rounded-sm bg-screen-raised motion-reduce:animate-none" />
          </div>
        ))}
      </section>
    );
  }

  /** A read that never arrived is not an empty shelf, so it says nothing rather than lying. */
  if (failed) return null;

  if (ranked && rows.length === 0) {
    return (
      <section className="pt-20 pb-28 text-center">
        <p className="text-base text-ink-dim">nothing in the box fits that.</p>
      </section>
    );
  }

  return (
    <section className="pt-12 pb-24 sm:pt-16">
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {rows.slice(0, shown).map((row, index) => (
          <Tile key={row.film.id} row={row} place={index + 1} ranked={ranked} />
        ))}
      </div>
      <div ref={sentinel} aria-hidden className="h-px" />
    </section>
  );
}

function Tile({ row, place, ranked }: { row: Ranked; place: number; ranked: boolean }) {
  const { film } = row;
  return (
    <article className="flex flex-col gap-2.5">
      <div className="relative aspect-[2/3] overflow-hidden rounded-sm bg-screen-raised ring-1 ring-edge/60">
        <Image
          src={posterUrl(film.posterBase, place <= 8 ? 600 : 300)}
          alt=""
          fill
          sizes="(max-width: 640px) 46vw, (max-width: 1024px) 31vw, 23vw"
          className="object-cover"
          priority={place <= 4}
        />
        {ranked ? (
          <span className="numerals absolute top-0 left-0 bg-screen/85 px-2 py-0.5 text-sm text-marquee backdrop-blur-sm">
            {place}
          </span>
        ) : null}
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
