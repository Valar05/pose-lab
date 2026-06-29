import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const output = execFileSync('node', [path.join(projectRoot, 'tools', 'meshy_fps_weapon_basis_audit.mjs')], { cwd: projectRoot, encoding: 'utf8' });
const jsonStart = output.indexOf('{');
if (jsonStart < 0) throw new Error(`audit did not print JSON: ${output}`);
const result = JSON.parse(output.slice(jsonStart));
const audit = JSON.parse(fs.readFileSync(path.join(projectRoot, result.path), 'utf8'));
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'basis audit should complete');
assert(audit.schema === 'pose-lab-meshy-fps-weapon-basis-audit-v1', `unexpected schema ${audit.schema}`);
assert(audit.clip === 'OneHandReady', `basis audit should inspect OneHandReady, got ${audit.clip}`);
assert(audit.sourceKeyCount === 31, `audit should preserve 31 authored Weapon.R keys, got ${audit.sourceKeyCount}`);
assert(audit.metrics.rawAvgBladeErrorDeg > 45, `raw wrist-relative blade basis should be visibly wrong, got ${audit.metrics.rawAvgBladeErrorDeg}`);
assert(audit.metrics.solvedAvgBladeErrorDeg <= 1, `frame-solved basis should reduce blade direction error, got ${audit.metrics.solvedAvgBladeErrorDeg}`);
assert(js.includes('function quaternionFromBladeFrame') && js.includes('weaponTipWorldFromSocket'), 'runtime should build a solved weapon frame from blade direction');
assert(js.includes('weaponConfig.frameSolve !== false') && js.includes('targetWeaponWorld = quaternionFromBladeFrame(mappedBlade, mappedUp)'), 'runtime should use frame-solved WeaponGrip orientation');
assert(profiles.includes('frameSolve: true') && profiles.includes('sourceTipLocal: [0.00854, 0.57786, 0.00995]'), 'Meshy profile should enable measured FPS weapon frame solve');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-fps-weapon-basis-audit', 'raw-basis-error-measured', 'frame-solved-runtime-enabled'], metrics: audit.metrics }, null, 2));
