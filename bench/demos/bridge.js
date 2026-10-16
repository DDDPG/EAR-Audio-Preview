/* Browser adapter only: UI, analysis, decoding and rendering use production code. */
let manifest;
const send = (data) => window.postMessage(data, location.origin);
window.acquireVsCodeApi = () => ({
  getState: () => ({ onboardingSeen: true }),
  setState: () => {},
  postMessage: async (message) => {
    try {
      if (message.type === "compare.ready") {
        manifest = await (
          await fetch(
            `/manifest?count=${new URLSearchParams(location.search).get("count") || 4}`,
          )
        ).json();
        send({
          type: "compare.files",
          initial: true,
          onboardingSeen: true,
          files: manifest,
          workerUri: "/dist/comparisonWorker.js",
          loudnessWorkerUri: "/dist/comparisonLoudnessWorker.js",
          loudnessWorkletUri: "/dist/loudness.worklet.js",
        });
      } else if (message.type === "compare.read") {
        const index = manifest.findIndex((f) => f.id === message.id);
        const response = await fetch(
          `/audio?track=${index}&offset=${message.offset}`,
        );
        send({
          type: "compare.data",
          id: message.id,
          revision: message.revision,
          offset: message.offset,
          length: Number(response.headers.get("X-Audio-Length")),
          samples: await response.arrayBuffer(),
        });
      } else if (message.type === "compare.confirm") {
        send({
          type: "compare.confirmed",
          requestId: message.requestId,
          accepted: true,
        });
      } else if (message.type === "compare.remove") {
        manifest = manifest.filter((f) => f.id !== message.id);
      }
    } catch (error) {
      send({
        type: "compare.failure",
        id: message.id,
        revision: message.revision,
        message: String(error),
      });
    }
  },
});
