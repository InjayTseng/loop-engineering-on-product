#!/usr/bin/env node
// check.mjs — the bench product's BUILD_CMD: no browser, deterministic, text evidence only.
// Exit 0 = ok. Prints JSON: whether the inline script parses, which funnel-critical strings are missing,
// and every control with its label and what its handler does — the evidence a validator can read.
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const MUST = ["Start your first habit", "Create account", "Upgrade to Pro"];
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
let scriptOk = true, scriptError = null;
try { new vm.Script(scripts); } catch (e) { scriptOk = false; scriptError = String(e.message); }
const fn = (name) => {   // the whole function, by brace matching (one-line functions included)
  const start = scripts.search(new RegExp(`function ${name}\\s*\\(`)); if (start < 0) return null;
  let i = scripts.indexOf("{", start), depth = 0;
  for (; i < scripts.length; i++) { if (scripts[i] === "{") depth++; else if (scripts[i] === "}" && --depth === 0) break; }
  return scripts.slice(start, i + 1);
};
const controls = [...html.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)].map(([, attrs, label]) => {
  const onclick = (attrs.match(/onclick="([^"]*)"/) || [])[1] || null;
  const called = onclick && (onclick.match(/^\s*([A-Za-z_]\w*)\s*\(/) || [])[1];
  return { id: (attrs.match(/id="([^"]*)"/) || [])[1] || null, label: label.replace(/<[^>]+>|\$\{[^}]*\}/g, "").trim(), onclick,
           handler: called ? fn(called) : null };
});
const missing = MUST.filter((s) => !html.includes(s));
const ok = scriptOk && missing.length === 0;
console.log(JSON.stringify({ ok, scriptOk, scriptError, missing, controls }, null, 2));
process.exit(ok ? 0 : 1);
