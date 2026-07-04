import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const raw = execFileSync('node', [
  'tools/pose_lab_route.mjs',
  '--kind',
  'weapon-fk',
  '--actor',
  'meshyCharacter',
  '--clip',
  'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]',
  '--json',
], { cwd: projectRoot, encoding: 'utf8' });
const route = JSON.parse(raw);
const doc = fs.readFileSync(path.join(projectRoot, 'docs', 'POSE_LAB_EVIDENCE_PROTOCOL.md'), 'utf8');
const orientation = fs.readFileSync(path.join(projectRoot, 'PROJECT_ORIENTATION.md'), 'utf8');

assert(route.schema === 'pose-lab-route-v1', 'route command should emit the canonical schema');
assert(route.route?.kind === 'weapon-fk', 'weapon terms should route to weapon-fk');
assert(route.route?.authoritativeEvidence === 'firebase-hosted-cloud-browser', 'weapon-fk route should use Firebase hosted cloud browser as authority');
assert(route.route?.commands?.some((entry) => entry.command.includes('test_firebase_hosting_config.mjs')), 'weapon-fk route must validate Firebase hosting config');
assert(route.route?.commands?.some((entry) => entry.command.includes('test_firebase_visual_truth_contract.mjs')), 'weapon-fk route must validate Firebase visual truth contract');
assert(route.route?.commands?.some((entry) => entry.command.includes('gh workflow run firebase-visual-truth.yml')), 'weapon-fk route must run the Firebase visual truth workflow');
assert(route.route?.requiredArtifacts?.includes('generated/firebase_visual_truth/latest/visual_truth.json'), 'weapon-fk route must require Firebase visual truth JSON');
assert(route.route?.requiredArtifacts?.includes('generated/firebase_visual_truth/latest/tpose.png'), 'weapon-fk route must require T-pose cloud screenshot');
assert(route.route?.requiredArtifacts?.includes('generated/firebase_visual_truth/latest/ready_visual_follow.png'), 'weapon-fk route must require Ready visual-follow cloud contact sheet');
assert(route.route?.acceptance?.includes('truthLedger.tposeStableIdle === true'), 'weapon-fk route must require T-pose stable idle cloud truth');
assert(route.route?.acceptance?.includes('truthLedger.readyBoringFk === true'), 'weapon-fk route must require Ready boring FK cloud truth');
assert(route.route?.acceptance?.includes('captures[ready].evaluation.checks.tipTracksHand === true'), 'weapon-fk route must require saber tip to track hand in cloud');
assert(route.route?.acceptance?.includes('captures[ready].evaluation.checks.hiltAwayFromRawHand === true'), 'weapon-fk route must reject hilt collapse onto the raw hand/wrist');
assert(route.route?.acceptance?.includes('captures[ready].evaluation.checks.readyHandOrientationSane === true'), 'weapon-fk route must reject Ready hand-orientation visual regressions');
assert(route.route?.forbiddenProof?.some((item) => item.includes('source-string tests')), 'route must explicitly demote source-string tests as final visual proof');
assert(route.route?.forbiddenProof?.some((item) => item.includes('screencap')), 'route must forbid deprecated screencap acceptance');
assert(route.route?.forbiddenProof?.some((item) => item.includes('offline render')), 'route must forbid offline render acceptance');
assert(route.route?.negativeControl?.command?.includes('test_pose_lab_no_bad_promotions.mjs'), 'weapon-fk route must include promotion negative control');

assert(doc.includes('Firebase hosted visual truth is tier-one') && doc.includes('Source-string tests are support-only'), 'evidence protocol should document Firebase authority and support-only string tests');
assert(doc.includes('node tools/pose_lab_route.mjs --kind weapon-fk'), 'evidence protocol should advertise the router command');
assert(orientation.includes('docs/POSE_LAB_EVIDENCE_PROTOCOL.md'), 'orientation should link to the evidence protocol');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-route-command', 'weapon-fk-evidence-route', 'evidence-protocol-link'] }, null, 2));
