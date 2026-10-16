/* eslint-disable @typescript-eslint/naming-convention -- Mock exports and AutoEq wire fields retain their external names. */
import CurveCorrectionOverlayComponent from "./curveCorrectionOverlayComponent";
import HeadphoneEqSettingsService from "../../services/headphoneEqSettingsService";
import {
  AutoEqApiClient,
  mapEqualizeResponse,
} from "../../services/autoEqApiClient";
import EqPresetHostClient from "../../services/eqPresetHostClient";

jest.mock("./parametricEqEditorComponent", () => ({
  __esModule: true,
  default: class {
    dispose() {}
    resize() {}
    setFilters() {}
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness() {
  document.body.innerHTML = '<div id="curve"></div>';
  const settings = new HeadphoneEqSettingsService();
  const post = jest.fn();
  const api = new AutoEqApiClient(jest.fn().mockResolvedValue([]));
  const presets = {
    readWorkspacePreset: jest.fn(),
    importFile: jest.fn(),
    listWorkspacePresets: jest.fn(),
  };
  const overlay = new CurveCorrectionOverlayComponent(
    "#curve",
    settings,
    48000,
    post,
    presets as unknown as EqPresetHostClient,
    api,
  );
  return { overlay, settings, post, api, presets };
}

test("a resolved preset cannot update settings after its overlay is disposed", async () => {
  const h = harness();
  const gate = deferred<unknown>();
  h.presets.readWorkspacePreset.mockReturnValue(gate.promise);
  const result = h.overlay["_selectWorkspacePreset"](
    "preset.json",
    "Preset",
    document.createElement("input"),
    document.createElement("ul"),
  );
  const profile = mapEqualizeResponse(
    "X",
    { source: "a", rig: "b", form: "c" },
    "T",
    {
      parametric_eq: {
        filters: [{ type: "PEAKING", fc: 1000, q: 1, gain: 1 }],
      },
    },
  );
  gate.resolve(profile);
  h.overlay.dispose();
  await result;
  expect(h.settings.profile).toBeNull();
  expect(h.post).not.toHaveBeenCalled();
  h.api.dispose();
  h.settings.dispose();
});

test("a disposed overlay ignores late imported presets", async () => {
  const h = harness();
  const gate = deferred<{ content: string; fileName: string }>();
  h.presets.importFile.mockReturnValue(gate.promise);
  const result = h.overlay["_importPreset"](
    document.createElement("input"),
    document.createElement("ul"),
  );
  h.overlay.dispose();
  gate.resolve({
    content: "invalid format would fail parsing",
    fileName: "preset.json",
  });
  await result;
  expect(h.settings.profile).toBeNull();
  expect(document.querySelector(".js-cc-status")?.textContent).toBe("");
  h.api.dispose();
  h.settings.dispose();
});

test("resolved equalization cannot apply a profile after overlay disposal", async () => {
  const h = harness();
  const gate = deferred<ReturnType<typeof mapEqualizeResponse>>();
  jest.spyOn(h.api, "equalizeParametric").mockReturnValue(gate.promise);
  h.overlay["_selectedName"] = "X";
  h.overlay["_selectedVariant"] = { source: "a", rig: "b", form: "c" };
  h.overlay["_selectedTarget"] = "T";
  const result = h.overlay["_applyPreset"]();
  gate.resolve(
    mapEqualizeResponse("X", { source: "a", rig: "b", form: "c" }, "T", {
      parametric_eq: {
        filters: [{ type: "PEAKING", fc: 1000, q: 1, gain: 1 }],
      },
    }),
  );
  h.overlay.dispose();
  await result;
  expect(h.settings.profile).toBeNull();
  h.api.dispose();
  h.settings.dispose();
});
