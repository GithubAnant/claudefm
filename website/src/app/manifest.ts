import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ClaudeFM CLI",
    short_name: "ClaudeFM",
    description: "Claude FM terminal music player for the command line.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#d97558",
    categories: ["music", "utilities", "developer tools"],
    icons: [
      {
        src: "/images/favicon.png",
        sizes: "any",
        type: "image/png"
      }
    ]
  };
}
