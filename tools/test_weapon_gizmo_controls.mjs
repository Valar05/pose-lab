import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.css'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(html.includes('data-panel="weapon"') && html.includes('id="weaponPanel"'), 'Weapon panel should be reachable from the phone tool dock');
for (const id of ['weaponGizmoToggle', 'weaponGizmoTranslate', 'weaponGizmoRotate', 'weaponGizmoSave', 'weaponGizmoStatus']) {
  assert(html.includes(`id="${id}"`), `missing weapon gizmo control ${id}`);
}
assert(js.includes('createWeaponGizmo()') && js.includes("new THREE.TorusGeometry"), 'runtime should create a 3D weapon transform gizmo with rotation rings');
assert(js.includes('beginWeaponGizmoDrag(event)') && js.includes('updateWeaponGizmoDrag(event)') && js.includes('finishWeaponGizmoDrag(event)'), 'runtime should route canvas pointer drags through the weapon gizmo');
assert(js.includes('proxy.config.modelLocalOffset = next'), 'translation gizmo should edit modelLocalOffset live');
assert(js.includes('actor.info.weaponAttachment.rotationDeg = next'), 'rotation gizmo should edit weaponAttachment.rotationDeg live');
assert(js.includes("localStorage.setItem('poseLab.weaponGizmoTuning'"), 'save should persist exact tuned weapon values for handoff');
assert(js.includes('this.weaponTuningSnippet(values)'), 'save/readout should emit a rig-profiles.js snippet');
assert(css.includes('#weaponPanel') && css.includes('sheet-weapon'), 'Weapon panel should have phone critique sheet styling');
assert(!css.includes('body.critique-mode #weaponPanel { display: none !important; }'), 'critique mode must not globally hide the Weapon panel');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['weapon-panel', '3d-gizmo-drag', 'save-tuned-values'] }, null, 2));
