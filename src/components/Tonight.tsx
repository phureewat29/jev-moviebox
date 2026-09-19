"use client";

import { useMemo, useRef, useState } from "react";
import { Ask } from "@/components/Ask";
import { Mark } from "@/components/Mark";
import { Shelf } from "@/components/Shelf";
import type { FilmCard } from "@/core/Film";
import type { Labels } from "@/core/Labels";
import { rank, shortlist, type PersonRead } from "@/core/Rank";
import type { Company } from "@/core/Company";
import labelsFile from "@/data/labels.json";

const labels = new Map((labelsFile as unknown as Labels).films.map((row) => [row.id, row]));

/**
 * How small the lockup goes once the shelf is on screen, and how tall it is laid out.
 *
 * The lockup is laid out at its *full* size and scaled down, never up. Scaling up rasterizes
 * the text at the small size and stretches the bitmap, which came out visibly soft; scaling a
 * full-size raster down stays sharp. Both are plain numbers because the animation is a
 * transform, so the layout never changes and nothing has to be measured at runtime.
 */
const SHELF_SCALE = 0.6;
/** Measured: the box at the wordmark's width (242:262), a 0.55em gap, and one 20px line. */
const LOCKUP_HEIGHT = 163;

/**
 * Three states, not one nullable read. "Never asked", "asked and the shelf had nothing", and
 * "asked and it broke" are different things, and collapsing them is how the shelf ended up
 * claiming it had searched when no answer ever arrived.
 */
type Result =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; read: PersonRead }
  | { status: "failed" };

export function Tonight({ films }: { films: readonly FilmCard[] }) {
  const [said, setSaid] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [result, setResult] = useState<Result>({ status: "idle" });
  /**
   * Nothing is on the shelf until someone asks, the way a search page shows no results until
   * you search. It flips on the first press and never flips back, so the box rises once.
   */
  const [asked, setAsked] = useState(false);
  /**
   * Every request carries a number and only the newest may paint. The button disables while a
   * read is in flight, but Enter bypassed it entirely and three quick presses fired three
   * reads — whichever landed last won, which is not the one that was asked last.
   */
  const issued = useRef(0);

  const pending = result.status === "loading";

  const rows = useMemo(
    () =>
      result.status === "ok" ? shortlist(rank({ person: result.read, films, labels })) : [],
    [result, films],
  );

  const recommend = async () => {
    if (pending || said.trim() === "") return;
    const mine = (issued.current += 1);
    setAsked(true);
    setResult({ status: "loading" });
    try {
      const response = await fetch("/api/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ said, company }),
      });
      const body = (await response.json()) as { read: PersonRead | null };
      if (mine !== issued.current) return;
      setResult(body.read === null ? { status: "failed" } : { status: "ok", read: body.read });
    } catch {
      if (mine !== issued.current) return;
      setResult({ status: "failed" });
    }
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 sm:pt-14">
        {/**
         * Everything here moves with `transform` and nothing with layout. Padding, font-size
         * and height all animate by re-running layout on every frame, and on this page that
         * meant relaying out the header, the search box and a grid of twelve posters sixty
         * times a second — which is the jitter. A transform is composited and touches none of it.
         */}
        <div
          className="transition-transform duration-500 ease-out will-change-transform motion-reduce:transition-none"
          style={{ transform: asked ? "translateY(0)" : "translateY(calc(20vh - 2rem))" }}
        >
          <header className="flex flex-col items-center">
            {/**
             * Scaled down once the shelf is on screen. Doing this with font-size re-shaped the
             * text on every frame and made the letters jitter against each other as they
             * re-fitted; a scale is composited and touches no layout at all.
             */}
            <div
              className="origin-top transition-transform duration-500 ease-out will-change-transform motion-reduce:transition-none"
              style={{ transform: `scale(${asked ? SHELF_SCALE : 1})` }}
            >
              {/**
               * The wordmark is real HTML text, so it keeps the display face and the wide
               * letter-spacing that make it read as a marquee; an svg `textLength` squeezes the
               * glyphs together to hit a width and throws exactly that away. The mark then takes
               * `w-full` of a box the text sized, so the two match by construction.
               */}
              <div className="flex w-fit flex-col items-center gap-[0.55em] text-xl">
                <Mark />
                {/**
                 * The negative right margin cancels the letter-space `.marquee` adds after the
                 * final F. That space is margin, not content, and leaving it in made the mark a
                 * third of a character wider than the word it sits over.
                 */}
                <span className="marquee -mr-[0.36em] text-[1em] leading-none text-ink">
                  MOVIE BOX
                </span>
              </div>
            </div>
          </header>

          {/**
           * Everything below the lockup rises by exactly the height the lockup gives up when it
           * scales down, so the two move as one piece and no gap opens between them.
           */}
          <div
            className="transition-transform duration-500 ease-out will-change-transform motion-reduce:transition-none"
            style={{
              transform: `translateY(${asked ? -LOCKUP_HEIGHT * (1 - SHELF_SCALE) : 0}px)`,
            }}
          >
            {/* the hairline under a cinema sign */}
            <div className="mx-auto mt-4 mb-9 h-px w-28 bg-gradient-to-r from-transparent via-edge to-transparent sm:mb-11" />

            <Ask
              said={said}
              company={company}
              pending={pending}
              onSaid={setSaid}
              onCompany={setCompany}
              onSubmit={() => void recommend()}
            />

            <p aria-live="polite" className="pt-4 text-center text-xs text-ink-faint">
              {result.status === "failed" ? "couldn’t read that just now." : null}
            </p>

            {asked ? (
              <div className="animate-[fade-up_600ms_ease-out] motion-reduce:animate-none">
                {/**
                 * A failed read shows nothing at all rather than the last query's shelf, which
                 * is what made stale results look like the model had invented them.
                 */}
                <Shelf
                  rows={rows}
                  ranked={result.status === "ok"}
                  pending={pending}
                  failed={result.status === "failed"}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
