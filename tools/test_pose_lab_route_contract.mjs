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
  'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]',
  '--json',
], { cwd: projectRoot, encoding: 'utf8' });
const route = JSON.parse(raw);
const doc = fs.readFileSync(path.join(projectRoot, 'docs', 'POSE_LAB_EVIDENCE_PROTOCOL.md'), 'utf8');
const orientation = fs.readFileSync(path.join(projectRoot, 'PROJECT_ORIENTATION.md'), 'utf8');

assert(route.schema === 'pose-lab-route-v1', 'route command should emit the canonical schema');
assert(route.route?.kind === 'weapon-fk', 'weapon terms should route to weapon-fk');
assert(route.route?.authoritativeEvidence === 'offline-render-artifact', 'weapon-fk route should use offline render artifacts as authority');
assert(route.route?.commands?.some((entry) => entry.command.includes('tools/pose_lab_offline_render.mjs') && entry.command.includes('--assert-fixed')), 'weapon-fk route must run the fixed offline renderer');
assert(route.route?.commands?.some((entry) => entry.command.includes('test_pose_lab_offline_render_contract.mjs')), 'weapon-fk route must run the offline render contract');
assert(route.route?.acceptance?.includes('checks.appliedHiltAwayFromRawHand === true'), 'weapon-fk route must require hilt displacement from raw hand');
assert(route.route?.acceptance?.includes('checks.weaponBladeDirectionMatchesFpsSource === true'), 'weapon-fk route must require visible blade direction parity');
assert(route.route?.forbiddenProof?.some((item) => item.includes('source-string tests')), 'route must explicitly demote source-string tests as final visual proof');
assert(route.route?.forbiddenProof?.some((item) => item.includes('screencap')), 'route must forbid deprecated screencap acceptance');
assert(route.route?.negativeControl?.command?.includes('--fault collapse-displacement'), 'weapon-fk route must include the collapsed-displacement negative control');

assert(doc.includes('Weapon FK / Meshy Sword') && doc.includes('Source-string tests are support-only'), 'evidence protocol should document the weapon route and support-only string tests');
assert(doc.includes('node tools/pose_lab_route.mjs --kind weapon-fk'), 'evidence protocol should advertise the router command');
assert(orientation.includes('docs/POSE_LAB_EVIDENCE_PROTOCOL.md'), 'orientation should link to the evidence protocol');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-route-command', 'weapon-fk-evidence-route', 'evidence-protocol-link'] }, null, 2));
