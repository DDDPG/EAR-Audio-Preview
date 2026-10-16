import Component from "../component";
import type AnalyzeSettingsService from "../services/analyzeSettingsService";
import { EventType } from "../events";
import { WebviewMessageType, type PostMessage } from "../../message";
import type HeadphoneEqSettingsService from "../services/headphoneEqSettingsService";
import AutoEqHostClient from "../services/autoEqHostClient";
import EqPresetHostClient from "../services/eqPresetHostClient";
import { AutoEqApiClient } from "../services/autoEqApiClient";
import { PageRpcClient } from "../services/pageRpcClient";
import LiveMonitoringBarComponent from "../components/liveMeters/liveMonitoringBarComponent";
import CurveCorrectionOverlayComponent from "../components/curveCorrection/curveCorrectionOverlayComponent";
import { createComparisonLiveSettings } from "./comparisonLiveView";
import type { ComparisonTransport } from "./comparisonTransport";
import type {
  ComparisonRequest,
  ComparisonResponse,
} from "../../comparison/protocol";

/** The single-file monitor and EQ editor, connected to the comparison audio bus. */
export class ComparisonMonitor extends Component {
  private _curve: CurveCorrectionOverlayComponent | null = null;
  private readonly _settings: AnalyzeSettingsService;
  private readonly _panel: HTMLElement;
  private readonly _trigger: HTMLButtonElement;
  private readonly _post: PostMessage;
  private readonly _presetHost: EqPresetHostClient;
  private readonly _rpc: PageRpcClient;
  private _open = false;

  constructor(
    private readonly root: HTMLElement,
    transport: ComparisonTransport,
    eq: HeadphoneEqSettingsService,
    post: (message: ComparisonRequest) => void,
    rpc?: PageRpcClient,
  ) {
    super();
    this._settings = createComparisonLiveSettings(
      transport.context?.sampleRate || 48000,
    );
    this._disposables.push(this._settings);
    this._post = (message) => {
      if (
        WebviewMessageType.isAutoEqRequest(message) ||
        WebviewMessageType.isEqPresetOp(message) ||
        WebviewMessageType.isSaveEqSettings(message) ||
        WebviewMessageType.isWriteEqProfile(message)
      ) {
        post({ type: "compare.eq", message });
      }
    };
    this._rpc = rpc ?? this._register(new PageRpcClient(this._post));
    const autoEq = new AutoEqHostClient(this._rpc);
    const autoEqApi = this._register(
      new AutoEqApiClient((request) => autoEq.request(request)),
    );
    this._presetHost = new EqPresetHostClient(this._rpc);
    this._trigger = root.querySelector("[data-open-monitor]");
    const mount = document.createElement("div");
    mount.innerHTML = `<section class="comparisonMonitorPanel" role="dialog" aria-label="Monitor" hidden><header><h2>Monitor</h2><button type="button" data-close-monitor aria-label="Close monitor">×</button></header><div id="comparisonMonitorMount"></div></section><div id="comparisonCurveMount"></div>`;
    root.append(mount);
    this._register({ dispose: () => mount.remove() });
    this._panel = mount.querySelector(".comparisonMonitorPanel");
    const openCurve = () => {
      this.close(false);
      if (!this._curve) {
        this._curve = new CurveCorrectionOverlayComponent(
          "#comparisonCurveMount",
          eq,
          transport.context?.sampleRate || 48000,
          this._post,
          this._presetHost,
          autoEqApi,
        );
        this._disposables.push(this._curve);
      }
      this._curve.open();
    };
    this._disposables.push(
      new LiveMonitoringBarComponent(
        "#comparisonMonitorMount",
        this._settings,
        eq,
        openCurve,
      ),
    );
    this._addEventlistener(
      this._settings,
      EventType.AS_UPDATE_LIVE_MONITORING_MODE,
      () =>
        transport.setMonitoring(
          this._settings.liveMonitoringMode,
          transport.hpfHz,
          transport.lpfHz,
        ),
    );
    this._addEventlistener(
      this._settings,
      EventType.AS_UPDATE_MONITOR_BAND_SOLO_MASK,
      () => transport.setBandMask(this._settings.monitorBandSoloMask),
    );
    const syncEq = () => transport.setHeadphoneEq(eq);
    this._addEventlistener(eq, EventType.HE_UPDATE_BYPASSED, syncEq);
    this._addEventlistener(eq, EventType.HE_UPDATE_PROFILE, syncEq);
    this._addEventlistener(this._trigger, "click", () => {
      if (this._open) {
        this.close();
      } else {
        this._open = true;
        this.root.dataset.monitorOpen = "true";
        this._panel.hidden = false;
        this._trigger.setAttribute("aria-expanded", "true");
        this.position();
        this._panel.querySelector<HTMLButtonElement>(".js-lm-lr")?.focus();
      }
    });
    this._addEventlistener(
      this._panel.querySelector("[data-close-monitor]"),
      "click",
      () => this.close(),
    );
    this._addEventlistener(document, "pointerdown", (event: PointerEvent) => {
      if (
        this._open &&
        !this._panel.contains(event.target as Node) &&
        !this._trigger.contains(event.target as Node)
      ) {
        this.close(false);
      }
    });
    this._addEventlistener(document, "keydown", (event: KeyboardEvent) => {
      if (event.key === "Escape" && this._open) {
        event.preventDefault();
        this.close();
      }
    });
    this._addEventlistener(window, "resize", () => this.position());
    this._addEventlistener(window, "scroll", () => this.position());
  }

  public receive(message: ComparisonResponse): void {
    if (message.type !== "compare.eqResult") {
      return;
    }
    this._rpc.handleResponse(message.message);
  }

  private position(): void {
    if (!this._open) {
      return;
    }
    const dock = this._trigger.closest<HTMLElement>(".comparisonTransport");
    const dockBottom = Number.parseFloat(getComputedStyle(dock).bottom) || 10;
    const bottom = dockBottom + dock.offsetHeight + 8;
    this._panel.style.top = "auto";
    this._panel.style.bottom = `${bottom}px`;
    this._panel.style.right = getComputedStyle(dock).right;
    this._panel.style.maxHeight = `${Math.max(80, window.innerHeight - bottom - 12)}px`;
  }

  private close(restoreFocus = true): void {
    this._open = false;
    delete this.root.dataset.monitorOpen;
    this._panel.hidden = true;
    this._trigger.setAttribute("aria-expanded", "false");
    if (restoreFocus) {
      this._trigger.focus();
    }
  }
}
