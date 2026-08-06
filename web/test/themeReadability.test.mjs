import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mainSource = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const themeSource = await readFile(new URL("../src/red-theme.css", import.meta.url), "utf8");
const readabilitySource = await readFile(new URL("../src/readability.css", import.meta.url), "utf8");

test("shared theme overrides are loaded after feature styles", () => {
  const dropzoneIndex = mainSource.indexOf('import "./data-dropzone.css"');
  const themeIndex = mainSource.indexOf('import "./red-theme.css"');
  const readabilityIndex = mainSource.indexOf('import "./readability.css"');

  assert.ok(dropzoneIndex >= 0);
  assert.ok(themeIndex > dropzoneIndex);
  assert.ok(readabilityIndex > themeIndex);
});

test("cauchan uses the shared red workbench color tokens", () => {
  assert.match(themeSource, /--bg:\s*#fcfbfb/);
  assert.match(themeSource, /--text:\s*#302929/);
  assert.match(themeSource, /--primary:\s*#b94f57/);
  assert.match(themeSource, /html\[data-theme="dark"\]/);
  assert.match(themeSource, /--primary:\s*#e3949a/);
  assert.match(themeSource, /\.workflow-step\.active/);
  assert.match(themeSource, /\.causal-node\.selected/);
  assert.match(themeSource, /\.react-flow__controls-button/);
});

test("typography follows the bochan and malchan readability scale", () => {
  assert.match(readabilitySource, /--ui-control-font-size:\s*15px/);
  assert.match(readabilitySource, /--ui-label-font-size:\s*14px/);
  assert.match(readabilitySource, /--ui-secondary-font-size:\s*13px/);
  assert.match(readabilitySource, /--ui-kicker-font-size:\s*12px/);
  assert.match(readabilitySource, /input\[type="checkbox"\]/);
  assert.match(readabilitySource, /width:\s*18px/);
  assert.match(readabilitySource, /\.causal-node-copy strong/);
  assert.match(readabilitySource, /table th/);
});
