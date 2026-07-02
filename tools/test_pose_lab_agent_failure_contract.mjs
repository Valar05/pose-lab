import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const contractPath = path.join(projectRoot, 'docs', 'POSE_LAB_AGENT_FAILURE_CONTRACT.md');
const contract = fs.readFileSync(contractPath, 'utf8');
const orientation = fs.readFileSync(path.join(projectRoot, 'PROJECT_ORIENTATION.md'), 'utf8');
const agents = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(contract.includes('Meshy must be FPS weapon FK plus authored offsets, nothing else.'), 'contract must preserve the controlling FK instruction');
assert(contract.includes('Pain Mined From The Failed Session'), 'contract must mine the user pain explicitly');
for (const phrase of [
  'accepted marker, socket, cache-token, and generated-artifact evidence',
  'edited placement literals before proving',
  'documented and implied fixed states before the user accepted',
  'tests encode the broken Meshy-specific design',
  'red build',
  'dirty repo dirtier',
  'momentum over prompt attention',
]) {
  assert(contract.includes(phrase), `contract is missing mined pain phrase: ${phrase}`);
}

for (const phrase of [
  'The latest user correction controls',
  'stop the active premise and audit assumptions',
  'If two consecutive visual edits are no-ops',
  'Do not use success language',
  'Do not write victory documentation',
  'failed-attempt edit to quarantine or roll back',
]) {
  assert(contract.includes(phrase), `contract is missing required behavior phrase: ${phrase}`);
}

for (const phrase of [
  'The current Meshy saber state is not accepted as fixed',
  'Quarantine or roll back failed-attempt production edits',
  'Add an FK matrix invariant comparing FPS and Meshy',
  'Only then consider authored offset edits',
]) {
  assert(contract.includes(phrase), `contract is missing quarantine phrase: ${phrase}`);
}

assert(orientation.includes('docs/POSE_LAB_AGENT_FAILURE_CONTRACT.md'), 'PROJECT_ORIENTATION should route agents to the failure contract');
assert(orientation.includes('not accepted as fixed'), 'PROJECT_ORIENTATION should state Meshy saber is not accepted fixed');
assert(agents.includes('docs/POSE_LAB_AGENT_FAILURE_CONTRACT.md'), 'AGENTS should route agents to the failure contract');
assert(agents.includes('FPS weapon FK plus authored offsets'), 'AGENTS should preserve the controlling instruction');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['pose-lab-agent-failure-contract', 'prompt-attention-regression', 'meshy-fk-quarantine-routing'],
  contract: path.relative(projectRoot, contractPath),
}, null, 2));
