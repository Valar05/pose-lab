import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
function read(relativePath) { return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'); }

const ladder = read('docs/POSE_LAB_VISUAL_AUTHORITY_LADDER.md');
const evidence = read('docs/POSE_LAB_EVIDENCE_PROTOCOL.md');
const firebase = read('docs/FIREBASE_VISUAL_TRUTH.md');
const orientation = read('PROJECT_ORIENTATION.md');
const agents = read('AGENTS.md');
const roles = JSON.parse(read('contracts/meshy_saber_evidence_roles.json'));

assert(ladder.includes('Blender authoring truth'), 'authority ladder must start with Blender authoring truth');
assert(ladder.includes('Pose Lab import truth'), 'authority ladder must include Pose Lab import truth');
assert(ladder.includes('Diagnostics and guardrails'), 'authority ladder must demote diagnostics');
assert(ladder.includes('Cloud presentation truth'), 'authority ladder must include cloud presentation truth');
assert(ladder.includes('User screenshot veto'), 'authority ladder must include user screenshot veto');
assert(evidence.includes('Visual Authority Ladder') && evidence.includes('Cloud presentation proof'), 'evidence protocol must point to the reconciled ladder');
assert(firebase.includes('final browser presentation gate') && firebase.includes('not an authoring surface'), 'Firebase doc must stop presenting cloud as authoring truth');
assert(orientation.includes('docs/POSE_LAB_VISUAL_AUTHORITY_LADDER.md'), 'orientation must link the authority ladder');
assert(agents.includes('docs/POSE_LAB_VISUAL_AUTHORITY_LADDER.md'), 'AGENTS must link the authority ladder');
assert(roles.schema === 'pose-lab-evidence-role-map-v1', 'role map schema should be stable');
assert(roles.roles?.acceptance?.some((entry) => entry.id === 'blender_authoring_approval'), 'role map must classify Blender approval as acceptance');
assert(roles.roles?.diagnostic?.includes('tools/test_firebase_visual_truth_contract.mjs'), 'Firebase contract should be diagnostic after Blender-first pivot');
assert(roles.roles?.guardrail?.includes('tools/test_pose_lab_recovery_gate.mjs'), 'recovery gate test should be a guardrail');
assert(!JSON.stringify(roles.roles?.diagnostic || []).includes('human-approved Blender'), 'diagnostics must not include human approval authority');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-visual-authority-ladder', 'evidence-role-map', 'docs-reconciled'] }, null, 2));

