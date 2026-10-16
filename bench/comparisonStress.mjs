/** Run after webpack + comparisonBrowserHarness servers at 9344/9348. */
import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const output = process.env.EAR_STRESS_OUT || "/tmp/ear-060-stress";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH,
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const results = [];
try {
  for (const count of Array.from({ length: Number(process.env.EAR_STRESS_ROUNDS || 3) }, () => [4, 8]).flat()) {
    const run = results.filter((r) => r.count === count).length + 1;
    const page = await browser.newPage({
      viewport: { width: 1392, height: 886 },
      deviceScaleFactor: 2,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("crash", () => errors.push("renderer crash"));
    await page.addInitScript(() =>
      sessionStorage.setItem(
        "comparison-state",
        JSON.stringify({ onboardingSeen: true }),
      ),
    );
    const started = Date.now();
    await page.goto(`http://127.0.0.1:${count === 4 ? 9344 : 9348}`);
    await page.waitForFunction(
      (n) => document.querySelectorAll(".comparisonTrack").length === n,
      count,
      { timeout: 120000 },
    );
    await page.waitForFunction(
      (n) =>
        document.querySelectorAll("canvas[data-stft][data-drawn-key]")
          .length === n,
      count,
      { timeout: 120000 },
    );
    const readyMs = Date.now() - started;
    const allSources = await page
      .locator(".comparisonTrack__name")
      .evaluateAll((nodes) => nodes.map((n) => n.title));
    // Actual pointer drag must update every STFT timeline, then double-click reset.
    const canvas = page.locator("canvas[data-stft]").first();
    await canvas.scrollIntoViewIfNeeded();
    const oldKey = await canvas.getAttribute("data-drawn-key");
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.8, {
      steps: 10,
    });
    await page.mouse.up();
    await page.waitForFunction(
      (old) =>
        document.querySelector("canvas[data-stft]")?.dataset.drawnKey !== old,
      oldKey,
    );
    await canvas.dblclick();
    await page.waitForFunction(
      (n) =>
        document.querySelectorAll("canvas[data-stft][data-drawn-key]")
          .length === n,
      count,
      { timeout: 120000 },
    );
    // Enable all eight audible sources, rather than testing one audible + seven muted.
    await page.locator('[data-action="mute"]').evaluateAll((buttons) =>
      buttons.forEach((b) => {
        if (b.getAttribute("aria-pressed") === "true") b.click();
      }),
    );
    await page.locator('[data-pane="live"]').click();
    await page.locator("[data-volume]").fill("10");
    await page.locator("[data-volume]").dispatchEvent("input");
    await page.locator("[data-time-input]").fill("10");
    await page.locator("[data-time-input]").dispatchEvent("change");
    await page.locator("[data-play]").click();
    await page.waitForFunction(
      () => Number(document.querySelector("#root").dataset.liveTime) > 1,
      null,
      { timeout: 30000 },
    );
    await page.locator("#capture").click();
    await page.waitForFunction(
      () => document.querySelector("#report").textContent.startsWith("{"),
      null,
      { timeout: 30000 },
    );
    const capture = JSON.parse(await page.locator("#report").textContent());
    assert.equal(capture.activeTracks, count);
    assert(capture.animationFrames.count > 500);
    assert(capture.livePresentationIntervals.count > 100);
    assert(capture.animationFrames.p95Ms < 50);
    assert(capture.livePresentationIntervals.p95Ms < 100);
    // Rapid seek, mute, bypass, pane changes while the graph is running.
    for (let j = 0; j < 12; j++) {
      await page.locator("[data-time-input]").fill(String(20 + j * 3));
      await page.locator("[data-time-input]").dispatchEvent("change");
      await page
        .locator('[data-action="active"]')
        .last()
        .evaluate((b) => b.click());
      await page
        .locator('[data-action="active"]')
        .last()
        .evaluate((b) => b.click());
      await page
        .locator('[data-action="mute"]')
        .last()
        .evaluate((b) => b.click());
      await page
        .locator('[data-action="mute"]')
        .last()
        .evaluate((b) => b.click());
      await page.locator(`[data-pane="${j % 2 ? "live" : "stft"}"]`).click();
    }
    await page.locator('[data-pane="live"]').click();
    await page.waitForFunction(
      () => Number(document.querySelector("#root").dataset.liveTime) > 50,
      null,
      { timeout: 30000 },
    );
    await page.locator("[data-play]").click();
    await page.setViewportSize({ width: 700, height: 886 });
    const last = page.locator(".comparisonTrack").last();
    await last.scrollIntoViewIfNeeded();
    await last.hover();
    const hit = await last.evaluate((el) => {
      const b = el.getBoundingClientRect();
      const x = b.left + 35,
        y = b.top + b.height / 2;
      const target = document.elementFromPoint(x, y);
      return {
        width: b.width,
        action: target?.closest("[data-action]")?.getAttribute("data-action"),
        scrollWidth: el.parentElement.scrollWidth,
        clientWidth: el.parentElement.clientWidth,
      };
    });
    assert.equal(hit.action, "focus");
    assert(hit.width >= 159);
    if (count === 8) {
      assert(hit.scrollWidth > hit.clientWidth);
      await page.screenshot({ path: `${output}/eight-narrow-${run}.png` });
    }
    assert.deepEqual(errors, []);
    const result = {
      count,
      run,
      readyMs,
      allSources,
      capture,
      interactionCycles: 12,
      narrowHit: hit,
      errors,
    };
    results.push(result);
    await fs.writeFile(
      `${output}/stress.json`,
      JSON.stringify(
        {
          source:
            "Four complete user-provided MP3 recordings, each loaded twice for eight-track load. Production bundle and real Web Audio; browser host bridge, no VS Code IPC.",
          results,
        },
        null,
        2,
      ),
    );
    console.log(
      JSON.stringify({
        count,
        run,
        readyMs,
        rafP95: capture.animationFrames.p95Ms,
        liveP95: capture.livePresentationIntervals.p95Ms,
        errors,
      }),
    );
    await page.close();
  }
} finally {
  await browser.close();
}
