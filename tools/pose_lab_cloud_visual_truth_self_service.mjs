#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return {
    command: [command, ...args].join(' '),
    status: result.status ?? 1,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

const steps = [];
steps.push(run('node', ['tools/build_firebase_pose_lab_release.mjs']));
if (steps.at(-1).status === 0) steps.push(run('node', ['tools/test_firebase_hosting_config.mjs']));

const ok = steps.every((step) => step.status === 0);
console.log(JSON.stringify({
  schema: 'pose-lab-cloud-visual-self-service-v1',
  ok,
  status: ok ? 'release-staged' : 'blocked',
  next: ok
    ? 'Deploy with: firebase hosting:channel:deploy visual-truth --project home-center-dclar --expires 30d'
    : 'Fix the first failed step before deploying cloud visual truth.',
  steps,
}, null, 2));
process.exit(ok ? 0 : 1);
