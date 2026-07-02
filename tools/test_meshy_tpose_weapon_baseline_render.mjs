import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const output = JSON.parse(execFileSync('node', ['tools/meshy_tpose_weapon_baseline_render.mjs'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
const artifactPath = path.join(projectRoot, output.artifact || '');
const sheetPath = path.join(projectRoot, output.sheet || '');
assert(fs.existsSync(artifactPath), `missing baseline artifact: ${output.artifact}`);
assert(fs.existsSync(sheetPath), `missing baseline sheet: ${output.sheet}`);
assert(fs.statSync(sheetPath).size > 1000, 'baseline sheet should be non-empty');

const artifact = fs.existsSync(artifactPath) ? JSON.parse(fs.readFileSync(artifactPath, 'utf8')) : {};
assert(artifact.schema === 'pose-lab-meshy-tpose-weapon-baseline-render-v1', 'baseline artifact schema mismatch');
assert(artifact.proofKind === 'offline-render-baseline-reference', 'baseline artifact should identify offline render proof');
assert(artifact.notPromotionEvidenceForReady === true, 'baseline artifact must not be usable as Ready promotion evidence');
assert(artifact.clipName === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', `unexpected baseline clip ${artifact.clipName}`);
assert(artifact.visibility?.status === 'visible', `baseline weapon should be visible, got ${artifact.visibility?.status}`);
assert(artifact.visibility?.matchedPattern === '\\[FPS-REST-ARMS', `unexpected visible pattern ${artifact.visibility?.matchedPattern}`);
assert(artifact.protectedSurfacePolicy?.includes('startup/SwordReady/RestProbe/default visibility'), 'baseline artifact should name protected surfaces');
assert(JSON.stringify(artifact.manualValues?.handLocalOffset) === JSON.stringify([0.095, 0.035, -0.01]), 'Meshy handLocalOffset changed');
assert(JSON.stringify(artifact.manualValues?.modelLocalOffset) === JSON.stringify([-0.11512, 0.00773, -0.01127]), 'Meshy modelLocalOffset changed');
assert(JSON.stringify(artifact.manualValues?.gripLocalPosition) === JSON.stringify([0.6535, -0.02302, -0.07317]), 'Meshy hilt oracle changed');
assert(Number.isFinite(artifact.metrics?.hiltToHandDistance), 'baseline should report hiltToHandDistance');
assert(Number.isFinite(artifact.metrics?.bladeLength) && artifact.metrics.bladeLength > 0.1, 'baseline should report visible blade length');
for (const key of ['rightHand', 'socket', 'hilt', 'tip']) {
  assert(Array.isArray(artifact.points?.[key]) && artifact.points[key].length === 3, `baseline should report ${key}`);
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['meshy-tpose-baseline-offline-render', 'baseline-not-ready-promotion-evidence'],
  artifact: output.artifact,
  sheet: output.sheet,
  metrics: artifact.metrics,
}, null, 2));
