import { execFileSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const audit = JSON.parse(execFileSync('python3', ['tools/audit_bad_frames.py', '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json'], { cwd: projectRoot, encoding: 'utf8' }));
const failures = audit.failures.filter((failure) => failure.ruleId.includes('height'));
if (failures.length) {
  throw new Error(failures.map((failure) => `${failure.ruleId}@${failure.spriteFrame}`).join('\n'));
}
console.log('PASS test_axekick_recovery_foot_pop');
