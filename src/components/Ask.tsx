"use client";

import { Baby, Heart, House, Play, Search, User, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { COMPANY, SAID_LIMIT, type Company } from "@/core/Company";

type Suggestion = { readonly said: string; readonly company: Company | null };

/** Who is watching is the one thing the person knows and the model can only guess, so it is a control, not a question. */
const AUDIENCE: Record<Company, { label: string; Icon: typeof User; on: string; off: string }> = {
  solo: { label: "Just me", Icon: User, on: "bg-sky-400/10 text-sky-200/90 ring-sky-400/25", off: "text-sky-300/35" },
  couple: { label: "Two of us", Icon: Heart, on: "bg-rose-400/10 text-rose-200/90 ring-rose-400/25", off: "text-rose-300/35" },
  friends: { label: "Friends", Icon: Users, on: "bg-amber-400/10 text-amber-200/90 ring-amber-400/25", off: "text-amber-300/35" },
  family: { label: "Family", Icon: House, on: "bg-emerald-400/10 text-emerald-200/90 ring-emerald-400/25", off: "text-emerald-300/35" },
  kids: { label: "Kids too", Icon: Baby, on: "bg-violet-400/10 text-violet-200/90 ring-violet-400/25", off: "text-violet-300/35" },
};

/** Each carries who is watching: "kids are up" with the audience left on "just me" contradicts itself. */
const SUGGESTIONS: readonly Suggestion[] = [
  { said: "Long day. I just want to switch off.", company: "solo" },
  { said: "Rough week. I need to feel something.", company: "solo" },
  { said: "Good mood, got the whole evening.", company: "solo" },
  { said: "Can't sleep. Scare me.", company: "solo" },
  { said: "Hungover. Nothing that asks anything of me.", company: "solo" },
  { said: "I want to cry, properly.", company: "solo" },
  { said: "Restless. I can't sit still for anything slow.", company: "solo" },
  { said: "Home sick in bed all day.", company: "solo" },
  { said: "Wired from work. Something to come down from it.", company: "solo" },
  { said: "Feeling nostalgic for being a kid.", company: "solo" },
  { said: "Raining all weekend. I'm not going out.", company: "solo" },
  { said: "I've got two hours and no plans.", company: "solo" },
  { said: "Just got dumped.", company: "solo" },
  { said: "I need to feel better about people.", company: "solo" },
  { said: "Everything went wrong today.", company: "solo" },
  { said: "I'm bored of everything I usually watch.", company: "solo" },
  { said: "Snowed in and the wifi still works.", company: "solo" },
  { said: "Sunday afternoon, nothing to do.", company: "solo" },
  { said: "Up at 3am again.", company: "solo" },
  { said: "I want to be impressed.", company: "solo" },
  { said: "Nothing has made me laugh in a week.", company: "solo" },
  { said: "I need a good cry and then an early night.", company: "solo" },
  { said: "Feeling brave. Show me something heavy.", company: "solo" },
  { said: "Too tired to read subtitles.", company: "solo" },
  { said: "I want something I'll still be thinking about tomorrow.", company: "solo" },
  { said: "Date night. Something we'll both like.", company: "couple" },
  { said: "First date. Nothing too intense.", company: "couple" },
  { said: "We always argue about what to watch.", company: "couple" },
  { said: "Something to put on while we cook.", company: "couple" },
  { said: "Anniversary. Something romantic.", company: "couple" },
  { said: "We've got wine and no plans.", company: "couple" },
  { said: "Long distance, watching together on a call.", company: "couple" },
  { said: "Something we can pause and talk through.", company: "couple" },
  { said: "Kids are up. Something we can all watch.", company: "kids" },
  { said: "Rainy afternoon with the kids.", company: "kids" },
  { said: "Six-year-old's choice, but I have to sit through it too.", company: "kids" },
  { said: "Something with animals for the little one.", company: "kids" },
  { said: "A sleepover and eight children.", company: "kids" },
  { said: "Nothing scary. She's four.", company: "kids" },
  { said: "Something that'll get them off the tablet.", company: "kids" },
  { said: "Something the whole family will sit through.", company: "family" },
  { said: "My parents are visiting. Something they'd enjoy.", company: "family" },
  { said: "Teenagers. Something they won't call boring.", company: "family" },
  { said: "Christmas, everyone's here.", company: "family" },
  { said: "Three generations in one room.", company: "family" },
  { said: "Grandma picks, and she likes the old ones.", company: "family" },
  { said: "Something my dad would actually stay awake for.", company: "family" },
  { said: "Friends are over. Nothing too serious.", company: "friends" },
  { said: "Make me laugh until it hurts.", company: "friends" },
  { said: "Big group, everyone's talking. Keep it light.", company: "friends" },
  { said: "Everyone's seen everything. Find something we haven't.", company: "friends" },
  { said: "Pizza and something stupid.", company: "friends" },
  { said: "Something we can shout at.", company: "friends" },
  { said: "A film night, and it should feel like an event.", company: "friends" },
  { said: "A proper mystery I can try to solve.", company: "solo" },
  { said: "A true story that actually happened.", company: "solo" },
  { said: "Something beautiful I can just stare at.", company: "solo" },
  { said: "Something about music.", company: "solo" },
  { said: "Courtroom drama. People arguing well.", company: "solo" },
  { said: "Spies, and nobody can be trusted.", company: "solo" },
  { said: "One performance worth the whole film.", company: "solo" },
  { said: "Someone building something impossible.", company: "solo" },
  { said: "Space, and make it quiet.", company: "solo" },
  { said: "A film about growing up.", company: "solo" },
  { said: "Something genuinely strange.", company: "solo" },
  { said: "A detective who is worse at life than at the job.", company: "solo" },
  { said: "Somebody getting revenge.", company: "solo" },
  { said: "A film about a friendship.", company: "solo" },
  { said: "Journalism, and someone telling the truth anyway.", company: "solo" },
  { said: "Something about war, from the ground.", company: "solo" },
  { said: "A survival story.", company: "solo" },
  { said: "Someone who is very good at one thing.", company: "solo" },
  { said: "A film set entirely in one room.", company: "solo" },
  { said: "Politics, and people who are good at it.", company: "solo" },
  { said: "Something about a family falling apart.", company: "solo" },
  { said: "A road trip.", company: "solo" },
  { said: "Someone pretending to be someone else.", company: "solo" },
  { said: "A film about grief that isn't unbearable.", company: "solo" },
  { said: "Boxing, or anything with training in it.", company: "solo" },
  { said: "A cult, and someone getting out.", company: "solo" },
  { said: "Chess, cards, anything with a game in it.", company: "solo" },
  { said: "Someone who cooks for a living.", company: "solo" },
  { said: "A film about teachers.", company: "solo" },
  { said: "Something with a twist I won't see coming.", company: "solo" },
  { said: "A heist. Clever people stealing things.", company: "friends" },
  { said: "A con artist running a long game.", company: "friends" },
  { said: "Cars, and a lot of them.", company: "friends" },
  { said: "Superheroes, and make it fun.", company: "friends" },
  { said: "A monster movie, an honest one.", company: "friends" },
  { said: "Zombies.", company: "friends" },
  { said: "Aliens arriving.", company: "friends" },
  { said: "A disaster film where the effects hold up.", company: "friends" },
  { said: "Something about food.", company: "couple" },
  { said: "Two people who shouldn't be together.", company: "couple" },
  { said: "A wedding, and everything going wrong.", company: "couple" },
  { said: "Something set somewhere I'd like to go.", company: "couple" },
  { said: "Something Thai.", company: null },
  { said: "Something Korean.", company: null },
  { said: "Japanese, something old.", company: null },
  { said: "A nature documentary, something calming.", company: null },
  { said: "Indian, and I want the songs.", company: null },
  { said: "French, and I'll read the subtitles.", company: null },
  { said: "Italian, something classic.", company: null },
  { said: "Something from Hong Kong, with fighting in it.", company: null },
  { said: "A Spanish-language film.", company: null },
  { said: "British, and very British.", company: null },
  { said: "Scandinavian and cold.", company: null },
  { said: "Something Chinese I'd have heard of.", company: null },
  { said: "A GDH film, the ones that make you cry.", company: null },
  { said: "K-drama, the sort people binge.", company: null },
  { said: "Bollywood, three hours, I don't mind.", company: null },
  { said: "Anime, and make it good.", company: "solo" },
  { said: "Anime, but not a long series.", company: "solo" },
  { said: "Studio Ghibli.", company: "solo" },
  { said: "Black and white. A proper classic.", company: "solo" },
  { said: "Silent era, if there's anything good.", company: "solo" },
  { said: "Something from the seventies.", company: "solo" },
  { said: "A film older than me that still holds up.", company: "solo" },
  { said: "I don't mind subtitles.", company: "solo" },
  { said: "Under ninety minutes. I'm going to bed after.", company: "solo" },
  { said: "A series I can fall into for a week.", company: "solo" },
  { said: "Something like Interstellar, but shorter.", company: "solo" },
  { said: "A comfort rewatch. Nothing new tonight.", company: "solo" },
  { said: "Something I can fall asleep to.", company: "solo" },
  { said: "One episode, then bed. Honestly.", company: "solo" },
  { said: "A trilogy. I've got all day.", company: "solo" },
  { said: "Short episodes, I keep getting interrupted.", company: "solo" },
  { said: "One long film, and I'll give it my full attention.", company: "solo" },
  { said: "A miniseries I can finish this weekend.", company: "solo" },
  { said: "Something with one season only. No commitment.", company: "solo" },
  { said: "A horror film that's actually frightening.", company: "solo" },
  { said: "A western.", company: "solo" },
  { said: "A musical.", company: "solo" },
  { said: "A documentary about a crime.", company: "solo" },
  { said: "Science fiction, the thoughtful kind.", company: "solo" },
  { said: "A thriller that doesn't let up.", company: "solo" },
  { said: "A comedy from before I was born.", company: "solo" },
  { said: "A war film.", company: "solo" },
  { said: "A biopic of someone interesting.", company: "solo" },
  { said: "A sports film.", company: "solo" },
  { said: "Fantasy, with a proper world in it.", company: "solo" },
  { said: "Animation, but for adults.", company: "solo" },
  { said: "A courtroom film.", company: "solo" },
  { said: "A gangster film.", company: "solo" },
  { said: "A film noir.", company: "solo" },
  { said: "Something historical, and roughly accurate.", company: "solo" },
  { said: "A romance that isn't sentimental.", company: "solo" },
  { said: "A psychological thriller.", company: "solo" },
  { said: "A dark comedy.", company: "solo" },
  { said: "A coming-of-age film.", company: "solo" },
  { said: "The best thing in the box.", company: null },
  { said: "Something from the nineties.", company: null },
  { said: "Surprise me.", company: null },
  { said: "Something everyone's seen except me.", company: null },
  { said: "Nothing I've heard of.", company: null },
  { said: "The highest rated thing here.", company: null },
  { said: "Something from this decade.", company: null },
  { said: "The oldest thing you've got that's still good.", company: null },
  { said: "Something short and very good.", company: null },
  { said: "A film that won everything the year it came out.", company: null },
  { said: "Something from the eighties.", company: null },
  { said: "The one nobody talks about any more.", company: null },
];

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

/** Fisher-Yates, so the first suggestion you read is not always the same one. */
const shuffled = <T,>(items: readonly T[]): readonly T[] => {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

function Rotating({ onPick }: { onPick: (suggestion: Suggestion) => void }) {
  // shuffled after mount: the server cannot draw the same order the client would
  const [order, setOrder] = useState<readonly Suggestion[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => setOrder(shuffled(SUGGESTIONS)), []);
  useEffect(() => {
    if (order.length === 0) return;
    const timer = setInterval(() => setIndex((current) => (current + 1) % order.length), ROTATE_MS);
    return () => clearInterval(timer);
  }, [order]);

  const current = order[index];
  return (
    <button
      type="button"
      onClick={() => current !== undefined && onPick(current)}
      disabled={current === undefined}
      aria-label={current === undefined ? "Suggestions" : `Use this suggestion: ${current.said}`}
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
  onSaid,
  onCompany,
  onSubmit,
}: {
  said: string;
  company: Company | null;
  pending: boolean;
  onSaid: (value: string) => void;
  onCompany: (value: Company | null) => void;
  onSubmit: () => void;
}) {
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
        <Rotating onPick={pick} />
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
