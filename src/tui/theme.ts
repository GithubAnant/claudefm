import process from "node:process";

export const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[?25l";
export const EXIT_ALT_SCREEN = "\x1b[?1049l\x1b[?25h\x1b[0m";
export const RESET = "\x1b[0m";

export type ColorMode = "truecolor" | "ansi256";

export interface TerminalEnvironment {
  [key: string]: string | undefined;
}

interface Theme {
  canvas: string;
  panel: string;
  panelAlt: string;
  text: string;
  muted: string;
  dim: string;
  accent: string;
  danger: string;
  warning: string;
  border: string;
  borderHot: string;
}

const TRUECOLOR_THEME: Theme = {
  canvas: "\x1b[48;2;0;0;0m",
  panel: "\x1b[48;2;17;17;17m",
  panelAlt: "\x1b[48;2;23;23;23m",
  text: "\x1b[38;2;246;238;232m",
  muted: "\x1b[38;2;169;151;141m",
  dim: "\x1b[38;2;116;99;90m",
  accent: "\x1b[38;2;217;119;87m",
  danger: "\x1b[38;2;255;128;102m",
  warning: "\x1b[38;2;224;163;91m",
  border: "\x1b[38;2;62;49;43m",
  borderHot: "\x1b[38;2;217;119;87m"
};

const ANSI256_THEME: Theme = {
  canvas: "\x1b[48;5;16m",
  panel: "\x1b[48;5;233m",
  panelAlt: "\x1b[48;5;234m",
  text: "\x1b[38;5;255m",
  muted: "\x1b[38;5;181m",
  dim: "\x1b[38;5;95m",
  accent: "\x1b[38;5;209m",
  danger: "\x1b[38;5;203m",
  warning: "\x1b[38;5;179m",
  border: "\x1b[38;5;238m",
  borderHot: "\x1b[38;5;209m"
};

export function detectColorMode(environment: TerminalEnvironment = process.env): ColorMode {
  if (environment.CLAUDEFM_COLOR_MODE === "truecolor") {
    return "truecolor";
  }

  if (environment.CLAUDEFM_COLOR_MODE === "256") {
    return "ansi256";
  }

  if (environment.TERM_PROGRAM === "Apple_Terminal") {
    return "ansi256";
  }

  return "truecolor";
}

export function resolveTheme(environment: TerminalEnvironment = process.env): Theme {
  return detectColorMode(environment) === "ansi256" ? ANSI256_THEME : TRUECOLOR_THEME;
}

export const THEME = resolveTheme();

export const PANEL_PADDING_X = 2;
export const PANEL_PADDING_Y = 2;
export const SECTION_GAP = 2;

export function enterScreen(): void {
  process.stdout.write(`${ENTER_ALT_SCREEN}${THEME.canvas}${THEME.text}`);
}

export function exitScreen(): void {
  process.stdout.write(EXIT_ALT_SCREEN);
}
