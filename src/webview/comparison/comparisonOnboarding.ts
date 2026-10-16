import OnboardingTourComponent, {
  type OnboardingTourStep,
} from "../components/onboarding/onboardingTourComponent";
import type { ComparisonSession } from "./comparisonSession";

/** Use the same interactive tour engine as the single-file workspace. */
export class ComparisonOnboarding {
  private readonly tour: OnboardingTourComponent;
  private readonly button: HTMLButtonElement;
  private readonly mount: HTMLDivElement;
  private frame: number | undefined;

  constructor(
    private readonly root: HTMLElement,
    session: ComparisonSession,
    onFinished: () => void,
  ) {
    this.mount = document.createElement("div");
    this.mount.id = "comparisonOnboardingMount";
    root.append(this.mount);
    this.button = document.createElement("button");
    this.button.className = "workspaceChrome__settingsBtn";
    this.button.textContent = "?";
    this.button.setAttribute("aria-label", "Open getting-started guide");
    this.button.title = "Getting started guide";
    const shortcuts = root.querySelector<HTMLButtonElement>(
      '[aria-label="Keyboard shortcuts"]',
    );
    shortcuts.textContent = "⌨";
    shortcuts.before(this.button);
    const pane = (
      id: string,
      title: string,
      body: string,
    ): OnboardingTourStep => ({
      target: `[data-pane="${id}"]`,
      title,
      body,
      advanceOn: { kind: "custom", check: () => session.pane === id },
    });
    this.tour = new OnboardingTourComponent(
      "#comparisonOnboardingMount",
      [
        {
          target: ".comparisonTracks",
          title: "Compare your audio",
          body: "Each file keeps its own color across waveforms and charts. Click a filename to focus it; use + to add files to this comparison.",
        },
        {
          target: ".comparisonTracks",
          title: "Active, bypass and mute",
          body: "Click a colored lamp to include or bypass that file. Hover a file to reveal the speaker and remove buttons. Mute changes listening only; removing a file does not delete it.",
        },
        pane(
          "stft",
          "Open STFT",
          "Click STFT to compare spectrograms on a shared time, frequency and dBFS scale.",
        ),
        {
          target: ".comparisonDeck",
          title: "Explore a shared range",
          body: "Drag a region to zoom every item together. Ctrl/Cmd + drag selects time only; Shift + drag selects frequency only. Double-click resets the range. The wheel scrolls the page. Right-click for layout and comparison actions.",
        },
        pane(
          "live",
          "Open Live Spec",
          "Click LIVE SPEC to compare the sound field, phase correlation and live spectra at the same playback position.",
        ),
        pane(
          "edit",
          "Edit and export",
          "Click EDIT & EXPORT to select a region, adjust playback filters and export the active files as a mix.",
        ),
        pane(
          "loudness",
          "Compare loudness",
          "Click LOUDNESS for short-term LUFS curves and aligned integrated LUFS, LRA and true-peak statistics.",
        ),
        {
          target: ".comparisonTransport",
          title: "Playback and volume",
          body: "Play the comparison, drag the seek slider or enter a position in seconds. Enter confirms and Escape cancels. Double-click Volume to reset to 100%; enable Loop to repeat playback.",
        },
        {
          target: "[data-open-monitor]",
          title: "Open Monitor",
          body: "Click Monitor on the right of the floating transport to open the shared listening controls.",
          advanceOn: { kind: "visible", selector: ".comparisonMonitorPanel" },
        },
        {
          target: ".comparisonMonitorPanel",
          title: "Try the listening controls",
          body: "Choose L/R/M/S, swap channels, solo a frequency band or open the headphone profile editor. These controls affect listening, not the original analysis. Close Monitor to continue.",
          advanceOn: { kind: "closed", selector: ".comparisonMonitorPanel" },
        },
        {
          target: ".js-openSettings",
          title: "Open pane settings",
          body: "Click the gear to adjust the current view.",
          advanceOn: { kind: "visible", selector: "#settingsOverlay" },
        },
        {
          target: ".settingsOverlay__dialog",
          title: "Adjust the comparison",
          body: "Scroll inside this panel to reach every setting. The options follow the selected view; STFT includes window, frequency scale, color range and waveform controls. Close the panel to continue.",
          advanceOn: { kind: "closed", selector: "#settingsOverlay" },
        },
        {
          target: '[aria-label="Keyboard shortcuts"]',
          title: "Keyboard shortcuts",
          body: "Click the keyboard button or press ? to see the shortcut reference.",
          advanceOn: { kind: "visible", selector: ".keyboardShortcutsOverlay" },
        },
        {
          target: ".keyboardShortcutsOverlay",
          title: "Shortcut reference",
          body: "Keep this reference handy for playback and shared zoom controls. Close it to continue.",
          advanceOn: { kind: "closed", selector: ".keyboardShortcutsOverlay" },
        },
        {
          target: null,
          title: "You're set",
          body: "Reopen this guide anytime with the ? button beside the keyboard button in the top toolbar.",
        },
      ],
      () => {
        delete root.dataset.tourActive;
        onFinished();
      },
      {
        escGuardSelectors: [
          "#settingsOverlay",
          ".comparisonMonitorPanel",
          ".curveCorrectionOverlay",
          ".keyboardShortcutsOverlay",
        ],
      },
    );
    this.button.onclick = () => this.start();
  }

  start(): void {
    if (this.tour.active || this.frame !== undefined) {
      return;
    }
    this.root.dataset.tourActive = "true";
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.tour.start();
    });
  }

  dispose(): void {
    if (this.frame !== undefined) {
      cancelAnimationFrame(this.frame);
    }
    delete this.root.dataset.tourActive;
    this.tour.dispose();
    this.button.remove();
    this.mount.remove();
  }
}
