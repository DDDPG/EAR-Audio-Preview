import {
  freeEssentiaVector,
  type EssentiaInstance,
} from "../../shared/essentiaTypes";

/** Raw FFT magnitude; windowing and dBFS calibration stay common to both backends. */
export function essentiaSpectrum(
  essentia: EssentiaInstance,
): (frame: Float64Array) => Float32Array {
  return (frame) => {
    const input = essentia.arrayToVector(Float32Array.from(frame));
    let output: unknown;
    try {
      output = essentia.Spectrum(input, frame.length).spectrum;
      return essentia.vectorToArray(output).slice();
    } finally {
      freeEssentiaVector(output);
      freeEssentiaVector(input);
    }
  };
}
