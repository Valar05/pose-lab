import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'tools', 'clean_pose_lab_tmp.mjs'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(source.includes("const tmpRoot = '/data/data/com.termux/files/usr/tmp'"), 'cleanup script must be scoped to Termux tmp');
assert(source.includes("'firebase-visual-truth-'"), 'cleanup script should include Firebase visual truth temp artifacts');
assert(source.includes("'pose-lab-parity-promotion-'"), 'cleanup script should include parity promotion temp artifacts');
assert(source.includes('safeTmpChild'), 'cleanup script must guard paths before deleting');
assert(source.includes('resolved.startsWith(`${resolvedRoot}${path.sep}`)'), 'cleanup script must only delete children under tmp root');
assert(source.includes("arg === '--apply'"), 'cleanup script must require --apply for deletion');
assert(source.includes("mode: args.apply ? 'apply' : 'dry-run'"), 'cleanup script must default to dry-run reporting');
assert(source.includes('fs.rmSync(candidate.path, { recursive: true, force: true })'), 'cleanup script should delete through guarded Node fs, not shell rm');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-tmp-cleanup-script', 'guarded-node-delete', 'dry-run-default'] }, null, 2));
