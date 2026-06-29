import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(os.tmpdir(), `pose-lab-weapon-stick-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'weapon_retarget_stick_debug.mjs'),
  '--out', outDir,
  '--clip', 'Armature|Swing1',
], { cwd: projectRoot, encoding: 'utf8' });
const jsonStart = output.indexOf('{');
if (jsonStart < 0) throw new Error(`tool did not print JSON: ${output}`);
const result = JSON.parse(output.slice(jsonStart));
const manifestPath = path.join(projectRoot, result.manifest);
const pngPath = path.join(projectRoot, result.png);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'weapon stick debug should exit ok');
assert(manifest.schema === 'pose-lab-weapon-retarget-stick-debug-v1', `unexpected schema ${manifest.schema}`);
assert(manifest.clip === 'Armature|Swing1', 'manifest should cover Armature|Swing1');
assert(fs.existsSync(pngPath), `missing PNG contact sheet ${pngPath}`);
assert((manifest.frames || []).length >= 12, 'manifest should include dense source/target frame samples');
assert(manifest.metrics.pathMode === 'authored-diagonal-cut', `expected authored path mode, got ${manifest.metrics.pathMode}`);
assert(manifest.metrics.verdict !== 'covert-wave', `verdict should escape covert-wave, got ${manifest.metrics.verdict}`);
assert(manifest.metrics.targetSourceGripTravelRatio >= 0.4, `target grip travel ratio too low for frontside hand path: ${manifest.metrics.targetSourceGripTravelRatio}`);
assert(manifest.metrics.bladeSweepDeg >= 120, `blade sweep too low for diagonal sabre cut: ${manifest.metrics.bladeSweepDeg}`);
assert(manifest.metrics.targetGripZTravel >= 0.08, `target hand Z travel too low; screenshot showed planar hand motion: ${manifest.metrics.targetGripZTravel}`);
assert(manifest.metrics.targetTipZTravel >= 0.35, `target blade-tip Z travel too low: ${manifest.metrics.targetTipZTravel}`);
assert(manifest.metrics.targetBladeLeverLength >= 0.7, `target blade lever collapsed to hand scale: ${manifest.metrics.targetBladeLeverLength}`);
assert(manifest.metrics.hitHandDistanceFromShoulder >= 0.42, `hit hand reach too short: ${manifest.metrics.hitHandDistanceFromShoulder}`);
assert(manifest.metrics.reachClampSamples === 0, `frontside hand path should not depend on reach clamping: ${manifest.metrics.reachClampSamples}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['weapon-retarget-stick-debug', 'authored-diagonal-cut', 'visible-z-depth', 'frontside-hand-path', 'world-blade-lever', 'not-covert-wave', 'offline-png-sheet'], manifest: result.manifest, png: result.png }, null, 2));
