/** Local integration harness: the production comparison bundle and real Web Audio. */
import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtures = path.resolve(
  process.argv[2] ?? "/tmp/ear-compare-fixtures/long",
);
const files = (await fs.readdir(fixtures))
  .filter((name) => /\.(wav|mp3)$/i.test(name))
  .sort()
  .slice(0, Number(process.env.EAR_TRACKS || 4));
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/manifest") {
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify(
          files.map((name, index) => ({
            id: `track-${index + 1}`,
            uri: name,
            name,
            ext: path.extname(name).slice(1),
            revision: 1,
          })),
        ),
      );
    } else if (url.pathname === "/audio") {
      const index = Number(url.searchParams.get("track")),
        offset = Number(url.searchParams.get("offset"));
      if (
        !Number.isInteger(index) ||
        !files[index] ||
        !Number.isSafeInteger(offset) ||
        offset < 0
      ) {
        response.writeHead(400).end();
        return;
      }
      const handle = await fs.open(path.join(fixtures, files[index]), "r");
      try {
        const { size } = await handle.stat();
        const data = new Uint8Array(
          Math.max(0, Math.min(3_000_000, size - offset)),
        );
        await handle.read(data, 0, data.length, offset);
        response.setHeader("X-Audio-Length", size);
        response.end(data);
      } finally {
        await handle.close();
      }
    } else if (url.pathname === "/export" && request.method === "POST") {
      const parts = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 32_000_000) {
          throw new Error("Benchmark export region exceeds 32 MB limit");
        }
        parts.push(chunk);
      }
      await fs.writeFile(
        path.join(
          process.env.EAR_REPORT_DIR || path.join(root, ".cross-gan/round_3"),
          "browser-export.wav",
        ),
        Buffer.concat(parts),
      );
      response.end("browser-export.wav");
    } else if (url.pathname === "/report" && request.method === "POST") {
      let data = "";
      for await (const chunk of request) {
        data += chunk;
        if (data.length > 1_000_000) {
          throw new Error("Report too large");
        }
      }
      const report = JSON.parse(data);
      await fs.writeFile(
        path.join(
          process.env.EAR_REPORT_DIR || path.join(root, ".cross-gan/round_3"),
          "browser-performance.json",
        ),
        JSON.stringify(report, null, 2),
      );
      response.end("saved");
    } else {
      const resource =
        url.pathname === "/"
          ? "bench/comparisonBrowserHarness.html"
          : url.pathname.slice(1);
      if (
        !(
          resource === "bench/comparisonBrowserHarness.html" ||
          /^dist\/[\w.-]+$/.test(resource)
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
      response.end(await fs.readFile(path.join(root, resource)));
    }
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
server.listen(Number(process.env.EAR_PORT || 9340), "127.0.0.1", () =>
  console.log(
    `Comparison benchmark: http://127.0.0.1:${process.env.EAR_PORT || 9340} (${files.length} files from ${fixtures})`,
  ),
);
