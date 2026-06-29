import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'weapon_retarget_debug', 'fps_onehand_attack1');
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'weapon_retarget_stick_debug.mjs'),
  '--preset', 'fpsPlayer',
  '--out', outDir,
], { cwd: projectRoot, encoding: 'utf8' });
const jsonStart = output.indexOf('{');
if (jsonStart < 0) throw new Error(`tool did not print JSON: ${output}`);
const result = JSON.parse(output.slice(jsonStart));
const manifestPath = path.join(projectRoot, result.manifest);
const pngPath = path.join(projectRoot, result.png);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const runtime = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
assert(runtime.includes('function buildPositionGuidedArmClips'), 'runtime should keep the generic FPS-to-Meshy position-guided builder available');
assert(!runtime.includes("position-guided-source-derived-hand-delta"), 'runtime must not use the offline source-derived hand-delta path until live visual evidence proves it stable');

assert(result.ok === true, 'FPS weapon stick debug should exit ok');
assert(manifest.schema === 'pose-lab-weapon-retarget-stick-debug-v1', `unexpected schema ${manifest.schema}`);
assert(manifest.preset === 'fpsPlayer', `manifest should use fpsPlayer preset, got ${manifest.preset}`);
assert(manifest.source === 'assets/models/FPSPlayer.glb', `source should be FPSPlayer.glb, got ${manifest.source}`);
assert(manifest.target === 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb', `unexpected target ${manifest.target}`);
assert(manifest.clip === 'OneHandAttack1', `manifest should cover OneHandAttack1, got ${manifest.clip}`);
assert(fs.existsSync(pngPath), `missing PNG contact sheet ${pngPath}`);
assert((manifest.frames || []).length >= 12, 'manifest should include dense source/target frame samples');
const m = manifest.metrics || {};
assert(m.pathMode === 'source-derived', `expected source-derived path mode, got ${m.pathMode}`);
assert(m.sourceFormat === 'glb', `expected GLB source format, got ${m.sourceFormat}`);
assert(m.targetSourceGripTravelRatio >= 0.65, `target grip travel ratio too low: ${m.targetSourceGripTravelRatio}`);
assert(m.targetSourceTipTravelRatio >= 0.65, `target tip travel ratio too low: ${m.targetSourceTipTravelRatio}`);
assert(m.targetBladeLeverLength >= 0.8 && m.targetBladeLeverLength <= 0.9, `target blade lever should stay saber length, got ${m.targetBladeLeverLength}`);
assert(m.bladeSweepDeg >= m.sourceBladeSweepDeg * 0.75, `target blade sweep ${m.bladeSweepDeg} too low versus source ${m.sourceBladeSweepDeg}`);
assert(m.avgBladeDirErrorDeg <= 35, `average blade direction error too high: ${m.avgBladeDirErrorDeg}`);
assert(m.maxBladeDirErrorDeg <= 90, `maximum blade direction error too high: ${m.maxBladeDirErrorDeg}`);
assert(m.avgGripLocalError <= 0.35, `average shoulder-frame grip error too high: ${m.avgGripLocalError}`);
assert(m.reachClampSamples <= Math.ceil((manifest.frames || []).length * 0.25), `reach clamping affects too many frames: ${m.reachClampSamples}/${(manifest.frames || []).length}`);
assert(m.verdict !== 'covert-wave', `verdict should not be covert-wave, got ${m.verdict}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fps-to-meshy-offline-stick-debug', 'offline-only-source-derived-hand-path', 'virtual-fps-weapon-tip', 'offline-png-sheet'], manifest: result.manifest, png: result.png, metrics: m }, null, 2));
