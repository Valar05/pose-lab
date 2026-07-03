#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'quartermaster_visual_gate');
const userHiltOracle = [0.69507, -0.02421, -0.06231];
const epsilon = 0.00002;

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= {
    createElementNS() {
      const listeners = new Map();
      return {
        style: {},
        width: 1,
        height: 1,
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
        set src(value) { this._src = value; setTimeout(() => listeners.get('load')?.({ type: 'load' }), 0); },
        get src() { return this._src || ''; },
      };
    },
  };
  globalThis.createImageBitmap ||= async () => ({ width: 1, height: 1, close() {} });
}

function arrayBuffer(file) {
  const buffer = fs.readFileSync(file);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function canon(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function round(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function point(vec, digits = 5) {
  return [round(vec.x, digits), round(vec.y, digits), round(vec.z, digits)];
}

function quat(quaternion, digits = 5) {
  return [round(quaternion.x, digits), round(quaternion.y, digits), round(quaternion.z, digits), round(quaternion.w, digits)];
}

function fromArray(THREE, values) {
  return new THREE.Vector3().fromArray(Array.isArray(values) ? values : [0, 0, 0]);
}

function quaternionFromDeg(THREE, values) {
  const rotation = Array.isArray(values) ? values : [0, 0, 0];
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(Number(rotation[0] || 0)),
    THREE.MathUtils.degToRad(Number(rotation[1] || 0)),
    THREE.MathUtils.degToRad(Number(rotation[2] || 0)),
    'XYZ',
  )).normalize();
}

function arrayClose(actual, expected, tolerance = epsilon) {
  return actual.length === expected.length && actual.every((value, index) => Math.abs(Number(value || 0) - Number(expected[index] || 0)) <= tolerance);
}

function findNode(root, name) {
  const wanted = canon(name);
  let found = null;
  root.traverse((node) => {
    if (!found && canon(node.name) === wanted) found = node;
  });
  return found;
}

function requireNode(root, name) {
  const node = findNode(root, name);
  if (!node) throw new Error(`missing node ${name}`);
  return node;
}

function worldPosition(THREE, node) {
  const out = new THREE.Vector3();
  node.getWorldPosition(out);
  return out;
}

function worldQuaternion(THREE, node) {
  const out = new THREE.Quaternion();
  node.getWorldQuaternion(out);
  return out.normalize();
}

function localPointFromWorld(THREE, frame, worldPoint) {
  return worldPoint.clone().applyMatrix4(frame.matrixWorld.clone().invert());
}

function sampleQuaternionTrack(THREE, track, time) {
  const result = track.createInterpolant(new Float32Array(4)).evaluate(time);
  return new THREE.Quaternion(result[0], result[1], result[2], result[3]).normalize();
}

function captureBonePose(root) {
  const pose = [];
  root.traverse((node) => {
    if (node.isBone) pose.push({
      node,
      position: node.position.clone(),
      quaternion: node.quaternion.clone(),
      scale: node.scale.clone(),
    });
  });
  return pose;
}

function restoreBonePose(pose) {
  for (const entry of pose) {
    entry.node.position.copy(entry.position);
    entry.node.quaternion.copy(entry.quaternion);
    entry.node.scale.copy(entry.scale);
  }
}

function applyClipPose(THREE, root, clip, time) {
  if (!clip) return;
  for (const track of clip.tracks || []) {
    if (!track.name.endsWith('.quaternion')) continue;
    const nodeName = track.name.replace(/\.quaternion$/, '');
    const node = findNode(root, nodeName);
    if (node) node.quaternion.copy(sampleQuaternionTrack(THREE, track, time));
  }
}

function resolveCaseClip(gltf, caseName) {
  if (caseName === 'model-rest') return null;
  const exact = gltf.animations.find((clip) => clip.name === caseName);
  if (exact) return exact;
  const wanted = canon(caseName);
  return gltf.animations.find((clip) => canon(clip.name).includes(wanted)) || null;
}

function applyWeaponRuntime(THREE, scene, profile, sabreScene) {
  const proxyConfig = structuredClone(profile.weaponProxy || {});
  const attachmentConfig = structuredClone(profile.weaponAttachment || {});
  const rightHand = requireNode(scene, proxyConfig.handBone || 'RightHand');
  const weaponGrip = new THREE.Bone();
  weaponGrip.name = proxyConfig.socketBone || attachmentConfig.socketBone || 'WeaponGrip';
  weaponGrip.position.copy(fromArray(THREE, proxyConfig.handLocalOffset));
  weaponGrip.position.add(fromArray(THREE, proxyConfig.modelLocalOffset));
  weaponGrip.position.add(fromArray(THREE, proxyConfig.gripOffset));
  weaponGrip.quaternion.copy(quaternionFromDeg(THREE, proxyConfig.rotationDeg));
  rightHand.add(weaponGrip);

  const sabreMesh = sabreScene.clone(true);
  sabreMesh.name = attachmentConfig.name || 'Meshy French Revolution Sabre';
  weaponGrip.add(sabreMesh);
  sabreMesh.scale.setScalar(Number(attachmentConfig.scale ?? 1));
  sabreMesh.quaternion.copy(quaternionFromDeg(THREE, attachmentConfig.rotationDeg));
  sabreMesh.position.copy(fromArray(THREE, attachmentConfig.position));
  const gripLocal = fromArray(THREE, attachmentConfig.gripLocalPosition);
  const gripOffset = gripLocal.clone().multiplyScalar(Number(attachmentConfig.scale ?? 1)).applyQuaternion(sabreMesh.quaternion);
  sabreMesh.position.sub(gripOffset);
  scene.updateMatrixWorld(true);
  return { proxyConfig, attachmentConfig, rightHand, weaponGrip, sabreMesh, gripLocal };
}

function measureSabreBoundsInFrame(THREE, sabreMesh, frame) {
  const box = new THREE.Box3();
  let meshCount = 0;
  let vertexCount = 0;
  const inverseFrame = frame.matrixWorld.clone().invert();
  sabreMesh.traverse((node) => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    meshCount += 1;
    const positions = node.geometry.attributes.position;
    const stride = Math.max(1, Math.floor(positions.count / 2000));
    for (let index = 0; index < positions.count; index += stride) {
      const point = new THREE.Vector3().fromBufferAttribute(positions, index);
      node.localToWorld(point);
      point.applyMatrix4(inverseFrame);
      box.expandByPoint(point);
      vertexCount += 1;
    }
  });
  const size = new THREE.Vector3();
  box.getSize(size);
  return {
    frame: frame.name || 'frame',
    meshCount,
    sampledVertexCount: vertexCount,
    min: point(box.min),
    max: point(box.max),
    size: point(size),
    length: round(Math.max(size.x, size.y, size.z)),
  };
}

function projectSvgPoints(points) {
  const all = Object.values(points).flat();
  const xs = all.map((point) => point[0]);
  const ys = all.map((point) => point[1]);
  const minX = Math.min(...xs, -0.35);
  const maxX = Math.max(...xs, 0.35);
  const minY = Math.min(...ys, -0.35);
  const maxY = Math.max(...ys, 0.35);
  const width = 760;
  const height = 520;
  const pad = 58;
  const scale = Math.min((width - pad * 2) / Math.max(0.001, maxX - minX), (height - pad * 2) / Math.max(0.001, maxY - minY));
  const project = ([x, y]) => [round(pad + (x - minX) * scale, 2), round(height - pad - (y - minY) * scale, 2)];
  return { width, height, project };
}

function writeCaseSvg(file, caseReport) {
  const points = {
    main: [
      caseReport.pointsInRightHand.weaponGrip,
      caseReport.pointsInRightHand.visibleHilt,
      caseReport.pointsInRightHand.visibleTip,
      caseReport.pointsInRightHand.rightHandOrigin,
    ],
  };
  const { width, height, project } = projectSvgPoints(points);
  const grip = project(caseReport.pointsInRightHand.weaponGrip);
  const hilt = project(caseReport.pointsInRightHand.visibleHilt);
  const tip = project(caseReport.pointsInRightHand.visibleTip);
  const hand = project(caseReport.pointsInRightHand.rightHandOrigin);
  const expected = caseReport.green ? '#7ddc83' : '#ff5f57';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#101418"/>
  <line x1="${hilt[0]}" y1="${hilt[1]}" x2="${tip[0]}" y2="${tip[1]}" stroke="#42e9ff" stroke-width="5"/>
  <line x1="${hand[0]}" y1="${hand[1]}" x2="${grip[0]}" y2="${grip[1]}" stroke="#8892a0" stroke-width="2" stroke-dasharray="6 6"/>
  <circle cx="${hand[0]}" cy="${hand[1]}" r="7" fill="#ffffff"/>
  <circle cx="${grip[0]}" cy="${grip[1]}" r="10" fill="#ff4fd8"/>
  <circle cx="${hilt[0]}" cy="${hilt[1]}" r="6" fill="#ffd36d"/>
  <circle cx="${tip[0]}" cy="${tip[1]}" r="7" fill="#d8f1ff"/>
  <text x="18" y="30" fill="#e5edf5" font-family="monospace" font-size="16">${caseReport.name}: ${caseReport.green ? 'GREEN' : 'RED'}</text>
  <text x="18" y="54" fill="${expected}" font-family="monospace" font-size="13">${caseReport.verdict}</text>
  <text x="18" y="${height - 22}" fill="#e5edf5" font-family="monospace" font-size="12">white=RightHand origin, magenta=WeaponGrip, gold=visible hilt, cyan=visible tip</text>
</svg>
`;
  fs.writeFileSync(file, svg);
}

function writeContactSvg(file, cases) {
  const width = 760;
  const height = Math.max(240, 130 + cases.length * 74);
  const rows = cases.map((entry, index) => {
    const y = 78 + index * 74;
    const color = entry.green ? '#7ddc83' : '#ff5f57';
    return `<text x="24" y="${y}" fill="${color}" font-family="monospace" font-size="15">${entry.name}: ${entry.verdict}</text>
  <text x="44" y="${y + 22}" fill="#d5dde7" font-family="monospace" font-size="12">hiltInGrip=${JSON.stringify(entry.visibleHiltInWeaponGrip)} blade=${JSON.stringify(entry.bladeVectorInWeaponGrip)}</text>`;
  }).join('\n');
  fs.writeFileSync(file, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#101418"/>
  <text x="24" y="34" fill="#e5edf5" font-family="monospace" font-size="18">Meshy Hand FK Visual Gate</text>
  <text x="24" y="56" fill="#aeb7c2" font-family="monospace" font-size="12">Relationship gate, not source-string proof.</text>
  ${rows}
</svg>
`);
}

async function loadGlb(GLTFLoader, file) {
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + path.sep, resolve, reject));
}

async function main() {
  ensureBrowserShim();
  const THREE = await import(pathToFileURL(path.join(projectRoot, 'vendor', 'three', 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(projectRoot, 'vendor', 'three', 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const { RIG_PROFILES } = await import(pathToFileURL(path.join(projectRoot, 'src', 'rig-profiles.js')));
  const profile = RIG_PROFILES.meshyCharacter;
  if (!profile) throw new Error('missing RIG_PROFILES.meshyCharacter');
  const outDir = path.resolve(projectRoot, argValue('--out', defaultOut));
  const allowMissingReady = hasFlag('--allow-missing-ready');

  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, profile.url));
  const sabre = await loadGlb(GLTFLoader, path.join(projectRoot, profile.weaponAttachment.url));
  const restPose = captureBonePose(meshy.scene);
  const cases = [
    { name: 'model-rest', clip: null, time: 0, required: true },
    { name: 'MeshyWalk', clip: resolveCaseClip(meshy, 'walking'), time: 0.35, required: true },
    { name: 'Ready', clip: resolveCaseClip(meshy, 'OneHandReady') || resolveCaseClip(meshy, 'FPS-VISUAL-IK') || resolveCaseClip(meshy, 'FPS-REST-ARMS'), time: 0.25, required: !allowMissingReady },
  ];

  const unresolved = cases.filter((entry) => entry.required && entry.name === 'Ready' && !entry.clip);
  const reports = [];
  fs.mkdirSync(outDir, { recursive: true });
  for (const entry of cases) {
    if (!entry.clip && entry.name !== 'model-rest') {
      reports.push({
        name: entry.name,
        green: false,
        skipped: true,
        verdict: `clip not resolved in clean PR2 offline assets${entry.required ? ' (required)' : ''}`,
      });
      continue;
    }
    restoreBonePose(restPose);
    applyClipPose(THREE, meshy.scene, entry.clip, Math.min(Number(entry.time || 0), entry.clip?.duration || 0));
    meshy.scene.updateMatrixWorld(true);
    const { proxyConfig, attachmentConfig, rightHand, weaponGrip, sabreMesh, gripLocal } = applyWeaponRuntime(THREE, meshy.scene, profile, sabre.scene);
    const tipLocal = fromArray(THREE, attachmentConfig.tipLocalPosition || proxyConfig.tipOffset || [0, 0, 0.85]);
    const visibleHiltWorld = sabreMesh.localToWorld(gripLocal.clone());
    const visibleTipWorld = sabreMesh.localToWorld(tipLocal.clone());
    const visibleHiltInGripVec = localPointFromWorld(THREE, weaponGrip, visibleHiltWorld);
    const visibleTipInGripVec = localPointFromWorld(THREE, weaponGrip, visibleTipWorld);
    const visibleHiltInRightHandVec = localPointFromWorld(THREE, rightHand, visibleHiltWorld);
    const visibleTipInRightHandVec = localPointFromWorld(THREE, rightHand, visibleTipWorld);
    const bladeVectorInGripVec = visibleTipInGripVec.clone().sub(visibleHiltInGripVec);
    const bladeVectorInRightHandVec = visibleTipInRightHandVec.clone().sub(visibleHiltInRightHandVec);
    const sabreBoundsInWeaponGrip = measureSabreBoundsInFrame(THREE, sabreMesh, weaponGrip);
    const sabreBoundsInRightHand = measureSabreBoundsInFrame(THREE, sabreMesh, rightHand);
    const expectedGripInRightHand = weaponGrip.position.clone();
    const hiltPinned = visibleHiltInGripVec.length() <= epsilon;
    const oracleFlows = arrayClose(attachmentConfig.gripLocalPosition || [], userHiltOracle);
    const parentIsRightHand = weaponGrip.parent === rightHand;
    const hiltAtExpectedHandOffset = visibleHiltInRightHandVec.distanceTo(expectedGripInRightHand) <= epsilon;
    const realMeshVisible = sabreBoundsInWeaponGrip.length > 0.5;
    const green = hiltPinned && oracleFlows && parentIsRightHand && hiltAtExpectedHandOffset && realMeshVisible;
    const report = {
      name: entry.name,
      sourceClip: entry.clip?.name || 'model-rest',
      time: round(entry.time || 0),
      green,
      verdict: green ? 'visible hilt is pinned to WeaponGrip at the authored RightHand-local offset' : 'visible relationship is red; see failed assertions',
      failedAssertions: [
        !oracleFlows ? 'profile gripLocalPosition does not equal user oracle' : null,
        !parentIsRightHand ? 'WeaponGrip is not parented to RightHand' : null,
        !hiltPinned ? 'visible hilt is not pinned to WeaponGrip' : null,
        !hiltAtExpectedHandOffset ? 'visible hilt is not at WeaponGrip local offset in RightHand space' : null,
        !realMeshVisible ? 'real sabre mesh bounds are too small in WeaponGrip space' : null,
      ].filter(Boolean),
      profileGripLocalPosition: attachmentConfig.gripLocalPosition,
      weaponGripParent: weaponGrip.parent?.name || '',
      rightHandWorldPosition: point(worldPosition(THREE, rightHand)),
      rightHandWorldQuaternion: quat(worldQuaternion(THREE, rightHand)),
      weaponGripLocalPosition: point(weaponGrip.position),
      weaponGripLocalQuaternion: quat(weaponGrip.quaternion),
      weaponGripWorldPosition: point(worldPosition(THREE, weaponGrip)),
      weaponGripWorldQuaternion: quat(worldQuaternion(THREE, weaponGrip)),
      sabreMeshLocalPosition: point(sabreMesh.position),
      sabreMeshLocalQuaternion: quat(sabreMesh.quaternion),
      visibleHiltInWeaponGrip: point(visibleHiltInGripVec),
      visibleTipInWeaponGrip: point(visibleTipInGripVec),
      bladeVectorInWeaponGrip: point(bladeVectorInGripVec),
      visibleHiltInRightHand: point(visibleHiltInRightHandVec),
      visibleTipInRightHand: point(visibleTipInRightHandVec),
      bladeVectorInRightHand: point(bladeVectorInRightHandVec),
      pointsInRightHand: {
        rightHandOrigin: [0, 0, 0],
        weaponGrip: point(expectedGripInRightHand),
        visibleHilt: point(visibleHiltInRightHandVec),
        visibleTip: point(visibleTipInRightHandVec),
      },
      sabreBoundsInWeaponGrip,
      sabreBoundsInRightHand,
    };
    const svgPath = path.join(outDir, `${entry.name.replace(/[^a-z0-9_-]/gi, '_')}.svg`);
    writeCaseSvg(svgPath, report);
    report.svg = path.relative(projectRoot, svgPath);
    reports.push(report);
    weaponGrip.remove(sabreMesh);
    rightHand.remove(weaponGrip);
  }

  const requiredFailures = reports.filter((entry) => entry.skipped && cases.find((item) => item.name === entry.name)?.required);
  const comparable = reports.filter((entry) => !entry.skipped);
  const reference = comparable[0];
  const drift = reference ? comparable.map((entry) => ({
    name: entry.name,
    hiltRightHandDeltaFromReference: point(fromArray(THREE, entry.visibleHiltInRightHand).sub(fromArray(THREE, reference.visibleHiltInRightHand))),
    bladeVectorDeltaFromReference: point(fromArray(THREE, entry.bladeVectorInRightHand).sub(fromArray(THREE, reference.bladeVectorInRightHand))),
  })) : [];
  const contactPath = path.join(outDir, 'visual_gate_contact.svg');
  writeContactSvg(contactPath, reports);
  const payload = {
    schema: 'pose-lab-meshy-hand-fk-visual-gate-v1',
    generatedAt: new Date().toISOString(),
    branchExpectation: 'codex/quartermaster-meshy-hand-fk',
    verdict: reports.every((entry) => entry.green || entry.skipped) && requiredFailures.length === 0 ? 'green' : 'red',
    relationshipUnderTest: 'RightHand -> WeaponGrip -> real sabre mesh; visible hilt remains pinned to WeaponGrip and at the authored RightHand-local offset',
    allowMissingReady,
    unresolvedRequiredCases: requiredFailures.map((entry) => entry.name),
    drift,
    reports,
    artifacts: {
      contactSheet: path.relative(projectRoot, contactPath),
    },
  };
  const jsonPath = path.join(outDir, 'visual_gate.json');
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({
    ok: payload.verdict === 'green',
    verdict: payload.verdict,
    report: path.relative(projectRoot, jsonPath),
    contactSheet: payload.artifacts.contactSheet,
    unresolvedRequiredCases: payload.unresolvedRequiredCases,
    cases: reports.map((entry) => ({ name: entry.name, green: entry.green, skipped: Boolean(entry.skipped), verdict: entry.verdict, svg: entry.svg || null })),
  }, null, 2));
  if (payload.verdict !== 'green') process.exit(1);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
