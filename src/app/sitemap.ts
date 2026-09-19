import type { MetadataRoute } from "next";
import { SITE } from "@/core/Site";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: SITE.href, lastModified: new Date(), changeFrequency: "monthly", priority: 1 }];
}
