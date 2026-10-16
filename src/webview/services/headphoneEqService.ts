import { toWebAudioType } from "./autoEqApiClient";
import { computeListenMatchDb } from "../utils/eqCanvasMath";
import type HeadphoneEqSettingsService from "./headphoneEqSettingsService";
import type { EqFilterBand } from "../types/headphoneEq";

export interface EqChainNodes {
  input: AudioNode;
  output: AudioNode;
}

/**
 * Builds a PEQ chain (preamp + biquads) for insertion before the gain node.
 * Caller owns disconnecting prior nodes via disposeEqNodes().
 */
export function createEqChain(
  ctx: BaseAudioContext,
  settings: Pick<HeadphoneEqSettingsService, "profile" | "shouldApplyEq">,
): { nodes: AudioNode[]; chain: EqChainNodes | null } {
  const nodes: AudioNode[] = [];
  if (!settings.shouldApplyEq() || !settings.profile) {
    return { nodes, chain: null };
  }
  const { preampDb, filters } = settings.profile;

  const preamp = ctx.createGain();
  preamp.gain.value = Math.pow(10, preampDb / 20);
  nodes.push(preamp);

  let last: AudioNode = preamp;
  for (const band of filters) {
    if (!band.enabled) {
      continue;
    }
    const f = ctx.createBiquadFilter();
    f.type = toWebAudioType(band.type);
    f.frequency.value = band.frequency;
    f.Q.value = band.q;
    f.gain.value = band.gainDb;
    last.connect(f);
    last = f;
    nodes.push(f);
  }

  const listenMatch = ctx.createGain();
  const matchDb = computeListenMatchDb(preampDb, filters);
  listenMatch.gain.value = Math.pow(10, matchDb / 20);
  last.connect(listenMatch);
  last = listenMatch;
  nodes.push(listenMatch);

  return { nodes, chain: { input: preamp, output: last } };
}

export type ExportEqSnapshot = Pick<
  HeadphoneEqSettingsService,
  "profile" | "shouldApplyEq"
>;

/** Snapshot before asynchronous rendering; later UI edits cannot change the export. */
export function snapshotExportEq(
  settings?: HeadphoneEqSettingsService,
): ExportEqSnapshot {
  if (!settings?.shouldApplyEq() || !settings.profile) {
    throw new Error(
      "Enable a headphone EQ profile before applying it to an export",
    );
  }
  const profile = settings.profile;
  return {
    profile: {
      ...profile,
      filters: profile.filters.map((band) => ({ ...band })),
    },
    shouldApplyEq: () => true,
  };
}

/** Uses the same preamp, PEQ and listen-match gain as monitoring, excluding master volume. */
export async function applyExportEq(
  buffer: AudioBuffer,
  settings?: ExportEqSnapshot,
): Promise<AudioBuffer> {
  if (!settings) {
    return buffer;
  }
  const context = new OfflineAudioContext(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate,
  );
  const source = context.createBufferSource();
  source.buffer = buffer;
  const { nodes, chain } = createEqChain(context, settings);
  source.connect(chain?.input ?? context.destination);
  chain?.output.connect(context.destination);
  source.start();
  try {
    return await context.startRendering();
  } finally {
    source.disconnect();
    disposeEqNodes(nodes);
  }
}

export function disposeEqNodes(nodes: AudioNode[]): void {
  for (const n of [...nodes].reverse()) {
    try {
      n.disconnect();
    } catch {
      /* ok */
    }
  }
}

export function applyBandToFilter(
  filter: BiquadFilterNode,
  band: EqFilterBand,
): void {
  filter.type = toWebAudioType(band.type);
  filter.frequency.value = band.frequency;
  filter.Q.value = band.q;
  filter.gain.value = band.gainDb;
}
