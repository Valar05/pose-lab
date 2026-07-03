import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'meshy_onehand_ready_visual_parity.mjs'),
  '--out',
  'generated/test_runs/meshy_onehand_ready_visual_parity',
], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const artifactPath = path.join(projectRoot, result.path);
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(artifact.schema === 'pose-lab-meshy-onehand-ready-visual-parity-v1', `unexpected schema ${artifact.schema}`);
assert(artifact.sourceClip === 'OneHandReady', `expected OneHandReady source, got ${artifact.sourceClip}`);
assert(fs.existsSync(path.join(projectRoot, result.sheet)), `missing visual parity contact sheet: ${result.sheet}`);
assert(!profiles.includes("clipTag: 'FPS-VISUAL-IK-GOLDEN'"), 'Visual-IK Ready profile block must not be promoted');
assert(!profiles.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-VISUAL-IK-GOLDEN'"), 'Visual-IK Ready origin group must not be promoted');
assert(artifact.acceptedAsFix !== true, 'Visual-IK Ready parity artifact must not be accepted as a fix');
assert(profiles.includes("clipTag: 'FPS-VISUAL-IK-READY'"), 'Visual-IK Ready review candidate should be wired as an explicit non-GOLDEN profile block');
assert(profiles.includes("clipSuffix: '-> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'"), 'Visual-IK Ready review candidate should expose the exact Firebase-reviewed clip');
assert(artifact.acceptance?.activeRuntimeUsesJointProjection === true, 'Visual-IK joint-projection candidate must be active for review');
assert(artifact.visualClassification === 'ready_for_review', `Visual-IK Ready candidate should be ready for Firebase review, got ${artifact.visualClassification}`);

if (failures.length) {
  throw new Error([
    'Meshy OneHandReady Visual-IK quarantine failed.',
    `Artifact: ${path.relative(projectRoot, artifactPath)}`,
    `Sheet: ${result.sheet}`,
    ...failures,
  ].join('\n'));
}

console.log(JSON.stringify({
  checked: ['meshy-onehand-ready-visual-ik-review-candidate'],
  artifact: path.relative(projectRoot, artifactPath),
  sheet: result.sheet,
  visualClassification: artifact.visualClassification,
}, null, 2));
