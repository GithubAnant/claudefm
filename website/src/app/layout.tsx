import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "claudefm",
  description: "Claude FM for the command line.",
  openGraph: {
    title: "claudefm",
    description: "Claude FM for the command line."
  }
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
