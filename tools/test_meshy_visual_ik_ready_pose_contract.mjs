import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const readyRuntime = fs.readFileSync(path.join(projectRoot, 'src', 'meshy-ready-runtime.mjs'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes("import { buildMeshyFpsVisualIkReadyClip }"), 'pose-lab should import the shared Ready helper');
assert(js.includes("spec.retargetMode === 'meshy-fps-visual-ik-ready'"), 'pose-lab should dispatch the explicit Ready helper mode');
assert(profiles.includes("retargetMode: 'meshy-fps-visual-ik-ready'"), 'Meshy profile should use the explicit Ready helper mode');
assert(profiles.includes("clipSuffix: '-> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'"), 'Ready clip should keep the visual IK R/L roll label');
assert(profiles.includes("rightRollOffsetDeg: -120") && profiles.includes("leftRollOffsetDeg: -90"), 'Ready profile should preserve accepted roll offsets');
assert(readyRuntime.includes('dropInitialRestKey') && readyRuntime.includes('targetKeyCount'), 'Ready helper should preserve source-key timing metadata');
assert(readyRuntime.includes('weaponTrackEnabled: Boolean(weaponTrack)'), 'Ready helper should expose weapon-track status for validation');
assert(js.includes('weaponAttachment: target.info?.weaponAttachment || {}'), 'Ready helper should receive attachment data only for metadata/math fallback, not for normal weapon tracks');
assert(!js.includes('experimentalWeaponSwing: true'), 'runtime call site must not enable experimental weapon tracks');
assert(!profiles.includes("weaponKeyConvert: {"), 'profile must not enable weapon conversion for normal Ready clips');
assert(profiles.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'Ready salvage must leave main saber hilt literal unchanged');

if (failures.length) throw new Error(failures.join('\\n'));
console.log(JSON.stringify({ checked: ['meshy-ready-helper-wired', 'saber-main-literals-unchanged'] }, null, 2));
