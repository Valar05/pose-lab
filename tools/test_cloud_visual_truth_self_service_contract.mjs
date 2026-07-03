import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const selfService = fs.readFileSync(path.join(projectRoot, 'tools', 'pose_lab_cloud_visual_truth_self_service.mjs'), 'utf8');
const inspector = fs.readFileSync(path.join(projectRoot, 'tools', 'inspect_firebase_visual_artifact.mjs'), 'utf8');
const firebaseDoc = fs.readFileSync(path.join(projectRoot, 'docs', 'FIREBASE_VISUAL_TRUTH.md'), 'utf8');
const refreshDoc = fs.readFileSync(path.join(projectRoot, 'docs', 'VISUAL_EVIDENCE_REFRESH.md'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

assert(selfService.includes('pose-lab-cloud-visual-truth-self-service-v1'), 'self-service tool should write a stable ledger schema');
assert(selfService.includes("run('git', ['push'])"), 'self-service tool should use git push to trigger the existing PR workflow');
assert(!selfService.includes('gh workflow run'), 'self-service tool must not depend on gh workflow dispatch');
assert(!selfService.includes("'workflow', 'run'"), 'self-service tool must not invoke gh workflow dispatch');
assert(selfService.includes("'run', 'download'"), 'self-service tool should use authenticated gh artifact download fallback');
assert(selfService.includes('actions/runs?head_sha='), 'self-service tool should poll workflow runs by commit SHA');
assert(selfService.includes('firebase-visual-truth'), 'self-service tool should fetch the Firebase visual truth artifact');
assert(selfService.includes('generated\', \'firebase_visual_truth\', \'latest'), 'self-service tool should sync downloaded artifacts to the canonical evidence path');
assert(selfService.includes('tools/inspect_firebase_visual_artifact.mjs'), 'self-service tool should call the artifact inspector');
for (const required of [
  "'--check', 'src/pose-lab.js'",
  "'--check', 'src/rig-profiles.js'",
  "'--check', 'tools/capture_firebase_visual_truth.mjs'",
  "'tools/test_firebase_hosting_config.mjs'",
  "'tools/test_pose_lab_no_bad_promotions.mjs'",
  "'diff', '--check'",
]) {
  assert(selfService.includes(required), `self-service preflight should include ${required}`);
}

assert(inspector.includes('pose-lab-firebase-visual-artifact-inspection-v1'), 'artifact inspector should write a stable schema');
for (const required of ['visual_truth.json', 'tpose.png', 'ready.png', 'ready_visual_follow.png']) {
  assert(inspector.includes(required), `artifact inspector should require ${required}`);
}
assert(inspector.includes('Inspect these PNGs directly'), 'artifact inspector must remind agents that PNG inspection is required');
assert(inspector.includes('stale cache token'), 'artifact inspector should reject stale cache tokens');
assert(inspector.includes('artifact commit does not match current checkout'), 'artifact inspector should report wrong-commit artifacts');
assert(inspector.includes('--strict-commit'), 'artifact inspector should offer strict commit enforcement without breaking PR merge-sha artifacts by default');

assert(firebaseDoc.includes('pose_lab_cloud_visual_truth_self_service.mjs'), 'Firebase docs should route normal cloud refresh through the self-service tool');
assert(refreshDoc.includes('pose_lab_cloud_visual_truth_self_service.mjs'), 'visual evidence refresh docs should route normal refresh through the self-service tool');
assert(!refreshDoc.includes('gh workflow run firebase-visual-truth.yml --repo Valar05/pose-lab --ref <branch>'), 'visual refresh docs should not make gh workflow dispatch the default path');
assert(packageJson.scripts?.['cloud:visual'], 'package.json should expose a self-service cloud visual script');
assert(packageJson.scripts?.['cloud:inspect'], 'package.json should expose an artifact inspection script');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['cloud-visual-truth-self-service', 'artifact-inspector', 'no-gh-dispatch-default'] }, null, 2));
