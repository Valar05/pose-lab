import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const manifest = fs.readFileSync(path.join(projectRoot, 'assets', 'asset_manifest.json'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(fs.existsSync(path.join(projectRoot, 'assets/source/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb')), 'source Meshy sabre GLB should be preserved');
assert(fs.existsSync(path.join(projectRoot, 'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb')), 'runtime Meshy sabre GLB should exist');
assert(profiles.includes("weaponAttachment: {"), 'Meshy profile should define a real weapon attachment');
assert(profiles.includes("url: 'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb'"), 'weapon attachment should use the downloaded Meshy sabre runtime GLB');
assert(profiles.includes("socketBone: 'WeaponGrip'") && profiles.includes("tipMarker: 'WeaponGrip_end'"), 'weapon attachment should expose the centered WeaponGrip and WeaponGrip_end');
assert(profiles.includes('scale: 0.47493') && profiles.includes('rotationDeg: [90, 0, -55.145]'), 'Meshy weapon attachment should use the saved rig-local Meshy rotation');
assert(profiles.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]') && profiles.includes('tipLocalPosition: [-0.95561, 0.1368, 0]'), 'Meshy weapon attachment should preserve the Meshy rig-local hilt candidate and track the real blade tip');
assert(profiles.includes('gripLocalPosition: [0.67888, -0.07803, -0.06249]'), 'FPS weapon attachment should preserve the semantic landmark hilt candidate');
assert(profiles.includes('handLocalOffset: [0.095, 0.035, -0.01]'), 'Meshy weapon socket should keep its rig-local visual hand offset');
assert(profiles.includes('modelLocalOffset: [-0.11512, 0.00773, -0.01127]'), 'Meshy weapon socket should keep its rig-local model-space placement');
assert(profiles.includes('gripOffset: [0, 0, 0]'), 'Meshy weapon socket should rotate from the hand origin without shifting the socket');
assert(js.includes('const root = new THREE.Bone();') && js.includes('root.userData.syntheticWeaponBone = true') && js.includes('root.userData.twoHandCenteredWeaponBone = Boolean(leftHand && !sourceSocket') && js.includes('root.userData.positionMode = config.positionMode') && js.includes('root.userData.sourceSocketBone = sourceSocket?.name ||') && js.includes('root.userData.parentMode = config.parentMode ||'), 'weapon socket should support synthetic sockets, selectable one-hand/two-hand positioning, FK following, and authored source-socket inheritance');
assert(js.includes('proxy.rightHand.localToWorld(new THREE.Vector3().fromArray(proxy.config.handLocalOffset))'), 'weapon socket should support hand-local offsets for visual palm-center grip');
assert(js.includes('proxy.config.modelLocalOffset') && js.includes('local.add(new THREE.Vector3().fromArray(proxy.config.modelLocalOffset))'), 'weapon socket should support model-space offsets for screenshot-directed placement');
assert(profiles.includes("positionMode: 'right-hand'"), 'Meshy one-hand saber should place WeaponGrip on the right hand instead of the two-hand midpoint');
assert(!profiles.includes('copiedSourceLayer') && !js.includes('syncCopiedSourceLayer'), 'Meshy weapon attachment should not use a copied FPS actor overlay');
assert(profiles.includes("parentMode: 'synthetic-source-socket'") && profiles.includes("syntheticSourceSocketBone: 'WeaponR'") && js.includes('syntheticSourceSocket.add(root);'), 'Meshy one-hand saber should follow RightHand through synthetic WeaponR with WeaponGrip as its child');
assert(js.includes('attachWeaponAttachment(weaponRoot, config = {})'), 'runtime should attach a real weapon model to the socket');
assert(js.includes('weaponRoot.visible = true') && js.includes('node.visible = true') && js.includes('this.weaponProxy.model.visible = true'), 'weapon attachment should force the loaded model hierarchy visible');
assert(js.includes('LAB_CACHE_TOKEN') && js.includes('cacheToken: LAB_CACHE_TOKEN'), 'live weapon diagnostics should report the loaded cache token so stale tabs are obvious');
assert(js.includes('weaponDebugForceVisible()') && js.includes('weaponDebugForceVisible: weaponDebugForceVisible()'), 'live weapon diagnostics should report the explicit force-visible debug override');
for (const metric of ['hiltToHandDistance', 'bladeLength', 'basketFrontErrorDeg', 'socketForwardToBladeErrorDeg']) {
  assert(js.includes(metric), `live weapon diagnostics should expose ${metric}`);
}
assert(profiles.includes("clipTag: 'FPS-SWORD-UPPER'") && profiles.includes("sourceHand: 'Hand.R'") && profiles.includes("leftHandBone: 'LeftHand'"), 'FPS-SWORD-UPPER should convert authored Hand.R/Weapon.R upper-body contribution and keep a Meshy socket');
assert(!profiles.includes("{ from: 'mixamorigHips', to: 'Hips'"), 'rejected full-body hips mapping must not remain');
assert(manifest.includes('meshy_french_revolution_sabre_runtime_glb') && manifest.includes('WeaponGrip'), 'asset manifest should document the Meshy sabre runtime socket');
assert(manifest.includes('meshy_character_sheet_fps_sword_upper_clip_binding'), 'asset manifest should document the FPS sword upper-body Meshy clip binding');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-upper-body-fps-sword', 'real-sabre-weapongrip-attachment', 'manifested-sabre-provenance'] }, null, 2));
