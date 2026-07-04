import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

function writeJson(root, relativePath, data) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

function runGate(mockDir) {
  const raw = execFileSync('node', ['tools/pose_lab_recovery_gate.mjs', '--json', '--mock-dir', mockDir], { cwd: projectRoot, encoding: 'utf8' });
  return JSON.parse(raw);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-lab-recovery-gate-'));
const baseManifest = {
  schema: 'pose-lab-blender-authoring-lane-v1',
  status: 'scaffolded-no-approved-export',
};
writeJson(tmp, 'authoring/meshy_saber/manifest.json', baseManifest);
writeJson(tmp, 'contracts/meshy_saber_evidence_roles.json', { schema: 'pose-lab-evidence-role-map-v1' });

let report = runGate(tmp);
assert(report.authorityStage === 'blender-authoring', 'unapproved Blender lane should keep authority at blender-authoring');
assert(report.permissions.runtimeFixAllowed === false, 'runtime fixes should be blocked before Blender approval');
assert(report.permissions.wakeAllowed === false, 'wake should be blocked before Blender approval');
assert(report.failures.some((entry) => entry.includes('no human-approved export')), 'gate should name missing human-approved export');

writeJson(tmp, 'authoring/meshy_saber/exports/meshy_ready_saber_contract.json', {
  schema: 'pose-lab-blender-meshy-saber-contract-v1',
  status: 'human-approved',
  poseLabImport: { verified: true },
});
writeJson(tmp, 'generated/firebase_visual_truth/latest/visual_truth.json', {
  schema: 'pose-lab-firebase-visual-truth-v1',
  cacheToken: report.cacheToken,
  runtimeBuild: report.runtimeBuild,
  ok: true,
  hostedUrl: 'https://example.invalid/pose-lab.html',
  truthLedger: { tposeStableIdle: true, readyBoringFk: true },
});
report = runGate(tmp);
assert(report.authorityStage === 'cloud-presentation', 'approved Blender/import plus green Firebase should reach cloud-presentation');
assert(report.permissions.wakeAllowed === true, 'wake should be allowed only for approved fresh green cloud proof');
assert(report.permissions.claimGreenAllowed === true, 'green claim should require the same gate as wake');

writeJson(tmp, 'generated/visual_red_build/pose_lab_latest.json', { status: 'red', humanRed: true, visualRead: 'saber still wrong' });
report = runGate(tmp);
assert(report.permissions.wakeAllowed === false, 'human red-build veto should block wake');
assert(report.failures.some((entry) => entry.includes('vetoes green claims')), 'gate should report human red veto');

writeJson(tmp, 'generated/visual_red_build/pose_lab_previous_red.json', { status: 'red', humanRed: true, visualRead: 'saber still wrong' });
report = runGate(tmp);
assert(report.failures.some((entry) => entry.includes('no visible improvement')), 'gate should detect unchanged red artifact');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-recovery-gate', 'blender-authoring-block', 'red-build-veto', 'no-visible-change-stop'] }, null, 2));

