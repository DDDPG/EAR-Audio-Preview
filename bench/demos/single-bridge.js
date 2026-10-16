/* File/host IPC adapter. All displayed analysis and EQ use production code. */
const send = (data) => window.postMessage(data, location.origin);
window.demoHostErrors = [];
window.acquireVsCodeApi = () => ({
  getState: () => ({ onboardingSeen: true }),
  setState() {},
  async postMessage(message) {
    const d = message.data;
    try {
      if (message.type === "CONFIG")
        send({
          type: "CONFIG",
          data: {
            autoAnalyze: true,
            headphoneEq: { bypassed: false, profile: null },
            playerDefault: { initialVolume: 30, enableSpacekeyPlay: true },
            analyzeDefault: {
              waveformVerticalScale: 0.35,
              spectrogramVisible: true,
              spectrogramVerticalScale: 0.6,
              frequencyScale: 1,
              windowSizeIndex: 2,
            },
            fileExt: "mp3",
            fileName: "B.mp3",
            loudnessWorkletUri: "/dist/loudness.worklet.js",
            onboardingSeen: true,
          },
        });
      else if (message.type === "DATA") {
        const response = await fetch(`/audio?track=1&offset=${d.start}`);
        const samples = await response.arrayBuffer();
        send({
          type: "DATA",
          data: {
            samples,
            start: d.start,
            end: d.start + samples.byteLength,
            wholeLength: Number(response.headers.get("X-Audio-Length")),
          },
        });
      } else if (message.type === "ANALYZE_SEQUENCE_FEATURES") {
        const response = await fetch(
          `/features?rate=${d.sampleRate}&hop=${d.hopSec}`,
          { method: "POST", body: d.samples },
        );
        if (!response.ok) throw new Error(await response.text());
        const json = await response.json();
        const profile = Object.fromEntries(
          Object.entries(json).map(([k, v]) => [
            k,
            Array.isArray(v) ? new Float32Array(v).buffer : v,
          ]),
        );
        window.demoFeatureEvidence = {
          frames: json.timeSec.length,
          sampleRate: json.sampleRate,
          pitchedFrames: json.f0Hz.filter((v) => v > 0).length,
        };
        send({
          type: "SEQUENCE_FEATURES",
          data: { requestId: d.requestId, profile },
        });
      } else if (message.type === "AUTOEQ_REQUEST") {
        send({
          type: "AUTOEQ_RESULT",
          data: {
            requestId: d.requestId,
            error: "Offline capture: import a local preset",
          },
        });
      } else if (message.type === "EQ_PRESET_OP") {
        let payload;
        if (d.op === "list") payload = { presets: [], hasWorkspace: false };
        else if (d.op === "import") {
          const response = await fetch("/preset");
          if (!response.ok) throw new Error(await response.text());
          payload = {
            content: await response.text(),
            fileName: "Sennheiser HD650 ParametricEQ.txt",
          };
        } else throw new Error("Unsupported demo preset operation");
        send({
          type: "EQ_PRESET_OP_RESULT",
          data: { requestId: d.requestId, payload },
        });
      }
    } catch (error) {
      window.demoHostErrors.push({ type: message.type, error: String(error) });
      const types = {
        AUTOEQ_REQUEST: "AUTOEQ_RESULT",
        EQ_PRESET_OP: "EQ_PRESET_OP_RESULT",
        ANALYZE_SEQUENCE_FEATURES: "SEQUENCE_FEATURES",
      };
      if (types[message.type])
        send({
          type: types[message.type],
          data: { requestId: d.requestId, error: String(error) },
        });
      console.error(error);
    }
  },
});
