import process from "node:process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { centerText, fit, type ScreenLine } from "./screen.js";

const ASSET_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../assets");
const LOGO_IMAGE_PATH = resolve(ASSET_DIR, "claudefm.png");
const LOGO_IMAGE_WIDTH = 12;
export const LOGO_IMAGE_HEIGHT = 4;
const LOGO_IMAGE_GAP = 3;

let cachedLogoImageEscape: string | undefined;

export function logoLines(width: number): ScreenLine[] {
  const imageLogo = imageLogoLines(width);
  if (imageLogo.length > 0) {
    return imageLogo;
  }

  const logo = [
    ["█▀▀ █  ▄▀▀▄ █ █ █▀▄ █▀▀", "  █▀▀ █▄▀▄█"],
    ["█   █  █▀▀█ █ █ █ █ █▀ ", "  █▀  █ ▀ █"],
    ["▀▀▀ ▀▀ ▀  ▀ ▀▀▀ ▀▀  ▀▀▀", "  ▀   ▀   ▀"]
  ];

  return [
    ...logo.map(([main, fm]) => centerLogoLine(main, fm, width)),
    { text: "", variant: "blank" as const },
    { text: centerText("music for thinking and building", width), variant: "muted" as const }
  ];
}

function imageLogoLines(width: number): ScreenLine[] {
  const imageEscape = getInlineLogoImage();
  const imageTextStart = LOGO_IMAGE_WIDTH + LOGO_IMAGE_GAP;
  if (!imageEscape || width < imageTextStart + 28) {
    return [];
  }

  const textLines = [
    "CLAUDE FM",
    "music for thinking and building",
    "terminal radio"
  ];

  return Array.from({ length: LOGO_IMAGE_HEIGHT }, (_, index) => ({
    text: textLines[index] ?? "",
    imageEscape: index === 0 ? imageEscape : undefined,
    imageTextStart,
    imageAccent: index === 0,
    variant: "imageLogo" as const
  }));
}

function getInlineLogoImage(): string | undefined {
  if (cachedLogoImageEscape !== undefined) {
    return cachedLogoImageEscape || undefined;
  }

  if (!supportsInlineImages() || !existsSync(LOGO_IMAGE_PATH)) {
    cachedLogoImageEscape = "";
    return undefined;
  }

  const data = readFileSync(LOGO_IMAGE_PATH).toString("base64");
  cachedLogoImageEscape = `\x1b]1337;File=inline=1;width=${LOGO_IMAGE_WIDTH};height=${LOGO_IMAGE_HEIGHT};preserveAspectRatio=1:${data}\x07`;
  return cachedLogoImageEscape;
}

function supportsInlineImages(): boolean {
  const termProgram = process.env.TERM_PROGRAM ?? "";
  return termProgram === "iTerm.app" || termProgram === "WezTerm" || Boolean(process.env.WEZTERM_EXECUTABLE);
}

function centerLogoLine(main: string, fm: string, width: number): ScreenLine {
  const text = `${main}${fm}`;
  if (text.length >= width) {
    return { text: fit(text, width), logoFmStart: Math.min(main.length, width), variant: "logo" };
  }

  const left = Math.floor((width - text.length) / 2);
  return {
    text: `${" ".repeat(left)}${text}${" ".repeat(width - text.length - left)}`,
    logoFmStart: left + main.length,
    variant: "logo"
  };
}
