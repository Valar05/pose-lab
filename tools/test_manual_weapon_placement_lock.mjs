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
  ['Meshy modelLocalOffset', 'modelLocalOffset: [-0.18003, -0.0236, -0.13396]'],
  ['Meshy weapon scale', 'scale: 0.47493'],
  ['Meshy weapon rotation', 'rotationDeg: [90, 0, -55.145]'],
  ['Meshy grip landmark', 'gripLocalPosition: [0.6535, -0.02302, -0.07317]'],
  ['Meshy tip landmark', 'tipLocalPosition: [-0.95561, 0.1368, 0]'],
  ['FPS modelLocalOffset', 'modelLocalOffset: [0.06126, -0.07096, -0.00135]'],
  ['FPS weapon scale', 'scale: 0.323'],
  ['FPS weapon rotation', 'rotationDeg: [178.343, 4.512, 109.315]'],
  ['FPS grip landmark', 'gripLocalPosition: [0.67888, -0.07803, -0.06249]'],
  ['FPS tip landmark', 'tipLocalPosition: [-0.95561, 0.1368, 0]'],
];

for (const [label, literal] of lockedProductionLiterals) {
  assert(profiles.includes(literal), `${label} manual placement literal changed or was removed`);
}

assert(orientation.includes('Manual Placement Authority'), 'orientation should document manual placement authority');
assert(orientation.includes('Never overwrite manually placed weapon/model attachment values'), 'orientation should forbid diagnostic overwrite of manual placement');
assert(agents.includes('Never overwrite manually placed weapon/model attachment values'), 'AGENTS should forbid diagnostic overwrite of manual placement');

assert(socketSolver.includes('MANUAL_PLACEMENT_LOCK'), 'socket solver should carry an explicit manual placement lock');
assert(socketSolver.includes('promotable: false'), 'socket solver should never mark manual placement candidates as promotable');
assert(socketSolver.includes('productionSnippet: null'), 'socket solver should never emit production snippets for manual placement fields');
assert(!socketSolver.includes('candidate may be promoted later'), 'socket solver should not invite promotion of metric-derived socket output');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['manual-weapon-placement-literals', 'manual-authority-docs', 'socket-solver-no-promotable-snippet'],
  lockedProductionLiterals: lockedProductionLiterals.map(([label]) => label),
}, null, 2));
