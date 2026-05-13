import type { Metadata, Viewport } from "next";
import "./globals.css";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://claudefm.vercel.app";
const title = "ClaudeFM CLI";
const description =
  "Run ClaudeFM as a terminal music player for the Claude FM YouTube live stream, with mpv playback, yt-dlp stream resolution, keyboard controls, and output-device settings.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: "ClaudeFM",
  title: {
    default: title,
    template: "%s | ClaudeFM"
  },
  description,
  keywords: [
    "ClaudeFM",
    "Claude FM",
    "terminal music player",
    "command line radio",
    "YouTube live stream",
    "mpv player",
    "yt-dlp",
    "npm CLI",
    "terminal audio",
    "CLI music"
  ],
  authors: [{ name: "Anant Singhal", url: "https://github.com/GithubAnant" }],
  creator: "Anant Singhal",
  publisher: "Anant Singhal",
  category: "developer tools",
  manifest: "/manifest.webmanifest",
  alternates: {
    canonical: "/"
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png" }
    ],
    apple: "/icon.png"
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "ClaudeFM",
    title,
    description,
    locale: "en_US",
    images: [
      {
        url: "/images/demo.png",
        width: 1668,
        height: 924,
        alt: "ClaudeFM terminal dashboard"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    site: "@anant_hq",
    creator: "@anant_hq",
    title,
    description,
    images: ["/images/demo.png"]
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1
    }
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050505",
  colorScheme: "dark"
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
