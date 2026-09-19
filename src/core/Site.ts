/** Where this deploys. One literal, so the canonical, the sitemap and the robots file cannot drift. */
export const SITE = new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://moviebox.phureewat.com");
