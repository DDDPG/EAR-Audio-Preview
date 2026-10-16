/* eslint-disable @typescript-eslint/naming-convention */
import type {
  AutoEqEntries,
  AutoEqEntryVariant,
  AutoEqTarget,
  EqFilterBand,
  EqFilterType,
  HeadphoneEqProfile,
} from "../types/headphoneEq";
import type { AutoEqRequestEndpoint } from "../../message";

const CACHE_MAX = 48;

/** Single source of truth: the wire endpoint union from message.ts. */
export type AutoEqEndpoint = AutoEqRequestEndpoint;

export interface AutoEqHostRequest {
  endpoint: AutoEqEndpoint;
  body?: {
    name: string;
    source: string;
    rig: string;
    target: string;
    fs: number;
  };
}

type AutoEqHostFn = (req: AutoEqHostRequest) => Promise<unknown>;

function cacheKey(parts: {
  name: string;
  source: string;
  rig: string;
  target: string;
  fs: number;
}): string {
  return `${parts.name}|${parts.source}|${parts.rig}|${parts.target}|${parts.fs}`;
}

function lruSet(
  cache: Map<string, HeadphoneEqProfile>,
  key: string,
  value: HeadphoneEqProfile,
): void {
  if (cache.has(key)) {
    cache.delete(key);
  }
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first) {
      cache.delete(first);
    }
  }
}

function mapFilterType(raw: string): EqFilterType {
  const t = raw.toUpperCase();
  if (t === "LOW_SHELF" || t === "LSC") {
    return "lowshelf";
  }
  if (t === "HIGH_SHELF" || t === "HSC") {
    return "highshelf";
  }
  return "peaking";
}

function toWebAudioType(type: EqFilterType): BiquadFilterType {
  if (type === "lowshelf") {
    return "lowshelf";
  }
  if (type === "highshelf") {
    return "highshelf";
  }
  return "peaking";
}

export { toWebAudioType };

interface RawPeqFilter {
  type?: string;
  fc?: number;
  q?: number;
  gain?: number;
  enabled?: boolean;
}

interface EqualizeResponse {
  parametric_eq?: {
    preamp?: number;
    filters?: RawPeqFilter[];
  };
}

export function buildProfileId(
  name: string,
  variant: AutoEqEntryVariant,
  targetLabel: string,
): string {
  return `${name}|${variant.source}|${variant.rig}|${targetLabel}`;
}

export function buildDisplayName(name: string, targetLabel: string): string {
  return `${name} · ${targetLabel}`;
}

export function mapEqualizeResponse(
  name: string,
  variant: AutoEqEntryVariant,
  targetLabel: string,
  body: EqualizeResponse,
): HeadphoneEqProfile {
  const peq = body.parametric_eq;
  if (!peq?.filters?.length) {
    throw new Error("AutoEq returned no parametric EQ filters");
  }
  const filters: EqFilterBand[] = peq.filters.map((f) => ({
    enabled: f.enabled !== false,
    type: mapFilterType(f.type ?? "PEAKING"),
    frequency: Number(f.fc) || 1000,
    gainDb: Number(f.gain) || 0,
    q: Number(f.q) || 1,
  }));
  const preampDb =
    typeof peq.preamp === "number"
      ? peq.preamp
      : -Math.max(0, ...filters.map((f) => (f.gainDb > 0 ? f.gainDb : 0)));
  const profile: HeadphoneEqProfile = {
    id: buildProfileId(name, variant, targetLabel),
    displayName: buildDisplayName(name, targetLabel),
    meta: {
      name,
      source: variant.source,
      rig: variant.rig,
      form: variant.form,
      targetLabel,
    },
    preampDb,
    filters,
    isCustomized: false,
  };
  profile.baseSnapshot = structuredClone(profile);
  return profile;
}

export function compatibleTargets(
  targets: AutoEqTarget[],
  variant: AutoEqEntryVariant,
): AutoEqTarget[] {
  return targets.filter((t) =>
    t.compatible.some(
      (c) =>
        c.source === variant.source &&
        c.form === variant.form &&
        (!c.rig || c.rig === variant.rig),
    ),
  );
}

/** Instance caches follow the page-owned RPC connection; no global host binding. */
export class AutoEqApiClient {
  private _disposed = false;
  private _cache = new Map<string, HeadphoneEqProfile>();
  private _entriesPromise: Promise<AutoEqEntries> | null = null;
  private _targetsPromise: Promise<AutoEqTarget[]> | null = null;
  constructor(private readonly _requestHost: AutoEqHostFn) {}

  public async fetchEntries(): Promise<AutoEqEntries> {
    this.ensureActive();
    if (!this._entriesPromise) {
      this._entriesPromise = (
        this._requestHost({ endpoint: "entries" }) as Promise<AutoEqEntries>
      ).catch((err) => {
        this._entriesPromise = null;
        throw err;
      });
    }
    const entries = await this._entriesPromise;
    this.ensureActive();
    return entries;
  }

  public async fetchTargets(): Promise<AutoEqTarget[]> {
    this.ensureActive();
    if (!this._targetsPromise) {
      this._targetsPromise = (
        this._requestHost({ endpoint: "targets" }) as Promise<AutoEqTarget[]>
      ).catch((err) => {
        this._targetsPromise = null;
        throw err;
      });
    }
    const targets = await this._targetsPromise;
    this.ensureActive();
    return targets;
  }

  public async equalizeParametric(opts: {
    name: string;
    variant: AutoEqEntryVariant;
    targetLabel: string;
    fs: number;
  }): Promise<HeadphoneEqProfile> {
    this.ensureActive();
    const key = cacheKey({
      name: opts.name,
      source: opts.variant.source,
      rig: opts.variant.rig,
      target: opts.targetLabel,
      fs: opts.fs,
    });
    const cached = this._cache.get(key);
    if (cached) {
      return structuredClone(cached);
    }

    const body = (await this._requestHost({
      endpoint: "equalize",
      body: {
        name: opts.name,
        source: opts.variant.source,
        rig: opts.variant.rig,
        target: opts.targetLabel,
        fs: opts.fs,
      },
    })) as EqualizeResponse;
    this.ensureActive();
    const profile = mapEqualizeResponse(
      opts.name,
      opts.variant,
      opts.targetLabel,
      body,
    );
    lruSet(this._cache, key, profile);
    return structuredClone(profile);
  }

  private ensureActive(): void {
    if (this._disposed) {
      throw new Error("AutoEq client disposed");
    }
  }

  public dispose(): void {
    this._disposed = true;
    this._cache.clear();
    this._entriesPromise = null;
    this._targetsPromise = null;
  }
}
