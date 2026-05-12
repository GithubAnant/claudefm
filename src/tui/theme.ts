import process from "node:process";

export const ENTER_ALT_SCREEN = "\x1b[?1049h\x1b[?25l";
export const EXIT_ALT_SCREEN = "\x1b[?1049l\x1b[?25h\x1b[0m";
export const RESET = "\x1b[0m";

export const THEME = {
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
} as const;

export const PANEL_PADDING_X = 2;
export const PANEL_PADDING_Y = 2;
export const SECTION_GAP = 2;

export function enterScreen(): void {
  process.stdout.write(`${ENTER_ALT_SCREEN}${THEME.canvas}${THEME.text}`);
}

export function exitScreen(): void {
  process.stdout.write(EXIT_ALT_SCREEN);
}
