import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const socketSolver = fs.readFileSync(path.join(projectRoot, 'tools', 'socket_solver.mjs'), 'utf8');
const orientation = fs.readFileSync(path.join(projectRoot, 'PROJECT_ORIENTATION.md'), 'utf8');
const agents = fs.readFileSync(path.join(projectRoot, 'AGENTS.md'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const lockedProductionLiterals = [
  ['Meshy handLocalOffset', 'handLocalOffset: [0.095, 0.035, -0.01]'],
  ['Meshy modelLocalOffset', 'modelLocalOffset: [-0.11512, 0.00773, -0.01127]'],
  ['Meshy weapon scale', 'scale: 0.47493'],
  ['Meshy weapon rotation', 'rotationDeg: [90, 0, -55.145]'],
  ['Meshy grip landmark', 'gripLocalPosition: [0.6535, -0.02302, -0.07317]'],
  ['Meshy tip landmark', 'tipLocalPosition: [-0.95561, 0.1368, 0]'],
  ['FPS modelLocalOffset', 'modelLocalOffset: [0.00424, -0.0167, 0.01744]'],
  ['FPS weapon scale', 'scale: 0.323'],
  ['FPS weapon rotation', 'rotationDeg: [-179.998, -4.747, 111.678]'],
  ['FPS grip landmark', 'gripLocalPosition: [0.67888, -0.07803, -0.06249]'],
  ['FPS tip landmark', 'tipLocalPosition: [-0.95561, 0.1368, 0]'],
];

for (const [label, literal] of lockedProductionLiterals) {
  assert(profiles.includes(literal), `${label} manual placement literal changed or was removed`);
}

assert(orientation.includes('Manual Fix Authority'), 'orientation should document general manual fix authority');
assert(orientation.includes('Any manual fix authored by the user is the golden standard'), 'orientation should define manual fixes as golden standard');
assert(orientation.includes('manual animation, pose, socket, camera, UI, material, asset, and runtime fixes outrank diagnostics'), 'orientation should generalize beyond weapon placement');
assert(agents.includes('Any manual fix authored by the user is the golden standard'), 'AGENTS should define manual fixes as golden standard');
assert(agents.includes('Never overwrite manual animation, pose, socket, camera, UI, material, asset, runtime, or weapon/model attachment fixes'), 'AGENTS should forbid diagnostic overwrite of any manual fix');

assert(socketSolver.includes('MANUAL_PLACEMENT_LOCK'), 'socket solver should carry an explicit manual placement lock');
assert(socketSolver.includes('promotable: false'), 'socket solver should never mark manual placement candidates as promotable');
assert(socketSolver.includes('productionSnippet: null'), 'socket solver should never emit production snippets for manual placement fields');
assert(socketSolver.includes('candidateModelLocalOffset: null'), 'socket solver should not output production-shaped replacement socket offsets');
assert(!socketSolver.includes('candidate may be promoted later'), 'socket solver should not invite promotion of metric-derived socket output');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['manual-weapon-placement-literals', 'manual-authority-docs', 'socket-solver-no-promotable-snippet'],
  lockedProductionLiterals: lockedProductionLiterals.map(([label]) => label),
}, null, 2));
