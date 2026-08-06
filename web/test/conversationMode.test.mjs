import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const pageSource = await readFile(new URL("../src/pages/ConversationPage.tsx", import.meta.url), "utf8");
const dataPageSource = await readFile(new URL("../src/pages/DataPage.tsx", import.meta.url), "utf8");
const iconSource = await readFile(new URL("../src/components/ConversationIcon.tsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/conversation-mode.css", import.meta.url), "utf8");
const alignmentSource = await readFile(new URL("../src/conversation-user-alignment.css", import.meta.url), "utf8");
const mainSource = await readFile(new URL("../src/main.tsx", import.meta.url), "utf8");
const typesSource = await readFile(new URL("../src/types.ts", import.meta.url), "utf8");

test("conversation mode is integrated without replacing workflow pages", () => {
  assert.match(appSource, /conversationOpen/);
  assert.match(appSource, /<ConversationPage onOpenStep=\{openStep\}/);
  assert.match(appSource, /className=\{`conversation-launcher/);
  assert.match(appSource, /const PAGES: Record<WorkbenchStep, ComponentType>/);
});

test("guided flow reuses existing causal analysis state and APIs", () => {
  assert.match(pageSource, /uploadDataset/);
  assert.match(pageSource, /runDiscovery/);
  assert.match(pageSource, /runInference/);
  assert.match(pageSource, /setSelectedColumns/);
  assert.match(pageSource, /setCategoricalColumns/);
  assert.match(pageSource, /setStructureSource/);
  assert.match(pageSource, /unresolvedDiscoveryEdges/);
  assert.match(pageSource, /CausalForestDML/);
});

test("causal inference factors and methods can be reselected", () => {
  assert.match(pageSource, /function reselectInferenceFactors\(\): void/);
  assert.match(pageSource, /setDraftTreatment\(""\)/);
  assert.match(pageSource, /setDraftOutcome\(""\)/);
  assert.match(pageSource, /function reselectInferenceMethod\(\): void/);
  assert.match(pageSource, /因子を選び直す/);
  assert.match(pageSource, /推定手法を選び直す/);
  assert.match(pageSource, /stage === "confirm" \|\| stage === "result"/);
});

test("manual structures and unresolved discovery edges hand off to existing editors", () => {
  assert.match(pageSource, /onOpenStep\("knowledge"\)/);
  assert.match(pageSource, /onOpenStep\("discovery"\)/);
  assert.match(pageSource, /unresolvedDiscoveryEdges > 0/);
  assert.match(pageSource, /この構造で推論へ進む/);
});

test("conversation cards do not collapse and icon resolution is shared", () => {
  assert.match(styleSource, /conversation-messages > \.conversation-action-card[\s\S]*flex:\s*0 0 auto/);
  assert.match(styleSource, /\.conversation-result-card[\s\S]*overflow:\s*visible/);
  assert.match(styleSource, /\.conversation-launcher[\s\S]*width:\s*100%/);
  assert.match(iconSource, /iconResolutionPromise/);
  assert.match(iconSource, /resolveConversationIcon/);
});

test("user messages and the user avatar are placed on the right", () => {
  assert.match(alignmentSource, /\.conversation-message\.user\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\) 38px/);
  assert.match(alignmentSource, /\.conversation-message\.user \.conversation-avatar[\s\S]*grid-column:\s*2/);
  assert.match(alignmentSource, /\.conversation-message\.user \.conversation-bubble[\s\S]*justify-self:\s*end/);
});

test("web dataset profile exposes backend imputation metadata", () => {
  assert.match(typesSource, /source_missing_counts/);
  assert.match(typesSource, /imputed_counts/);
  assert.match(typesSource, /imputation_methods/);
  assert.match(dataPageSource, /FastAPI側から補完/);
  assert.match(dataPageSource, /IMPUTATION_LABELS/);
});

test("conversation styles load after theme and readability overrides", () => {
  const themeIndex = mainSource.indexOf('import "./red-theme.css"');
  const readabilityIndex = mainSource.indexOf('import "./readability.css"');
  const conversationIndex = mainSource.indexOf('import "./conversation-mode.css"');
  const alignmentIndex = mainSource.indexOf('import "./conversation-user-alignment.css"');

  assert.ok(themeIndex >= 0);
  assert.ok(readabilityIndex > themeIndex);
  assert.ok(conversationIndex > readabilityIndex);
  assert.ok(alignmentIndex > conversationIndex);
});
