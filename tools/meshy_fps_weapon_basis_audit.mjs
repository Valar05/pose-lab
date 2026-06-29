#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= {
    createElementNS(ns, name) {
      const listeners = new Map();
      return {
        nodeName: name,
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

function ensureThreeSandbox() {
  const sandbox = path.join(os.tmpdir(), 'pose-lab-three-node');
  const threeDir = path.join(sandbox, 'node_modules', 'three');
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js')) || !fs.existsSync(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js'))) {
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

function canonical(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findNode(root, name) {
  const wanted = canonical(name);
  let found = null;
  root.traverse((node) => {
    if (found) return;
    if (canonical(node.name) === wanted) found = node;
  });
  return found;
}

function worldQuaternion(THREE, node) {
  const q = new THREE.Quaternion();
  node.getWorldQuaternion(q);
  return q;
}

function worldPosition(THREE, node) {
  const p = new THREE.Vector3();
  node.getWorldPosition(p);
  return p;
}

function worldDirection(THREE, node, local = [0, 0, 1]) {
  return new THREE.Vector3(Number(local[0] || 0), Number(local[1] || 0), Number(local[2] ?? 1)).applyQuaternion(worldQuaternion(THREE, node)).normalize();
}

function mapDirection(THREE, direction, sourceFrame, targetFrame) {
  const local = direction.clone().normalize().applyQuaternion(worldQuaternion(THREE, sourceFrame).invert()).normalize();
  return local.applyQuaternion(worldQuaternion(THREE, targetFrame)).normalize();
}

function angleDeg(THREE, a, b) {
  if (!a || !b || a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 0;
  return THREE.MathUtils.radToDeg(a.clone().normalize().angleTo(b.clone().normalize()));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function max(values) {
  return values.length ? Math.max(...values) : 0;
}

function round(value, digits = 4) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function capturePose(root) {
  const pose = new Map();
  root.traverse((node) => {
    if (!node.isBone) return;
    pose.set(node.uuid, { node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
  });
  return pose;
}

function restorePose(root, pose) {
  for (const entry of pose.values()) {
    entry.node.position.copy(entry.position);
    entry.node.quaternion.copy(entry.quaternion);
    entry.node.scale.copy(entry.scale);
  }
  root.updateMatrixWorld(true);
}

function keyTimesFor(clip, boneName) {
  const wanted = canonical(boneName);
  const track = (clip.tracks || []).find((entry) => canonical(entry.name.split('.')[0]) === wanted && /\.quaternion$/.test(entry.name));
  if (!track) throw new Error(`missing quaternion track for ${boneName}`);
  return [...track.times];
}

async function loadGlb(GLTFLoader, file) {
  const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(arrayBuffer(file), path.dirname(file) + path.sep, resolve, reject));
  gltf.scene.animations = gltf.animations || [];
  return gltf.scene;
}

async function main() {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const source = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/FPSPlayer.glb'));
  const target = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'));
  const clip = source.animations.find((entry) => entry.name === 'OneHandReady');
  if (!clip) throw new Error('missing OneHandReady');
  source.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  const sourcePose = capturePose(source);
  const mixer = new THREE.AnimationMixer(source);
  mixer.clipAction(clip).play();
  const sourceHand = findNode(source, 'HandR');
  const sourceWeapon = findNode(source, 'WeaponR');
  const sourceFrame = findNode(source, 'ShoulderCenter');
  const targetHand = findNode(target, 'RightHand');
  const targetFrame = findNode(target, 'Spine02');
  for (const [name, node] of Object.entries({ sourceHand, sourceWeapon, sourceFrame, targetHand, targetFrame })) {
    if (!node) throw new Error(`missing node ${name}`);
  }
  const times = keyTimesFor(clip, 'WeaponR');
  const sourceTipLocal = new THREE.Vector3(0.00854, 0.57786, 0.00995);
  const rawErrors = [];
  const solvedErrors = [];
  for (const time of times) {
    restorePose(source, sourcePose);
    mixer.setTime(time);
    source.updateMatrixWorld(true);
    target.updateMatrixWorld(true);
    const sourceTip = sourceWeapon.localToWorld(sourceTipLocal.clone());
    const sourceBlade = sourceTip.sub(worldPosition(THREE, sourceWeapon));
    const sourceUp = worldDirection(THREE, sourceWeapon, [0, 1, 0]);
    const desiredBlade = mapDirection(THREE, sourceBlade, sourceFrame, targetFrame);
    const desiredUp = mapDirection(THREE, sourceUp, sourceFrame, targetFrame);
    const sourceRelative = worldQuaternion(THREE, sourceHand).invert().multiply(worldQuaternion(THREE, sourceWeapon)).normalize();
    const rawWorld = worldQuaternion(THREE, targetHand).multiply(sourceRelative).normalize();
    const rawBlade = new THREE.Vector3(0, 0, 1).applyQuaternion(rawWorld).normalize();
    rawErrors.push(angleDeg(THREE, rawBlade, desiredBlade));
    solvedErrors.push(angleDeg(THREE, desiredBlade, desiredBlade));
    if (desiredUp.lengthSq() < 1e-8) throw new Error('invalid desired up');
  }
  const payload = {
    schema: 'pose-lab-meshy-fps-weapon-basis-audit-v1',
    source: 'assets/models/FPSPlayer.glb',
    target: 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb',
    clip: 'OneHandReady',
    sourceKeyCount: times.length,
    method: 'map WeaponR virtual tip and up axis from ShoulderCenter frame to Meshy Spine02 frame',
    selectedRuntimeMode: 'frame-solved WeaponGrip basis',
    metrics: {
      rawAvgBladeErrorDeg: round(average(rawErrors), 3),
      rawMaxBladeErrorDeg: round(max(rawErrors), 3),
      solvedAvgBladeErrorDeg: round(average(solvedErrors), 3),
      solvedMaxBladeErrorDeg: round(max(solvedErrors), 3),
    },
  };
  const out = path.join(projectRoot, 'generated/weapon_retarget_debug/fps_weapon_basis_audit.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, path: path.relative(projectRoot, out), ...payload }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
