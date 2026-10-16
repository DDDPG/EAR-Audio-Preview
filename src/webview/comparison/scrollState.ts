import type { ComparisonView, ComparisonPane } from "./comparisonSession";
import type { ComparisonStftSettings } from "./stftSettings";
interface ScrollState {
  left: number;
  top: number;
}
export interface ComparisonWebviewState {
  onboardingSeen?: boolean;
  scroll?: ScrollState;
  view?: ComparisonView;
  pane?: ComparisonPane;
  stft?: ComparisonStftSettings;
  controls?: {
    windowMs: number;
    hopMs: number;
    tiltDbPerOct: number;
    weighting: "none" | "a";
    waveformScale: number;
    waveformVisible: boolean;
    minAmplitude: number;
    maxAmplitude: number;
    expanded: boolean;
  };
  layout?: "auto" | "row" | "column";
}
/** Restore only after async audio loading has made the saved position reachable. */
export function retainComparisonScroll(
  root: HTMLElement,
  saved: ScrollState | undefined,
  save: (scroll: ScrollState) => void,
): () => void {
  const scroller = document.scrollingElement ?? document.documentElement;
  let pending =
    saved && Number.isFinite(saved.top) && Number.isFinite(saved.left)
      ? { top: Math.max(0, saved.top), left: Math.max(0, saved.left) }
      : undefined;
  const restore = () => {
    if (
      !pending ||
      scroller.scrollHeight - scroller.clientHeight < pending.top
    ) {
      return;
    }
    scroller.scrollTop = pending.top;
    scroller.scrollLeft = pending.left;
    pending = undefined;
  };
  const onScroll = () => {
    if (!pending) {
      save({ top: scroller.scrollTop, left: scroller.scrollLeft });
    }
  };
  const cancelRestore = () => {
    pending = undefined;
  };
  const observer = new MutationObserver(restore);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("wheel", cancelRestore, { passive: true });
  window.addEventListener("pointerdown", cancelRestore, { passive: true });
  restore();
  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("wheel", cancelRestore);
    window.removeEventListener("pointerdown", cancelRestore);
  };
}
