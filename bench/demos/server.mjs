import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { loadHost } from "./host.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const audioDir = process.argv[2];
if (!audioDir)
  throw new Error("Supply the local directory containing A.mp3 through D.mp3");
const recordings = await Promise.all(
  ["A.mp3", "B.mp3", "C.mp3", "D.mp3"].map(async (name, i) => {
    const bytes = await fs.readFile(path.join(audioDir, name));
    return {
      id: "track-" + (i + 1),
      uri: "demo:" + name,
      name,
      ext: "mp3",
      revision: 1,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes,
    };
  }),
);
const seq = loadHost(
  path.join(root, "src/extensionHost/sequenceFeatureHost.ts"),
);
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/features" && request.method === "POST") {
      const chunks = [];
      let length = 0;
      for await (const chunk of request) {
        length += chunk.length;
        if (length > 128 * 1024 * 1024)
          throw new Error("Feature input too large");
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      const owned = bytes.buffer.slice(
        bytes.byteOffset,
        bytes.byteOffset + bytes.byteLength,
      );
      const wire = await seq.analyzeSequenceFeaturesInHost(
        new Float32Array(owned),
        Number(url.searchParams.get("rate")),
        Number(url.searchParams.get("hop")),
      );
      if (!wire)
        throw new Error("Actual Essentia feature analysis unavailable");
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify(
          Object.fromEntries(
            Object.entries(wire).map(([k, v]) => [
              k,
              v instanceof ArrayBuffer ? Array.from(new Float32Array(v)) : v,
            ]),
          ),
        ),
      );
    } else if (url.pathname === "/preset") {
      response.end(
        await fs.readFile(
          path.join(root, "bench/demo-captures/host-cache/hd650.txt"),
        ),
      );
    } else if (url.pathname === "/manifest") {
      const count = Number(url.searchParams.get("count")) === 2 ? 2 : 4;
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify(
          recordings.slice(0, count).map(({ bytes, ...info }) => info),
        ),
      );
    } else if (url.pathname === "/audio") {
      const index = Number(url.searchParams.get("track")),
        offset = Number(url.searchParams.get("offset"));
      if (
        !Number.isInteger(index) ||
        !recordings[index] ||
        !Number.isSafeInteger(offset) ||
        offset < 0
      ) {
        response.writeHead(400).end();
        return;
      }
      const bytes = recordings[index].bytes;
      response.setHeader("X-Audio-Length", bytes.length);
      response.end(bytes.subarray(offset, offset + 3_000_000));
    } else {
      const resource =
        url.pathname === "/" || url.pathname === "/single"
          ? "bench/demos/index.html"
          : url.pathname.slice(1);
      if (
        !(
          resource === "bench/demos/index.html" ||
          resource === "bench/demos/bridge.js" ||
          resource === "bench/demos/single-bridge.js" ||
          /^dist\/(?:web\/)?[\w.-]+$/.test(resource)
        )
      ) {
        response.writeHead(404).end();
        return;
      }
      response.setHeader(
        "Content-Type",
        resource.endsWith(".html")
          ? "text/html"
          : resource.endsWith(".wasm")
            ? "application/wasm"
            : "text/javascript",
      );
      let content = await fs.readFile(path.join(root, resource));
      if (url.pathname === "/single")
        content = Buffer.from(
          content
            .toString()
            .replace("/bench/demos/bridge.js", "/bench/demos/single-bridge.js")
            .replace("/dist/comparison.js", "/dist/audioPreview.js"),
        );
      response.end(content);
    }
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
server.listen(9344, "127.0.0.1", () =>
  console.log("Production demo harness: http://127.0.0.1:9344"),
);
