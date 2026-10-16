import HeadphoneEqSettingsService from "./headphoneEqSettingsService";
import EqMonitorStripComponent from "../components/liveMeters/eqMonitorStripComponent";
import { createEqChain } from "./headphoneEqService";
import type {
  HeadphoneEqPersistedState,
  HeadphoneEqProfile,
} from "../types/headphoneEq";

function profile(): HeadphoneEqProfile {
  return {
    id: "hd650",
    displayName: "HD 650",
    meta: {
      name: "HD 650",
      source: "oratory1990",
      rig: "711",
      form: "over-ear",
      targetLabel: "Harman",
    },
    preampDb: -6.1,
    filters: [
      { enabled: true, type: "peaking", frequency: 1000, gainDb: 2, q: 0.7 },
    ],
    isCustomized: false,
  };
}

describe("persisted headphone EQ boundary", () => {
  test.each([
    {},
    { preampDb: 0, filters: null },
    { ...profile(), meta: null },
    { ...profile(), preampDb: Infinity },
    { ...profile(), preampDb: 1e38 },
    { ...profile(), filters: [{ ...profile().filters[0], frequency: NaN }] },
    { ...profile(), filters: [{ ...profile().filters[0], q: 0 }] },
    { ...profile(), filters: [{ ...profile().filters[0], type: "unknown" }] },
    { ...profile(), baseSnapshot: {} },
  ])(
    "invalid profile is discarded before UI/audio initialization: %j",
    (invalid) => {
      for (const bypassed of [false, true]) {
        const settings = new HeadphoneEqSettingsService();
        settings.loadPersisted({
          bypassed,
          profile: invalid,
        } as HeadphoneEqPersistedState);
        expect(settings.profile).toBeNull();
        expect(settings.bypassed).toBe(true);
        expect(() => createEqChain({} as AudioContext, settings)).not.toThrow();
        document.body.innerHTML = '<div id="eq"></div>';
        const strip = new EqMonitorStripComponent(
          "#eq",
          settings,
          () => undefined,
        );
        expect(
          document.querySelector(".js-he-profileText")?.textContent,
        ).toMatch(/no profile/i);
        strip.dispose();
        settings.dispose();
      }
    },
  );

  test("valid profiles and snapshots roundtrip without modification or shared references", () => {
    const value = profile();
    value.baseSnapshot = profile();
    for (const bypassed of [false, true]) {
      const state = { bypassed, profile: value };
      const settings = new HeadphoneEqSettingsService();
      settings.loadPersisted(state);
      expect(settings.toPersisted()).toEqual(state);
      expect(settings.profile).not.toBe(value);
      expect(settings.profile?.baseSnapshot).not.toBe(value.baseSnapshot);
      settings.dispose();
    }
  });

  test("cyclic snapshots are discarded without recursion or cloning failures", () => {
    const value = profile();
    value.baseSnapshot = value;
    const settings = new HeadphoneEqSettingsService();
    expect(() =>
      settings.loadPersisted({ bypassed: false, profile: value }),
    ).not.toThrow();
    expect(settings.profile).toBeNull();
    expect(settings.bypassed).toBe(true);
    settings.dispose();
  });

  test("an invalid direct import leaves the previous valid profile unchanged", () => {
    const settings = new HeadphoneEqSettingsService();
    settings.setProfile(profile());
    const previous = settings.toPersisted();
    expect(() => settings.setProfile({} as HeadphoneEqProfile)).toThrow(
      "Invalid headphone EQ profile",
    );
    expect(settings.toPersisted()).toEqual(previous);
    settings.dispose();
  });

  test("a clone failure in persisted state falls back without interrupting initialization", () => {
    const settings = new HeadphoneEqSettingsService();
    const clone = jest
      .spyOn(globalThis, "structuredClone")
      .mockImplementationOnce(() => {
        throw new RangeError("State is too deeply nested");
      });
    try {
      expect(() =>
        settings.loadPersisted({ bypassed: false, profile: profile() }),
      ).not.toThrow();
      expect(settings.profile).toBeNull();
      expect(settings.bypassed).toBe(true);
    } finally {
      clone.mockRestore();
      settings.dispose();
    }
  });
});
