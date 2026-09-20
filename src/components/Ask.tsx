"use client";

import { Baby, Heart, House, Play, Search, User, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { COMPANY, SAID_LIMIT, type Company } from "@/core/Company";
import { draw, EMPTY_DECK, type Deck } from "@/core/Deck";
import type { Suggestion } from "@/core/Suggestions";

/** Who is watching is the one thing the person knows and the model can only guess, so it is a control, not a question. */
const AUDIENCE: Record<Company, { label: string; Icon: typeof User; on: string; off: string }> = {
  solo: { label: "Just me", Icon: User, on: "bg-sky-400/10 text-sky-200/90 ring-sky-400/25", off: "text-sky-300/35" },
  couple: { label: "Two of us", Icon: Heart, on: "bg-rose-400/10 text-rose-200/90 ring-rose-400/25", off: "text-rose-300/35" },
  friends: { label: "Friends", Icon: Users, on: "bg-amber-400/10 text-amber-200/90 ring-amber-400/25", off: "text-amber-300/35" },
  family: { label: "Family", Icon: House, on: "bg-emerald-400/10 text-emerald-200/90 ring-emerald-400/25", off: "text-emerald-300/35" },
  kids: { label: "Kids too", Icon: Baby, on: "bg-violet-400/10 text-violet-200/90 ring-violet-400/25", off: "text-violet-300/35" },
};


/** A reel turning: it says what is loading, not just that something is. */
function Reel({ size }: { size: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden
      className="animate-spin [animation-duration:1.6s] motion-reduce:animate-none"
    >
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="6.6" r="1.9" fill="currentColor" />
      <circle cx="16.7" cy="14.7" r="1.9" fill="currentColor" />
      <circle cx="7.3" cy="14.7" r="1.9" fill="currentColor" />
    </svg>
  );
}

const ROTATE_MS = 4000;


function Rotating({
  suggestions,
  onPick,
}: {
  suggestions: readonly Suggestion[];
  onPick: (suggestion: Suggestion) => void;
}) {
  // dealt after mount: the server cannot draw the order the client would
  const [deck, setDeck] = useState<Deck>(EMPTY_DECK);

  useEffect(() => setDeck(draw(EMPTY_DECK, suggestions)), [suggestions]);
  useEffect(() => {
    const timer = setInterval(() => setDeck((current) => draw(current, suggestions)), ROTATE_MS);
    return () => clearInterval(timer);
  }, [suggestions]);

  const current = deck.shown;
  return (
    <button
      type="button"
      onClick={() => current !== null && onPick(current)}
      disabled={current === null}
      aria-label={current === null ? "Suggestions" : `Use this suggestion: ${current.said}`}
      className="flex h-9 items-center text-lg text-ink underline decoration-edge underline-offset-[7px] transition-colors hover:decoration-marquee sm:text-2xl"
    >
      {/* keyed on the text, so each suggestion remounts and fades in on its own */}
      <span key={current?.said} className="animate-[fade-in_400ms_ease-out] motion-reduce:animate-none">
        &ldquo;{current?.said ?? "\u00a0"}&rdquo;
      </span>
    </button>
  );
}

export function Ask({
  said,
  company,
  pending,
  suggestions,
  onSaid,
  onCompany,
  onSubmit,
}: {
  said: string;
  company: Company | null;
  pending: boolean;
  suggestions: readonly Suggestion[];
  onSaid: (value: string) => void;
  onCompany: (value: Company | null) => void;
  onSubmit: () => void;
}) {
  /** A suggestion is a whole preset: a line that names no audience clears the pill rather than keeping a stale one. */
  const pick = (suggestion: Suggestion) => {
    onSaid(suggestion.said);
    onCompany(suggestion.company);
  };

  return (
    <section className="mx-auto flex w-full max-w-3xl flex-col items-center">
      <h1 className="text-center text-sm font-normal text-balance text-ink-dim sm:text-base">
        How was your day, and what are you in the mood for?
      </h1>

      <div className="pt-2 pb-7">
        <Rotating suggestions={suggestions} onPick={pick} />
      </div>

      <div className="flex w-full items-center gap-3 rounded-full border border-edge bg-screen-raised py-1.5 pr-1.5 pl-5 transition-colors focus-within:border-marquee/50">
        <Search size={17} className="shrink-0 text-ink-faint" aria-hidden />
        <input
          /**
           * A bare text input with no type or name is what a password manager reads as a login
           * field, so it offers to fill it. `search` says what this is, and the ignore
           * attributes are what 1Password, LastPass and Bitwarden actually look for.
           */
          type="search"
          name="mood"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="sentences"
          enterKeyHint="search"
          data-1p-ignore
          data-lpignore="true"
          data-bwignore
          value={said}
          onChange={(event) => onSaid(event.target.value.slice(0, SAID_LIMIT))}
          onKeyDown={(event) => {
            // the button is disabled while a read is in flight; the keyboard must be too
            if (event.key === "Enter" && !pending) onSubmit();
          }}
          placeholder="Tell it how the day went…"
          aria-label="How was your day, and what are you in the mood for?"
          className="min-w-0 flex-1 appearance-none bg-transparent py-2 text-base text-ink outline-none placeholder:text-ink-faint [&::-webkit-search-cancel-button]:appearance-none"
        />
        <button
          type="button"
          onClick={onSubmit}
          disabled={pending || said.trim() === ""}
          aria-label={pending ? "Looking" : "Find something to watch"}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-marquee text-screen transition-opacity hover:opacity-90 disabled:opacity-70"
        >
          {pending ? <Reel size={18} /> : <Play size={17} fill="currentColor" aria-hidden />}
        </button>
      </div>

      <div className="flex flex-wrap justify-center gap-1.5 pt-4">
        {COMPANY.map((id) => {
          const { label, Icon, on, off } = AUDIENCE[id];
          const selected = company === id;
          return (
            <button
              key={id}
              type="button"
              // tapping the selected one clears it; nothing selected means anyone
              onClick={() => onCompany(selected ? null : id)}
              aria-pressed={selected}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ring-1 transition-colors ${
                selected ? `${on} font-medium` : `${off} ring-transparent hover:bg-screen-raised hover:ring-edge`
              }`}
            >
              <Icon size={14} aria-hidden />
              <span className={selected ? "" : "text-ink-dim"}>{label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
