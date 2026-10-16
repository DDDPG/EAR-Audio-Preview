/* eslint-env worker */
/* eslint-disable @typescript-eslint/no-unused-vars -- currentTime is read by the worklet kernel concatenated before this adapter. */
/* global processorClass, sampleRate:writable, currentFrame:writable, currentTime:writable, snapshots:writable */
let processor;
self.onmessage = (event) => {
  const message = event.data;
  try {
    if (message.type === "init") {
      sampleRate = message.sampleRate;
      currentFrame = 0;
      currentTime = 0;
      snapshots = [];
      processor = new processorClass({
        numberOfInputs: 1,
        processorOptions: { capacity: message.duration, interval: message.hop },
      });
    } else if (message.type === "chunk") {
      for (let offset = 0; offset < message.left.length; offset += 128) {
        const left = message.left.subarray(offset, offset + 128);
        const channels = message.right
          ? [left, message.right.subarray(offset, offset + 128)]
          : [left];
        currentTime = currentFrame / sampleRate;
        processor.process([channels], [], {});
        currentFrame += left.length;
      }
    } else if (message.type === "finish") {
      if (currentFrame > 0) {
        // Flush the original kernel's pending measurements without adding audio.
        currentTime = currentFrame / sampleRate;
        processor.interval = 0;
        processor.process([], [], {});
      }
      self.postMessage({ id: message.id, snapshots });
      snapshots = [];
      processor = null;
      return;
    }
    self.postMessage({ id: message.id });
  } catch (error) {
    self.postMessage({ id: message.id, error: String(error) });
  }
};
