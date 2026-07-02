import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const runtimePath = path.join(projectRoot, 'src', 'pose-lab.js');
const profilesPath = path.join(projectRoot, 'src', 'rig-profiles.js');
const evidencePath = path.join(projectRoot, 'generated', 'visual_red_build', 'meshy_ready_weapon_fk_follow_latest.json');
const observedPath = path.join(projectRoot, 'generated', 'visual_red_build', 'meshy_ready_weapon_fk_follow_observed_web_truth.json');
const verifierPath = path.join(projectRoot, 'tools', 'meshy_ready_weapon_offline_visual_truth.mjs');
const sharedTruthPath = path.join(projectRoot, 'src', 'ready-weapon-truth.mjs');
const runtime = fs.readFileSync(runtimePath, 'utf8');
const profiles = fs.readFileSync(profilesPath, 'utf8');
const verifier = fs.readFileSync(verifierPath, 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
function currentCacheToken() {
  const match = runtime.match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] || '';
}
function importToken(moduleName) {
  const escaped = moduleName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = runtime.match(new RegExp(`${escaped}\\?v=([^'"]+)`));
  return match?.[1] || '';
}
function assertOrdered(source, markers, label) {
  let cursor = -1;
  for (const marker of markers) {
    const next = source.indexOf(marker, cursor + 1);
    assert(next > cursor, `${label}: expected marker after previous marker: ${marker}`);
    cursor = next;
  }
}
assert(fs.existsSync(sharedTruthPath), 'shared ready weapon truth module should exist');
assert(fs.existsSync(observedPath), 'observed web truth artifact should exist');
assert(runtime.includes("./ready-weapon-truth.mjs?v=pose-editor-131"), 'runtime should import shared ready weapon truth module with current cache token');
assert(verifier.includes("../src/ready-weapon-truth.mjs"), 'offline verifier should import shared ready weapon truth module');
assert(verifier.includes('readJson(args.observed)'), 'offline verifier should read observed web truth from artifact');
assert(!verifier.includes('const observedWebTruth = {'), 'offline verifier must not hardcode observed web truth');
assert(runtime.includes('updateSyntheticWeaponSocketTransform(THREE'), 'runtime socket transform should call shared truth function');
assert(runtime.includes('applyWeaponAttachmentTruthTransform(THREE'), 'runtime weapon attachment should call shared truth function');
assert(fs.readFileSync(sharedTruthPath, 'utf8').includes('classifyWeaponVisibility'), 'shared truth should model runtime weapon visibility');
assert(runtime.includes('classifyWeaponVisibility({'), 'browser runtime should classify weapon visibility through shared truth');
assert(!runtime.includes("patterns.some((pattern) => new RegExp(pattern).test(clip?.name || ''))"), 'browser runtime must not duplicate weapon visibility pattern matching');
const run = JSON.parse(execFileSync('node', [verifierPath], { cwd: projectRoot, encoding: 'utf8' }));
const artifactPath = path.join(projectRoot, run.artifact || '');
const sheetPath = path.join(projectRoot, run.sheet || '');
assert(fs.existsSync(artifactPath), `missing offline/web truth artifact: ${run.artifact}`);
assert(fs.existsSync(sheetPath), `missing offline/web truth sheet: ${run.sheet}`);
assert(fs.statSync(sheetPath).size > 1000, 'offline/web truth contact sheet should not be empty');
const artifact = fs.existsSync(artifactPath) ? JSON.parse(fs.readFileSync(artifactPath, 'utf8')) : null;
const token = currentCacheToken();
assert(token === 'pose-editor-131', `expected cache token pose-editor-131, got ${token}`);
assert(importToken('meshy-ready-runtime.mjs') === token, 'meshy-ready-runtime import token should match LAB_CACHE_TOKEN');
assert(importToken('ready-weapon-truth.mjs') === token, 'ready-weapon-truth import token should match LAB_CACHE_TOKEN');
assert(artifact?.schema === 'pose-lab-offline-web-truth-parity-ready-weapon-fk-v1', 'offline/web parity artifact schema mismatch');
assert(artifact?.proofMode === 'offline-web-truth-parity', 'artifact should identify offline/web parity proof mode');
assert(artifact?.browserCaptureDeprecated === true, 'artifact should deprecate browser capture as proof');
assert(artifact?.clipName === 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]', `unexpected verified clip ${artifact?.clipName}`);
assert(artifact?.cacheToken === token, 'artifact cache token should match runtime cache token');
assert(artifact?.observedWebTruthPath === 'generated/visual_red_build/meshy_ready_weapon_fk_follow_observed_web_truth.json', 'artifact should point to observed web truth artifact');
assert(artifact?.observedWebTruth?.visualClass === 'sword-rest-space', 'artifact should preserve current human web truth red class');
assert(artifact?.offlineTruth?.transformClass === 'sword-follows-fk', `unexpected offline transform class ${artifact?.offlineTruth?.transformClass}`);
assert(artifact?.offlineTruth?.visibilityClass === 'weapon-hidden', `unexpected offline visibility class ${artifact?.offlineTruth?.visibilityClass}`);
assert(artifact?.offlineTruth?.visualClass === 'sword-hidden', `unexpected offline visual class ${artifact?.offlineTruth?.visualClass}`);
assert(artifact?.parity?.visualVerdict === 'red' || artifact?.parity?.visualVerdict === 'fixed', 'artifact must explicitly classify red or fixed');
const acceptance = artifact?.acceptance || {};
for (const key of ['generatedReadyClipResolved', 'readyClipSampled', 'readyHandDisplacedFromRest', 'noGeneratedWeaponTracks', 'runtimeVisibilityModeled', 'manualSaberPlacementPreserved']) {
  assert(acceptance[key] === true, `offline/web truth acceptance prerequisite failed: ${key}`);
}
assert(fs.existsSync(evidencePath), 'missing red-build offline/web parity gate artifact');
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
assert(evidence.schema === 'pose-lab-ready-weapon-fk-offline-web-parity-gate-v1', 'red-build gate should use offline/web parity schema');
assert(evidence.browserCaptureDeprecated === true, 'red-build gate should deprecate browser capture');
assert(evidence.sharedTruthModule === 'src/ready-weapon-truth.mjs', 'red-build gate should name shared truth module');
assert(evidence.observedWebTruthPath === artifact.observedWebTruthPath, 'red-build gate should point at observed web truth artifact');
assert(evidence.offlineVisualTruth?.artifactPath === run.artifact, 'red-build gate should point at the parity artifact');
assert(evidence.offlineVisualTruth?.sheetPath === run.sheet, 'red-build gate should point at the parity sheet');
assert(evidence.offlineVisualTruth?.result === artifact.result, 'red-build gate result should mirror parity artifact');
assertOrdered(runtime, ['this.mixer.setTime(0);', 'this.reapplyBoneEdits();', 'this.applyGrounding();', 'this.updateWeaponProxyVisibility();', 'this.updateDebugHelpers();'], 'clip start should update weapon after final pose edits');
const updateStart = runtime.indexOf('  update(dt) {');
const updateEnd = runtime.indexOf('\n  }', updateStart + 1);
const updateBlock = runtime.slice(updateStart, updateEnd);
assertOrdered(updateBlock, ['this.mixer.update(dt);', 'this.reapplyBoneEdits();', 'this.applyGrounding();', 'this.updateWeaponProxyVisibility();', 'this.updateLegSymmetryOverlay();'], 'per-frame update should make weapon follow final FK pose');
assert(!profiles.includes("targetWeapon: 'WeaponGrip'") && !profiles.includes("sourceWeapon: 'Weapon.R'"), 'normal Ready clip must not key WeaponGrip or Weapon.R');
assert(!profiles.includes('weaponKeyConvert: {'), 'normal Ready profile must not re-enable weapon conversion');
if (artifact?.parity?.visualVerdict !== 'fixed') failures.push(`RED BUILD: offline/web truth parity not fixed: observed=${artifact?.observedWebTruth?.visualClass} offline=${artifact?.offlineTruth?.visualClass} visibility=${artifact?.offlineTruth?.visibilityClass} parityFailure=${artifact?.parity?.parityFailure || 'current-visual-truth-red'}`);
if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['ready-weapon-fk-offline-web-parity-fixed'], artifact: run.artifact, sheet: run.sheet, result: artifact.result, metrics: artifact.metrics }, null, 2));
