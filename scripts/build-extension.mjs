/**
 * Builds the production widget asset that Shopify serves from its CDN.
 *
 *   widget-src/homexperia.js
 *        -> HOMEXPERIA_TARGET_URL substitution (when set)
 *        -> Terser
 *        -> extensions/homexperia-storefront/assets/homexperia.min.js
 *
 * The Homexperia experience URL is one global value, so it is injected at build
 * time rather than stored per merchant or exposed as a theme setting. Changing
 * it means changing the environment variable and redeploying; the published CDN
 * asset does not change on its own. That tradeoff is intentional.
 *
 * The literal in widget-src stays as the fallback when the variable is unset.
 */

import { readFile, writeFile } from "node:fs/promises";
import { minify } from "terser";

const SOURCE = "widget-src/homexperia.js";
const OUTPUT = "extensions/homexperia-storefront/assets/homexperia.min.js";

// Matches the targetUrl default inside DEFAULT_CONFIG.
const TARGET_URL = /(targetUrl:\s*")([^"]*)(")/;

const source = await readFile(SOURCE, "utf8");
const match = source.match(TARGET_URL);

// Fail loudly rather than silently shipping an asset without the substitution.
if (!match) {
  throw new Error(
    `Could not find a targetUrl default in ${SOURCE}. The build was aborted so a stale URL cannot ship.`,
  );
}

let widget = source;
let targetUrl = match[2];
const override = process.env.HOMEXPERIA_TARGET_URL?.trim();

if (override) {
  // A quote or backslash would break out of the string literal; a bad URL would
  // break the widget at runtime. Reject both here, where it is cheap to notice.
  if (override.includes('"') || override.includes("\\")) {
    throw new Error("HOMEXPERIA_TARGET_URL must not contain quotes or backslashes.");
  }

  const parsed = new URL(override);

  if (parsed.protocol !== "https:") {
    throw new Error("HOMEXPERIA_TARGET_URL must use https.");
  }

  widget = source.replace(TARGET_URL, `$1${override}$3`);
  targetUrl = override;
}

const result = await minify(widget, { compress: true, mangle: true });

if (!result.code) {
  throw new Error("Terser produced no output.");
}

// Guard against shipping an asset whose URL does not match what was requested.
if (!result.code.includes(targetUrl)) {
  throw new Error(
    `Built asset does not contain the expected target URL (${targetUrl}). The build was aborted.`,
  );
}

await writeFile(OUTPUT, result.code, "utf8");

console.log(
  `Built ${OUTPUT} (${result.code.length} bytes) targetUrl=${targetUrl} ` +
    `[${override ? "HOMEXPERIA_TARGET_URL" : "source default"}]`,
);
