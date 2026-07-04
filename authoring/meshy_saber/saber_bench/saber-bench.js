import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const ASSETS = {
  meshyAnimated: './assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb',
  meshyStaticPbr: './assets/models/meshy_character_sheet/static/Meshy_AI_Meshy_Character_Sheet_0628173422_texture.glb',
  sabre: './assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb',
};

const BASELINE = Object.freeze({
  schema: 'pose-lab-meshy-saber-bench-contract-v1',
  source: 'minimal-saber-bench',
  hierarchy: 'Meshy character plus real Meshy sabre mesh',
  grip: {
    position: [0, 0, 0],
    rotationDeg: [0, 0, 0],
  },
  sabre: {
    position: [0, 0, 0],
    rotationDeg: [0, 0, 0],
    scale: 1,
    gripLocalPosition: [0, 0, 0],
    tipLocalPosition: [-1.65, 0, 0],
    pinHiltToWeaponGrip: true,
    showRealMesh: true,
    showProxySaber: false,
  },
});

const state = structuredClone(BASELINE);
state.generatedAt = new Date().toISOString();

const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map((el) => [el.id, el]));
const inputs = [...document.querySelectorAll('[data-field]')];
const loader = new GLTFLoader();
const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101213);

const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 80);
camera.position.set(0.35, -3.0, 0.45);

const renderer = new THREE.WebGLRenderer({ canvas: ui.benchCanvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const controls = new OrbitControls(camera, ui.benchCanvas);
controls.enableDamping = true;
controls.target.set(-0.55, 0, 0);

const root = new THREE.Group();
root.name = 'SaberBenchRoot';
scene.add(root);
scene.add(new THREE.HemisphereLight(0xffffff, 0x2c3135, 2.0));
const key = new THREE.DirectionalLight(0xffffff, 3.2);
key.position.set(2.5, -3.5, 4.0);
scene.add(key);

const grid = new THREE.GridHelper(3, 12, 0x47525a, 0x2a3034);
grid.position.y = 0;
root.add(grid);

const gripMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.025, 16, 10),
  new THREE.MeshBasicMaterial({ color: 0x6ad8ff })
);
gripMarker.name = 'WeaponGrip visible marker';

const hiltMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.018, 16, 10),
  new THREE.MeshBasicMaterial({ color: 0xff4ad8 })
);
hiltMarker.name = 'Sabre semantic hilt marker';

const tipMarker = new THREE.Mesh(
  new THREE.SphereGeometry(0.018, 16, 10),
  new THREE.MeshBasicMaterial({ color: 0xffdd72 })
);
tipMarker.name = 'Sabre semantic tip marker';

const fallbackGrip = new THREE.Object3D();
fallbackGrip.name = 'FallbackVisibleWeaponGrip';
fallbackGrip.position.set(0, 0, 0);
root.add(fallbackGrip);

const fallbackSabreRoot = new THREE.Object3D();
fallbackSabreRoot.name = 'FallbackVisibleSabreRoot';
fallbackGrip.add(fallbackSabreRoot);

const proxySaber = new THREE.Group();
proxySaber.name = 'Bright editable saber proxy';
const proxyBladeLength = 1.65;
const proxyBlade = new THREE.Mesh(
  new THREE.CylinderGeometry(0.035, 0.02, proxyBladeLength, 20),
  new THREE.MeshBasicMaterial({ color: 0x67e8ff })
);
proxyBlade.name = 'bright blade';
proxyBlade.rotation.z = Math.PI / 2;
proxyBlade.position.x = -proxyBladeLength * 0.5;
const proxyHilt = new THREE.Mesh(
  new THREE.CylinderGeometry(0.07, 0.07, 0.38, 20),
  new THREE.MeshBasicMaterial({ color: 0xffcf5a })
);
proxyHilt.name = 'bright hilt';
proxyHilt.rotation.z = Math.PI / 2;
proxyHilt.position.x = 0.06;
const proxyGuard = new THREE.Mesh(
  new THREE.BoxGeometry(0.075, 0.55, 0.075),
  new THREE.MeshBasicMaterial({ color: 0xff67d8 })
);
proxyGuard.name = 'bright guard';
proxyGuard.position.set(0, 0, 0);
proxySaber.add(proxyBlade, proxyHilt, proxyGuard);
fallbackSabreRoot.add(proxySaber, gripMarker, hiltMarker, tipMarker);

let meshyRoot = null;
let charMesh = null;
let rightHand = null;
let weaponGrip = null;
let sabreRoot = null;
let sabreMesh = null;
let selectedLayer = 'grip';
let lastTruthReadoutAt = 0;

function setStatus(message) {
  ui.status.textContent = message;
}

function degToRadArray(values) {
  return values.map((value) => THREE.MathUtils.degToRad(Number(value) || 0));
}

function round(value, places = 5) {
  return Number(Number(value || 0).toFixed(places));
}

function roundArray(values, places = 5) {
  return values.map((value) => round(value, places));
}

function vectorFromArray(values) {
  return new THREE.Vector3(values[0] || 0, values[1] || 0, values[2] || 0);
}

function formatVector(vector) {
  return [vector.x, vector.y, vector.z].map((value) => round(value, 4));
}

function findNamed(rootObject, name, type = '') {
  let found = null;
  rootObject.traverse((node) => {
    if (!found && node.name === name && (!type || node.type === type)) found = node;
  });
  return found;
}

function findLargestMesh(rootObject) {
  let winner = null;
  let winnerSize = -Infinity;
  rootObject.traverse((node) => {
    if (!node.isMesh) return;
    const size = node.geometry?.boundingSphere?.radius || node.geometry?.boundingBox?.getSize(new THREE.Vector3()).length() || 0;
    if (size > winnerSize) {
      winner = node;
      winnerSize = size;
    }
  });
  return winner;
}

function hideEverythingBut(rootObject, keep) {
  rootObject.traverse((node) => {
    if (!node.isMesh && !node.isCamera && !node.isLight) return;
    const visible = node === keep;
    node.visible = visible;
    if (node.isMesh) {
      node.frustumCulled = false;
      node.castShadow = false;
      node.receiveShadow = false;
    }
  });
}

function materialList(rootObject) {
  const materials = [];
  rootObject.traverse((node) => {
    if (!node.isMesh) return;
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      if (material) materials.push(material);
    }
  });
  return materials;
}

function cloneMaterial(material) {
  const clone = material?.clone?.() || new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8 });
  for (const keyName of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) {
    if (clone[keyName]) clone[keyName].needsUpdate = true;
  }
  clone.needsUpdate = true;
  return clone;
}

function applyPbrMaterialSource(target, staticScene) {
  const source = materialList(staticScene);
  if (!source.length || !target) return;
  const current = Array.isArray(target.material) ? target.material : [target.material];
  target.material = current.length > 1
    ? current.map((_, index) => cloneMaterial(source[index] || source[0]))
    : cloneMaterial(source[0]);
}

async function loadGltf(url) {
  return await loader.loadAsync(url);
}

function worldBoundsFor(...objects) {
  const box = new THREE.Box3();
  let hasObject = false;
  for (const object of objects) {
    if (!object) continue;
    object.updateMatrixWorld(true);
    const objectBox = new THREE.Box3().setFromObject(object);
    if (objectBox.isEmpty()) continue;
    if (!hasObject) box.copy(objectBox);
    else box.union(objectBox);
    hasObject = true;
  }
  return hasObject ? box : null;
}

function isCameraFramed(object) {
  if (!object) return false;
  const box = worldBoundsFor(object);
  if (!box) return false;
  const center = box.getCenter(new THREE.Vector3()).project(camera);
  return center.z > -1 && center.z < 1 && Math.abs(center.x) <= 1.05 && Math.abs(center.y) <= 1.05;
}

function frameLoadedScene() {
  const box = worldBoundsFor(charMesh, sabreMesh);
  if (!box) {
    setView('full');
    return;
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  const distance = Math.max(1.8, maxDim / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.35);
  controls.target.copy(center);
  camera.position.copy(center).add(new THREE.Vector3(0.35 * distance, -distance, 0.22 * distance));
  camera.near = 0.01;
  camera.far = Math.max(80, distance * 8);
  camera.updateProjectionMatrix();
  controls.update();
}

function updateTruthReadout() {
  if (!ui.truthReadout) return;
  const sabreBox = worldBoundsFor(sabreMesh);
  const sabreSize = sabreBox?.getSize(new THREE.Vector3()) || new THREE.Vector3();
  ui.truthReadout.textContent = [
    `real mesh loaded: ${sabreMesh ? 'yes' : 'no'}`,
    `mesh name: ${sabreMesh?.name || 'none'}`,
    `world bounds size: ${JSON.stringify(formatVector(sabreSize))}`,
    `camera framed: ${isCameraFramed(sabreMesh) ? 'yes' : 'no'}`,
    `proxy visible: ${proxySaber.visible ? 'yes' : 'no'}`,
  ].join('\n');
}

function attachFkHierarchy() {
  weaponGrip = new THREE.Object3D();
  weaponGrip.name = 'WeaponGrip';
  rightHand.add(weaponGrip);

  sabreRoot = new THREE.Object3D();
  sabreRoot.name = 'SabreRoot';
  weaponGrip.add(sabreRoot);

  sabreRoot.add(gripMarker);
  sabreRoot.add(hiltMarker);
  sabreRoot.add(tipMarker);
  sabreRoot.add(proxySaber);
  applyStateToScene();
}

function applyStateToScene() {
  const gripNode = weaponGrip || fallbackGrip;
  const sabreNode = sabreRoot || fallbackSabreRoot;
  gripNode.position.fromArray(state.grip.position);
  gripNode.rotation.set(...degToRadArray(state.grip.rotationDeg), 'XYZ');

  sabreNode.position.fromArray(state.sabre.position);
  sabreNode.rotation.set(...degToRadArray(state.sabre.rotationDeg), 'XYZ');
  sabreNode.scale.setScalar(Number(state.sabre.scale) || 1);

  const gripLocal = vectorFromArray(state.sabre.gripLocalPosition);
  if (sabreMesh) {
    sabreMesh.position.set(0, 0, 0);
    if (state.sabre.pinHiltToWeaponGrip) sabreMesh.position.copy(gripLocal).multiplyScalar(-1);
    sabreMesh.visible = state.sabre.showRealMesh !== false;
  }
  proxySaber.visible = state.sabre.showProxySaber !== false;

  gripMarker.position.set(0, 0, 0);
  const meshOffset = sabreMesh?.position || new THREE.Vector3();
  hiltMarker.position.copy(gripLocal).add(meshOffset);
  tipMarker.position.copy(vectorFromArray(state.sabre.tipLocalPosition)).add(meshOffset);
  proxySaber.position.set(0, 0, 0);

  syncInputs();
  writeJson();
  updateTruthReadout();
}

function syncInputs() {
  for (const input of inputs) {
    if (document.activeElement === input) continue;
    const value = getField(input.dataset.field);
    input.value = Array.isArray(value) ? '' : String(round(value, input.dataset.field.includes('rotationDeg') ? 3 : 5));
  }
  ui.pinHilt.checked = Boolean(state.sabre.pinHiltToWeaponGrip);
  ui.showRealMesh.checked = state.sabre.showRealMesh !== false;
  ui.showProxySaber.checked = state.sabre.showProxySaber !== false;
  ui.selectionReadout.textContent = 'selected: ' + (selectedLayer === 'grip' ? 'WeaponGrip' : 'SabreRoot');
  ui.selectGrip.classList.toggle('active', selectedLayer === 'grip');
  ui.selectSabre.classList.toggle('active', selectedLayer === 'sabre');
}

function getField(path) {
  const parts = path.split('.');
  let current = state;
  for (const part of parts) current = current?.[part];
  return current;
}

function setField(path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  let current = state;
  for (const part of parts) current = current[part];
  if (Array.isArray(current)) current[Number(last)] = value;
  else current[last] = value;
}

function readInputs() {
  for (const input of inputs) {
    const value = Number(input.value);
    if (Number.isFinite(value)) setField(input.dataset.field, value);
  }
  state.sabre.pinHiltToWeaponGrip = Boolean(ui.pinHilt.checked);
  state.sabre.showRealMesh = Boolean(ui.showRealMesh.checked);
  state.sabre.showProxySaber = Boolean(ui.showProxySaber.checked);
  state.generatedAt = new Date().toISOString();
  normalizeState();
  applyStateToScene();
}

function normalizeState() {
  state.grip.position = roundArray(state.grip.position);
  state.grip.rotationDeg = roundArray(state.grip.rotationDeg, 3);
  state.sabre.position = roundArray(state.sabre.position);
  state.sabre.rotationDeg = roundArray(state.sabre.rotationDeg, 3);
  state.sabre.scale = round(state.sabre.scale, 5);
  state.sabre.gripLocalPosition = roundArray(state.sabre.gripLocalPosition);
}

function contractJson() {
  return {
    schema: state.schema,
    source: state.source,
    generatedAt: state.generatedAt,
    assets: ASSETS,
    hierarchy: state.hierarchy,
    weaponGripLocal: {
      parentBone: 'RightHand',
      position: state.grip.position,
      rotationDeg: state.grip.rotationDeg,
    },
    sabreLocal: {
      parent: 'WeaponGrip',
      position: state.sabre.position,
      rotationDeg: state.sabre.rotationDeg,
      scale: state.sabre.scale,
      gripLocalPosition: state.sabre.gripLocalPosition,
      tipLocalPosition: state.sabre.tipLocalPosition,
      pinHiltToWeaponGrip: state.sabre.pinHiltToWeaponGrip,
      showRealMesh: state.sabre.showRealMesh,
      showProxySaber: state.sabre.showProxySaber,
    },
  };
}

function writeJson() {
  ui.jsonBox.value = JSON.stringify(contractJson(), null, 2);
}

function applyJson() {
  const parsed = JSON.parse(ui.jsonBox.value);
  if (parsed.weaponGripLocal) {
    state.grip.position = [...parsed.weaponGripLocal.position];
    state.grip.rotationDeg = [...parsed.weaponGripLocal.rotationDeg];
  }
  if (parsed.sabreLocal) {
    state.sabre.position = [...parsed.sabreLocal.position];
    state.sabre.rotationDeg = [...parsed.sabreLocal.rotationDeg];
    state.sabre.scale = parsed.sabreLocal.scale;
    state.sabre.gripLocalPosition = [...parsed.sabreLocal.gripLocalPosition];
    state.sabre.tipLocalPosition = [...parsed.sabreLocal.tipLocalPosition];
    state.sabre.pinHiltToWeaponGrip = parsed.sabreLocal.pinHiltToWeaponGrip !== false;
    state.sabre.showRealMesh = parsed.sabreLocal.showRealMesh !== false;
    state.sabre.showProxySaber = parsed.sabreLocal.showProxySaber !== false;
  }
  normalizeState();
  applyStateToScene();
}

function setView(kind) {
  if (kind === 'hand') {
    const target = new THREE.Vector3();
    (rightHand || sabreMesh || proxySaber).getWorldPosition(target);
    controls.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(0.48, -0.82, 0.25));
    camera.fov = 38;
  } else if (kind === 'blade') {
    const target = new THREE.Vector3();
    (sabreMesh || proxySaber).getWorldPosition(target);
    controls.target.copy(target);
    camera.position.copy(target).add(new THREE.Vector3(0.95, -1.45, 0.42));
    camera.fov = 32;
  } else {
    controls.target.set(-0.55, 0, 0);
    camera.position.set(0.35, -3.0, 0.45);
    camera.fov = 42;
  }
  camera.updateProjectionMatrix();
  controls.update();
  updateTruthReadout();
}

function nudge(axis, direction) {
  const target = selectedLayer === 'grip' ? state.grip.position : state.sabre.position;
  const index = { x: 0, y: 1, z: 2 }[axis];
  target[index] = round(target[index] + Number(direction) * 0.01);
  state.generatedAt = new Date().toISOString();
  applyStateToScene();
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(contractJson(), null, 2) + '\n'], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'meshy-saber-bench-contract.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

async function copyJson() {
  await navigator.clipboard?.writeText(JSON.stringify(contractJson(), null, 2));
  setStatus('contract copied');
}

async function loadMeshyReference() {
  setStatus('loading real Meshy character and sabre mesh');
  const [meshy, pbr, sabre] = await Promise.all([
    loadGltf(ASSETS.meshyAnimated),
    loadGltf(ASSETS.meshyStaticPbr),
    loadGltf(ASSETS.sabre),
  ]);

  meshyRoot = meshy.scene;
  root.add(meshyRoot);
  charMesh = findNamed(meshyRoot, 'char1') || findLargestMesh(meshyRoot);
  if (!charMesh) throw new Error('Meshy visible mesh char1 not found');
  hideEverythingBut(meshyRoot, charMesh);
  applyPbrMaterialSource(charMesh, pbr.scene);

  rightHand = findNamed(meshyRoot, 'RightHand', 'Bone');
  if (!rightHand) throw new Error('RightHand bone not found');

  sabreMesh = findNamed(sabre.scene, 'Mesh_0') || findLargestMesh(sabre.scene);
  if (!sabreMesh) throw new Error('Sabre Mesh_0 not found');
  hideEverythingBut(sabre.scene, sabreMesh);
  scene.add(sabre.scene);
  attachFkHierarchy();
  sabreRoot.add(sabreMesh);
  applyStateToScene();

  frameLoadedScene();
  setStatus('ready: real Meshy character and real sabre mesh loaded');
  window.saberBench = { state, contractJson, scene, rightHand, weaponGrip, sabreRoot, sabreMesh, proxySaber, truthReadout: updateTruthReadout };
  updateTruthReadout();
}

function resize() {
  const rect = ui.benchCanvas.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  clock.getDelta();
  controls.update();
  if (performance.now() - lastTruthReadoutAt > 500) {
    lastTruthReadoutAt = performance.now();
    updateTruthReadout();
  }
  renderer.render(scene, camera);
}

for (const input of inputs) {
  input.addEventListener('change', readInputs);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      input.blur();
      readInputs();
    }
  });
}
ui.pinHilt.addEventListener('change', readInputs);
ui.showRealMesh.addEventListener('change', readInputs);
ui.showProxySaber.addEventListener('change', readInputs);
ui.viewFull.addEventListener('click', () => setView('full'));
ui.viewHand.addEventListener('click', () => setView('hand'));
ui.viewBlade.addEventListener('click', () => setView('blade'));
ui.selectGrip.addEventListener('click', () => { selectedLayer = 'grip'; syncInputs(); });
ui.selectSabre.addEventListener('click', () => { selectedLayer = 'sabre'; syncInputs(); });
ui.resetBaseline.addEventListener('click', () => {
  Object.assign(state, structuredClone(BASELINE), { generatedAt: new Date().toISOString() });
  applyStateToScene();
});
ui.copyJson.addEventListener('click', () => copyJson().catch((error) => setStatus(error.message)));
ui.downloadJson.addEventListener('click', downloadJson);
ui.applyJson.addEventListener('click', () => {
  try {
    applyJson();
    setStatus('contract applied');
  } catch (error) {
    setStatus('bad JSON: ' + error.message);
  }
});
for (const button of document.querySelectorAll('[data-nudge]')) {
  button.addEventListener('click', () => nudge(...button.dataset.nudge.split(',')));
}

window.addEventListener('resize', resize);
resize();
applyStateToScene();
animate();
window.saberBench = { state, contractJson, scene, proxySaber, truthReadout: updateTruthReadout };
loadMeshyReference().catch((error) => {
  setStatus('real mesh load failed: ' + error.message);
  updateTruthReadout();
});
