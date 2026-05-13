import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClaudeFM CLI",
    short_name: "ClaudeFM",
    description: "Claude FM terminal music player for the command line.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#050505",
    theme_color: "#d97558",
    categories: ["music", "utilities", "developer tools"],
    icons: [
      {
        src: "/images/icon-192.png",
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: "/images/icon-512.png",
        sizes: "512x512",
        type: "image/png"
      }
    ]
  };
}
