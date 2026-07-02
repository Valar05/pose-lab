import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const orientation = fs.readFileSync(path.join(projectRoot, 'PROJECT_ORIENTATION.md'), 'utf8');
const workflow = fs.readFileSync(path.join(projectRoot, 'docs', 'ANIMATION_WORKFLOW_TOOLING.md'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(orientation.includes('Device Capture Standard Deprecated'), 'PROJECT_ORIENTATION should deprecate device capture as acceptance proof');
assert(workflow.includes('Device Capture Standard Deprecated'), 'ANIMATION_WORKFLOW_TOOLING should deprecate device capture as acceptance proof');
assert(orientation.includes('offline visibility') && orientation.includes('offline transform'), 'PROJECT_ORIENTATION should require offline visibility and transform gates');
assert(orientation.includes('context only'), 'PROJECT_ORIENTATION should define observed web truth as context only');
assert(workflow.includes('Offline/Web Truth Parity Gate'), 'ANIMATION_WORKFLOW_TOOLING should document the offline truth gate');
assert(workflow.includes('Visibility must pass before transform can be promoted'), 'workflow should require visibility before transform promotion');
assert(workflow.includes('observed human context'), 'workflow should keep observed truth as human context');
assert(workflow.includes('tools/meshy_ready_weapon_offline_visual_truth.mjs'), 'workflow should name the Meshy Ready offline verifier');
for (const text of [orientation, workflow]) {
  assert(text.includes('Browser screenshots') || text.includes('browser screenshots'), 'docs should explicitly mention browser screenshots');
  assert(text.includes('deprecated as acceptance'), 'docs should mark browser/device capture deprecated as acceptance evidence');
  assert(text.includes('cannot close a red build') || text.includes('cannot promote'), 'docs should say browser capture cannot close/promote');
}
assert(!orientation.includes('Use the visual QA harness or a fresh Android screenshot from the live browser when you need visible proof.'), 'old browser-first proof rule must be removed from PROJECT_ORIENTATION');
assert(!workflow.includes('Do not use the old standalone `screencap` path.'), 'old screencap-only ban should be replaced by broader browser capture deprecation');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['offline-machine-gate-policy', 'browser-capture-deprecated', 'observed-truth-context-only'] }, null, 2));
