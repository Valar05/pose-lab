import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const dryRun = JSON.parse(execFileSync('node', [
  'tools/meshy_saber_blender_workbench.mjs',
  '--dry-run',
  '--json',
  '--blender',
  'blender',
], { cwd: projectRoot, encoding: 'utf8' }));

assert(dryRun.ok === true, 'dry run should not require Blender execution');
assert(dryRun.status === 'DRY_RUN', 'dry run should report DRY_RUN');
assert(Array.isArray(dryRun.command), 'dry run should report the command array');
assert(dryRun.command.includes('--background'), 'workbench should run Blender in background mode');
assert(dryRun.command.includes('authoring/meshy_saber/blender_build_meshy_ready_authoring.py'), 'workbench should call the Meshy saber Blender script');
assert(dryRun.command.includes('--render-dir'), 'workbench should request render artifacts');
assert(dryRun.command.includes('authoring/meshy_saber/exports/headless_review'), 'workbench should use the headless review output directory');
assert(dryRun.command.includes('--export-json'), 'workbench should export the transform contract');

const unavailable = spawnSync('node', [
  'tools/meshy_saber_blender_workbench.mjs',
  '--probe',
  '--json',
  '--blender',
  '/definitely/missing/blender',
], { cwd: projectRoot, encoding: 'utf8' });
const unavailableReport = JSON.parse(unavailable.stdout);
assert(unavailable.status === 0, 'probe mode should report missing Blender without failing the planning/probe command');
assert(unavailableReport.status === 'LOCAL_BLENDER_UNAVAILABLE', 'missing Blender should be explicit');
assert(String(unavailableReport.message || '').includes('do not fall back to Cauldron'), 'missing Blender report should forbid silent Cauldron fallback');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-saber-blender-workbench', 'dry-run-command', 'local-blender-unavailable'] }, null, 2));
