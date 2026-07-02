#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolvePoseLabActorRuntimeConfig } from '../src/pose-lab-profile-resolver.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'weapon_fk_follow_offline');

function parseArgs(argv) {
  const args = { out: defaultOut, clip: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--clip') args.clip = argv[++i] || '';
    else if (arg.startsWith('--clip=')) args.clip = arg.slice('--clip='.length);
  }
  return args;
}

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 1024, innerHeight: 768, devicePixelRatio: 1 };
  globalThis.self ||= globalThis;
  globalThis.document ||= {
    createElementNS(_ns, name) {
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
  const dir = path.join(sandbox, 'node_modules', 'three');
  const loader = path.join(dir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js');
  if (!fs.existsSync(path.join(dir, 'build', 'three.module.js')) || !fs.existsSync(loader)) {
    fs.rmSync(sandbox, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    execFileSync('cp', ['-R', path.join(projectRoot, 'vendor', 'three'), dir]);
  }
  return dir;
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

function findNode(root, name) {
  const wanted = canon(name);
  let found = null;
  root.traverse((node) => {
    if (!found && canon(node.name) === wanted) found = node;
  });
  return found;
}

function worldPosition(THREE, object) {
  return object.getWorldPosition(new THREE.Vector3());
}

function worldQuaternion(THREE, object) {
  return object.getWorldQuaternion(new THREE.Quaternion());
}

function round(value, digits = 5) {
  return Number(Number(value || 0).toFixed(digits));
}

function point(v) {
  return [round(v.x), round(v.y), round(v.z)];
}

function localPoint(THREE, parent, child) {
  parent.updateMatrixWorld(true);
  child.updateMatrixWorld(true);
  return worldPosition(THREE, child).applyMatrix4(parent.matrixWorld.clone().invert());
}

function attachRuntimeWeapon(THREE, meshyRoot, sabreRoot, config) {
  const hand = findNode(meshyRoot, config.proxy.handBone);
  if (!hand) throw new Error(`missing ${config.proxy.handBone}`);
  meshyRoot.updateMatrixWorld(true);

  const socketWorld = hand.localToWorld(new THREE.Vector3().fromArray(config.proxy.handLocalOffset));
  const socketModelLocal = meshyRoot.worldToLocal(socketWorld.clone());
  socketModelLocal.add(new THREE.Vector3().fromArray(config.proxy.modelLocalOffset));
  socketModelLocal.add(new THREE.Vector3().fromArray(config.proxy.gripOffset));
  const socketWorldPosition = meshyRoot.localToWorld(socketModelLocal.clone());
  const socketLocalPosition = socketWorldPosition.applyMatrix4(hand.matrixWorld.clone().invert());
  const socketLocalQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(...config.proxy.rotationDeg.map((value) => THREE.MathUtils.degToRad(value || 0)), 'XYZ'));
  const socketWorldQuaternion = worldQuaternion(THREE, meshyRoot).multiply(socketLocalQuaternion).normalize();
  const socketHandQuaternion = worldQuaternion(THREE, hand).invert().multiply(socketWorldQuaternion).normalize();

  const socket = new THREE.Bone();
  socket.name = config.proxy.socketBone;
  socket.userData.syntheticWeaponBone = true;
  socket.position.copy(socketLocalPosition);
  socket.quaternion.copy(socketHandQuaternion);
  hand.add(socket);

  const displayRoot = new THREE.Group();
  displayRoot.name = socket.name + '-display-root';
  socket.add(displayRoot);

  const model = sabreRoot;
  model.name = config.attachment.name;
  displayRoot.add(model);
  const tip = new THREE.Group();
  tip.name = config.attachment.tipMarker;
  displayRoot.add(tip);

  const applyAttachment = () => {
    meshyRoot.updateMatrixWorld(true);
    socket.updateMatrixWorld(true);
    const modelWorldScale = meshyRoot.getWorldScale(new THREE.Vector3());
    const socketWorldScale = socket.getWorldScale(new THREE.Vector3());
    displayRoot.position.set(0, 0, 0);
    displayRoot.quaternion.identity();
    displayRoot.scale.set(
      modelWorldScale.x / Math.max(0.000001, Math.abs(socketWorldScale.x)),
      modelWorldScale.y / Math.max(0.000001, Math.abs(socketWorldScale.y)),
      modelWorldScale.z / Math.max(0.000001, Math.abs(socketWorldScale.z))
    );
    model.scale.setScalar(config.attachment.scale);
    model.rotation.set(...config.attachment.rotationDeg.map((value) => THREE.MathUtils.degToRad(value || 0)));
    model.position.fromArray(config.attachment.position);
    const gripLocal = new THREE.Vector3().fromArray(config.attachment.gripLocalPosition);
    gripLocal.multiplyScalar(config.attachment.scale);
    gripLocal.applyQuaternion(model.quaternion);
    model.position.sub(gripLocal);
    const tipLocal = new THREE.Vector3().fromArray(config.attachment.tipLocalPosition);
    tipLocal.multiplyScalar(config.attachment.scale);
    tipLocal.applyQuaternion(model.quaternion);
    tipLocal.add(model.position);
    tip.position.copy(tipLocal);
  };
  applyAttachment();
  return { hand, socket, displayRoot, model, tip, applyAttachment };
}

function writeSvg(outPath, samples) {
  const width = 760;
  const height = 220;
  const xs = samples.flatMap((sample) => [sample.hand[0], sample.socket[0], sample.model[0], sample.tip[0]]);
  const ys = samples.flatMap((sample) => [sample.hand[1], sample.socket[1], sample.model[1], sample.tip[1]]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sx = (x) => 35 + ((x - minX) / Math.max(0.0001, maxX - minX)) * (width - 70);
  const sy = (y) => height - 35 - ((y - minY) / Math.max(0.0001, maxY - minY)) * (height - 70);
  const polyline = (field, color) => `<polyline fill="none" stroke="${color}" stroke-width="3" points="${samples.map((sample) => `${sx(sample[field][0]).toFixed(1)},${sy(sample[field][1]).toFixed(1)}`).join(' ')}" />`;
  const body = [
    '<rect width="100%" height="100%" fill="#101820"/>',
    '<text x="18" y="24" fill="#f2f5f7" font-family="monospace" font-size="14">Weapon FK follow offline trace: hand/socket/model/tip XY motion</text>',
    polyline('hand', '#7dd3fc'),
    polyline('socket', '#facc15'),
    polyline('model', '#f97316'),
    polyline('tip', '#34d399'),
  ].join('\n');
  fs.writeFileSync(outPath, `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n${body}\n</svg>\n`);
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const config = resolvePoseLabActorRuntimeConfig('meshyCharacter');
  const meshyPath = path.join(projectRoot, 'assets', 'models', 'meshy_character_sheet', 'animated', 'Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb');
  const sabrePath = path.join(projectRoot, config.attachment.url);
  const meshy = await loadGlb(GLTFLoader, meshyPath);
  const sabre = await loadGlb(GLTFLoader, sabrePath);
  const clip = args.clip
    ? meshy.animations.find((entry) => entry.name === args.clip || entry.name.includes(args.clip))
    : meshy.animations[0];
  if (!clip) throw new Error('missing Meshy animation clip');
  const runtime = attachRuntimeWeapon(THREE, meshy.scene, sabre.scene, config);
  const mixer = new THREE.AnimationMixer(meshy.scene);
  const action = mixer.clipAction(clip);
  action.play();
  const duration = Math.max(0.001, Number(clip.duration || 0.001));
  const times = [0, duration * 0.2, duration * 0.4, duration * 0.6, duration * 0.8, duration];
  const samples = [];
  for (const time of times) {
    action.time = time;
    mixer.update(0);
    runtime.applyAttachment();
    meshy.scene.updateMatrixWorld(true);
    samples.push({
      time: round(time),
      hand: point(worldPosition(THREE, runtime.hand)),
      socket: point(worldPosition(THREE, runtime.socket)),
      display: point(worldPosition(THREE, runtime.displayRoot)),
      model: point(worldPosition(THREE, runtime.model)),
      tip: point(worldPosition(THREE, runtime.tip)),
      socketInHand: point(localPoint(THREE, runtime.hand, runtime.socket)),
      displayInSocket: point(localPoint(THREE, runtime.socket, runtime.displayRoot)),
      modelInDisplay: point(localPoint(THREE, runtime.displayRoot, runtime.model)),
    });
  }
  const distance = (a, b) => new THREE.Vector3().fromArray(a).distanceTo(new THREE.Vector3().fromArray(b));
  const drift = (field) => Math.max(...samples.map((sample) => distance(samples[0][field], sample[field])));
  const motion = {
    hand: round(drift('hand')),
    socket: round(drift('socket')),
    display: round(drift('display')),
    model: round(drift('model')),
    tip: round(drift('tip')),
  };
  const relativeDrift = {
    socketInHand: round(drift('socketInHand')),
    displayInSocket: round(drift('displayInSocket')),
    modelInDisplay: round(drift('modelInDisplay')),
  };
  const follows = {
    parentChain: runtime.socket.parent === runtime.hand && runtime.displayRoot.parent === runtime.socket && runtime.model.parent === runtime.displayRoot && runtime.tip.parent === runtime.displayRoot,
    handMoves: motion.hand > 0.01,
    socketMoves: motion.socket > 0.01,
    displayMoves: motion.display > 0.01,
    modelMoves: motion.model > 0.01,
    tipMoves: motion.tip > 0.01,
    socketStableInHand: relativeDrift.socketInHand < 0.005,
    displayStableInSocket: relativeDrift.displayInSocket < 0.005,
    modelStableInDisplay: relativeDrift.modelInDisplay < 0.005,
  };
  const ok = Object.values(follows).every(Boolean);
  const data = {
    schema: 'pose-lab-weapon-fk-follow-offline-v1',
    ok,
    clip: clip.name,
    source: path.relative(projectRoot, meshyPath),
    sabre: path.relative(projectRoot, sabrePath),
    parentChain: [runtime.model.name, runtime.model.parent?.name, runtime.model.parent?.parent?.name, runtime.model.parent?.parent?.parent?.name].filter(Boolean),
    motion,
    relativeDrift,
    follows,
    samples,
  };
  const dataPath = path.join(args.out, 'weapon_fk_follow_offline.json');
  const svgPath = path.join(args.out, 'weapon_fk_follow_offline.svg');
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2) + '\n');
  writeSvg(svgPath, samples);
  console.log(JSON.stringify({ ok, data: path.relative(projectRoot, dataPath), svg: path.relative(projectRoot, svgPath), motion, relativeDrift, follows }, null, 2));
  if (!ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
