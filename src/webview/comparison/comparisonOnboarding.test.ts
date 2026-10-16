import { ComparisonOnboarding } from "./comparisonOnboarding";
import { ComparisonSession } from "./comparisonSession";

describe("comparison onboarding", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    document.body.innerHTML = `<div id="root"><div class="comparisonTracks"></div><button aria-label="Keyboard shortcuts">?</button><button data-pane="stft">STFT</button><div class="comparisonDeck"></div><div class="comparisonTransport"></div></div>`;
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it("reuses the interactive tour, advances on pane selection and can reopen after skip", () => {
    const root = document.getElementById("root");
    const session = new ComparisonSession();
    session.pane = "live";
    const finished = jest.fn();
    const guide = new ComparisonOnboarding(root, session, finished);
    guide.start();
    jest.advanceTimersByTime(20);
    expect(root.dataset.tourActive).toBe("true");
    const next = root.querySelector<HTMLButtonElement>(".js-tourNext");
    next.click();
    next.click();
    expect(root.querySelector(".onboardingTour__title").textContent).toBe(
      "Open STFT",
    );
    session.pane = "stft";
    jest.advanceTimersByTime(150);
    expect(root.querySelector(".onboardingTour__title").textContent).toBe(
      "Explore a shared range",
    );
    root.querySelector<HTMLButtonElement>(".js-tourSkip").click();
    expect(finished).toHaveBeenCalledTimes(1);
    expect(root.dataset.tourActive).toBeUndefined();
    root
      .querySelector<HTMLButtonElement>(
        '[aria-label="Open getting-started guide"]',
      )
      .click();
    jest.advanceTimersByTime(20);
    expect(root.querySelector(".onboardingTour").hasAttribute("hidden")).toBe(
      false,
    );
    guide.dispose();
    expect(root.querySelector(".onboardingTour")).toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it("cancels a pending first-open frame when disposed", () => {
    const root = document.getElementById("root");
    const finished = jest.fn();
    const guide = new ComparisonOnboarding(
      root,
      new ComparisonSession(),
      finished,
    );
    guide.start();
    guide.dispose();
    jest.runOnlyPendingTimers();
    expect(finished).not.toHaveBeenCalled();
    expect(root.dataset.tourActive).toBeUndefined();
  });
});
