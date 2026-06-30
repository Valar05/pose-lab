import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const rigProfiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.css'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(html.includes('data-panel="weapon"') && html.includes('id="weaponPanel"'), 'Weapon panel should be reachable from the phone tool dock');
for (const id of ['weaponGizmoToggle', 'weaponGizmoTranslate', 'weaponGizmoRotate', 'weaponGizmoScale', 'weaponGizmoSave', 'weaponGizmoStatus']) {
  assert(html.includes(`id="${id}"`), `missing weapon gizmo control ${id}`);
}
assert(html.includes('Weapon Gestures'), 'weapon panel should present gesture controls, not a 3D gizmo promise');
assert(js.includes('createWeaponGizmo()') && js.includes('this.weaponGizmo = { group: null, pickables: [] }'), 'runtime should keep compatibility state without creating 3D gizmo meshes');
assert(!js.includes('new THREE.TorusGeometry') && !js.includes('new THREE.ArrowHelper') && !js.includes('new THREE.SphereGeometry(0.075'), 'weapon placement controls must not create 3D gizmo geometry');
assert(js.includes('beginWeaponGizmoDrag(event)') && js.includes('updateWeaponGizmoDrag(event)') && js.includes('finishWeaponGizmoDrag(event)'), 'runtime should route canvas pointer drags through the weapon gizmo');
assert(js.includes('weaponGesturePointers = new Map()') && js.includes('beginWeaponMultiTouchGesture(event') && js.includes('updateWeaponMultiTouchGesture(event'), 'weapon controls should track independent screen gesture pointers');
assert(js.includes('weaponGizmoScreenHit(event, actor)') && !js.includes('raycaster.intersectObjects(this.weaponGizmo.pickables'), 'weapon gestures should not require precise 3D axis picking');
assert(js.includes("this.weaponGizmoMode = mode === 'rotate' ? 'rotate' : (mode === 'scale' ? 'scale' : 'translate')"), 'weapon gizmo should expose move, rotate, and scale modes');
assert(js.includes('proxy.config.modelLocalOffset = next'), 'translation gizmo should edit modelLocalOffset live');
assert(js.includes('weaponMoveOffsetFrame(actor') && js.includes('weaponWorldDeltaToOffsetFrame(actor, world)'), 'translation should convert screen deltas through the weapon offset frame');
assert(js.includes('if (Array.isArray(proxy.config.modelLocalOffset)) proxy.root.position.add'), 'source-socket weapons should apply modelLocalOffset so FPS Arms Move is visible');
assert(js.includes('weaponGestureRotationSnapshot(actor') && js.includes('applyWeaponScreenRotation(actor'), 'rotation should use a socket-aware screen quaternion snapshot');
assert(js.includes('setWeaponAttachmentLocalQuaternion(actor, localQuat)'), 'rotation should write weaponAttachment.rotationDeg after quaternion conversion');
assert(js.includes('setWeaponAttachmentScale(actor, scale)'), 'scale should use a dedicated scale writer');
assert(js.includes("if (mode === 'rotate')") && js.includes("} else if (mode === 'scale')"), 'two-finger gestures should be gated by the active mode');
assert(js.includes('new THREE.Quaternion().setFromAxisAngle(axis, twist)'), 'two-finger rotate should twist around the captured screen/view axis');
assert(js.includes('Number(gesture.startScale || 1) * pinch'), 'two-finger pinch should scale only in Scale mode');
assert(js.includes('Math.exp(-dy * 0.006)'), 'one-finger scale should be vertical-only');
assert(js.includes('cancelWeaponGesture()') && js.includes('this.cancelWeaponGesture();'), 'mode changes should cancel stale active weapon gestures');
assert(js.includes("localStorage.setItem('poseLab.weaponGizmoTuning'"), 'save should persist exact tuned weapon values for handoff');
assert(js.includes('this.weaponTuningSnippet(values)'), 'save/readout should emit a rig-profiles.js snippet');
assert(js.includes('tipLocalPosition: [') && js.includes('values.tipLocalPosition.join'), 'weapon save snippet should preserve the blade tip landmark');
assert(rigProfiles.includes("label: 'FPS Arms'") && rigProfiles.includes('handLocalOffset: [0, 0, 0]') && rigProfiles.includes('modelLocalOffset: [0.06126, -0.07096, -0.00135]'), 'FPS Arms should save the accepted weapon proxy offsets');
assert(rigProfiles.includes('rotationDeg: [178.343, 4.512, 109.315]') && rigProfiles.includes('scale: 0.323'), 'FPS Arms should save the accepted weapon attachment rotation and scale');
assert(css.includes('#weaponPanel') && css.includes('sheet-weapon'), 'Weapon panel should have phone critique sheet styling');
assert(!css.includes('body.critique-mode #weaponPanel { display: none !important; }'), 'critique mode must not globally hide the Weapon panel');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['weapon-panel', 'screen-gesture-drag', 'move-rotate-scale-modes', 'two-finger-rotate-scale', 'save-tuned-values'] }, null, 2));
