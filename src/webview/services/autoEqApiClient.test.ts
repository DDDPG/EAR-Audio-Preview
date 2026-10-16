/* eslint-disable @typescript-eslint/naming-convention */
import {
  buildDisplayName,
  buildProfileId,
  compatibleTargets,
  mapEqualizeResponse,
} from "./autoEqApiClient";
import type { AutoEqTarget } from "../types/headphoneEq";

describe("autoEqApiClient", () => {
  test("mapEqualizeResponse maps PEQ filters and preamp", () => {
    const variant = { source: "oratory1990", rig: "crinacle", form: "raw" };
    const profile = mapEqualizeResponse("HD 650", variant, "Harman", {
      parametric_eq: {
        preamp: -3.5,
        filters: [
          { type: "PEAKING", fc: 1000, q: 1.2, gain: 2.5, enabled: true },
          { type: "LOW_SHELF", fc: 120, q: 0.7, gain: 1.0 },
        ],
      },
    });

    expect(profile.id).toBe(buildProfileId("HD 650", variant, "Harman"));
    expect(profile.displayName).toBe(buildDisplayName("HD 650", "Harman"));
    expect(profile.preampDb).toBe(-3.5);
    expect(profile.filters).toHaveLength(2);
    expect(profile.filters[0]).toMatchObject({
      type: "peaking",
      frequency: 1000,
      gainDb: 2.5,
      q: 1.2,
      enabled: true,
    });
    expect(profile.filters[1].type).toBe("lowshelf");
    expect(profile.baseSnapshot?.filters).toHaveLength(2);
    expect(profile.isCustomized).toBe(false);
  });

  test("mapEqualizeResponse throws when no filters returned", () => {
    expect(() =>
      mapEqualizeResponse("X", { source: "a", rig: "b", form: "c" }, "T", {
        parametric_eq: { filters: [] },
      }),
    ).toThrow(/no parametric EQ filters/i);
  });

  test("compatibleTargets matches source, form, and rig", () => {
    const variant = { source: "oratory1990", rig: "crinacle", form: "raw" };
    const targets: AutoEqTarget[] = [
      {
        label: "Harman",
        compatible: [{ source: "oratory1990", form: "raw", rig: "crinacle" }],
        recommended: [],
      },
      {
        label: "Diffuse",
        compatible: [{ source: "other", form: "raw" }],
        recommended: [],
      },
    ];
    const compat = compatibleTargets(targets, variant);
    expect(compat.map((t) => t.label)).toEqual(["Harman"]);
  });
});

describe("page-owned AutoEq API", () => {
  test("catalog caches are isolated across pages and failed fetches can retry", async () => {
    const { AutoEqApiClient } = await import("./autoEqApiClient");
    const firstHost = jest
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ first: [] });
    const secondHost = jest.fn().mockResolvedValue({ second: [] });
    const first = new AutoEqApiClient(firstHost),
      second = new AutoEqApiClient(secondHost);
    await expect(first.fetchEntries()).rejects.toThrow("offline");
    await expect(first.fetchEntries()).resolves.toEqual({ first: [] });
    await first.fetchEntries();
    await expect(second.fetchEntries()).resolves.toEqual({ second: [] });
    expect(firstHost).toHaveBeenCalledTimes(2);
    expect(secondHost).toHaveBeenCalledTimes(1);
    first.dispose();
    second.dispose();
    await expect(first.fetchEntries()).rejects.toThrow(/disposed/);
  });
});

test.each(["fetchEntries", "fetchTargets"] as const)(
  "%s rejects a reply resolved just before disposal",
  async (method) => {
    const { AutoEqApiClient } = await import("./autoEqApiClient");
    let resolve!: (value: unknown) => void;
    const gate = new Promise((done) => {
      resolve = done;
    });
    const api = new AutoEqApiClient(() => gate);
    const result = api[method]();
    const rejected = expect(result).rejects.toThrow(/disposed/);
    resolve([]);
    api.dispose();
    await rejected;
  },
);
