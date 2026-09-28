#!/usr/bin/env node
// serve.mjs — local, read-only developer dashboard for the loop (docs/10-dashboard.md).
//
//   node scripts/dashboard/serve.mjs                       # live: this repo's .loop/ (open http://127.0.0.1:4400)
//   node scripts/dashboard/serve.mjs --loop-log examples/web-v2-20-rounds/loop.log \
//        --ledger examples/web-v2-20-rounds/as-run/_backlog.md    # replay a past run's log
//
// Options: --port 4400 · --host 127.0.0.1 · --root <repo> (default: this repo) · --config loop.config.env
// No dependencies, no writes. It never starts, stops or steers the loop — it only reads the files
// the driver and the round agent already write. Bound to localhost: round logs can hold anything.
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ALLOWED_FILE, buildState, hostAllowed } from "./state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k.startsWith("--")) args[k.slice(2)] = process.argv[++i];
}
const root = resolve(args.root || join(HERE, "../.."));
const port = Number(args.port || 4400), host = args.host || "127.0.0.1";
const opts = { loopLog: args["loop-log"], ledger: args.ledger, config: args.config };

const send = (res, code, type, body) => {
  res.writeHead(code, { "content-type": type, "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(body);
};

const server = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  try {
    if (!hostAllowed(req.headers.host, host, port)) return send(res, 421, "text/plain", "unexpected Host");
    if (req.method !== "GET") return send(res, 405, "text/plain", "read-only");
    if (url.pathname === "/") return send(res, 200, "text/html; charset=utf-8", readFileSync(join(HERE, "index.html")));
    if (url.pathname === "/api/state") return send(res, 200, "application/json; charset=utf-8", JSON.stringify(buildState(root, opts)));
    if (url.pathname === "/api/file") {
      const p = url.searchParams.get("path") || "";
      if (!ALLOWED_FILE.test(p)) return send(res, 403, "text/plain; charset=utf-8", "not an allowed file");
      return send(res, 200, "text/plain; charset=utf-8", readFileSync(join(root, p)));
    }
    send(res, 404, "text/plain", "not found");
  } catch (e) {
    send(res, e.code === "ENOENT" ? 404 : 500, "text/plain; charset=utf-8", String(e.message || e));
  }
});
server.listen(port, host, () => {
  console.log(`loop dashboard: http://${host}:${port}  (${opts.loopLog ? `replaying ${opts.loopLog}` : `live: ${root}/.loop`})`);
});
