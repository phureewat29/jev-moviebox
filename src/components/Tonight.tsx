"use client";

import { useMemo, useRef, useState } from "react";
import { Ask } from "@/components/Ask";
import { Mark } from "@/components/Mark";
import { Shelf } from "@/components/Shelf";
import type { Company } from "@/core/Company";
import type { FilmCard } from "@/core/Film";
import type { Suggestion } from "@/core/Suggestions";
import type { Labels } from "@/core/Labels";
import { rank, shortlist, type PersonRead } from "@/core/Rank";
import labelsFile from "@/data/labels.json";

const labels = new Map((labelsFile as unknown as Labels).films.map((row) => [row.id, row]));

/**
 * Everything here moves with `transform` and nothing with layout: animating padding or
 * font-size re-ran layout on the header, the search box and twelve posters every frame, which
 * was the jitter. The lockup is laid out at full size and scaled *down*; scaled up, its text is
 * rasterized small and stretched, and came out soft.
 */
const MOTION = "transition-transform duration-500 ease-out will-change-transform motion-reduce:transition-none";
const SHELF_SCALE = 0.6;
/** Measured: the box at the wordmark's width (242:262), a 0.55em gap, and one 20px line. */
const LOCKUP_HEIGHT = 163;
const LIFT = `translateY(${-LOCKUP_HEIGHT * (1 - SHELF_SCALE)}px)`;
const REST = "translateY(calc(20vh - 2rem))";

/** Null until the first press: a search page shows nothing until you search. */
type Result =
  | null
  | { status: "loading" }
  | { status: "ok"; read: PersonRead }
  | { status: "failed" }
  | { status: "throttled"; retryAfter: number };

const TROUBLE: Record<"failed" | "throttled", (retryAfter: number) => string> = {
  failed: () => "couldn’t read that just now.",
  throttled: (retryAfter) => `too many tries — try again in ${retryAfter}s.`,
};

export function Tonight({
  films,
  suggestions,
}: {
  films: readonly FilmCard[];
  suggestions: readonly Suggestion[];
}) {
  const [said, setSaid] = useState("");
  const [company, setCompany] = useState<Company | null>(null);
  const [result, setResult] = useState<Result>(null);
  /**
   * The newest press supersedes the one before it: the old request is aborted, and only the
   * newest may set state. One mechanism, so a slow answer can never paint over a newer one.
   */
  const inFlight = useRef<AbortController | null>(null);

  const asked = result !== null;
  const pending = result?.status === "loading";
  const rows = useMemo(
    () => (result?.status === "ok" ? shortlist(rank({ person: result.read, films, labels })) : []),
    [result, films],
  );

  const recommend = async () => {
    if (said.trim() === "") return;
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    setResult({ status: "loading" });
    try {
      const response = await fetch("/api/read", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ said, company }),
        signal: controller.signal,
      });
      if (response.status === 429) {
        setResult({ status: "throttled", retryAfter: Number(response.headers.get("retry-after") ?? 10) });
        return;
      }
      const body = (await response.json()) as { read: PersonRead | null };
      setResult(body.read === null ? { status: "failed" } : { status: "ok", read: body.read });
    } catch {
      if (!controller.signal.aborted) setResult({ status: "failed" });
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <div className="mx-auto w-full max-w-6xl px-4 pt-8 sm:px-6 sm:pt-14">
        <div className={MOTION} style={{ transform: asked ? "translateY(0)" : REST }}>
          <header className="flex flex-col items-center">
            <div className={`origin-top ${MOTION}`} style={{ transform: `scale(${asked ? SHELF_SCALE : 1})` }}>
              {/* the wordmark is real text so it keeps its tracking; the mark takes the width the text sets */}
              <div className="flex w-fit flex-col items-center gap-[0.55em] text-xl">
                <Mark />
                {/* `.marquee` adds a letter-space after the final X; that is margin, not content */}
                <span className="marquee -mr-[0.36em] text-[1em] leading-none text-ink">MOVIE BOX</span>
              </div>
            </div>
          </header>

          {/* rises by exactly what the lockup gives up when it scales, so no gap opens */}
          <div className={MOTION} style={{ transform: asked ? LIFT : "translateY(0)" }}>
            <div className="mx-auto mt-4 mb-9 h-px w-28 bg-gradient-to-r from-transparent via-edge to-transparent sm:mb-11" />

            <Ask
              said={said}
              company={company}
              pending={pending}
              suggestions={suggestions}
              onSaid={setSaid}
              onCompany={setCompany}
              onSubmit={() => void recommend()}
            />

            <p aria-live="polite" className="pt-4 text-center text-xs text-ink-faint">
              {result?.status === "failed" ? TROUBLE.failed(0) : null}
              {result?.status === "throttled" ? TROUBLE.throttled(result.retryAfter) : null}
            </p>

            {/* trouble shows nothing at all, never the previous query's shelf */}
            {asked && result.status !== "failed" && result.status !== "throttled" ? (
              <div className="animate-[fade-up_600ms_ease-out] motion-reduce:animate-none">
                <Shelf rows={rows} pending={pending} />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
