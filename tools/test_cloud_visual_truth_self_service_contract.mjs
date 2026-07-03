import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const selfService = fs.readFileSync(path.join(projectRoot, 'tools', 'pose_lab_cloud_visual_truth_self_service.mjs'), 'utf8');
const wakeReady = fs.readFileSync(path.join(projectRoot, 'tools', 'wake_pose_lab_ready_cloud_url.mjs'), 'utf8');
const inspector = fs.readFileSync(path.join(projectRoot, 'tools', 'inspect_firebase_visual_artifact.mjs'), 'utf8');
const firebaseDoc = fs.readFileSync(path.join(projectRoot, 'docs', 'FIREBASE_VISUAL_TRUTH.md'), 'utf8');
const refreshDoc = fs.readFileSync(path.join(projectRoot, 'docs', 'VISUAL_EVIDENCE_REFRESH.md'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));

assert(selfService.includes('pose-lab-cloud-visual-truth-self-service-v1'), 'self-service tool should write a stable ledger schema');
assert(selfService.includes('--commit-message') && selfService.includes("run('git', ['add', '-u'])") && selfService.includes("run('git', ['commit', '-m', message])"), 'self-service tool should own tracked-edit staging and commit to avoid ad hoc approval prompts');
assert(selfService.includes('--include') && selfService.includes('ensureSafeInclude'), 'self-service tool should require explicit include paths for new files instead of sweeping generated artifacts');
assert(selfService.includes("run('git', ['push'])"), 'self-service tool should use git push to trigger the existing PR workflow');
assert(!selfService.includes('gh workflow run'), 'self-service tool must not depend on gh workflow dispatch');
assert(!selfService.includes("'workflow', 'run'"), 'self-service tool must not invoke gh workflow dispatch');
assert(selfService.includes("'run', 'download'"), 'self-service tool should use authenticated gh artifact download fallback');
assert(selfService.includes('actions/runs?head_sha='), 'self-service tool should poll workflow runs by commit SHA');
assert(selfService.includes('firebase-visual-truth'), 'self-service tool should fetch the Firebase visual truth artifact');
assert(selfService.includes('generated\', \'firebase_visual_truth\', \'latest'), 'self-service tool should sync downloaded artifacts to the canonical evidence path');
assert(selfService.includes('tpose_relationship_closeup.png') && selfService.includes('ready_relationship_closeup.png'), 'self-service tool should sync relationship close-up artifacts');
assert(selfService.includes('tools/inspect_firebase_visual_artifact.mjs'), 'self-service tool should call the artifact inspector');
assert(selfService.includes('refreshingFirebaseEvidence'), 'self-service tool should distinguish stale-evidence refresh from normal preflight');
assert(selfService.includes("!options.refreshingFirebaseEvidence"), 'self-service tool should skip stale visual-red evidence only while refreshing Firebase artifacts');
assert(selfService.includes("['node', ['tools/test_pose_lab_visual_red_build_contract.mjs']]"), 'normal self-service preflight should still include the visual red-build contract');
assert(selfService.includes("if (!args.download) throw new Error(`Firebase visual truth workflow concluded"), 'self-service tool should still fail non-download runs when Firebase visual truth fails');
assert(selfService.includes('downloading artifact for visual inspection'), 'self-service tool should download failed visual-truth artifacts when inspection was requested');
assert(selfService.includes("captureUrl(evidence, 'ready')"), 'self-service tool should wake the Ready capture URL, not the Firebase root');
assert(selfService.includes('refusing to wake base hostedUrl'), 'self-service tool should refuse to wake the base hostedUrl as review proof');
assert(selfService.includes('prune_and_wake_browser.sh'), 'self-service tool should use the Android browser wake script after artifact inspection');
assert(selfService.includes('inspection.evidenceOk === true'), 'self-service tool should wake Android browser only when the artifact is ready/green');
assert(selfService.includes('Browser wake skipped because the artifact is not green/ready'), 'self-service tool should skip browser wake during red/debug artifact inspection');
assert(wakeReady.includes('pose-lab-ready-cloud-url-wake-v1'), 'ready wake wrapper should write a stable ledger schema');
assert(wakeReady.includes('truthLedger?.readyBoringFk') && wakeReady.includes('readyVisualRelationshipAccepted'), 'ready wake wrapper should refuse non-ready artifacts');
assert(wakeReady.includes("captures?.find((capture) => capture.id === 'ready')"), 'ready wake wrapper should use captures[id=ready]');
assert(packageJson.scripts?.['cloud:wake-ready'], 'package.json should expose a reusable ready browser wake script');
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
for (const required of ['visual_truth.json', 'tpose.png', 'tpose_relationship_closeup.png', 'ready.png', 'ready_relationship_closeup.png', 'ready_visual_follow.png']) {
  assert(inspector.includes(required), `artifact inspector should require ${required}`);
}
assert(inspector.includes('Inspect these PNGs directly'), 'artifact inspector must remind agents that PNG inspection is required');
assert(inspector.includes('stale cache token'), 'artifact inspector should reject stale cache tokens');
assert(inspector.includes('artifact commit does not match current checkout'), 'artifact inspector should report wrong-commit artifacts');
assert(inspector.includes('--strict-commit'), 'artifact inspector should offer strict commit enforcement without breaking PR merge-sha artifacts by default');

assert(firebaseDoc.includes('pose_lab_cloud_visual_truth_self_service.mjs'), 'Firebase docs should route normal cloud refresh through the self-service tool');
assert(firebaseDoc.includes('--commit-message') && firebaseDoc.includes('--include path/to/file'), 'Firebase docs should document the one-command commit/push/wait/download/inspect path');
assert(refreshDoc.includes('pose_lab_cloud_visual_truth_self_service.mjs'), 'visual evidence refresh docs should route normal refresh through the self-service tool');
assert(!refreshDoc.includes('gh workflow run firebase-visual-truth.yml --repo Valar05/pose-lab --ref <branch>'), 'visual refresh docs should not make gh workflow dispatch the default path');
assert(packageJson.scripts?.['cloud:visual'], 'package.json should expose a self-service cloud visual script');
assert(packageJson.scripts?.['cloud:inspect'], 'package.json should expose an artifact inspection script');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['cloud-visual-truth-self-service', 'artifact-inspector', 'no-gh-dispatch-default'] }, null, 2));
