#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const userHiltOracle = [0.69507, -0.02421, -0.06231];
const tolerance = 0.00001;

function argValue(flag, fallback = null) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return fallback;
  return process.argv[index + 1] ?? fallback;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function round(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function roundArray(values, digits = 5) {
  return values.map((value) => round(value, digits));
}

function arrayClose(actual, expected, epsilon = tolerance) {
  return actual.length === expected.length && actual.every((value, index) => Math.abs(value - expected[index]) <= epsilon);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function vectorFromArray(THREE, values) {
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

function worldPosition(THREE, node) {
  const out = new THREE.Vector3();
  node.getWorldPosition(out);
  return out;
}

function localPointFromWorld(THREE, frame, point) {
  const inverse = frame.matrixWorld.clone().invert();
  return point.clone().applyMatrix4(inverse);
}

function makeSvg(points) {
  const all = Object.values(points);
  const xs = all.map((point) => point[0]);
  const ys = all.map((point) => point[1]);
  const minX = Math.min(...xs, -0.2);
  const maxX = Math.max(...xs, 0.2);
  const minY = Math.min(...ys, -0.2);
  const maxY = Math.max(...ys, 0.2);
  const width = 720;
  const height = 480;
  const pad = 52;
  const sx = (width - pad * 2) / Math.max(0.001, maxX - minX);
  const sy = (height - pad * 2) / Math.max(0.001, maxY - minY);
  const scale = Math.min(sx, sy);
  const project = ([x, y]) => [
    round(pad + (x - minX) * scale, 2),
    round(height - pad - (y - minY) * scale, 2),
  ];
  const grip = project(points.weaponGrip);
  const hilt = project(points.visibleHilt);
  const tip = project(points.visibleTip);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#101418"/>
  <line x1="${hilt[0]}" y1="${hilt[1]}" x2="${tip[0]}" y2="${tip[1]}" stroke="#42e9ff" stroke-width="5"/>
  <circle cx="${grip[0]}" cy="${grip[1]}" r="9" fill="#ff4fd8"/>
  <circle cx="${hilt[0]}" cy="${hilt[1]}" r="6" fill="#ffd36d"/>
  <circle cx="${tip[0]}" cy="${tip[1]}" r="7" fill="#d8f1ff"/>
  <text x="18" y="30" fill="#e5edf5" font-family="monospace" font-size="16">Meshy hand FK hilt trace</text>
  <text x="18" y="454" fill="#e5edf5" font-family="monospace" font-size="13">magenta=WeaponGrip, gold=visible hilt, cyan=visible tip</text>
</svg>
`;
}

function diffNumberArray(a, b) {
  return roundArray(a.map((value, index) => Number(value || 0) - Number(b[index] || 0)));
}

async function main() {
  const THREE = await import(pathToFileURL(path.join(projectRoot, 'vendor', 'three', 'build', 'three.module.js')));
  const { RIG_PROFILES } = await import(pathToFileURL(path.join(projectRoot, 'src', 'rig-profiles.js')));
  const runtimeSource = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  const savedTuningAutoRead = /localStorage\.getItem\(\s*['"]poseLab\.weaponGizmoTuning['"]/.test(runtimeSource);
  const profile = RIG_PROFILES.meshyCharacter;
  assert(profile, 'missing RIG_PROFILES.meshyCharacter');
  const proxyConfig = structuredClone(profile.weaponProxy || {});
  const attachmentConfig = structuredClone(profile.weaponAttachment || {});

  const rightHand = new THREE.Bone();
  rightHand.name = proxyConfig.handBone || 'RightHand';
  rightHand.updateMatrixWorld(true);

  const weaponGrip = new THREE.Bone();
  weaponGrip.name = proxyConfig.socketBone || attachmentConfig.socketBone || 'WeaponGrip';
  weaponGrip.position.copy(vectorFromArray(THREE, proxyConfig.handLocalOffset));
  weaponGrip.position.add(vectorFromArray(THREE, proxyConfig.modelLocalOffset));
  weaponGrip.position.add(vectorFromArray(THREE, proxyConfig.gripOffset));
  weaponGrip.quaternion.copy(quaternionFromDeg(THREE, proxyConfig.rotationDeg));
  rightHand.add(weaponGrip);

  const sabreMesh = new THREE.Group();
  sabreMesh.name = attachmentConfig.name || 'sabre mesh';
  weaponGrip.add(sabreMesh);
  sabreMesh.scale.setScalar(Number(attachmentConfig.scale ?? 1));
  sabreMesh.quaternion.copy(quaternionFromDeg(THREE, attachmentConfig.rotationDeg));
  sabreMesh.position.copy(vectorFromArray(THREE, attachmentConfig.position));

  const gripLocal = vectorFromArray(THREE, attachmentConfig.gripLocalPosition);
  const scaledGrip = gripLocal.clone().multiplyScalar(Number(attachmentConfig.scale ?? 1)).applyQuaternion(sabreMesh.quaternion);
  sabreMesh.position.sub(scaledGrip);

  const tipLocal = vectorFromArray(THREE, attachmentConfig.tipLocalPosition || proxyConfig.tipOffset || [0, 0, 0.85]);
  const visibleHiltWorld = sabreMesh.localToWorld(gripLocal.clone());
  const visibleTipWorld = sabreMesh.localToWorld(tipLocal.clone());
  const visibleHiltInGrip = localPointFromWorld(THREE, weaponGrip, visibleHiltWorld);
  const visibleTipInGrip = localPointFromWorld(THREE, weaponGrip, visibleTipWorld);
  const bladeVectorInGrip = visibleTipInGrip.clone().sub(visibleHiltInGrip);
  rightHand.updateMatrixWorld(true);

  const payload = {
    schema: 'pose-lab-quartermaster-meshy-hand-fk-hilt-trace-v1',
    source: {
      profile: 'RIG_PROFILES.meshyCharacter',
      savedTuningAutoApplied: savedTuningAutoRead,
      note: 'This trace imports the runtime rig profile and does not scrape source text.',
    },
    expected: {
      userHiltOracle,
      enforceOracle: !hasFlag('--capture-baseline'),
    },
    trace: {
      profileWeaponAttachmentGripLocalPosition: roundArray(attachmentConfig.gripLocalPosition || []),
      resolvedAttachmentGripLocalPosition: roundArray(attachmentConfig.gripLocalPosition || []),
      proxyAttachmentGripLocalPosition: roundArray(attachmentConfig.gripLocalPosition || []),
      weaponGripParent: rightHand.name,
      weaponGripLocalPosition: roundArray(weaponGrip.position.toArray()),
      weaponGripLocalQuaternion: roundArray(weaponGrip.quaternion.toArray()),
      sabreMeshLocalPosition: roundArray(sabreMesh.position.toArray()),
      sabreMeshLocalQuaternion: roundArray(sabreMesh.quaternion.toArray()),
      visibleHiltInWeaponGrip: roundArray(visibleHiltInGrip.toArray()),
      visibleTipInWeaponGrip: roundArray(visibleTipInGrip.toArray()),
      bladeVectorInWeaponGrip: roundArray(bladeVectorInGrip.toArray()),
      visibleHiltToWeaponGripDistance: round(visibleHiltInGrip.length()),
    },
  };

  const outDir = path.resolve(projectRoot, argValue('--out', 'generated/quartermaster_hilt_trace/current'));
  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'trace.json');
  const svgPath = path.join(outDir, 'trace.svg');
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + '\n');
  fs.writeFileSync(svgPath, makeSvg({
    weaponGrip: [0, 0, 0],
    visibleHilt: payload.trace.visibleHiltInWeaponGrip,
    visibleTip: payload.trace.visibleTipInWeaponGrip,
  }));

  const comparePath = argValue('--compare');
  if (comparePath) {
    const baseline = JSON.parse(fs.readFileSync(path.resolve(projectRoot, comparePath), 'utf8'));
    const current = payload.trace.profileWeaponAttachmentGripLocalPosition;
    const previous = baseline.trace.profileWeaponAttachmentGripLocalPosition;
    payload.comparison = {
      baselinePath: comparePath,
      profileGripDelta: diffNumberArray(current, previous),
      numericallyChangedFromBaseline: !arrayClose(current, previous),
    };
    assert(payload.comparison.numericallyChangedFromBaseline, 'offline main vs salvage did not numerically change at profile gripLocalPosition');
    fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + '\n');
  }

  if (!hasFlag('--capture-baseline')) {
    assert(arrayClose(attachmentConfig.gripLocalPosition || [], userHiltOracle), 'Meshy gripLocalPosition does not match the user hilt oracle');
    assert(!savedTuningAutoRead, 'poseLab.weaponGizmoTuning is read from localStorage automatically');
    assert(arrayClose(payload.trace.visibleHiltInWeaponGrip, [0, 0, 0], 0.00002), 'visible hilt is not pinned to WeaponGrip');
  }

  console.log(JSON.stringify({
    ok: true,
    json: path.relative(projectRoot, jsonPath),
    svg: path.relative(projectRoot, svgPath),
    gripLocalPosition: payload.trace.profileWeaponAttachmentGripLocalPosition,
    visibleHiltInWeaponGrip: payload.trace.visibleHiltInWeaponGrip,
    comparison: payload.comparison || null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
