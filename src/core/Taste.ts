/**
 * The taste rubric: the one place a level is described. Each axis carries a question for the
 * film side and one for the person side over the *same* four levels, so the two answers are
 * distributions the ranker can lay on top of each other.
 *
 * This module holds data only. It imports nothing, so the browser can read a level's text for a
 * reason chip without pulling the model SDK into the bundle; the questions themselves are built
 * in Questions.ts, which the server and the scripts own.
 */

export type Levels = readonly [string, string, string, string];

/**
 * A `match` axis wants the film to land where the person landed. A `ceiling` axis is a budget:
 * the person states the most they can take, and a film asking less is just as welcome. Someone
 * with energy to burn is not offended by an easy film, but symmetric scoring would punish it.
 */
export type AxisKind = "match" | "ceiling";

export type Axis = {
  readonly kind: AxisKind;
  /** Completes "does what this person said speak at all to ___?" */
  readonly relevance: string;
  readonly film: string;
  readonly person: string;
  readonly levels: Levels;
};

export const AXES = {
  attention: {
    kind: "ceiling",
    relevance: "how much attention they are willing to give a film",
    film: "How much attention does this film ask of the viewer?",
    person: "How much attention is this person willing to give a film tonight?",
    /**
     * Calibrated against a catalog of acclaimed films, where nothing is background viewing:
     * the old level 0 held zero of 250 and the old level 2 held 223, so the axis ordered
     * almost nothing. These four split that bulge.
     */
    levels: [
      "Easy to follow; it survives being talked over",
      "Straightforward, though it is better if you watch it properly",
      "Rewards close attention; the details and the dialogue matter",
      "Demands full concentration; a moment away loses the thread",
    ],
  },
  warmth: {
    kind: "match",
    relevance: "how much warmth or reassurance they want",
    film: "How much warmth and reassurance does this film offer the viewer?",
    person: "How much warmth and reassurance does this person want from a film tonight?",
    levels: [
      "Bleak; it offers no comfort at all",
      "Cool and distant; it keeps the viewer at arm's length",
      "Warm in places; hard things happen, but people are kind to each other",
      "A hug of a film; it leaves the viewer looked after",
    ],
  },
  intensity: {
    kind: "match",
    relevance: "how hard they want a film to hit them",
    film: "How hard does this film hit the viewer emotionally?",
    person: "How hard does this person want a film to hit them tonight?",
    levels: [
      "Light throughout; nothing lands heavily",
      "Some weight to it, but it passes",
      "Hits hard in places; it is still there the next morning",
      "Wrings the viewer out; it needs a moment at the end",
    ],
  },
  pace: {
    kind: "match",
    relevance: "how fast they want a film to move",
    film: "How quickly does this film move?",
    person: "How quickly does this person want a film to move tonight?",
    levels: [
      "A slow burn; long stretches where little happens",
      "Unhurried; it takes its time and expects patience",
      "Keeps moving; scenes turn over briskly",
      "Relentless; it never lets up",
    ],
  },
  humor: {
    kind: "match",
    relevance: "how funny they want a film to be",
    film: "How funny is this film?",
    person: "How funny does this person want a film to be tonight?",
    levels: [
      "No jokes; nothing in it is played for laughs",
      "The odd light moment inside a serious film",
      "Funny throughout, though the story itself is not a joke",
      "Comedy first; the laughs are the point of watching",
    ],
  },
  tension: {
    kind: "match",
    relevance: "how much tension or fear they want",
    film: "How much tension or fear does this film put the viewer through?",
    person: "How much tension or fear does this person want tonight?",
    levels: [
      "Cosy; nobody in it is ever in real danger",
      "Mild stakes; curious rather than gripped",
      "Gripping; the next turn genuinely matters",
      "White-knuckle or frightening; hard to watch straight through",
    ],
  },
  reality: {
    kind: "match",
    relevance: "how far from ordinary life they want a film to be",
    film: "How far from ordinary life is this film's world?",
    person: "How far from ordinary life does this person want tonight's film to be?",
    levels: [
      "Could happen on an ordinary street next week",
      "The real world, but a life most people never see",
      "Heightened; the world bends to suit the story",
      "Another world entirely, with its own rules and creatures",
    ],
  },
  darkness: {
    kind: "ceiling",
    relevance: "how much cruelty or violence they are willing to sit through",
    film: "How much cruelty, violence or despair does this film put on screen?",
    person: "How much cruelty, violence or despair will this person sit through tonight?",
    levels: [
      "Nothing a nine-year-old could not watch",
      "Some peril and sadness, nothing graphic",
      "Adult: real violence, cruelty or despair, shown plainly",
      "Brutal; images that are hard to shake off afterwards",
    ],
  },
  romance: {
    kind: "match",
    relevance: "how much of a love story they want",
    film: "How central is a love story to this film?",
    person: "How much does this person want a love story tonight?",
    levels: [
      "No romance at all; nobody in it falls for anybody",
      "A love story happens somewhere in the background",
      "A romance runs alongside the main story",
      "The love story is the whole film",
    ],
  },
  scale: {
    kind: "match",
    relevance: "how large a world they want",
    film: "How large is the world this film takes place in?",
    person: "How large a world does this person want tonight?",
    levels: [
      "Two or three people; whatever happens outside them barely intrudes",
      "A handful of lives, close enough to know all of them",
      "Many lives pulled into one institution, crime or conflict",
      "Epic; the fate of nations, centuries or whole worlds",
    ],
  },
} as const satisfies Record<string, Axis>;

export type AxisId = keyof typeof AXES;
export const AXIS_IDS = Object.keys(AXES) as readonly AxisId[];

export const ENDINGS = {
  hopeful: "Things end better than they began; the viewer leaves lifted",
  bittersweet: "Loss and gain together; the viewer leaves sad and satisfied at once",
  bleak: "No comfort is offered; the viewer leaves heavy",
  ambiguous: "Deliberately unresolved; the viewer leaves arguing about what happened",
} as const;
export type EndingId = keyof typeof ENDINGS;
export const ENDING_IDS = Object.keys(ENDINGS) as readonly EndingId[];

/**
 * Runtime is the one axis where the film side is a fact, not a judgment. The person is asked
 * how long an evening they have; code reads the minutes off the catalog. Jev is never asked to
 * compare numbers, which the model card lists as a weak spot.
 */
export const RUNTIME_LEVELS = [
  "Under an hour and a half",
  "An hour and a half to two hours",
  "Two to two and a half hours",
  "Two and a half hours or more; they have the whole evening",
] as const satisfies Levels;

export const RUNTIME_QUESTION = "How long an evening does this person have for a film?";

export const RUNTIME_RELEVANCE =
  "Does what this person said speak at all to how long a film they want, or how much time they have?";

export const runtimeBand = (minutes: number): 0 | 1 | 2 | 3 =>
  minutes < 90 ? 0 : minutes < 120 ? 1 : minutes < 150 ? 2 : 3;

/** Judgments about a film that are facts rather than taste. Code uses them to filter, not to rank. */
export const FILM_FACTS = {
  kids_safe: {
    instructions: "Would most parents be comfortable with a nine-year-old in the room for this film?",
    criteria: {
      true: "Nothing in it would trouble a nine-year-old watching with a parent.",
      false: "It holds sexual content, sustained cruelty, terror, or despair that a nine-year-old should not sit through. Animation and a family-friendly genre do not make a film safe on their own.",
    },
  },
  first_date: {
    instructions: "Is this a good film for two people who do not know each other well yet?",
    criteria: {
      true: "Easy to talk about afterwards, and nothing in it makes either person want to leave the room.",
      false: "Explicit, harrowing, or so demanding that talking over it would ruin it.",
    },
  },
  true_events: { instructions: "Does this film retell events that really happened?" },
  franchise_entry: { instructions: "Is this film part of a series or franchise?" },
  needs_predecessor: {
    instructions: "Would a viewer be lost in this film without having seen an earlier one first?",
  },
  famous_twist: {
    instructions: "Does this film turn on a famous twist that is spoiled by knowing it in advance?",
    criteria: {
      true: "Knowing how it ends, or what is really going on, takes away most of the reason to watch it the first time.",
      false: "Knowing the ending costs the viewer little; the pleasure is in the telling, not the reveal.",
    },
  },
} as const;
export type FilmFactId = keyof typeof FILM_FACTS;
export const FILM_FACT_IDS = Object.keys(FILM_FACTS) as readonly FilmFactId[];

/**
 * What the person said, read as facts rather than taste. `names_reference` points at `said` on
 * purpose: asked loosely it reads a tapped poster in `loved` as a named reference and answers
 * 0.95 when the honest answer is nothing of the sort.
 */
export const PERSON_SIGNALS = {
  children_watching: {
    instructions: "Are children going to be watching along with this person tonight?",
    criteria: {
      true: "The person says or implies that a child will be in the room.",
      false: "The person is watching alone, or with other adults, or says nothing either way.",
    },
  },
  /**
   * Whether a genre came out of the person's mouth or out of the model's reading of their
   * subject matter. It decides whether genre may filter the shelf. "A western" states one, so
   * a non-western is simply wrong; "jail breaking" implies Crime, and filtering on that threw
   * away The Shawshank Redemption, which is tagged Drama.
   */
  genre_named: {
    instructions:
      "In `said`, does the person name a genre, format or kind of film outright, rather than describing a story, subject or mood and leaving the genre to be inferred?",
    criteria: {
      true: 'They use a genre or format word for what they want: "a comedy", "horror", "a western", "a documentary", "anime", "something funny", "a romance".',
      false: 'They describe a subject, plot, person, place or mood instead, and any genre has to be guessed from it: "jail breaking", "something like Interstellar", "batman", "a Kubrick film", "long day, I am wiped", "something from GDH".',
    },
  },
  names_reference: {
    instructions: "In `said`, does the person name a particular film they want tonight's pick to resemble?",
    criteria: {
      true: 'The text of `said` names a film and asks for something like it, as in "something like Interstellar but shorter".',
      false: "The text of `said` names no film, or names one without asking for anything similar to it. Titles listed under `loved`, `seen` or `not_for_me` were tapped from a poster wall rather than spoken, and never make this true.",
    },
  },
} as const;
export type PersonSignalId = keyof typeof PERSON_SIGNALS;
export const PERSON_SIGNAL_IDS = Object.keys(PERSON_SIGNALS) as readonly PersonSignalId[];

/**
 * Some questions are about the shelf rather than about a film: the best rated, the newest, a
 * particular decade. They are answered by sorting and filtering data we already hold, so Jev
 * only has to recognise the intent. Nothing here asks the model to compare a number.
 */
export const ORDERING = {
  best_rated: "They want the most acclaimed or highest-rated, whatever those turn out to be.",
  newest: "They want recent films, the newer the better.",
  oldest: "They want old films, classics, or the early days of cinema.",
  none: "They did not ask for any particular ordering; they described a kind of film.",
} as const;
export type OrderingId = keyof typeof ORDERING;

export const ORDERING_QUESTION =
  "Is this person asking for the shelf to be ordered a particular way, rather than for a kind of film?";

export const WANTS = {
  movie: "A film: one sitting, an ending tonight.",
  series: "A series: episodes, something to keep going back to.",
  either: "They did not say, or they do not mind.",
} as const;
export type WantsId = keyof typeof WANTS;

export const WANTS_QUESTION = "Is this person asking for a film or for a series?";

/**
 * Counted by *primary* country, not by any credit. OMDb's list is production finance, so
 * "France" by membership pulls in Terminator 2 and Ratatouille, and "China" has three entries
 * of which none is a Chinese film. A country only earns an option if three titles are actually
 * from there.
 *
 * Country and genre are on every catalog row, so Jev only has to recognise which one was asked
 * for and code does the filtering. Asking a 254-option title Choice to enumerate every Thai
 * film instead collapses onto one winner: it answers "which one", not "which ones".
 *
 * Both lists are the values that actually earn a place in the catalog — countries with at least
 * three titles, genres with at least five — so they move with the data instead of being guessed.
 */
export const COUNTRIES = ["United States", "United Kingdom", "Japan", "South Korea", "Thailand", "Germany", "France", "Italy", "India", "Canada", "Ireland", "Denmark", "Mexico", "Spain", "Hong Kong", "Sweden", "New Zealand"] as const;
export type CountryId = (typeof COUNTRIES)[number];

export const COUNTRY_QUESTION =
  "Which country's or region's films or series is this person asking for? Only answer with a country if they actually named one, or named a language, a people or a film industry that means one.";

/** One noul each, because genre is multi-valued: "something funny about war" is two answers. */
export const GENRES = ["Drama", "Comedy", "Crime", "Action", "Adventure", "Mystery", "Animation", "Thriller", "Romance", "Fantasy", "Sci-Fi", "Biography", "War", "Horror", "History", "Documentary", "Family", "Music", "Musical", "Sport", "Western"] as const;
export type GenreId = (typeof GENRES)[number];

export const genreQuestion = (genre: GenreId) => ({
  instructions: `Is this person asking for something in the ${genre} genre?`,
  criteria: {
    true: `They asked for ${genre}, directly or by clear implication.`,
    false: `They did not ask for ${genre}.`,
  },
});

export const DECADES = ["1920s", "1930s", "1940s", "1950s", "1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"] as const;
export type DecadeId = (typeof DECADES)[number] | "none";

export const DECADE_QUESTION = "Which decade is this person asking for, if they named one at all?";

export const decadeOf = (year: number): DecadeId => {
  const decade = `${Math.floor(year / 10) * 10}s` as DecadeId;
  return (DECADES as readonly string[]).includes(decade) ? decade : "none";
};

/**
 * Asked once per axis. Without it a confident "no romance wanted" reads as "romance matters a
 * great deal", and a query about prison escapes gets sorted by absence of romance. The criteria
 * carry the whole distinction: wanting none of something is still speaking to it; never
 * mentioning it is not.
 */
export const relevanceCriteria = {
  true: "They said something bearing on it, directly or by implication. Wanting none of it counts.",
  false: "They said nothing bearing on it either way; it simply did not come up.",
} as const;

export const relevanceInstruction = (axis: AxisId) =>
  `Does what this person said speak at all to ${AXES[axis].relevance}?`;

/**
 * The fields of a film record that are sent to the model. Changing this pick invalidates every
 * label exactly as surely as rewording a level, so it is hashed alongside the questions.
 */
export const FILM_STATE_FIELDS = ["title", "year", "director", "starring", "genres", "plot"] as const;

/**
 * Every word that reaches the model *about a film*, in a stable order. Labels record a hash of
 * this, so a reworded level shows up as stale data rather than as answers to a question nobody
 * asked. The relevance clauses and the person signals are deliberately outside it: they are only
 * ever put to a person, so adding or rewording one cannot invalidate a film's label.
 */
export const canonicalRubric = () =>
  JSON.stringify([
    FILM_STATE_FIELDS,
    AXIS_IDS.map((id) => [id, AXES[id].kind, AXES[id].film, AXES[id].person, AXES[id].levels]),
    ENDING_IDS.map((id) => [id, ENDINGS[id]]),
    FILM_FACT_IDS.map((id) => [id, FILM_FACTS[id]]),
    [RUNTIME_QUESTION, RUNTIME_LEVELS],
  ]);
