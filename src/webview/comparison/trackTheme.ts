/** Categorical track colors shared across waveform, STFT, live, and loudness. */
export const comparisonColors = [
  "#5cc248",
  "#00b4d8",
  "#ff9800",
  "#c77dff",
  "#ff6685",
  "#e2cf4a",
  "#61d4bf",
  "#859dff",
] as const;

export interface TrackThemeVariants {
  base: string;
  lufsM: string;
  lufsS: string;
  lufsI: string;
  truePeak: string;
  f0: string;
  onset: string;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const raw = hex.replace("#", "");
  const full =
    raw.length === 3
      ? raw
          .split("")
          .map((c) => c + c)
          .join("")
      : raw;
  const n = Number.parseInt(full, 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) {
    return { h: 0, s: 0, l };
  }
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  switch (max) {
    case r:
      h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      break;
    case g:
      h = ((b - r) / d + 2) / 6;
      break;
    default:
      h = ((r - g) / d + 4) / 6;
      break;
  }
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number): string {
  const hh = ((h % 360) + 360) % 360;
  const sat = clamp(s, 0, 1);
  const lit = clamp(l, 0, 1);
  const c = (1 - Math.abs(2 * lit - 1)) * sat;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = lit - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (hh < 60) {
    r = c;
    g = x;
  } else if (hh < 120) {
    r = x;
    g = c;
  } else if (hh < 180) {
    g = c;
    b = x;
  } else if (hh < 240) {
    g = x;
    b = c;
  } else if (hh < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const to = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function variant(
  hex: string,
  opts: { s?: number; l?: number; h?: number },
): string {
  const base = hexToHsl(hex);
  return hslToHex(
    base.h + (opts.h ?? 0),
    clamp(base.s * (opts.s ?? 1), 0.15, 1),
    clamp(base.l * (opts.l ?? 1), 0.18, 0.82),
  );
}

/** Per-feature colors from one track theme — same hue family, varied S/L. */
export function themeVariants(color: string): TrackThemeVariants {
  return {
    base: color,
    lufsM: variant(color, { l: 1.15, s: 0.95 }),
    lufsS: variant(color, { l: 0.95, s: 1.05 }),
    lufsI: variant(color, { l: 0.72, s: 1.1 }),
    truePeak: variant(color, { l: 0.55, s: 1.15, h: 8 }),
    f0: variant(color, { l: 0.85, s: 0.9, h: -12 }),
    onset: variant(color, { l: 1.05, s: 0.85, h: 18 }),
  };
}
