#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { authoredWeaponSocketLocal, roundFkMetric } from '../src/weapon-fk-contract.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(projectRoot, 'generated', 'offline_render', 'meshy_tpose_weapon_baseline');

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= {
    createElementNS() {
      const listeners = new Map();
      return {
        style: {}, width: 1, height: 1,
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type) { listeners.delete(type); },
        set src(value) { this._src = value; setTimeout(() => listeners.get('load')?.({ type: 'load' }), 0); },
        get src() { return this._src || ''; },
      };
    },
  };
  globalThis.createImageBitmap ||= async () => ({ width: 1, height: 1, close() {} });
}

function ensureThreeSandbox() {
  const sandbox = path.join(os.tmpdir(), 'pose-lab-three-node');
  const threeDir = path.join(sandbox, 'node_modules', 'three');
  const loader = path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js');
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js')) || !fs.existsSync(loader)) {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(threeDir), { recursive: true });
    execFileSync('cp', ['-R', path.join(projectRoot, 'vendor', 'three'), threeDir]);
  }
  return threeDir;
}

function arrayBuffer(file) {
  const buffer = fs.readFileSync(file);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

async function loadGlb(GLTFLoader, file) {
  return await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + path.sep, resolve, reject));
}

function canon(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function find(root, name) {
  const wanted = canon(name);
  let found = null;
  root.traverse((node) => { if (!found && canon(node.name) === wanted) found = node; });
  return found;
}

function requireNode(root, name) {
  const node = find(root, name);
  if (!node) throw new Error(`missing node ${name}`);
  return node;
}

function point(v) {
  return [roundFkMetric(v.x), roundFkMetric(v.y), roundFkMetric(v.z)];
}

function quat(q) {
  return [roundFkMetric(q.x, 6), roundFkMetric(q.y, 6), roundFkMetric(q.z, 6), roundFkMetric(q.w, 6)];
}

function project(points) {
  const minX = Math.min(...points.map((p) => p.x));
  const maxX = Math.max(...points.map((p) => p.x));
  const minY = Math.min(...points.map((p) => p.y));
  const maxY = Math.max(...points.map((p) => p.y));
  const span = Math.max(maxX - minX, maxY - minY, 0.001);
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: 330 / span };
}

function svgPoint(p, bounds, ox = 300, oy = 250) {
  return [ox + (p.x - bounds.cx) * bounds.scale, oy - (p.y - bounds.cy) * bounds.scale];
}

function writeSheet(file, data) {
  const W = 920;
  const H = 520;
  const points = [
    data.points.rightHand,
    data.points.leftHand,
    data.points.socket,
    data.points.hilt,
    data.points.tip,
    data.points.authoredSocket,
  ].map(([x, y, z]) => ({ x, y, z }));
  const bounds = project(points);
  const p = Object.fromEntries(Object.entries(data.points).map(([key, value]) => [key, svgPoint({ x: value[0], y: value[1], z: value[2] }, bounds)]));
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    '<rect width="100%" height="100%" fill="#071018"/>',
    '<text x="24" y="34" fill="#fff4c2" font-family="monospace" font-size="18">Meshy T-pose weapon baseline - offline reference</text>',
    `<text x="24" y="60" fill="#cbd5e1" font-family="monospace" font-size="13">clip=${data.clipName}</text>`,
    `<text x="24" y="80" fill="#cbd5e1" font-family="monospace" font-size="13">visibility=${data.visibility.status} pattern=${data.visibility.matchedPattern}</text>`,
    `<line x1="${p.hilt[0]}" y1="${p.hilt[1]}" x2="${p.tip[0]}" y2="${p.tip[1]}" stroke="#facc15" stroke-width="7"/>`,
    `<line x1="${p.socket[0]}" y1="${p.socket[1]}" x2="${p.rightHand[0]}" y2="${p.rightHand[1]}" stroke="#38bdf8" stroke-width="2" stroke-dasharray="5 5"/>`,
    `<circle cx="${p.rightHand[0]}" cy="${p.rightHand[1]}" r="8" fill="#22c55e"><title>RightHand</title></circle>`,
    `<circle cx="${p.leftHand[0]}" cy="${p.leftHand[1]}" r="7" fill="#84cc16"><title>LeftHand</title></circle>`,
    `<circle cx="${p.socket[0]}" cy="${p.socket[1]}" r="7" fill="#ef4444"><title>WeaponGrip socket</title></circle>`,
    `<circle cx="${p.hilt[0]}" cy="${p.hilt[1]}" r="6" fill="#f97316"><title>Rendered hilt/grip</title></circle>`,
    `<circle cx="${p.tip[0]}" cy="${p.tip[1]}" r="6" fill="#fde047"><title>Blade tip</title></circle>`,
    `<circle cx="${p.authoredSocket[0]}" cy="${p.authoredSocket[1]}" r="5" fill="#a78bfa"><title>Authored local FK sum reference</title></circle>`,
    '<text x="24" y="456" fill="#94a3b8" font-family="monospace" font-size="13">green=RightHand, red=runtime WeaponGrip socket, orange=hilt, yellow=tip, purple=authored local FK sum reference</text>',
    '<text x="24" y="478" fill="#fca5a5" font-family="monospace" font-size="13">This is baseline evidence only. It does not prove Ready FK follow or authorize selection-surface promotion.</text>',
    '</svg>',
  ];
  fs.writeFileSync(file, parts.join('\n') + '\n');
}

function clipVisible(clipName, config) {
  const patterns = config.visibleClipPatterns || [];
  const matchedPattern = patterns.find((pattern) => new RegExp(pattern).test(clipName)) || '';
  return { status: matchedPattern ? 'visible' : 'hidden', matchedPattern, patterns };
}

async function main() {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const { RIG_PROFILES } = await import(pathToFileURL(path.join(projectRoot, 'src', 'rig-profiles.js')));
  const profile = RIG_PROFILES.meshyCharacter;
  const clipName = profile.startupClip?.name || '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]';
  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, profile.url));
  const sabre = await loadGlb(GLTFLoader, path.join(projectRoot, profile.weaponAttachment.url));
  const model = meshy.scene;
  model.updateMatrixWorld(true);
  const rightHand = requireNode(model, profile.weaponProxy.handBone || 'RightHand');
  const leftHand = requireNode(model, profile.weaponProxy.leftHandBone || 'LeftHand');
  const socket = new THREE.Object3D();
  socket.name = profile.weaponProxy.socketBone || profile.weaponAttachment.socketBone || 'WeaponGrip';
  model.add(socket);

  const rightWorld = Array.isArray(profile.weaponProxy.handLocalOffset)
    ? rightHand.localToWorld(new THREE.Vector3().fromArray(profile.weaponProxy.handLocalOffset))
    : rightHand.getWorldPosition(new THREE.Vector3());
  const local = model.worldToLocal(rightWorld.clone());
  if (Array.isArray(profile.weaponProxy.modelLocalOffset)) local.add(new THREE.Vector3().fromArray(profile.weaponProxy.modelLocalOffset));
  if (Array.isArray(profile.weaponProxy.gripOffset)) local.add(new THREE.Vector3().fromArray(profile.weaponProxy.gripOffset));
  socket.position.copy(local);
  const modelWorldQuat = model.getWorldQuaternion(new THREE.Quaternion()).invert();
  socket.quaternion.copy(modelWorldQuat.multiply(rightHand.getWorldQuaternion(new THREE.Quaternion()))).normalize();

  const weaponRoot = sabre.scene.clone(true);
  socket.add(weaponRoot);
  weaponRoot.scale.setScalar(Number(profile.weaponAttachment.scale ?? 1));
  weaponRoot.rotation.set(...profile.weaponAttachment.rotationDeg.map((value) => THREE.MathUtils.degToRad(value || 0)));
  weaponRoot.position.set(0, 0, 0);
  const localGrip = new THREE.Vector3().fromArray(profile.weaponAttachment.gripLocalPosition);
  localGrip.multiplyScalar(Number(profile.weaponAttachment.scale ?? 1));
  localGrip.applyQuaternion(weaponRoot.quaternion);
  weaponRoot.position.sub(localGrip);
  const tip = new THREE.Object3D();
  const localTip = new THREE.Vector3().fromArray(profile.weaponAttachment.tipLocalPosition);
  localTip.multiplyScalar(Number(profile.weaponAttachment.scale ?? 1));
  localTip.applyQuaternion(weaponRoot.quaternion);
  localTip.add(weaponRoot.position);
  tip.position.copy(localTip);
  socket.add(tip);
  model.updateMatrixWorld(true);

  const authored = authoredWeaponSocketLocal(THREE, profile.weaponProxy);
  const authoredSocket = model.localToWorld(authored.position.clone());
  const socketWorld = socket.getWorldPosition(new THREE.Vector3());
  const hiltWorld = weaponRoot.getWorldPosition(new THREE.Vector3());
  const tipWorld = tip.getWorldPosition(new THREE.Vector3());
  const rightHandWorld = rightHand.getWorldPosition(new THREE.Vector3());
  const leftHandWorld = leftHand.getWorldPosition(new THREE.Vector3());
  const data = {
    schema: 'pose-lab-meshy-tpose-weapon-baseline-render-v1',
    generatedAt: new Date().toISOString(),
    proofKind: 'offline-render-baseline-reference',
    actorKey: 'meshyCharacter',
    clipName,
    cacheToken: fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8').match(/const\s+LAB_CACHE_TOKEN\s*=\s*'([^']+)'/)?.[1] || '',
    protectedSurfacePolicy: 'startup/SwordReady/RestProbe/default visibility remain on accepted T-pose/rest baseline',
    notPromotionEvidenceForReady: true,
    visibility: clipVisible(clipName, profile.weaponProxy),
    manualValues: {
      handLocalOffset: profile.weaponProxy.handLocalOffset,
      modelLocalOffset: profile.weaponProxy.modelLocalOffset,
      gripOffset: profile.weaponProxy.gripOffset,
      attachmentRotationDeg: profile.weaponAttachment.rotationDeg,
      gripLocalPosition: profile.weaponAttachment.gripLocalPosition,
      tipLocalPosition: profile.weaponAttachment.tipLocalPosition,
    },
    points: {
      rightHand: point(rightHandWorld),
      leftHand: point(leftHandWorld),
      socket: point(socketWorld),
      hilt: point(hiltWorld),
      tip: point(tipWorld),
      authoredSocket: point(authoredSocket),
    },
    quaternions: {
      socket: quat(socket.getWorldQuaternion(new THREE.Quaternion())),
      authoredLocal: quat(authored.quaternion),
    },
    metrics: {
      hiltToHandDistance: roundFkMetric(hiltWorld.distanceTo(rightHandWorld)),
      socketToAuthoredLocalDistance: roundFkMetric(socketWorld.distanceTo(authoredSocket)),
      bladeLength: roundFkMetric(tipWorld.distanceTo(hiltWorld)),
    },
  };

  fs.mkdirSync(outDir, { recursive: true });
  const jsonPath = path.join(outDir, 'baseline_render.json');
  const sheetPath = path.join(outDir, 'baseline_render.svg');
  data.sheet = path.relative(projectRoot, sheetPath);
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
  writeSheet(sheetPath, data);
  console.log(JSON.stringify({
    artifact: path.relative(projectRoot, jsonPath),
    sheet: path.relative(projectRoot, sheetPath),
    visibility: data.visibility,
    metrics: data.metrics,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
