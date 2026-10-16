/** Capture actual production UI with locally supplied recordings. No chart fixtures. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { chromium } = require(
  process.env.PLAYWRIGHT_MODULE_PATH || "playwright",
);
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const output = path.join(root, "bench/demo-captures");
const digest = (value) => createHash("sha256").update(value).digest("hex");
const provenance = await (await fetch("http://127.0.0.1:9344/manifest")).json();
const browser = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE
    ? { executablePath: process.env.CHROME_EXECUTABLE }
    : {}),
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const scenes = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["multi-audio-workflow", "single-audio-workflow"];
const results = [];
try {
  for (const scene of scenes) {
    const single = scene === "single-audio-workflow";
    if (!single && scene !== "multi-audio-workflow")
      throw new Error("Unknown scene");
    const dir = path.join(output, scene);
    await fs.mkdir(dir, { recursive: true });
    const page = await browser.newPage({
      viewport: { width: 1160, height: 820 },
      deviceScaleFactor: 1,
    });
    page.setDefaultTimeout(90000);
    const errors = [],
      frames = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const bundle = single ? "audioPreview.js" : "comparison.js";
    const bundleHash = digest(
      await fs.readFile(path.join(root, "dist", bundle)),
    );
    async function capture(title, caption, count = 6) {
      await page.evaluate(() => window.scrollTo(0, 0));
      for (let i = 0; i < count; i++) {
        await page.waitForTimeout(180);
        const id =
          String(frames.length).padStart(3, "0") +
          "-" +
          title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const screenshot = await page.screenshot({
          path: path.join(dir, id + ".png"),
        });
        const state = await page.evaluate(() => ({
          url: location.href,
          pane: document.querySelector("[role=tab][aria-selected=true]")
            ?.textContent,
          status: document.querySelector("[data-status]")?.textContent,
          position: document.querySelector("[data-time-input]")?.value,
          liveTime: document.querySelector("#root")?.dataset.liveTime,
          tracks: [...document.querySelectorAll(".comparisonTrack")].map(
            (t) => ({
              name: t.querySelector(".comparisonTrack__name").textContent,
              active: t.dataset.active,
              muted: t
                .querySelector("[data-action=mute]")
                .getAttribute("aria-pressed"),
            }),
          ),
          features: window.demoFeatureEvidence,
          hostErrors: window.demoHostErrors,
          loudness: [
            ...document.querySelectorAll(".loudnessComponent__metricValue"),
          ].map((e) => e.textContent),
          eqStatus: document.querySelector(".js-cc-status")?.textContent,
          eqBypassed: document
            .querySelector(".js-he-bypass")
            ?.getAttribute("aria-pressed"),
          playing:
            document
              .querySelector(".js-transportPanelPlay")
              ?.getAttribute("aria-label") === "Pause",
          seekProgress:
            document.querySelector(".progressFill")?.style.transform,
          canvasCount: document.querySelectorAll("canvas").length,
          inputs: [...document.querySelectorAll("input,select")]
            .filter((e) => e.getBoundingClientRect().width)
            .map((e) => ({
              label:
                e.getAttribute("aria-label") ||
                e.getAttribute("data-compare-setting") ||
                e.className,
              value: e.value,
              checked: e.checked,
            })),
        }));
        if (single && !state.playing)
          throw new Error("Single-file recording paused unexpectedly");
        const source = Buffer.from(
          JSON.stringify(
            {
              productionBundleSha256: bundleHash,
              audioSources: single
                ? provenance.filter((f) => f.name === "B.mp3")
                : provenance,
              ...state,
            },
            null,
            2,
          ),
        );
        await fs.writeFile(path.join(dir, id + ".json"), source);
        frames.push({
          id,
          title,
          caption,
          image: id + ".png",
          image_sha256: digest(screenshot),
          source: id + ".json",
          source_sha256: digest(source),
          duration_ms: 180,
        });
      }
    }
    const pane = (value) => page.locator(`[data-pane=${value}]`).click();
    async function edit(selector, value) {
      const f = page.locator(selector);
      await f.fill(String(value));
      await f.press("Tab");
    }
    async function mute(id) {
      const row = page.locator(`.comparisonTrack[data-track-id="${id}"]`);
      await row.hover();
      await page.waitForTimeout(250);
      await row.locator("[data-action=mute]").click();
    }
    await page.goto("http://127.0.0.1:9344/" + (single ? "single" : ""));
    if (!single) {
      await page.waitForFunction(
        () =>
          document
            .querySelector("[data-status]")
            ?.textContent.includes("4 / 4"),
        null,
        { timeout: 90000 },
      );
      await page.locator(".js-openSettings").click();
      await edit("[data-compare-setting=height]", 180);
      await edit("[data-compare-setting=waveformScale]", 0.2);
      await page.locator(".js-settingsClose").click();
      await page.waitForTimeout(1000);
      await capture(
        "Four real recordings. One timeline.",
        "A.mp3 / B.mp3 / C.mp3 / D.mp3 - original decoded signals",
        6,
      );
      const box = await page.locator("canvas[data-stft]").first().boundingBox();
      await page.mouse.move(box.x + box.width * 0.18, box.y + box.height * 0.2);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) {
        await page.mouse.move(
          box.x + box.width * (0.18 + (0.26 * i) / 6),
          box.y + box.height * (0.2 + (0.68 * i) / 6),
        );
        await capture(
          "Drag once. Zoom all four.",
          "Linked time and frequency selection across the STFT grid",
          1,
        );
      }
      await page.mouse.up();
      await page.waitForTimeout(600);
      await capture(
        "Compare the same passage",
        "Real harmonic detail, transients and spectral balance",
        8,
      );
      await page.locator("canvas[data-stft]").first().dblclick();
      await edit("[data-time-input]", 42);
      for (const id of ["track-2", "track-3", "track-4"]) await mute(id);
      await page.locator("[data-volume]").fill("25");
      await page.locator("[data-play]").click();
      await capture(
        "Four sources. Shared transport.",
        "All four recordings play together at the same position",
        6,
      );
      await pane("live");
      await page.locator(".js-openSettings").click();
      await page.locator("[data-compare-setting=waveformVisible]").uncheck();
      await page.locator(".js-settingsClose").click();
      await page.waitForFunction(
        () => Number(document.getElementById("root").dataset.liveTime) > 42,
      );
      await page.mouse.move(18, 80);
      await capture(
        "Live Spec in parallel",
        "Four spectrum overlays + stereo field + frequency correlation",
        14,
      );
      await mute("track-3");
      await mute("track-4");
      await capture(
        "Hear two. Analyze four.",
        "Mute changes monitoring; the original-signal analysis keeps running",
        6,
      );
      await page
        .locator(
          '.comparisonTrack[data-track-id="track-3"] [data-action=active]',
        )
        .click();
      await page
        .locator(
          '.comparisonTrack[data-track-id="track-4"] [data-action=active]',
        )
        .click();
      await page.mouse.move(18, 80);
      await capture(
        "Focus the comparison",
        "A.mp3 + B.mp3 - two real recordings, one shared view",
        10,
      );
    } else {
      await page.locator("#settingsFab:not([disabled])").waitFor();
      await page.locator("#tabStft").click();
      await page.waitForTimeout(1200);
      await page.locator(".js-transportExpand").click();
      await page.locator(".userInputSeekBar").fill("40");
      await page.locator(".js-transportPanelPlay[aria-label=Play]").click();
      await page.locator(".js-transportPanelPlay[aria-label=Pause]").waitFor();
      await page.locator(".js-transportClose").click();
      await page.mouse.move(18, 80);
      await capture(
        "One recording. A closer listen.",
        "B.mp3 - actual playback and full-file STFT",
        8,
      );
      await page.locator("#tabLiveSpec").click();
      await page.waitForTimeout(800);
      await capture(
        "Listen with live context",
        "Spectrum, stereo field and meters follow the real audio",
        8,
      );
      await page.locator("#tabLoudness").click();
      await capture(
        "Calculate loudness and features",
        "Actual offline loudness + Essentia F0 and onset analysis",
        6,
      );
      await page.waitForFunction(
        () =>
          window.demoFeatureEvidence &&
          document.querySelector(".js-lufsI")?.textContent.includes("LUFS"),
        null,
        { timeout: 90000 },
      );
      await page.mouse.move(570, 445);
      await capture(
        "Read the whole performance",
        "LUFS-S / LUFS-M / integrated loudness / F0 / onset",
        10,
      );
      await page.mouse.click(16, 70);
      await page.keyboard.press("e");
      await page.locator(".curveCorrectionOverlay--open").waitFor();
      await page.locator(".js-cc-import").click();
      await page.waitForFunction(() =>
        document.querySelector(".js-cc-status")?.textContent.includes("Import"),
      );
      await capture(
        "Correct the monitoring response",
        "Import the published AutoEq Sennheiser HD650 parametric preset",
        8,
      );
      const eq = await page.locator(".js-cc-canvas").boundingBox();
      await page.mouse.move(eq.x + eq.width * 0.42, eq.y + eq.height * 0.5);
      await capture(
        "Inspect the correction curve",
        "Real parametric filters and preamp; correction is a monitoring path",
        8,
      );
      await page.locator(".js-cc-close").click();
      await page.locator(".js-transportExpand").click();
      await page.locator(".js-he-bypass").click();
      await capture(
        "A/B the headphone correction",
        "Bypass the imported preset without changing source analysis",
        6,
      );
      await page.locator(".js-he-bypass").click();
      await capture(
        "Keep the source intact",
        "Return to corrected monitoring while the original file keeps playing",
        6,
      );
      const hostErrors = await page.evaluate(() => window.demoHostErrors);
      if (hostErrors.length) throw new Error(JSON.stringify(hostErrors));
    }
    if (errors.length) throw new Error(errors.join("; "));
    frames[0].duration_ms = 900;
    frames.at(-1).duration_ms = 1600;
    const storyboard = {
      version: 1,
      expected_frames: frames.length,
      canvas: [1160, 940],
      footer:
        "EAR Audio Preview 0.6 | Real recordings | Production UI / DSP | GIF has no audio",
      frames,
    };
    await fs.writeFile(
      path.join(dir, "storyboard.json"),
      JSON.stringify(storyboard, null, 2) + "\n",
    );
    results.push({
      scene,
      frames: frames.length,
      bundleSha256: bundleHash,
      browserErrors: errors,
      audioSources: single
        ? provenance.filter((f) => f.name === "B.mp3")
        : provenance,
    });
    await page.close();
    console.log(`Captured ${scene}: ${frames.length} verified frames`);
  }
  await fs.writeFile(
    path.join(output, "capture-report.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
