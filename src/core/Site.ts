/** Where this deploys. One literal, so the canonical, the sitemap and the robots file cannot drift. */
export const SITE = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://moviebox.phureewat.com");

/** `NEXT_PUBLIC_` so it inlines at build: the shelf photo reaches the browser as a CSS variable. Unset, everything serves from `public/`. */
const cdn = (process.env.NEXT_PUBLIC_CDN_URL ?? "").trim().replace(/\/+$/, "");

export const assetUrl = (path: string) => (cdn === "" ? path : `${cdn}${path}`);
