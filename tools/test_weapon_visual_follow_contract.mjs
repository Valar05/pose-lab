import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const helper = fs.readFileSync(path.join(projectRoot, 'tools', 'pose_lab_weapon_visual_follow.mjs'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('debugWeaponVisualFollow(sampleArgs = [])'), 'live browser should expose a visual weapon follow capture command');
assert(js.includes("schema: 'pose-lab-live-weapon-visual-follow-v1'"), 'visual follow result schema missing');
assert(js.includes("case 'weapon-visual-follow':") && js.includes("subcommand === 'visual-follow'"), 'debug CLI should route weapon visual-follow commands');
assert(js.includes("sheet.toDataURL('image/png')"), 'visual follow command should return a rendered PNG contact sheet');
assert(js.includes("probeMode ? 'probe-hand-rotation' : 'clip-samples'") && js.includes("setFromAxisAngle(new THREE.Vector3(0, 0, 1)"), 'visual follow should support non-persistent hand-rotation probe mode for subtle clips');
assert(js.includes('ctx.drawImage(canvas') && js.includes("drawDot(screen.hand") && js.includes("drawDot(screen.tip"), 'visual follow should copy canvas pixels and overlay hand/socket/model/tip markers');
assert(js.includes('screenMetrics') && js.includes('maxHandToSocketPx') && js.includes('minSocketToTipPx'), 'visual follow should report screen-space weapon cluster metrics');
assert(js.includes('meshLandmarks: meshLandmarks ? {') && js.includes('handToConfiguredGripPx') && js.includes('handToSavedGripPx'), 'visual follow should report real weapon mesh landmark distances, not only socket/tip overlays');
assert(js.includes('visibleConfiguredGripAtHand') && js.includes('maxHandToConfiguredGripPx'), 'visual follow should check the configured rendered grip landmark near the hand');
assert(js.includes('socketStableInHand: relativeDrift.socketInHand < 0.005'), 'visual follow should still report parented transform drift for diagnostics');
assert(js.includes('&& checks.socketStableInHand') && js.includes('&& checks.visibleConfiguredGripAtHand'), 'visual follow pass/fail should use FK parent stability and rendered mesh landmark checks');
assert(!js.includes('&& checks.savedMeshLandmarkAvailable') && !js.includes('&& checks.visibleSavedGripAtHand'), 'visual follow acceptance must not depend on stale localStorage tuning evidence');
assert(helper.includes("command: 'weapon visual-follow'"), 'Node helper default must capture the real clip-sample path, not probe mode');
assert(!helper.includes("command: 'weapon visual-follow probe'"), 'Probe mode must not be the default visual acceptance target');
assert(helper.includes("sendPoseLabDebugCommand") && helper.includes("weapon_visual_follow.png") && helper.includes("weapon_visual_follow.json"), 'Node helper should save visual follow PNG and JSON artifacts from the real browser target');
assert(helper.includes('decodeDataUrl') && helper.includes('byteLength'), 'Node helper should decode the browser image data URL into a real artifact');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['live-weapon-visual-follow-command', 'canvas-contact-sheet-artifact', 'mesh-landmark-assertions', 'non-probe-bridge-artifact-saver'] }, null, 2));
