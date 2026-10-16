/** Real-browser checks for the added menu actions, export option, and CQT load. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const out = process.env.EAR_STRESS_OUT || "/tmp/ear-060-stress";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const reports = [];
try {
  for (const count of [4, 8]) {
    const p = await browser.newPage({
      viewport: { width: 1392, height: 886 },
      deviceScaleFactor: 2,
    });
    const errors = [];
    p.on("pageerror", (e) => errors.push(String(e)));
    await p.addInitScript(() =>
      sessionStorage.setItem(
        "comparison-state",
        JSON.stringify({ onboardingSeen: true }),
      ),
    );
    await p.goto(`http://127.0.0.1:${count === 4 ? 9344 : 9348}`);
    await p.waitForFunction(
      (n) => document.querySelectorAll(".comparisonTrack").length === n,
      count,
      { timeout: 120000 },
    );
    const menu = async (text) => {
      await p
        .locator(".comparisonTrack")
        .first()
        .click({ button: "right", position: { x: 35, y: 20 } });
      await p.getByText(text, { exact: true }).click();
    };
    await menu("Match RMS levels (shared region)");
    await p.waitForFunction(
      () =>
        document
          .querySelector("[data-status]")
          .textContent.startsWith("RMS matched"),
      null,
      { timeout: 30000 },
    );
    const matched = await p.locator("[data-status]").textContent();
    await menu("Measure residual vs focused file…");
    await p.getByRole("dialog", { name: "Residual measurements" }).waitFor();
    const residual = await p.getByRole("dialog").innerText();
    assert(residual.includes("Relative dB"));
    if (count === 8) assert(residual.includes("−∞"));
    await p.getByRole("button", { name: "Close", exact: true }).click();
    await p.locator('[data-pane="edit"]').click();
    await p.locator("[data-start]").fill("10");
    await p.locator("[data-start]").dispatchEvent("change");
    await p.locator("[data-end]").fill("11");
    await p.locator("[data-end]").dispatchEvent("change");
    await p.locator("[data-export]").click();
    await p.waitForFunction(
      () =>
        document
          .querySelector("[data-status]")
          .textContent.startsWith("Exported"),
      null,
      { timeout: 30000 },
    );
    await p.locator("[data-export-eq]").check();
    await p.locator("[data-export]").click();
    await p.waitForFunction(
      () =>
        document
          .querySelector("[data-status]")
          .textContent.includes("Enable a headphone EQ"),
      null,
      { timeout: 10000 },
    );
    await p.locator("[data-export-eq]").uncheck();
    await p.locator('[data-pane="live"]').click();
    const modes = await p
      .locator(".js-analyzeSetting-liveSpectrumMode")
      .count();
    assert.equal(modes, 1);
    await p.locator(".js-analyzeSetting-liveSpectrumMode").evaluate((s) => {
      s.value = "cqt";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await p.locator('[data-action="mute"]').evaluateAll((bs) =>
      bs.forEach((b) => {
        if (b.getAttribute("aria-pressed") === "true") b.click();
      }),
    );
    await p.locator("[data-time-input]").fill("10");
    await p.locator("[data-time-input]").dispatchEvent("change");
    await p.locator("[data-volume]").fill("10");
    await p.locator("[data-volume]").dispatchEvent("input");
    await p.locator("[data-play]").click();
    await p.waitForFunction(
      () => Number(document.querySelector("#root").dataset.liveTime) > 11,
      null,
      { timeout: 30000 },
    );
    await p.locator("#capture").click();
    await p.waitForFunction(
      () => document.querySelector("#report").textContent.startsWith("{"),
      null,
      { timeout: 30000 },
    );
    const cqt = JSON.parse(await p.locator("#report").textContent());
    assert(cqt.animationFrames.p95Ms < 50);
    assert(cqt.livePresentationIntervals.p95Ms < 100);
    assert.deepEqual(errors, []);
    reports.push({ count, matched, residual, cqt, errors });
    await p.screenshot({ path: `${out}/cqt-${count}.png` });
    await p.close();
    console.log(
      JSON.stringify({
        count,
        cqtRafP95: cqt.animationFrames.p95Ms,
        cqtBatchP95: cqt.livePresentationIntervals.p95Ms,
      }),
    );
  }
  await fs.writeFile(
    `${out}/acceptance.json`,
    JSON.stringify(reports, null, 2),
  );
} finally {
  await browser.close();
}
