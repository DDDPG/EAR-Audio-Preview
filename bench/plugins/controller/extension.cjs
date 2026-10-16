const vscode = require("vscode"),
  http = require("http"),
  { performance } = require("perf_hooks");
exports.activate = (context) => {
  const server = http.createServer(async (req, res) => {
    try {
      if (
        !process.env.EAR_BENCH_TOKEN ||
        req.headers.authorization !== `Bearer ${process.env.EAR_BENCH_TOKEN}`
      ) {
        res.writeHead(403).end();
        return;
      }
      const url = new URL(req.url, "http://localhost");
      let body = "";
      for await (const c of req) body += c;
      const data = body ? JSON.parse(body) : {};
      let out;
      if (url.pathname === "/open") {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
        const t = performance.now();
        await vscode.commands.executeCommand(
          "vscode.openWith",
          vscode.Uri.file(data.file),
          data.viewType,
        );
        out = { hostOpenPromiseMs: performance.now() - t };
      } else if (url.pathname === "/close") {
        await vscode.commands.executeCommand(
          "workbench.action.closeAllEditors",
        );
        out = { closed: true };
      } else if (url.pathname === "/command") {
        const asUri = (x) =>
          Array.isArray(x)
            ? x.map(asUri)
            : x && x.file
              ? vscode.Uri.file(x.file)
              : x;
        const args = (data.args || []).map(asUri);
        out = {
          result: await vscode.commands.executeCommand(data.command, ...args),
        };
      } else if (url.pathname === "/status") {
        out = {
          vscode: vscode.version,
          extensions: vscode.extensions.all
            .filter((x) => x.packageJSON.publisher !== "vscode")
            .map((x) => ({
              id: x.id,
              active: x.isActive,
              version: x.packageJSON.version,
            })),
          memory: process.memoryUsage(),
        };
      } else {
        res.writeHead(404).end();
        return;
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(out));
    } catch (e) {
      res
        .writeHead(500)
        .end(JSON.stringify({ error: String(e), stack: e.stack }));
    }
  });
  server.listen(9477, "127.0.0.1");
  context.subscriptions.push({ dispose: () => server.close() });
};
