/** Data only, so the browser and the server read one list and a new company fails to compile until the UI draws it. */
export const COMPANY = ["solo", "couple", "friends", "family", "kids"] as const;
export type Company = (typeof COMPANY)[number];

/** How much of what was typed reaches the model; applied on the server. */
export const SAID_LIMIT = 200;
