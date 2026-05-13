import Image from "next/image";
import { InstallCard } from "./install-card";

const controls = [
  ["space", "pause or resume"],
  ["left/right", "seek"],
  ["+/-", "volume"],
  ["ctrl+p", "settings"],
  ["o", "open youtube"],
  ["q", "quit"]
];

const links = [
  ["GitHub", "https://github.com/GithubAnant/claudefm"],
  ["npm", "https://www.npmjs.com/package/claudefm"],
  ["LinkedIn", "https://www.linkedin.com/in/anantsinghal1"],
  ["X", "https://x.com/anant_hq"]
];

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://claudefm.vercel.app";

const faqs = [
  {
    question: "What is ClaudeFM?",
    answer:
      "ClaudeFM is a terminal music player for streaming the Claude FM YouTube live stream from the command line."
  },
  {
    question: "Does ClaudeFM need mpv?",
    answer:
      "mpv is recommended for the full terminal dashboard, keyboard controls, and output-device selection. ffplay can work as a simpler fallback."
  },
  {
    question: "Can I use another YouTube stream?",
    answer:
      "Yes. Start ClaudeFM with a custom URL or use ctrl+p settings to set a different YouTube stream link."
  }
];

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "ClaudeFM",
      url: siteUrl,
      description:
        "ClaudeFM is a terminal music player for the Claude FM YouTube live stream.",
      sameAs: [
        "https://github.com/GithubAnant/claudefm",
        "https://www.npmjs.com/package/claudefm"
      ]
    },
    {
      "@type": "SoftwareApplication",
      name: "ClaudeFM",
      alternateName: "claudefm",
      description:
        "A terminal music player for the Claude FM YouTube live stream, with mpv playback, yt-dlp stream resolution, keyboard controls, and output-device settings.",
      applicationCategory: "MultimediaApplication",
      operatingSystem: "macOS, Linux, Windows",
      softwareVersion: "0.1.1",
      license: "https://github.com/GithubAnant/claudefm/blob/main/LICENSE",
      codeRepository: "https://github.com/GithubAnant/claudefm",
      downloadUrl: "https://www.npmjs.com/package/claudefm",
      installUrl: "https://www.npmjs.com/package/claudefm",
      programmingLanguage: "TypeScript",
      runtimePlatform: "Node.js",
      keywords:
        "Claude FM, ClaudeFM, terminal music player, command line radio, YouTube live stream, mpv, yt-dlp, npm CLI",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD"
      },
      author: {
        "@type": "Person",
        name: "Anant Singhal",
        url: "https://github.com/GithubAnant",
        sameAs: ["https://www.linkedin.com/in/anantsinghal1", "https://x.com/anant_hq"]
      },
      sameAs: [
        "https://github.com/GithubAnant/claudefm",
        "https://www.npmjs.com/package/claudefm"
      ]
    },
    {
      "@type": "FAQPage",
      mainEntity: faqs.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer
        }
      }))
    }
  ]
};

export default function Home() {
  return (
    <main className="site-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav className="nav">
        <a className="nav-brand" href="#top" aria-label="Claude FM home">
          <Image src="/images/logo.png" alt="" width={42} height={28} priority />
          <span>claudefm</span>
        </a>
        <div className="nav-links" aria-label="Primary navigation">
          <a href="#install">Install</a>
          <a href="#demo">Demo</a>
          <a href="https://github.com/GithubAnant/claudefm">Repo</a>
        </div>
      </nav>

      <section id="top" className="hero">
        <div className="hero-copy">
          <Image
            className="hero-logo"
            src="/images/full_logo.png"
            alt="Claude FM"
            width={494}
            height={85}
            priority
          />
          <p className="eyebrow">terminal music player for command line radio</p>
          <h1>Run ClaudeFM in your terminal.</h1>
          <p className="lede">
            A small audio-first TUI for the ClaudeFM stream, with playback
            controls, output-device selection, and a clean dashboard that stays
            out of your way.
          </p>

          <div className="hero-actions" aria-label="Project links">
            <a className="button primary" href="#install">
              Install
            </a>
            <a className="button secondary" href="https://github.com/GithubAnant/claudefm">
              View repo
            </a>
          </div>
        </div>

        <InstallCard />
      </section>

      <section id="demo" className="demo-section">
        <div className="video-frame">
          <video
            controls
            muted
            playsInline
            poster="/images/demo.png"
            preload="metadata"
          >
            <source
              src="https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4"
              type="video/mp4"
            />
          </video>
        </div>
      </section>

      <section className="details-grid" aria-label="Features and controls">
        <article>
          <span className="card-label">player</span>
          <h3>Command line radio, no browser required.</h3>
          <p>
            ClaudeFM uses yt-dlp to resolve the stream and mpv for local
            playback inside a focused terminal dashboard.
          </p>
        </article>
        <article>
          <span className="card-label">settings</span>
          <h3>Installed like any npm CLI.</h3>
          <p>
            Install globally with npm, pnpm, bun, yarn, or the macOS shell
            installer, then start the player from your terminal.
          </p>
        </article>
        <article>
          <span className="card-label">controls</span>
          <h3>Keyboard controls for long sessions.</h3>
          <div className="controls-list">
            {controls.map(([key, action]) => (
              <div className="control-row" key={key}>
                <kbd>{key}</kbd>
                <span>{action}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="faq-section" aria-label="ClaudeFM frequently asked questions">
        <p className="eyebrow">faq</p>
        <div className="faq-list">
          {faqs.map((item) => (
            <article key={item.question}>
              <h3>{item.question}</h3>
              <p>{item.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="footer">
        <p>Built by Anant.</p>
        <div className="footer-links">
          {links.map(([label, href]) => (
            <a key={href} href={href}>
              {label}
            </a>
          ))}
        </div>
      </footer>
    </main>
  );
}
