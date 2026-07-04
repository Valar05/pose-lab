import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  applyWeaponSocketRuntimeRules,
  weaponPlacementConfigSignature,
  weaponProxyTopologySignature,
} from '../src/weapon-runtime-rules.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const THREE = await import(pathToFileURL(path.join(projectRoot, 'vendor', 'three', 'build', 'three.module.js')));
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

function makeHandFkProxy() {
  const model = new THREE.Group();
  model.name = 'ActorRoot';
  const rightHand = new THREE.Bone();
  rightHand.name = 'RightHand';
  model.add(rightHand);
  const root = new THREE.Bone();
  root.name = 'WeaponGrip';
  rightHand.add(root);
  const proxy = {
    root,
    rightHand,
    config: {
      parentMode: 'hand-fk',
      handBone: 'RightHand',
      socketBone: 'WeaponGrip',
      positionMode: 'right-hand',
      handLocalOffset: [0.1, 0.2, 0.3],
      modelLocalOffset: [0.02, 0.03, 0.04],
      gripOffset: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      allowAnimatedSocketAnimation: false,
      compensateParentScale: true,
    },
  };
  return { model, proxy };
}

function makeSyntheticProxy() {
  const model = new THREE.Group();
  model.name = 'ActorRoot';
  model.scale.set(2, 3, 4);
  const rightHand = new THREE.Bone();
  rightHand.name = 'RightHand';
  model.add(rightHand);
  const syntheticSourceSocket = new THREE.Bone();
  syntheticSourceSocket.name = 'WeaponR';
  rightHand.add(syntheticSourceSocket);
  const root = new THREE.Bone();
  root.name = 'WeaponGrip';
  syntheticSourceSocket.add(root);
  const proxy = {
    root,
    rightHand,
    syntheticSourceSocket,
    config: {
      parentMode: 'synthetic-source-socket',
      handBone: 'RightHand',
      socketBone: 'WeaponGrip',
      syntheticSourceSocketBone: 'WeaponR',
      positionMode: 'right-hand',
      handLocalOffset: [0.1, 0.2, 0.3],
      modelLocalOffset: [0.02, 0.03, 0.04],
      gripOffset: [0, 0, 0],
      rotationDeg: [0, 0, 0],
      allowAnimatedSocketAnimation: false,
      compensateParentScale: true,
    },
  };
  return { model, proxy };
}

{
  const { model, proxy } = makeHandFkProxy();
  const initial = applyWeaponSocketRuntimeRules(THREE, { model, proxy, force: true, placementSignature: 'stale-external-signature' });
  assert(initial.handled === true, 'initial hand-fk placement should be handled');
  const before = proxy.fkLocalQuaternion.clone();
  proxy.config.rotationDeg = [0, 45, 0];
  const afterResult = applyWeaponSocketRuntimeRules(THREE, { model, proxy, placementSignature: 'stale-external-signature' });
  assert(afterResult.handled === true, 'rotation change should still be handled');
  assert(before.angleTo(proxy.fkLocalQuaternion) > 0.1, 'rotationDeg change must invalidate cached hand-fk quaternion despite stale caller signature');
}

{
  const { model, proxy } = makeSyntheticProxy();
  const beforeSignature = weaponPlacementConfigSignature(THREE, proxy.config, { model, parent: proxy.syntheticSourceSocket });
  proxy.config.allowAnimatedSocketAnimation = true;
  const afterPermissionSignature = weaponPlacementConfigSignature(THREE, proxy.config, { model, parent: proxy.syntheticSourceSocket });
  assert(beforeSignature !== afterPermissionSignature, 'animation permission should affect placement cache signature');
  proxy.config.allowAnimatedSocketAnimation = false;
  const scaleSignature = weaponPlacementConfigSignature(THREE, proxy.config, { model, parent: proxy.syntheticSourceSocket });
  model.scale.set(3, 3, 4);
  model.updateMatrixWorld(true);
  const nextScaleSignature = weaponPlacementConfigSignature(THREE, proxy.config, { model, parent: proxy.syntheticSourceSocket });
  assert(scaleSignature !== nextScaleSignature, 'scale compensation inputs should affect placement cache signature');
}

{
  const { model, proxy } = makeSyntheticProxy();
  const originalTopology = weaponProxyTopologySignature(proxy.config, proxy);
  const initial = applyWeaponSocketRuntimeRules(THREE, { model, proxy, force: true });
  assert(initial.handled === true, 'initial synthetic placement should be handled');
  assert(proxy.topologySignature === originalTopology, 'runtime should record proxy topology signature');
  proxy.config.syntheticSourceSocketBone = 'WeaponR2';
  const changed = applyWeaponSocketRuntimeRules(THREE, { model, proxy });
  assert(changed.handled === false, 'topology config changes should not silently reuse proxy');
  assert(changed.reason === 'proxy-topology-changed-rebuild-required', `topology change should request rebuild, got ${changed.reason}`);
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['canonical-placement-cache-invalidation', 'stale-caller-signature-ignored', 'topology-change-rebuild-required'],
}, null, 2));
