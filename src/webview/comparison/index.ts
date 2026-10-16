import type { ComparisonChangeReason } from "./comparisonSession";
import { ComparisonOnboarding } from "./comparisonOnboarding";
import "../styles/vscode.css";
import "../components/liveMeters/liveMeters.css";
import "./comparison.css";
import { ComparisonApp } from "./comparisonApp";
import {
  retainComparisonScroll,
  type ComparisonWebviewState,
} from "./scrollState";
import type {
  ComparisonRequest,
  ComparisonResponse,
} from "../../comparison/protocol";
declare function acquireVsCodeApi(): {
  postMessage: (message: ComparisonRequest) => void;
  getState?: () => ComparisonWebviewState | undefined;
  setState?: (state: ComparisonWebviewState) => void;
};
const vscode = acquireVsCodeApi();
let state = vscode.getState?.() ?? {};
const root = document.getElementById("root");
const app = new ComparisonApp(root, (message) => vscode.postMessage(message));
app.session.restoreSettings(state);
let pendingView = state.view;
app.session.addEventListener(
  "change",
  (event: CustomEvent<{ reason: ComparisonChangeReason }>) => {
    if (pendingView && event.detail.reason === "loaded") {
      const view = pendingView;
      pendingView = undefined;
      app.session.setView(view);
    }
    const {
      windowMs,
      hopMs,
      tiltDbPerOct,
      weighting,
      waveformScale,
      waveformVisible,
      minAmplitude,
      maxAmplitude,
      expanded,
    } = app.session;
    state = {
      ...state,
      layout: app.session.stftLayout,
      pane: app.session.pane,
      stft: { ...app.session.stft },
      view: pendingView ?? { ...app.session.view },
      controls: {
        windowMs,
        hopMs,
        tiltDbPerOct,
        weighting,
        waveformScale,
        waveformVisible,
        minAmplitude,
        maxAmplitude,
        expanded,
      },
    };
    vscode.setState?.(state);
  },
);
const cleanup = retainComparisonScroll(root, state.scroll, (scroll) => {
  state = { ...state, scroll };
  vscode.setState?.(state);
});
window.addEventListener("pagehide", cleanup, { once: true });

const onboarding = new ComparisonOnboarding(root, app.session, () => {
  state = { ...state, onboardingSeen: true };
  vscode.postMessage({ type: "compare.onboardingSeen" });
  vscode.setState?.(state);
});
const startOnboarding = (event: MessageEvent<ComparisonResponse>) => {
  const message = event.data;
  if (message?.type !== "compare.files" || !message.initial) {
    return;
  }
  window.removeEventListener("message", startOnboarding);
  if (!state.onboardingSeen && !message.onboardingSeen) {
    onboarding.start();
  }
};
window.addEventListener("message", startOnboarding);
window.addEventListener(
  "pagehide",
  () => {
    window.removeEventListener("message", startOnboarding);
    onboarding.dispose();
  },
  { once: true },
);
