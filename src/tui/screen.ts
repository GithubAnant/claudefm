import process from "node:process";
import { RESET, THEME } from "./theme.js";

export type LineVariant =
  | "blank"
  | "logo"
  | "modal"
  | "modalDim"
  | "modalInput"
  | "modalTitle"
  | "modalHot"
  | "modalMuted"
  | "panel"
  | "panelTitle"
  | "columns"
  | "columnsTitle"
  | "hint"
  | "danger"
  | "muted";

export interface ScreenLine {
  text: string;
  variant: LineVariant;
  styledText?: string;
  boxWidth?: number;
  gap?: number;
  leftWidth?: number;
  rightText?: string;
  rightWidth?: number;
  logoFmStart?: number;
}

export function fit(text: string, width: number): string {
  if (text.length > width) {
    return `${text.slice(0, Math.max(0, width - 3))}...`;
  }

  return text.padEnd(width, " ");
}

export function wrapText(text: string, width: number): string[] {
  if (width <= 0) {
    return [""];
  }

  if (text.length <= width) {
    return [text];
  }

  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return [""];
  }

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    if (!current) {
      current = word;
      continue;
    }

    if (`${current} ${word}`.length <= width) {
      current = `${current} ${word}`;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

export function centerText(text: string, width: number): string {
  if (text.length >= width) {
    return fit(text, width);
  }

  const left = Math.floor((width - text.length) / 2);
  return `${" ".repeat(left)}${text}${" ".repeat(width - text.length - left)}`;
}

export function blankLine(): ScreenLine {
  return { text: "", variant: "blank" };
}

export function blankLines(count: number): ScreenLine[] {
  return Array.from({ length: count }, () => blankLine());
}

export function paintScreen(lines: ScreenLine[], width: number): string {
  const rows = process.stdout.rows || 24;
  const columns = process.stdout.columns || 80;
  const leftPad = Math.max(0, Math.floor((columns - width) / 2));
  const visibleLines = lines.slice(0, rows);
  const topPad = Math.max(0, Math.floor((rows - visibleLines.length) / 2));
  const painted = [
    ...Array.from({ length: topPad }, () => paintBlankLine(columns)),
    ...visibleLines.map((line) => paintLine(line, width, columns, leftPad))
  ];

  while (painted.length < rows) {
    painted.push(paintBlankLine(columns));
  }

  return `${painted.join("\n")}${RESET}`;
}

export function paintLine(line: ScreenLine, width: number, columns: number, leftPad: number): string {
  const padded = fit(line.text, width);
  const rightPad = Math.max(0, columns - leftPad - width);

  if (line.variant === "columns" || line.variant === "columnsTitle") {
    const gap = line.gap ?? 3;
    const leftWidth = line.leftWidth ?? line.text.length;
    const rightText = line.rightText ?? "";
    const rightWidth = line.rightWidth ?? rightText.length;
    const remainingPad = Math.max(0, width - leftWidth - gap - rightWidth);
    const leftForeground = panelForeground(line.text, line.variant === "columnsTitle");
    const rightForeground = panelForeground(rightText, line.variant === "columnsTitle");

    return [
      THEME.canvas,
      " ".repeat(leftPad),
      THEME.panel,
      leftForeground,
      fit(line.text, leftWidth),
      THEME.canvas,
      " ".repeat(gap),
      THEME.panel,
      rightForeground,
      fit(rightText, rightWidth),
      THEME.canvas,
      " ".repeat(remainingPad + rightPad),
      RESET
    ].join("");
  }

  if (
    line.variant === "modal" ||
    line.variant === "modalDim" ||
    line.variant === "modalInput" ||
    line.variant === "modalTitle" ||
    line.variant === "modalHot" ||
    line.variant === "modalMuted"
  ) {
    const boxWidth = Math.min(width, line.boxWidth ?? line.text.length);
    const modalLeftPad = leftPad + Math.max(0, Math.floor((width - boxWidth) / 2));
    const modalRightPad = Math.max(0, columns - modalLeftPad - boxWidth);
    const foreground = line.variant === "modalTitle"
      ? THEME.text
      : line.variant === "modalHot"
        ? THEME.accent
        : line.variant === "modalMuted"
          ? THEME.muted
          : line.variant === "modalDim"
            ? THEME.dim
            : THEME.text;
    const content = line.styledText ?? fit(line.text, boxWidth);

    return `${THEME.canvas}${" ".repeat(modalLeftPad)}${THEME.panelAlt}${foreground}${content}${THEME.canvas}${" ".repeat(modalRightPad)}${RESET}`;
  }

  if (line.variant === "panel" || line.variant === "panelTitle") {
    const foreground = panelForeground(line.text, line.variant === "panelTitle");
    return `${THEME.canvas}${" ".repeat(leftPad)}${THEME.panel}${foreground}${line.styledText ?? padded}${THEME.canvas}${" ".repeat(rightPad)}${RESET}`;
  }

  if (line.variant === "blank" || line.text.trim().length === 0) {
    return paintBlankLine(columns);
  }

  if (line.variant === "logo" && line.logoFmStart !== undefined) {
    return [
      THEME.canvas,
      " ".repeat(leftPad),
      THEME.accent,
      padded,
      THEME.canvas,
      " ".repeat(rightPad),
      RESET
    ].join("");
  }

  const foreground = line.variant === "logo"
    ? THEME.accent
    : line.variant === "danger"
      ? THEME.danger
      : line.variant === "hint"
        ? THEME.text
        : THEME.muted;

  return `${THEME.canvas}${" ".repeat(leftPad)}${foreground}${padded}${THEME.canvas}${" ".repeat(rightPad)}${RESET}`;
}

export function paintBlankLine(columns: number): string {
  return `${THEME.canvas}${" ".repeat(columns)}${RESET}`;
}

export function panelForeground(text: string, isTitle: boolean): string {
  const trimmed = text.trimStart();
  if (trimmed.startsWith("error")) {
    return THEME.danger;
  }

  if (
    trimmed.startsWith("ERROR") ||
    trimmed.startsWith("PLAYING") ||
    trimmed.startsWith("STARTING") ||
    trimmed.startsWith("BUFFERING")
  ) {
    return THEME.accent;
  }

  if (text.includes("█") || text.includes("·")) {
    return THEME.accent;
  }

  if (text.includes("source ")) {
    return THEME.muted;
  }

  if (trimmed.startsWith("$ ")) {
    return THEME.accent;
  }

  return isTitle ? THEME.accent : THEME.text;
}
