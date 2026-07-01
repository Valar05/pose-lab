import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const sourcePath = path.join(projectRoot, 'tools', 'pose_lab_weapon_visual_repro_offline.mjs');
const source = fs.readFileSync(sourcePath, 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(source.includes('pose_lab_offline_render.mjs'), 'deprecated weapon repro must delegate to the canonical pose+weapon offline renderer');
assert(source.includes('OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'), 'wrapper should keep the ready clip default');
assert(!source.includes('attachRuntimeWeapon('), 'deprecated weapon repro must not keep private weapon attachment math');
assert(!source.includes('displayRoot.scale.set('), 'deprecated weapon repro must not keep private display-root compensation math');
assert(!source.includes('screenshotCyanMetrics'), 'deprecated weapon repro must not remain screenshot-specific');
assert(!/screencap|debugBridge|termux-open-url|am start/.test(source), 'deprecated wrapper must not depend on live browser/capture');

const out = path.join(projectRoot, 'generated', 'test_runs', `weapon-repro-wrapper-${process.pid}`);
const output = execFileSync('node', [sourcePath, '--out', out, '--samples', '2'], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const artifactPath = path.join(projectRoot, result.path);
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
assert(artifact.schema === 'pose-lab-offline-pose-weapon-render-v1', `wrapper produced wrong schema ${artifact.schema}`);
assert(artifact.checks?.poseChecksPresent === true && artifact.checks?.weaponChecksPresent === true, 'wrapper output must include full pose plus weapon checks');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['deprecated-weapon-repro-delegates-to-canonical-offline-renderer'],
  artifact: result.path,
}, null, 2));
