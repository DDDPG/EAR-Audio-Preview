import type {
  AlignmentEstimate,
  AlignmentResidual,
} from "../../shared/audioAlignment";

export interface AlignmentJob {
  kind: "alignment";
  a: Float32Array[];
  b: Float32Array[];
  sampleRate: number;
}
export interface AlignmentReply {
  kind: "alignment";
  estimate?: AlignmentEstimate;
  residual?: AlignmentResidual;
  error?: string;
}
