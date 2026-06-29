import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(os.tmpdir(), `pose-lab-core-transform-audit-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'meshy_core_transform_audit.mjs'),
  '--out', outDir,
  '--clip', 'Armature|Swing1',
], { cwd: projectRoot, encoding: 'utf8' });
const jsonStart = output.indexOf('{');
if (jsonStart < 0) throw new Error(`tool did not print JSON: ${output}`);
const result = JSON.parse(output.slice(jsonStart));
const manifestPath = path.join(projectRoot, result.manifest);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
const byName = new Map((manifest.selectedBones || []).map((entry) => [entry.name, entry]));

assert(result.ok === true, 'core transform audit should exit ok');
assert(manifest.schema === 'pose-lab-core-transform-audit-v1', `unexpected schema ${manifest.schema}`);
assert(manifest.sourceBoneCount >= 100, `source should expose full duplicate Ruined Air rig, got ${manifest.sourceBoneCount}`);
assert(manifest.targetBoneCount === 24, `Meshy animated target should expose 24 bones, got ${manifest.targetBoneCount}`);
assert((manifest.duplicateNames || []).some((entry) => entry.name === 'RightArm' && entry.count === 2), 'audit should report duplicate RightArm source bones');
for (const name of ['RightShoulder', 'RightArm', 'RightForeArm', 'RightHand']) {
  const entry = byName.get(name);
  assert(entry, `missing selected bone ${name}`);
  assert(entry.sourceCandidateCount >= 2, `${name} should have duplicate source candidates`);
  assert(entry.sourceInSkin === true, `${name} selected source should be in skinned skeleton`);
  assert(entry.selectedChildSameName === false, `${name} selected child must not be same-name wrapper/end bone`);
}
assert(byName.get('RightArm')?.sourceMeaningfulChild === 'RightForeArm', `RightArm should chain to RightForeArm, got ${byName.get('RightArm')?.sourceMeaningfulChild}`);
assert(byName.get('RightForeArm')?.sourceMeaningfulChild === 'RightHand', `RightForeArm should chain to RightHand, got ${byName.get('RightForeArm')?.sourceMeaningfulChild}`);
assert((byName.get('RightArm')?.clipTrackKeys || 0) >= 30, 'Swing1 should include dense RightArm quaternion keys');
assert((byName.get('RightForeArm')?.clipTrackKeys || 0) >= 30, 'Swing1 should include dense RightForeArm quaternion keys');
assert((byName.get('RightHand')?.clipTrackKeys || 0) >= 30, 'Swing1 should include dense RightHand quaternion keys');
assert((byName.get('RightHand')?.sourceTargetWorldRestAngle || 0) > 90, 'audit should expose large source/target hand rest-space mismatch');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['core-transform-audit', 'duplicate-safe-source-bones', 'swing1-core-arm-tracks'], manifest: result.manifest }, null, 2));
