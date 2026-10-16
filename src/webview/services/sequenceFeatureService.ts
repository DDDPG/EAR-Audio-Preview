import { PageRpcClient } from "./pageRpcClient";
import Service from "../service";
import { computeAdaptiveSequenceHopSec } from "../../shared/sequenceHop";
import {
  profileFromWire,
  type SequenceFeatureProfile,
  type SequenceAnalysisProgress,
  type SequenceFeatureProfileWire,
} from "../../shared/sequenceFeatureCompute";
import {
  WebviewMessageType,
  ExtMessageType,
  type PostMessage,
} from "../../message";

export type { SequenceFeatureProfile, SequenceAnalysisProgress };

function monoDownmix(buffer: AudioBuffer): Float32Array {
  const ch0 = buffer.getChannelData(0);
  if (buffer.numberOfChannels < 2) {
    return ch0.slice();
  }
  const ch1 = buffer.getChannelData(1);
  const out = new Float32Array(ch0.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = (ch0[i] + ch1[i]) * 0.5;
  }
  return out;
}

export default class SequenceFeatureService extends Service {
  private _requestIds = new Set<string>();
  private _profileCache: SequenceFeatureProfile | null = null;
  private _analyzePromise: Promise<SequenceFeatureProfile | null> | null = null;

  constructor(
    private _audioBuffer: AudioBuffer,
    private _rpc: PageRpcClient,
    private _send?: PostMessage,
  ) {
    super();
  }

  public analyzeProfile(
    hopSec?: number,
    onProgress?: SequenceAnalysisProgress,
  ): Promise<SequenceFeatureProfile | null> {
    // The host currently returns the final profile without incremental progress.
    void onProgress;
    if (this._isDisposed) {
      return Promise.resolve(null);
    }
    const effectiveHop =
      hopSec ??
      computeAdaptiveSequenceHopSec(
        this._audioBuffer.duration,
        this._audioBuffer.sampleRate,
      );
    if (this._profileCache) {
      return Promise.resolve(this._profileCache);
    }
    if (this._analyzePromise) {
      return this._analyzePromise;
    }

    this._analyzePromise = this._runAnalysis(effectiveHop).finally(() => {
      this._analyzePromise = null;
    });
    return this._analyzePromise;
  }

  private _runAnalysis(hopSec: number): Promise<SequenceFeatureProfile | null> {
    const mono = monoDownmix(this._audioBuffer);
    let requestId = "";
    return this._rpc
      .request(
        ExtMessageType.SEQUENCE_FEATURES,
        (id) => {
          requestId = id;
          this._requestIds.add(id);
          return {
            type: WebviewMessageType.ANALYZE_SEQUENCE_FEATURES,
            data: {
              requestId: id,
              samples: mono.buffer,
              sampleRate: this._audioBuffer.sampleRate,
              hopSec,
            },
          };
        },
        10 * 60 * 1000,
        () => this._rpc.postCancellation(requestId, this._send),
        this._send,
      )
      .then((value) => {
        if (this._isDisposed || !value) {
          return null;
        }
        const profile = profileFromWire(value as SequenceFeatureProfileWire);
        this._profileCache = profile;
        return profile;
      })
      .catch((error) => {
        if (this._isDisposed) {
          return null;
        }
        throw error;
      })
      .finally(() => this._requestIds.delete(requestId));
  }

  public dispose(): void {
    super.dispose();
    for (const id of this._requestIds) {
      this._rpc.cancel(id);
    }
    this._requestIds.clear();
    this._profileCache = null;
  }
}
