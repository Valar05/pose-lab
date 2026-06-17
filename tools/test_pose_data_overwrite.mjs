import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-data-overwrite-'));
const target = `generated/pose_write_tests/${process.pid}/sample.poseclip.json`;
const targetAbs = path.join(projectRoot, target);
const source = path.join(projectRoot, 'assets/pose_indexes/ares_axekick_sf2.poseclip.json');
const failures = [];

function runJson(args, input = undefined) {
  const output = execFileSync('python3', ['tools/overwrite_pose_data.py', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    input,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function runFail(args, input = undefined) {
  const result = spawnSync('python3', ['tools/overwrite_pose_data.py', ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    input,
  });
  if (result.status === 0) failures.push(`expected failure for ${args.join(' ')}`);
  return result;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const dry = runJson(['--target', target, '--source', source, '--kind', 'poseclip', '--allow-new', '--dry-run']);
assert(dry.ok === true, 'dry run did not report ok');
assert(dry.dryRun === true, 'dry run flag missing');
assert(!fs.existsSync(targetAbs), 'dry run created target');

const create = runJson(['--target', target, '--source', source, '--kind', 'poseclip', '--allow-new']);
assert(create.ok === true, 'create did not report ok');
assert(create.created === true, 'create did not report created');
assert(create.backup === null, 'new create should not backup');
assert(fs.existsSync(targetAbs), 'create did not write target');

const original = JSON.parse(fs.readFileSync(targetAbs, 'utf8'));
const mutated = JSON.parse(JSON.stringify(original));
mutated.clip.name = `${mutated.clip.name} overwrite-test`;
mutated.clip.userData.poseDataOverwriteTest = true;
const overwrite = runJson(['--target', target, '--stdin', '--kind', 'poseclip'], JSON.stringify(mutated));
assert(overwrite.ok === true, 'overwrite did not report ok');
assert(overwrite.backup && fs.existsSync(path.join(projectRoot, overwrite.backup)), 'overwrite did not create backup');
const after = JSON.parse(fs.readFileSync(targetAbs, 'utf8'));
assert(after.clip.name.endsWith('overwrite-test'), 'overwrite did not replace target content');

const beforeBad = fs.readFileSync(targetAbs, 'utf8');
const bad = JSON.stringify({ schema: 'not-a-pose-schema', clip: { tracks: [] } });
const badResult = runFail(['--target', target, '--stdin', '--kind', 'poseclip'], bad);
assert(badResult.stderr.includes('requires schema'), 'bad schema failure did not explain schema requirement');
assert(fs.readFileSync(targetAbs, 'utf8') === beforeBad, 'bad schema changed target');

const outside = path.join(tmpRoot, 'outside.poseclip.json');
fs.writeFileSync(outside, JSON.stringify(original));
const outsideResult = runFail(['--target', outside, '--source', source, '--kind', 'poseclip', '--allow-new']);
assert(outsideResult.stderr.includes('outside allowed pose data roots'), 'outside-root failure missing');

const noCreateTarget = `generated/pose_write_tests/${process.pid}/no_create.poseclip.json`;
const noCreate = runFail(['--target', noCreateTarget, '--source', source, '--kind', 'poseclip']);
assert(noCreate.stderr.includes('--allow-new'), 'missing allow-new failure did not explain fix');

if (!failures.length) {
  fs.rmSync(path.dirname(targetAbs), { recursive: true, force: true });
  if (overwrite.backup) fs.rmSync(path.join(projectRoot, overwrite.backup), { force: true });
}

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_pose_data_overwrite');
console.log(JSON.stringify({ target, backup: overwrite.backup, checked: ['dry-run', 'create', 'backup-overwrite', 'schema-reject', 'root-reject', 'allow-new-reject'] }, null, 2));
