"use client";

import { useState } from "react";

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
    manager: "mac",
    command:
      "curl -fsSL https://raw.githubusercontent.com/GithubAnant/claudefm/main/install.sh | sh"
  }
];

async function copyCommand(command: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(command);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = command;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  document.body.removeChild(textarea);
}

export function InstallCard() {
  const [selected, setSelected] = useState(installCommands[0]);
  const [copied, setCopied] = useState<string | null>(null);

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
          className="copy-button"
          type="button"
          onClick={async () => {
            await copyCommand(selected.command);
            setCopied(selected.manager);
            window.setTimeout(() => setCopied(null), 1400);
          }}
          aria-label={`Copy ${selected.manager} install command`}
        >
          <span className="copy-icon" aria-hidden="true" />
          <span className="copy-text">{copied === selected.manager ? "copied" : "copy"}</span>
        </button>
      </div>

      <div className={`install-command install-command-${selected.manager}`}>
        <code>{selected.command}</code>
      </div>
    </aside>
  );
}
