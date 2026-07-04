#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}

const doctor = JSON.parse(execFileSync('node', ['tools/pose_lab_doctor.mjs', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
assert(doctor.schema === 'pose-lab-doctor-v1', 'doctor schema mismatch');
assert(doctor.caseValidation?.ok === true, 'doctor should report valid case specs');
assert(Array.isArray(doctor.cases?.verdicts), 'doctor should include case verdicts');
assert(doctor.saberParity && typeof doctor.saberParity.classification === 'string', 'doctor should expose saber parity status');
assert(typeof doctor.saberParity.nextCommand === 'string' && doctor.saberParity.nextCommand.length > 0, 'doctor should expose saber parity next command');
assert(doctor.manifest?.deleteEntries === 0, 'doctor should report no delete entries after cleanup');
assert(typeof doctor.nextCommand === 'string' && doctor.nextCommand.length > 0, 'doctor should provide a next command');

const toolIndex = JSON.parse(execFileSync('node', ['tools/pose_lab_tool_index.mjs', '--json'], {
  cwd: projectRoot,
  encoding: 'utf8',
}));
assert(toolIndex.schema === 'pose-lab-tool-index-v1', 'tool index schema mismatch');
assert(toolIndex.groups.some((group) => group.id === 'case-evidence'), 'tool index should include case-evidence group');
assert(toolIndex.groups.some((group) => group.id === 'visual-truth'), 'tool index should include visual-truth group');
assert(JSON.stringify(toolIndex).includes('refresh_pose_lab_offline_visual_evidence.mjs'), 'tool index should include the Meshy saber offline visual refresh command');

console.log('pose_lab_doctor_contract ok');
