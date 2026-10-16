/** Real VS Code comparison host admission, playback, and reopen smoke check. */
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import CDP from "./cdp.mjs";
const root = process.cwd(),
  output = process.env.EAR_NATIVE_OUT || "/tmp/ear-060-native";
const fixtures = process.argv[2];
if (!fixtures) throw Error("Supply eight local audio fixtures");
const files = (await fs.readdir(fixtures))
  .filter((f) => /\.(mp3|wav)$/.test(f))
  .sort()
  .slice(0, 8)
  .map((f) => path.join(fixtures, f));
const extension = path.join(output, "extensions", "ear");
await fs.mkdir(extension, { recursive: true });
for (const f of ["package.json", "ear_audio.png", "dist"])
  await fs.cp(path.join(root, f), path.join(extension, f), { recursive: true });
const profile = path.join(output, "profile");
await fs.mkdir(path.join(profile, "User"), { recursive: true });
await fs.writeFile(
  path.join(profile, "User/settings.json"),
  JSON.stringify({
    "workbench.startupEditor": "none",
    "security.workspace.trust.enabled": false,
    "telemetry.telemetryLevel": "off",
    "update.mode": "none",
    "extensions.autoUpdate": false,
    "window.restoreWindows": "none",
    "chat.disableAIFeatures": true,
  }),
);
const token = randomBytes(24).toString("hex");
const log = await fs.open(path.join(output, "editor.log"), "w");
const child = spawn(
  process.env.VSCODE_EXECUTABLE ||
    "/Applications/Visual Studio Code.app/Contents/MacOS/Electron",
  [
    `--user-data-dir=${profile}`,
    `--extensions-dir=${path.join(output, "extensions")}`,
    `--extensionDevelopmentPath=${path.join(root, "bench/plugins/controller")}`,
    "--remote-debugging-port=9466",
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
    "--mute-audio",
    "--new-window",
    fixtures,
  ],
  {
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
    env: { ...process.env, EAR_BENCH_TOKEN: token },
  },
);
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait(fn, timeout = 90000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await pause(100);
  }
  throw last || Error("Timeout");
}
async function post(route, data = {}) {
  const r = await fetch("http://127.0.0.1:9477" + route, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw Error(await r.text());
  return r.json();
}
const targets = () =>
  fetch("http://127.0.0.1:9466/json/list").then((r) => r.json());
const clients = [];
try {
  const status = await wait(() => post("/status"));
  const main = await wait(async () =>
    (await targets()).find((t) => t.type === "page"),
  );
  const outer = await CDP.connect(main.webSocketDebuggerUrl);
  clients.push(outer);
  await post("/command", { command: "workbench.action.closeSidebar" });
  await post("/command", { command: "workbench.action.closeAuxiliaryBar" });
  async function open() {
    await post("/command", {
      command: "earAudioPreview.compare",
      args: [null, files.map((file) => ({ file }))],
    });
    console.log("Comparison command sent");
    const target = await wait(async () =>
      (await targets()).find(
        (t) =>
          t.type === "iframe" &&
          t.url.toLowerCase().includes("ear-audio-preview"),
      ),
    );
    const c = await CDP.connect(target.webSocketDebuggerUrl);
    clients.push(c);
    await c.send("Runtime.enable");
    console.log("Webview attached", target.url);
    const context = await wait(async () => {
      for (const e of c.events.filter(
        (e) =>
          e.method === "Runtime.executionContextCreated" &&
          e.params.context.auxData?.isDefault,
      )) {
        try {
          if (
            await c.evaluate(
              "!!document.querySelector('#root.comparisonApp')",
              e.params.context.id,
            )
          )
            return e.params.context.id;
        } catch {}
      }
    });
    await wait(() =>
      c.evaluate(
        `(()=>{document.querySelector('.js-tourSkip')?.click();return document.querySelectorAll('.comparisonTrack').length===8&&document.querySelectorAll('canvas[data-stft][data-drawn-key]').length===8;})()`,
        context,
      ),
    );
    return { c, context };
  }
  await outer.send("Page.bringToFront");
  const readyAt = Date.now();
  let { c, context } = await open();
  const readyMs = Date.now() - readyAt;
  await c.evaluate(
    `[...document.querySelectorAll('[data-action="mute"]')].forEach(b=>{if(b.getAttribute('aria-pressed')==='true')b.click();});document.querySelector('[data-pane="live"]').click();document.querySelector('[data-play]').click();`,
    context,
  );
  await wait(() =>
    c.evaluate(
      `Number(document.querySelector('#root').dataset.liveTime)>2`,
      context,
    ),
  );
  await outer.send("Page.bringToFront");
  console.log(
    "Ready",
    readyMs,
    await c.evaluate("document.visibilityState", context),
  );
  const playback = await c.evaluate(
    `new Promise(resolve=>{const frames=[];let prev=performance.now(),active=true;function tick(t){if(!active)return;frames.push(t-prev);prev=t;requestAnimationFrame(tick);}requestAnimationFrame(tick);setTimeout(()=>{active=false;frames.shift();frames.sort((a,b)=>a-b);resolve({frames:frames.length,p95Ms:frames[Math.floor(frames.length*.95)],visibility:document.visibilityState,liveTime:Number(document.querySelector('#root').dataset.liveTime),active:document.querySelectorAll('.comparisonTrack[data-active="true"]').length,unmuted:document.querySelectorAll('[data-action="mute"][aria-pressed="false"]').length});},15000);})`,
    context,
  );
  console.log("Playback", playback);
  if (
    playback.active !== 8 ||
    playback.unmuted !== 8 ||
    playback.frames < 400 ||
    playback.p95Ms > 50
  )
    throw Error(JSON.stringify(playback));
  for (let i = 0; i < 6; i++) {
    await post("/close");
    await post("/command", {
      command: "earAudioPreview.compare",
      args: [null, files.map((file) => ({ file }))],
    });
    await pause(80);
  }
  await post("/close");
  ({ c, context } = await open());
  await pause(2000);
  const notifications = await outer.evaluate(
    `[...document.querySelectorAll('.notification-list-item')].map(e=>e.innerText)`,
  );
  const snapshot = await c.evaluate(
    `({tracks:document.querySelectorAll('.comparisonTrack').length,status:document.querySelector('[data-status]').textContent})`,
    context,
  );
  if (
    snapshot.tracks !== 8 ||
    notifications.some((x) => /dispos|failed|error/i.test(x))
  )
    throw Error(JSON.stringify({ snapshot, notifications }));
  await fs.writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        editor: status.vscode,
        readyMs,
        playback,
        rapidReopens: 6,
        snapshot,
        notifications,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ readyMs, playback, rapidReopens: 6, notifications }),
  );
} finally {
  clients.forEach((c) => c.close());
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {}
  await log.close();
}
