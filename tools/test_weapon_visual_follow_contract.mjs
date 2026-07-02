import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const helper = fs.readFileSync(path.join(projectRoot, 'tools', 'pose_lab_weapon_visual_follow.mjs'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('debugWeaponVisualFollow(sampleArgs = [])'), 'live browser should expose a visual weapon follow capture command');
assert(js.includes("schema: 'pose-lab-live-weapon-visual-follow-v1'"), 'visual follow result schema missing');
assert(js.includes('debugLiveWeaponHiltState(sampleArgs = [])') && js.includes("schema: 'pose-lab-live-weapon-hilt-state-v1'"), 'live browser should expose a non-seeking live hilt state command');
assert(js.includes("case 'weapon-visual-follow':") && js.includes("subcommand === 'visual-follow'"), 'debug CLI should route weapon visual-follow commands');
assert(js.includes("case 'weapon-live-hilt-state':") && js.includes("subcommand === 'live-hilt-state'"), 'debug CLI should route live hilt state commands');
assert(js.includes("sheet.toDataURL('image/png')"), 'visual follow command should return a rendered PNG contact sheet');
assert(js.includes("probeMode ? 'probe-hand-rotation' : 'clip-samples'") && js.includes("setFromAxisAngle(new THREE.Vector3(0, 0, 1)"), 'visual follow should support non-persistent hand-rotation probe mode for subtle clips');
assert(js.includes('ctx.drawImage(canvas') && js.includes("drawDot(screen.hand") && js.includes("drawDot(screen.tip") && js.includes("drawDot(appliedHiltDrawPoint, '#ec4899'"), 'visual follow should copy canvas pixels and overlay hand/socket/model/tip/applied-hilt markers');
assert(js.includes('pointInTile') && js.includes('clampToTile') && js.includes('appliedHiltInTile'), 'visual follow should not pass when the applied hilt marker is silently outside the contact-sheet tile');
assert(js.includes('screenMetrics') && js.includes('maxHandToSocketPx') && js.includes('minSocketToTipPx'), 'visual follow should report screen-space weapon cluster metrics');
assert(js.includes('meshLandmarks: meshLandmarks ? {') && js.includes('handToConfiguredGripPx') && js.includes('handToAppliedHiltPx') && js.includes('handBaselineToAppliedHiltPx') && js.includes('socketToAppliedHiltPx') && js.includes('handToSavedGripPx'), 'visual follow should report real weapon mesh landmark distances, not only socket/tip overlays');
assert(js.includes('appliedHiltTileScreen') && js.includes('appliedHiltCanvasScreen') && js.includes('handBaselineTileScreen') && js.includes('handBaselineCanvasScreen') && js.includes('palmTargetTileScreen') && js.includes('palmTargetCanvasScreen'), 'visual follow should label tile-local versus canvas screen coordinates explicitly');
assert(js.includes('configuredGripScreenMetricPresent') && js.includes('appliedHiltScreenMetricPresent') && js.includes('appliedHiltPinnedToAuthoredSocket') && js.includes('socketStableInHand') && js.includes('socketQuaternionStableInHand') && js.includes('displayQuaternionStableInSocket'), 'visual follow should check FK-local position and rotation stability under RightHand/WeaponGrip');
assert(js.includes('fallbackHiddenWithRealWeapon') && js.includes('realWeaponVisible') && js.includes('&& checks.fallbackHiddenWithRealWeapon') && js.includes('&& checks.realWeaponVisible'), 'visual follow should fail when fallback blade/hilt is still visible over the real sabre');
assert(js.includes('weaponVisualMeshLandmarks(actor, { resync: false })') && js.includes('noResyncDuringRead: true'), 'live hilt state should read the current frame without correcting it during measurement');
assert(js.includes("intendedPinTarget: 'stable FK child transform under RightHand'") && js.includes('palmTargetReportedAsDiagnosticOnly: true') && js.includes('handBaselineReportedAsDiagnosticOnly: true') && js.includes('acceptsFallbackHiltAsProof: false'), 'live hilt state should separate FK acceptance from palm/baseline/fallback hilt visuals');
assert(js.includes('domMarkerToAppliedHiltPx') && js.includes('sameLiveMarkerPoint'), 'live hilt state should verify the DOM marker is measuring the same applied hilt point');
assert(js.includes('socketStableInHand: relativeDrift.socketInHand < 0.005') && js.includes('socketQuaternionStableInHand: relativeDrift.socketQuaternionInHandDeg < 0.5') && js.includes('socketMayAnimateInHand: false'), 'visual follow should require pure FK stability relative to raw hand');
assert(js.includes('&& checks.socketStableInHand') && js.includes('&& checks.socketQuaternionStableInHand') && !js.includes('&& checks.visibleConfiguredGripAtHand') && !js.includes('&& checks.visibleAppliedHiltAtHand') && js.includes('&& checks.appliedHiltPinnedToAuthoredSocket') && js.includes('&& checks.visibleAppliedHiltMarker'), 'visual follow pass/fail should require FK-local weapon hierarchy stability');
assert(!js.includes('&& checks.savedMeshLandmarkAvailable') && !js.includes('&& checks.visibleSavedGripAtHand'), 'visual follow acceptance must not depend on stale localStorage tuning evidence');
assert(helper.includes("command: 'weapon visual-follow'"), 'Node helper default must capture the real clip-sample path, not probe mode');
assert(!helper.includes("command: 'weapon visual-follow probe'"), 'Probe mode must not be the default visual acceptance target');
assert(helper.includes("sendPoseLabDebugCommand") && helper.includes("weapon_visual_follow.png") && helper.includes("weapon_visual_follow.json"), 'Node helper should save visual follow PNG and JSON artifacts from the real browser target');
assert(helper.includes('decodeDataUrl') && helper.includes('byteLength'), 'Node helper should decode the browser image data URL into a real artifact');
assert(helper.includes('result?.image || result?.live?.image') && helper.includes('liveHilt:'), 'Node helper should also save live-hilt-state image artifacts with identity/check metadata');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['live-weapon-visual-follow-command', 'canvas-contact-sheet-artifact', 'mesh-landmark-assertions', 'non-probe-bridge-artifact-saver'] }, null, 2));
