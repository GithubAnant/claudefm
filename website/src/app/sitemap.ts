import type { MetadataRoute } from "next";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://claudefm.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: siteUrl,
      lastModified: new Date("2026-05-13"),
      changeFrequency: "weekly",
      priority: 1,
      images: [`${siteUrl}/images/demo.png`]
    }
  ];
}
