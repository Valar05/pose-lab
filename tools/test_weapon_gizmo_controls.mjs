import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const weaponRules = fs.readFileSync(path.join(projectRoot, 'src', 'weapon-runtime-rules.mjs'), 'utf8');
const rigProfiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.css'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(html.includes('data-panel="weapon"') && html.includes('id="weaponPanel"'), 'Weapon panel should be reachable from the phone tool dock');
for (const id of ['weaponGizmoToggle', 'weaponGizmoTranslate', 'weaponGizmoRotate', 'weaponGizmoScale', 'weaponGizmoSave', 'weaponGizmoStatus']) {
  assert(html.includes(`id="${id}"`), `missing weapon gizmo control ${id}`);
}
for (const id of ['semanticLandmarkPickHilt', 'semanticLandmarkPickTip', 'semanticLandmarkApplyHilt', 'semanticLandmarkApplyTip']) {
  assert(html.includes(`id="${id}"`), `missing semantic landmark control ${id}`);
}
assert(html.includes('Weapon Gestures'), 'weapon panel should present gesture controls, not a 3D gizmo promise');
assert(js.includes('createWeaponGizmo()') && js.includes("group.name = 'weapon-visual-sync-overlay'") && js.includes("line.name = 'weapon-overlay-socket-tip-line'"), 'runtime should expose the lightweight weapon visual-sync overlay for socket/tip/hand feedback');
assert(js.includes("grip.name = 'weapon-overlay-applied-hilt'") && js.includes("this.weaponGizmo = { group, socket, tip, hand, grip, line"), 'weapon overlay should show the currently applied hilt/grip point, not only the hand/socket/tip');
assert(js.includes("marker.id = 'weapon-screen-applied-hilt-marker'") && js.includes('updateWeaponScreenHiltMarker(true, gripWorld || socketWorld)'), 'weapon debug should expose a screen-space applied hilt marker when the 3D hilt point is offscreen or occluded');
assert(js.includes('screenPointInsideRect(screen, rect)') && js.includes('clampScreenPointToRect(screen, rect'), 'screen-space applied hilt marker should record/clamp off-canvas hilt points instead of disappearing');
assert(!js.includes('new THREE.TorusGeometry') && !js.includes('new THREE.ArrowHelper') && !js.includes('new THREE.SphereGeometry(0.075'), 'weapon placement controls must not create 3D gizmo geometry');
assert(js.includes('beginWeaponGizmoDrag(event)') && js.includes('updateWeaponGizmoDrag(event)') && js.includes('finishWeaponGizmoDrag(event)'), 'runtime should route canvas pointer drags through the weapon gizmo');
assert(js.includes('weaponGesturePointers = new Map()') && js.includes('beginWeaponMultiTouchGesture(event') && js.includes('updateWeaponMultiTouchGesture(event'), 'weapon controls should track independent screen gesture pointers');
assert(js.includes('weaponGizmoScreenHit(event, actor)') && !js.includes('raycaster.intersectObjects(this.weaponGizmo.pickables'), 'weapon gestures should not require precise 3D axis picking');
assert(js.includes("this.weaponGizmoMode = mode === 'rotate' ? 'rotate' : (mode === 'scale' ? 'scale' : 'translate')"), 'weapon gizmo should expose move, rotate, and scale modes');
assert(js.includes('proxy.config.modelLocalOffset = next'), 'translation gizmo should edit modelLocalOffset live');
assert(js.includes('weaponMoveOffsetFrame(actor') && js.includes('weaponWorldDeltaToOffsetFrame(actor, world)'), 'translation should convert screen deltas through the weapon offset frame');
assert(weaponRules.includes('if (Array.isArray(config.modelLocalOffset)) proxy.root.position.add') || weaponRules.includes('local.add(vectorFromArray(THREE, config.modelLocalOffset))'), 'source-socket weapons should apply modelLocalOffset so FPS Arms Move is visible');
assert(weaponRules.includes('fallbackHiddenWithRealWeapon') && weaponRules.includes('fallbackVisible = !(proxy?.model && proxy?.attachmentConfig?.url)'), 'real attached weapons should hide fallback blade/hilt so visual debugging does not show a fake weapon');
assert(js.includes('weaponGestureRotationSnapshot(actor') && js.includes('applyWeaponScreenRotation(actor'), 'rotation should use a socket-aware screen quaternion snapshot');
assert(js.includes('setWeaponAttachmentLocalQuaternion(actor, localQuat)'), 'rotation should write weaponAttachment.rotationDeg after quaternion conversion');
assert(js.includes('setWeaponAttachmentScale(actor, scale)'), 'scale should use a dedicated scale writer');
assert(js.includes('applySemanticLandmarkCandidate(target =') && js.includes("const field = key === 'tip' ? 'tipLocalPosition' : 'gripLocalPosition'"), 'semantic landmark apply should let picked hilt/tip update live attachment landmarks');
assert(js.includes("UI.semanticLandmarkApplyHilt?.addEventListener('click', () => this.applySemanticLandmarkCandidate('hilt'))"), 'Apply Hilt should wire to live gripLocalPosition updates');
assert(js.includes("UI.semanticLandmarkApplyTip?.addEventListener('click', () => this.applySemanticLandmarkCandidate('tip'))"), 'Apply Tip should wire to live tipLocalPosition updates');
assert(js.includes("pickedHilt: sphere('picked-hilt-marker', 0xec4899") && js.includes("hand.name = 'weapon-overlay-hand'") && js.includes("grip.name = 'weapon-overlay-applied-hilt'"), 'picked/applied hilt markers should not reuse the blue hand/wrist marker color');
assert(js.includes('candidate[key].world = this.semanticLandmarkRoundVector(proxy.model.localToWorld'), 'Apply Hilt/Tip should refresh the visible candidate marker after the live weapon resyncs');
assert(js.includes("if (mode === 'rotate')") && js.includes("} else if (mode === 'scale')"), 'two-finger gestures should be gated by the active mode');
assert(js.includes('new THREE.Quaternion().setFromAxisAngle(axis, twist)'), 'two-finger rotate should twist around the captured screen/view axis');
assert(js.includes('Number(gesture.startScale || 1) * pinch'), 'two-finger pinch should scale only in Scale mode');
assert(js.includes('Math.exp(-dy * 0.006)'), 'one-finger scale should be vertical-only');
assert(js.includes('cancelWeaponGesture()') && js.includes('this.cancelWeaponGesture();'), 'mode changes should cancel stale active weapon gestures');
assert(js.includes("localStorage.setItem('poseLab.weaponGizmoTuning'"), 'save should persist exact tuned weapon values for handoff');
assert(js.includes('this.weaponTuningSnippet(values)'), 'save/readout should emit a rig-profiles.js snippet');
assert(js.includes('tipLocalPosition: [') && js.includes('values.tipLocalPosition.join'), 'weapon save snippet should preserve the blade tip landmark');
assert(rigProfiles.includes("label: 'FPS Arms'") && rigProfiles.includes('handLocalOffset: [0, 0, 0]') && rigProfiles.includes('modelLocalOffset: [0.00424, -0.0167, 0.01744]'), 'FPS Arms should save the accepted weapon proxy offsets');
assert(rigProfiles.includes('rotationDeg: [-179.998, -4.747, 111.678]') && rigProfiles.includes('scale: 0.323'), 'FPS Arms should save the accepted weapon attachment rotation and scale');
assert(css.includes('#weaponPanel') && css.includes('sheet-weapon'), 'Weapon panel should have phone critique sheet styling');
assert(!css.includes('body.critique-mode #weaponPanel { display: none !important; }'), 'critique mode must not globally hide the Weapon panel');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['weapon-panel', 'screen-gesture-drag', 'move-rotate-scale-modes', 'two-finger-rotate-scale', 'save-tuned-values'] }, null, 2));
