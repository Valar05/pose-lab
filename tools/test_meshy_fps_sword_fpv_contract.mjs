import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.css'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const meshyCameraStart = profiles.indexOf("cameraMode: 'head-forward'");
const meshyCameraEnd = profiles.indexOf('    weaponProxy:', meshyCameraStart);
const meshyCamera = meshyCameraStart >= 0 && meshyCameraEnd > meshyCameraStart ? profiles.slice(meshyCameraStart, meshyCameraEnd) : '';

assert(js.includes("config.cameraMode === 'head-forward'"), 'FPV camera should support head-forward framing');
assert(js.includes('headForwardOffset') && js.includes('headCameraYOffset'), 'head-forward FPV should offset from the head bone, not the hands');
assert(!js.includes('config.lookAtHandsTarget && handCenter'), 'Meshy FPV must not aim at the hands; imported animation should bring hands into a straight-ahead frame');
assert(js.includes("this.viewMode === 'firstPerson' && this.activePanel !== 'none'"), 'entering FPV should close any open mobile sheet');
assert(profiles.includes("cameraMode: 'head-forward'"), 'Meshy first-person camera should use head-forward framing');
assert(profiles.includes("anchor: 'Head'") && profiles.includes("fallbackAnchor: 'Spine02'"), 'Meshy FPV should anchor from the head center with a torso fallback');
assert(!profiles.includes('lookAtHands: true'), 'Meshy FPV must not use the rejected hand-centered camera');
assert(!profiles.includes('cameraBackOffset: 0.62') && !profiles.includes('handCameraYOffset: 0.18'), 'Meshy FPV should not keep the behind-hand low camera offsets');
assert(profiles.includes("forwardAxis: 'z'"), 'Meshy FPV should use the same forward convention as the source FPS/Arcane first-person cameras');
assert(profiles.includes('headForwardOffset: 0.12') && profiles.includes('headCameraYOffset: -0.08'), 'Meshy FPV should sit just outside the measured skinned torso shell at eye/face height, not embedded in the abdomen or coat');
assert(profiles.includes('lookForward: 1.35') && profiles.includes('lookVertical: 0'), 'Meshy FPV should look straight ahead, not down at the hands or torso');
assert(!meshyCamera.includes('lookAtHandsTarget: true') && !meshyCamera.includes("targetHandBones: ['RightHand', 'LeftHand']"), 'Meshy FPV profile must not target hand bones');
assert(profiles.includes('fov: 112'), 'Meshy FPV should keep a moderately wide but not fisheye view');
assert(profiles.includes('near: 0.055'), 'Meshy FPV near plane should clip the immediate torso surface while preserving the measured hand and weapon reach');
assert(css.includes('fpv-unclutter-1.0') && css.includes('body.is-fpv #labHeader') && css.includes('body.is-fpv #viewTabs'), 'FPV should hide lab chrome while keeping Orbit/FPV available');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-fps-sword-outside-body-fpv'] }, null, 2));
