/** Where this deploys. One literal, so the canonical, the sitemap and the robots file cannot drift. */
export const SITE = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://moviebox.phureewat.com");

/**
 * The social card and the shelf photo are a quarter of a megabyte that changes a few times a
 * year, so in production they come from a CDN bucket rather than from the deployment.
 *
 * `NEXT_PUBLIC_` is load-bearing: the shelf reaches the browser as a CSS variable set in the
 * document, so the value has to be inlined at build time. Unset, everything serves from
 * `public/` and the app behaves exactly as it does locally.
 */
const cdn = (process.env.NEXT_PUBLIC_CDN_URL ?? "").trim().replace(/\/+$/, "");

/** Takes a root-relative path, so call sites read the same with or without a CDN. */
export const assetUrl = (path: string) => (cdn === "" ? path : `${cdn}${path}`);
