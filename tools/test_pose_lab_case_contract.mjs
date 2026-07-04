#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const casesRoot = path.join(projectRoot, 'cases');
const requiredCases = [
  'generated-churn',
  'meshy-ready-roll-drift',
  'meshy-saber-live-in-hand',
  'meshy-tpose-weapon-in-hand',
  'meshy-weapon-fk-pinning',
  'visual-truth-parity',
];

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

for (const id of requiredCases) {
  const file = path.join(casesRoot, `${id}.json`);
  assert(fs.existsSync(file), `missing case ${id}`);
  const data = readJson(file);
  assert(data.schema === 'pose-lab-case-v1', `bad schema for ${id}`);
  assert(data.id === id, `id mismatch for ${id}`);
  assert(data.route?.kind, `missing route kind for ${id}`);
  assert(data.route?.actor, `missing actor for ${id}`);
  assert(data.route?.clip, `missing clip for ${id}`);
  assert(Array.isArray(data.expectedVisibleBehavior) && data.expectedVisibleBehavior.length > 0, `missing visible behavior for ${id}`);
  assert(Array.isArray(data.contracts) && data.contracts.length > 0, `missing contracts for ${id}`);
  assert(Array.isArray(data.evidenceArtifacts), `missing evidence artifacts for ${id}`);
  assert((data.checks || []).some((check) => check.kind === 'route'), `missing route check for ${id}`);
}

const list = JSON.parse(execFileSync('node', ['tools/pose_lab_case.mjs', 'list', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
assert(list.schema === 'pose-lab-case-list-v1', 'case list schema mismatch');
for (const id of requiredCases) assert(list.cases.some((item) => item.id === id), `case list omitted ${id}`);

const route = JSON.parse(execFileSync('node', ['tools/pose_lab_case.mjs', 'route', '--case', 'meshy-weapon-fk-pinning'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
assert(route.schema === 'pose-lab-route-v1', 'route schema mismatch');
assert(route.route.kind === 'weapon-fk', 'weapon case did not resolve weapon-fk route');
assert(route.actor === 'meshyCharacter', 'weapon case actor mismatch');

const validation = JSON.parse(execFileSync('node', ['tools/pose_lab_case.mjs', 'validate', '--all', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
assert(validation.schema === 'pose-lab-case-validation-v1', 'validation schema mismatch');
assert(validation.ok === true, `case validation failed: ${(validation.failures || []).join('; ')}`);

const caseDoctor = JSON.parse(execFileSync('node', ['tools/pose_lab_case.mjs', 'doctor', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
assert(caseDoctor.schema === 'pose-lab-case-doctor-v1', 'case doctor schema mismatch');
assert(Array.isArray(caseDoctor.verdicts), 'case doctor omitted verdicts');

console.log('pose_lab_case_contract ok');
