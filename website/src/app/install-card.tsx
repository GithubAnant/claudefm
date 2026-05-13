"use client";

import { useState } from "react";
import { copyCommand } from "./copy-command";

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
    manager: "macOS",
    command:
      "curl -fsSL https://raw.githubusercontent.com/GithubAnant/claudefm/main/install.sh | sh"
  }
];

export function InstallCard() {
  const [selected, setSelected] = useState(installCommands[0]);
  const [copied, setCopied] = useState<string | null>(null);
  const [tickKey, setTickKey] = useState(0);
  const isCopied = copied === selected.manager;

  return (
    <aside id="install" className="install-card" aria-label="Install commands">
      <div className="install-card-header">
        <div className="install-tabs" role="tablist" aria-label="Install command options">
          {installCommands.map((item) => (
            <button
              aria-selected={selected.manager === item.manager}
              className="install-tab"
              key={item.manager}
              onClick={() => setSelected(item)}
              role="tab"
              type="button"
            >
              {item.manager}
            </button>
          ))}
        </div>
        <button
          className={isCopied ? "copy-button copy-button-copied" : "copy-button"}
          type="button"
          onClick={async () => {
            try {
              const didCopy = await copyCommand(selected.command);
              if (!didCopy) {
                return;
              }
              setCopied(selected.manager);
              setTickKey((key) => key + 1);
              window.setTimeout(() => setCopied(null), 1400);
            } catch {
              setCopied(null);
            }
          }}
          aria-label={`Copy ${selected.manager} install command`}
          aria-live="polite"
        >
          {isCopied ? (
            <span key={tickKey} className="copy-check" aria-hidden="true" />
          ) : (
            <span className="copy-icon" aria-hidden="true" />
          )}
          <span className="copy-text">{isCopied ? "copied" : "copy"}</span>
        </button>
      </div>

      <div className={`install-command install-command-${selected.manager}`}>
        <code>{selected.command}</code>
      </div>
    </aside>
  );
}
