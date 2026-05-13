import Image from "next/image";

const installCommands = [
  {
    manager: "npm",
    command: "npm install -g claudefm"
  },
  {
    manager: "pnpm",
    command: "pnpm add -g claudefm"
  },
  {
    manager: "bun",
    command: "bun add -g claudefm"
  },
  {
    manager: "yarn",
    command: "yarn global add claudefm"
  },
  {
    manager: "curl",
    command:
      "curl -fsSL https://raw.githubusercontent.com/GithubAnant/claudefm/main/install.sh | sh",
    note: "macOS only"
  }
];

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

export default function Home() {
  return (
    <main className="site-shell">
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
          <p className="eyebrow">terminal radio for deep work</p>
          <h1>Run claudefm in your terminal.</h1>
          <p className="lede">
            A small audio-first TUI for the Claude FM stream, with playback
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

        <aside id="install" className="install-card" aria-label="Install commands">
          <div className="install-card-header">
            <span>install</span>
            <span>node 18+</span>
          </div>
          <div className="install-list">
            {installCommands.map((item) => (
              <div className="install-row" key={item.manager}>
                <span className="manager">{item.manager}</span>
                <code>{item.command}</code>
                {item.note ? <span className="note">{item.note}</span> : null}
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="product-strip" aria-label="Claude FM terminal preview">
        <div className="logo-panel">
          <Image
            src="/images/claudefm.png"
            alt="Claude FM"
            width={494}
            height={104}
            sizes="(max-width: 900px) 80vw, 494px"
            priority
          />
          <p>music for thinking and building</p>
        </div>
        <div className="terminal-panel">
          <div className="panel-title">
            <span>now playing</span>
            <span>paused | volume 100%</span>
          </div>
          <div className="track">Claude FM</div>
          <div className="progress" aria-hidden="true">
            <span />
          </div>
          <div className="time">14:18:35 / 14:18:40</div>
        </div>
      </section>

      <section id="demo" className="demo-section">
        <div className="section-copy">
          <p className="eyebrow">demo</p>
          <h2>Drop the real walkthrough here when it is ready.</h2>
          <p>
            The frame is wired for a hosted video today. Replace the placeholder
            source with the working Claude FM demo when the recording lands.
          </p>
        </div>
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
          <h3>Audio stays in the terminal.</h3>
          <p>
            Uses yt-dlp with mpv or ffplay, then falls back to the browser when
            local playback is not ready.
          </p>
        </article>
        <article>
          <span className="card-label">settings</span>
          <h3>Fast changes without leaving the stream.</h3>
          <p>
            Open settings with ctrl+p, change the YouTube stream, select an
            output device, or jump to the repo.
          </p>
        </article>
        <article>
          <span className="card-label">controls</span>
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

      <footer className="footer">
        <Image src="/images/logo.png" alt="" width={36} height={24} />
        <div>
          <p>Built by Anant Singhal.</p>
          <div className="footer-links">
            {links.map(([label, href]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </div>
        </div>
      </footer>
    </main>
  );
}
