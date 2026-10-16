import { loadEssentiaInNode } from "./essentiaHost";
import { NativeSpectrum } from "../webview/comparison/comparisonDsp";
import { essentiaSpectrum } from "../webview/comparison/essentiaSpectrum";
import { computeAnalysisJob } from "../webview/comparison/computeAnalysisJob";
import type {
  AnalysisJob,
  AnalysisReply,
} from "../webview/comparison/analysisProtocol";

/** Page-owned engines; Essentia's dynamic JS glue is restricted to the Node host. */
export class ComparisonAnalysisHost {
  private _engines = new Map<string, NativeSpectrum>();
  public async analyze(
    job: AnalysisJob,
    shouldCancel: () => boolean,
  ): Promise<AnalysisReply | null> {
    const essentia = await loadEssentiaInNode();
    if (shouldCancel()) {
      return null;
    }
    if (!essentia) {
      throw new Error("Essentia is unavailable in the extension host");
    }
    const key = `${job.kind}-${job.trackId}`;
    let engine = this._engines.get(key);
    if (!engine) {
      engine = new NativeSpectrum(essentiaSpectrum(essentia));
      this._engines.set(key, engine);
      if (this._engines.size > 8) {
        this._engines.delete(this._engines.keys().next().value);
      }
    }
    return computeAnalysisJob(job, engine, shouldCancel);
  }
  public dispose(): void {
    this._engines.clear();
  }
}
