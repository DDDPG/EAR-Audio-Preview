import type { HeadphoneEqProfile } from "../webview/types/headphoneEq";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAudioParam(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(Math.fround(value));
}

function isGainDb(value: unknown): value is number {
  if (!isAudioParam(value)) {
    return false;
  }
  const linear = Math.fround(Math.pow(10, value / 20));
  return Number.isFinite(linear) && linear > 0;
}

/** Validate external JSON before UI formatting, Web Audio, or snapshot reset. */
export function isHeadphoneEqProfile(
  value: unknown,
): value is HeadphoneEqProfile {
  const visited = new Set<unknown>();
  let current = value;
  while (current !== undefined) {
    if (!isRecord(current) || visited.has(current)) {
      return false;
    }
    visited.add(current);
    const meta = current.meta;
    if (
      typeof current.id !== "string" ||
      typeof current.displayName !== "string" ||
      typeof current.isCustomized !== "boolean" ||
      !isGainDb(current.preampDb) ||
      !isRecord(meta) ||
      !["name", "source", "rig", "form", "targetLabel"].every(
        (key) => typeof meta[key] === "string",
      ) ||
      !Array.isArray(current.filters)
    ) {
      return false;
    }
    for (const band of current.filters) {
      if (
        !isRecord(band) ||
        typeof band.enabled !== "boolean" ||
        !["peaking", "lowshelf", "highshelf"].includes(band.type as string) ||
        !isAudioParam(band.frequency) ||
        Math.fround(band.frequency) <= 0 ||
        !isAudioParam(band.q) ||
        Math.fround(band.q) <= 0 ||
        !isGainDb(band.gainDb)
      ) {
        return false;
      }
    }
    current = current.baseSnapshot;
  }
  return visited.size > 0;
}
