import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const manifest = fs.readFileSync(path.join(projectRoot, 'assets', 'asset_manifest.json'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(profiles.includes('materialSource: {') && profiles.includes('Meshy_AI_Meshy_Character_Sheet_0628173422_texture.glb'), 'Meshy Character should declare the static PBR GLB as material source');
assert(profiles.includes("targetMeshes: ['char1']") && profiles.includes('includeSkinned: true'), 'material transfer should target the animated skinned char1 mesh');
assert(js.includes('function applyMaterialSourceMaterials') && js.includes('collectSourceMaterials(sourceRoot)'), 'runtime should copy materials from a source GLB');
assert(js.includes('actor.applyMaterialSource(materialLoaded.scene, info.materialSource)'), 'actor load should apply the material source to the animated model');
assert(manifest.includes('meshy_character_sheet_static_material_transfer'), 'asset manifest should document static-to-animated Meshy material transfer');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-static-pbr-material-transfer'] }, null, 2));
