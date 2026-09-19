/**
 * Who is watching. Data only, so the browser and the server read the same list; the audience
 * pills are typed against it and a new company fails to compile until the UI draws it.
 */
export const COMPANY = ["solo", "couple", "friends", "family", "kids"] as const;
export type Company = (typeof COMPANY)[number];

/** How much of what was typed reaches the model. Applied on the server, so it cannot be bypassed. */
export const SAID_LIMIT = 200;
