import { spawnSync } from 'node:child_process';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const result = spawnSync('node', ['tools/pose_lab_current_truth.mjs', '--json'], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

assert(result.status === 0, `current truth command should run: ${result.stderr}`);
const report = JSON.parse(result.stdout);
assert(report.schema === 'pose-lab-current-truth-v1', 'current truth schema mismatch');
assert(typeof report.branch === 'string' && report.branch.length > 0, 'current truth must report branch');
assert(typeof report.commit === 'string' && report.commit.length >= 7, 'current truth must report commit');
assert(typeof report.cacheToken === 'string' && report.cacheToken.length > 0, 'current truth must report cache token');
assert(report.preflight && typeof report.preflight.status === 'string', 'current truth must report preflight status');
assert(Array.isArray(report.openRedBuilds), 'current truth must report open red builds');
assert(Array.isArray(report.allowedWork) && report.allowedWork.length > 0, 'current truth must report allowed work');
assert(Array.isArray(report.blockedWork), 'current truth must report blocked work');

if (report.preflight.status === 'AUTHORITY_REVOKED_FALSE_GREEN') {
  assert(report.allowedWork.some((entry) => entry.includes('quarantine')), 'authority-revoked truth must allow quarantine work');
  assert(report.blockedWork.includes('FK edits'), 'authority-revoked truth must block FK edits');
  assert(report.blockedWork.includes('browser wake'), 'authority-revoked truth must block browser wake');
  assert(report.openRedBuilds.length > 0, 'authority-revoked truth must expose open red-build strikes');
}

console.log(JSON.stringify({
  checked: ['pose-lab-current-truth-contract'],
  status: report.preflight.status,
  redBuilds: report.openRedBuilds.length,
}, null, 2));
