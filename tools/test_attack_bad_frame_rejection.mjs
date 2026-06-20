import { execFileSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const audit = JSON.parse(execFileSync('python3', ['tools/audit_bad_frames.py', '--poseclip', 'assets/pose_indexes/ares_axekick_sf2.poseclip.json'], { cwd: projectRoot, encoding: 'utf8' }));
const failures = [];
const assert = (c, m) => { if (!c) failures.push(m); };
assert(audit.schema === 'pose-lab-bad-frame-audit-v1', `schema mismatch: ${audit.schema}`);
assert(audit.appliedRuleSet === 'sf2-axekick-bad-frame-rules-v1', `missing AxeKick bad frame ruleset: ${audit.appliedRuleSet}`);
assert(audit.failureCount === 0, `AxeKick bad frame audit found ${audit.failureCount} failures`);
if (failures.length) throw new Error(failures.join('\n'));
console.log('PASS test_attack_bad_frame_rejection');
