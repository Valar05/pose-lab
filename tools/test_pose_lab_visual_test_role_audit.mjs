import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const rolesPath = path.join(projectRoot, 'contracts', 'visual_test_roles.json');
const toolsDir = path.join(projectRoot, 'tools');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const rolePayload = readJson(rolesPath);
assert(rolePayload.schema === 'pose-lab-visual-test-roles-v1', 'visual test role manifest schema mismatch');
const rules = Array.isArray(rolePayload.roles) ? rolePayload.roles : [];
assert(rules.length > 0, 'visual test role manifest must define rules');

const allowedRoles = new Set(['acceptance', 'diagnostic', 'guardrail', 'quarantine']);
for (const rule of rules) {
  assert(typeof rule.match === 'string' && rule.match.length > 0, 'each visual test role rule needs match');
  assert(allowedRoles.has(rule.role), `invalid visual test role ${rule.role}`);
  assert(typeof rule.reason === 'string' && rule.reason.length >= 12, `visual test role ${rule.match} needs a reason`);
}

const highRiskPattern = /(?:visual|firebase|cloud|weapon|fk|pose|meshy|saber|critique|attack)/i;
const testFiles = fs.readdirSync(toolsDir)
  .filter((name) => /^test_.*\.mjs$/.test(name))
  .filter((name) => highRiskPattern.test(name))
  .sort();

function matchingRules(fileName) {
  return rules.filter((rule) => fileName.includes(rule.match));
}

const uncovered = [];
const classified = {};
for (const fileName of testFiles) {
  const matches = matchingRules(fileName);
  if (!matches.length) {
    uncovered.push(fileName);
    continue;
  }
  classified[fileName] = matches[0].role;
}

assert(uncovered.length === 0, `visual/FK/weapon/pose tests missing role classification:\n${uncovered.join('\n')}`);

for (const required of ['acceptance', 'diagnostic', 'guardrail', 'quarantine']) {
  assert(Object.values(classified).includes(required), `visual test roles must include ${required}`);
}

for (const acceptanceName of [
  'test_firebase_visual_truth_contract.mjs',
  'test_meshy_saber_live_in_hand_case.mjs',
]) {
  assert(classified[acceptanceName] === 'acceptance', `${acceptanceName} must be classified as acceptance`);
}

for (const diagnosticName of [
  'test_pose_lab_offline_render_contract.mjs',
  'test_weapon_fk_attachment_contract.mjs',
]) {
  assert(classified[diagnosticName] === 'diagnostic', `${diagnosticName} must be diagnostic-only`);
}

console.log(JSON.stringify({
  checked: ['pose-lab-visual-test-role-audit'],
  manifest: path.relative(projectRoot, rolesPath),
  classified: testFiles.length,
  roles: Object.fromEntries([...allowedRoles].map((role) => [role, Object.values(classified).filter((value) => value === role).length])),
}, null, 2));
