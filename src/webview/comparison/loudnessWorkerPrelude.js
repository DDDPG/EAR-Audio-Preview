/* eslint-env worker */
/* eslint-disable @typescript-eslint/no-unused-vars -- Bindings are used by the unmodified worklet appended at build time. */
/* The build appends the package's unmodified AudioWorklet processor below. */
let sampleRate = 48000;
let currentFrame = 0;
let currentTime = 0;
let processorClass;
let snapshots = [];
class AudioWorkletProcessor {
  constructor() {
    this.port = {
      postMessage: (value) =>
        snapshots.push({
          ...value,
          currentMeasurements: value.currentMeasurements.map((item) => ({
            ...item,
          })),
        }),
    };
  }
}
function registerProcessor(name, processor) {
  processorClass = processor;
}
