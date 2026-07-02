import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const diagnosticTools = [
  'tools/meshy_projection_workspace.mjs',
  'tools/meshy_blade_vector_workspace.mjs',
  'tools/meshy_weapon_basis_workspace.mjs',
  'tools/metric_landmark_audit.mjs',
  'tools/semantic_landmark_calibration.mjs',
  'tools/post_grip_baseline_audit.mjs',
  'tools/socket_solver.mjs',
  'tools/meshy_onehand_ready_visual_parity.mjs',
  'tools/meshy_ready_pose_workbench.mjs',
  'tools/render_bone_orientation_inspector.mjs',
];

for (const relative of diagnosticTools) {
  const file = path.join(projectRoot, relative);
  assert(fs.existsSync(file), `${relative} should exist for protected-surface audit`);
  const text = fs.readFileSync(file, 'utf8');
  assert(!/writeFileSync\s*\(\s*path\.join\s*\(\s*projectRoot\s*,\s*['"]src['"]/.test(text), `${relative} must not write production src files`);
  assert(!/writeFileSync\s*\(\s*path\.join\s*\(\s*projectRoot\s*,\s*['"]PROJECT_ORIENTATION\.md['"]/.test(text), `${relative} must not rewrite orientation docs`);
  assert(!/writeFileSync\s*\(\s*path\.join\s*\(\s*projectRoot\s*,\s*['"]generated['"]\s*,\s*['"]workflow_state['"]/.test(text), `${relative} must not rewrite accepted workflow state`);
  assert(!/actor\.info\.(startupClip|aliases|weaponProxy|weaponAttachment)\s*=/.test(text), `${relative} must not mutate runtime actor production config`);
  assert(!/(startupClip|visibleClipPatterns|SwordReady|RestProbe)\s*:/.test(text), `${relative} must not emit production selection snippets`);
}

const socketSolver = fs.readFileSync(path.join(projectRoot, 'tools', 'socket_solver.mjs'), 'utf8');
assert(socketSolver.includes('promotable: false'), 'socket solver should explicitly mark metric output non-promotable');
assert(socketSolver.includes('productionSnippet: null'), 'socket solver should not emit production override snippets');
assert(socketSolver.includes('candidateModelLocalOffset: null'), 'socket solver should omit production-shaped modelLocalOffset replacements');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['diagnostics-do-not-write-production-src', 'diagnostics-do-not-mutate-runtime-profile', 'socket-solver-non-promotable'],
  diagnosticTools,
}, null, 2));
