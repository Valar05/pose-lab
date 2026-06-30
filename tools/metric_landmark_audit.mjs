#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'metric_landmark_audit');
const SOURCE_BONES = ['ShoulderCenter', 'Arm.R', 'Forearm.R', 'Hand.R', 'Weapon.R', 'Arm.L', 'Forearm.L', 'Hand.L'];
const CHAINS = [
  { source: ['Arm.R', 'Forearm.R', 'Hand.R'], target: ['RightArm', 'RightForeArm', 'RightHand'] },
  { source: ['Arm.L', 'Forearm.L', 'Hand.L'], target: ['LeftArm', 'LeftForeArm', 'LeftHand'] },
];
const EPSILON = 1e-5;

function parseArgs(argv) {
  const args = { out: defaultOut, clip: 'OneHandReady', maxRenderFrames: 8, meshSampleStride: 24 };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++index] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--clip') args.clip = argv[++index] || args.clip;
    else if (arg.startsWith('--clip=')) args.clip = arg.slice('--clip='.length);
    else if (arg === '--max-render-frames') args.maxRenderFrames = Number(argv[++index] || args.maxRenderFrames);
    else if (arg.startsWith('--max-render-frames=')) args.maxRenderFrames = Number(arg.slice('--max-render-frames='.length));
    else if (arg === '--mesh-sample-stride') args.meshSampleStride = Number(argv[++index] || args.meshSampleStride);
    else if (arg.startsWith('--mesh-sample-stride=')) args.meshSampleStride = Number(arg.slice('--mesh-sample-stride='.length));
  }
  return args;
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

function ensureThreeSandbox() {
  const sandbox = path.join(os.tmpdir(), 'pose-lab-three-node');
  const threeDir = path.join(sandbox, 'node_modules', 'three');
  if (!fs.existsSync(path.join(threeDir, 'build', 'three.module.js')) || !fs.existsSync(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js'))) {
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
  root.traverse((node) => {
    if (!found && canon(node.name) === wanted) found = node;
  });
  return found;
}

function requireNode(root, name) {
  const node = find(root, name);
  if (!node) throw new Error(`missing node ${name}`);
  return node;
}

function round(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function point(vector, digits = 5) {
  return [round(vector.x, digits), round(vector.y, digits), round(vector.z, digits)];
}

function vectorFrom(THREE, values = [0, 0, 0]) {
  return new THREE.Vector3(Number(values[0] || 0), Number(values[1] || 0), Number(values[2] || 0));
}

function distance(a, b) {
  return a.distanceTo(b);
}

function worldPosition(THREE, node) {
  return node.getWorldPosition(new THREE.Vector3());
}

function worldQuaternion(THREE, node) {
  return node.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

function toFrameLocal(THREE, frame, pointWorld) {
  return pointWorld.clone().sub(worldPosition(THREE, frame)).applyQuaternion(worldQuaternion(THREE, frame).invert());
}

function fromFrameLocal(THREE, frame, local) {
  return local.clone().applyQuaternion(worldQuaternion(THREE, frame)).add(worldPosition(THREE, frame));
}

function capturePose(root) {
  const pose = [];
  root.traverse((node) => {
    if (!node.isBone && !node.isObject3D) return;
    pose.push({ node, position: node.position.clone(), quaternion: node.quaternion.clone(), scale: node.scale.clone() });
  });
  return pose;
}

function restorePose(root, pose) {
  for (const entry of pose) {
    entry.node.position.copy(entry.position);
    entry.node.quaternion.copy(entry.quaternion);
    entry.node.scale.copy(entry.scale);
    entry.node.updateMatrix();
  }
  root.updateMatrixWorld(true);
}

function sampleQuaternionTrack(THREE, track, time) {
  const result = track.createInterpolant(new Float32Array(4)).evaluate(time);
  return new THREE.Quaternion(result[0], result[1], result[2], result[3]).normalize();
}

function applyClipPose(THREE, root, clip, time) {
  for (const track of clip.tracks || []) {
    if (!track.name.endsWith('.quaternion')) continue;
    const node = find(root, track.name.replace(/\.quaternion$/, ''));
    if (node) node.quaternion.copy(sampleQuaternionTrack(THREE, track, time));
  }
  root.updateMatrixWorld(true);
}

function clipRestQuaternionMap(THREE, root, clip) {
  applyClipPose(THREE, root, clip, 0);
  const out = new Map();
  root.traverse((node) => {
    if (node.isBone) out.set(canon(node.name), node.quaternion.clone().normalize());
  });
  return out;
}

function bindRestLocalMap(THREE, root) {
  const worldByBone = new Map();
  const out = new Map();
  root.traverse((node) => {
    if (!node.isSkinnedMesh || !node.skeleton?.bones?.length) return;
    node.skeleton.bones.forEach((bone, index) => {
      const inverse = node.skeleton.boneInverses[index];
      if (bone && inverse && !worldByBone.has(bone)) worldByBone.set(bone, inverse.clone().invert());
    });
  });
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  for (const [bone, world] of worldByBone.entries()) {
    const parentWorld = bone.parent?.isBone ? worldByBone.get(bone.parent) : null;
    const local = parentWorld ? parentWorld.clone().invert().multiply(world) : world.clone();
    local.decompose(p, q, s);
    out.set(canon(bone.name), q.clone().normalize());
  }
  return out;
}

function applyLocalRest(root, restMap) {
  root.traverse((node) => {
    const rest = restMap.get(canon(node.name));
    if (rest) node.quaternion.copy(rest).normalize();
  });
  root.updateMatrixWorld(true);
}

function setWorldQuaternion(THREE, bone, targetWorld) {
  const parentWorld = bone.parent ? worldQuaternion(THREE, bone.parent).invert() : new THREE.Quaternion();
  bone.quaternion.copy(parentWorld.multiply(targetWorld).normalize());
}

function segmentDirection(THREE, a, b) {
  const direction = worldPosition(THREE, b).sub(worldPosition(THREE, a));
  return direction.lengthSq() > 1e-8 ? direction.normalize() : null;
}

function worldDirection(THREE, node, axis = [0, 1, 0]) {
  return vectorFrom(THREE, axis).normalize().applyQuaternion(worldQuaternion(THREE, node)).normalize();
}

function mapDirectionBetweenFrames(THREE, direction, sourceFrame, targetFrame) {
  const sourceLocal = direction.clone().normalize().applyQuaternion(worldQuaternion(THREE, sourceFrame).invert()).normalize();
  return sourceLocal.applyQuaternion(worldQuaternion(THREE, targetFrame)).normalize();
}

function projectedAroundAxis(THREE, direction, axis) {
  const projected = direction.clone().sub(axis.clone().multiplyScalar(direction.dot(axis)));
  return projected.lengthSq() > 1e-8 ? projected.normalize() : null;
}

function calibratedMeshyRestMap(THREE, fpsRoot, meshyRoot, fpsRestMap, meshyBindMap) {
  applyLocalRest(fpsRoot, fpsRestMap);
  applyLocalRest(meshyRoot, meshyBindMap);
  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const solved = new Map(meshyBindMap);
  for (const spec of [
    ['Arm.R', 'Forearm.R', 'RightArm', 'RightForeArm'],
    ['Forearm.R', 'Hand.R', 'RightForeArm', 'RightHand'],
    ['Arm.L', 'Forearm.L', 'LeftArm', 'LeftForeArm'],
    ['Forearm.L', 'Hand.L', 'LeftForeArm', 'LeftHand'],
  ]) {
    const [sourceAName, sourceBName, targetAName, targetBName] = spec;
    const desired = mapDirectionBetweenFrames(THREE, segmentDirection(THREE, requireNode(fpsRoot, sourceAName), requireNode(fpsRoot, sourceBName)), sourceFrame, targetFrame);
    const current = segmentDirection(THREE, requireNode(meshyRoot, targetAName), requireNode(meshyRoot, targetBName));
    const targetA = requireNode(meshyRoot, targetAName);
    setWorldQuaternion(THREE, targetA, new THREE.Quaternion().setFromUnitVectors(current, desired).multiply(worldQuaternion(THREE, targetA)).normalize());
    meshyRoot.updateMatrixWorld(true);
    solved.set(canon(targetA.name), targetA.quaternion.clone().normalize());
  }
  const forearm = requireNode(meshyRoot, 'RightForeArm');
  const hand = requireNode(meshyRoot, 'RightHand');
  const sourceHand = requireNode(fpsRoot, 'Hand.R');
  const axis = segmentDirection(THREE, forearm, hand);
  const desiredRoll = projectedAroundAxis(THREE, mapDirectionBetweenFrames(THREE, worldDirection(THREE, sourceHand, [0, 0, 1]), sourceFrame, targetFrame), axis);
  const currentRoll = projectedAroundAxis(THREE, worldDirection(THREE, hand, [0, -1, 0]), axis);
  if (desiredRoll && currentRoll) {
    const signed = Math.atan2(new THREE.Vector3().crossVectors(currentRoll, desiredRoll).dot(axis), currentRoll.dot(desiredRoll));
    const turn = new THREE.Quaternion().setFromAxisAngle(axis, signed + THREE.MathUtils.degToRad(-120)).normalize();
    setWorldQuaternion(THREE, hand, turn.multiply(worldQuaternion(THREE, hand)).normalize());
    meshyRoot.updateMatrixWorld(true);
    solved.set(canon(hand.name), hand.quaternion.clone().normalize());
  }
  return solved;
}

function keyTimesForImportantBones(clip) {
  const wanted = new Set(SOURCE_BONES.map(canon));
  const times = new Set();
  for (const track of clip.tracks || []) {
    if (!track.name.endsWith('.quaternion')) continue;
    const name = track.name.replace(/\.quaternion$/, '');
    if (!wanted.has(canon(name))) continue;
    for (const time of track.times || []) times.add(round(time, 6));
  }
  return [...times].sort((a, b) => a - b);
}

function chainLength(THREE, upper, lower, hand) {
  return worldPosition(THREE, upper).distanceTo(worldPosition(THREE, lower)) + worldPosition(THREE, lower).distanceTo(worldPosition(THREE, hand));
}

function uniformProjectionScale(THREE, fpsRoot, meshyRoot) {
  return CHAINS.map((chain) => chainLength(THREE, requireNode(meshyRoot, chain.target[0]), requireNode(meshyRoot, chain.target[1]), requireNode(meshyRoot, chain.target[2])) / Math.max(0.0001, chainLength(THREE, requireNode(fpsRoot, chain.source[0]), requireNode(fpsRoot, chain.source[1]), requireNode(fpsRoot, chain.source[2]))))
    .reduce((sum, value) => sum + value, 0) / CHAINS.length;
}

function projectSourceJoints(THREE, fpsRoot, meshyRoot, scale) {
  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const out = {};
  for (const sourceName of SOURCE_BONES) {
    const sourceLocal = toFrameLocal(THREE, sourceFrame, worldPosition(THREE, requireNode(fpsRoot, sourceName)));
    out[sourceName] = fromFrameLocal(THREE, targetFrame, sourceLocal.multiplyScalar(scale));
  }
  return out;
}

function alignSegment(THREE, root, joint, end, desiredStart, desiredEnd) {
  const current = segmentDirection(THREE, joint, end);
  const desired = desiredEnd.clone().sub(desiredStart);
  if (!current || desired.lengthSq() < 1e-8) return;
  const turn = new THREE.Quaternion().setFromUnitVectors(current, desired.normalize()).normalize();
  setWorldQuaternion(THREE, joint, turn.multiply(worldQuaternion(THREE, joint)).normalize());
  root.updateMatrixWorld(true);
}

function applyFkProjection(THREE, meshyRoot, projected) {
  for (const chain of CHAINS) {
    alignSegment(THREE, meshyRoot, requireNode(meshyRoot, chain.target[0]), requireNode(meshyRoot, chain.target[1]), projected[chain.source[0]], projected[chain.source[1]]);
    alignSegment(THREE, meshyRoot, requireNode(meshyRoot, chain.target[1]), requireNode(meshyRoot, chain.target[2]), projected[chain.source[1]], projected[chain.source[2]]);
  }
}

function profileBlock(actorKey, nextKey) {
  const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
  const start = profiles.indexOf(`${actorKey}:`);
  if (start < 0) throw new Error(`missing profile block ${actorKey}`);
  const end = nextKey ? profiles.indexOf(`\n  ${nextKey}:`, start) : -1;
  return profiles.slice(start, end > start ? end : undefined);
}

function arrayFor(block, name, fallback) {
  const match = block.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`));
  return match ? match[1].split(',').map((value) => Number(value.trim())).filter(Number.isFinite) : fallback;
}

function stringFor(block, name, fallback) {
  const match = block.match(new RegExp(`${name}:\\s*['"]([^'"]+)['"]`));
  return match ? match[1] : fallback;
}

function numberFor(block, name, fallback) {
  const match = block.match(new RegExp(`${name}:\\s*([-0-9.]+)`));
  return match ? Number(match[1]) : fallback;
}

function parseWeaponConfig(actorKey, nextKey) {
  const block = profileBlock(actorKey, nextKey);
  const proxyStart = block.indexOf('weaponProxy:');
  const proxyEnd = block.indexOf('\n    weaponAttachment:', proxyStart);
  const proxy = block.slice(proxyStart, proxyEnd > proxyStart ? proxyEnd : undefined);
  const attachStart = block.indexOf('weaponAttachment:');
  const attachEndMarkers = ['\n    extraClipUrls:', '\n    ownClipOptions:', '\n    retargetOptions:', '\n    legSymmetry:', '\n    autoRetargetSources:'];
  const attachEnd = attachEndMarkers.map((marker) => block.indexOf(marker, attachStart)).filter((index) => index > attachStart).sort((a, b) => a - b)[0] || -1;
  const attachment = block.slice(attachStart, attachEnd > attachStart ? attachEnd : undefined);
  return {
    actorKey,
    proxy: {
      handBone: stringFor(proxy, 'handBone', ''),
      leftHandBone: stringFor(proxy, 'leftHandBone', ''),
      sourceSocketBone: stringFor(proxy, 'sourceSocketBone', ''),
      socketBone: stringFor(proxy, 'socketBone', 'WeaponGrip'),
      positionMode: stringFor(proxy, 'positionMode', ''),
      handLocalOffset: arrayFor(proxy, 'handLocalOffset', [0, 0, 0]),
      modelLocalOffset: arrayFor(proxy, 'modelLocalOffset', [0, 0, 0]),
      gripOffset: arrayFor(proxy, 'gripOffset', [0, 0, 0]),
      tipOffset: arrayFor(proxy, 'tipOffset', [0, 0, 0.85]),
    },
    attachment: {
      url: stringFor(attachment, 'url', ''),
      name: stringFor(attachment, 'name', 'Weapon'),
      socketBone: stringFor(attachment, 'socketBone', 'WeaponGrip'),
      tipMarker: stringFor(attachment, 'tipMarker', 'WeaponGrip_end'),
      scale: numberFor(attachment, 'scale', 1),
      position: arrayFor(attachment, 'position', [0, 0, 0]),
      rotationDeg: arrayFor(attachment, 'rotationDeg', [0, 0, 0]),
      gripLocalPosition: arrayFor(attachment, 'gripLocalPosition', [0, 0, 0]),
      tipLocalPosition: arrayFor(attachment, 'tipLocalPosition', [0, 0.85, 0]),
    },
  };
}

function eulerQuat(THREE, deg) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...deg.map((value) => THREE.MathUtils.degToRad(value || 0)), 'XYZ')).normalize();
}

function legacySocketState(THREE, actor, root, config) {
  if (actor === 'fps') {
    const sourceSocket = requireNode(root, 'Weapon.R');
    const local = vectorFrom(THREE, config.proxy.modelLocalOffset).add(vectorFrom(THREE, config.proxy.gripOffset));
    return {
      parent: sourceSocket,
      position: sourceSocket.localToWorld(local.clone()),
      quaternion: worldQuaternion(THREE, sourceSocket),
      stages: [
        { name: 'sourceSocket', object: sourceSocket.name, world: point(worldPosition(THREE, sourceSocket)) },
        { name: 'proxyLocalOffset', local: point(local) },
      ],
    };
  }
  const rightHand = requireNode(root, 'RightHand');
  const socketFromHand = rightHand.localToWorld(vectorFrom(THREE, config.proxy.handLocalOffset));
  const socketLocal = root.worldToLocal(socketFromHand.clone()).add(vectorFrom(THREE, config.proxy.modelLocalOffset)).add(vectorFrom(THREE, config.proxy.gripOffset));
  return {
    parent: root,
    position: root.localToWorld(socketLocal.clone()),
    quaternion: worldQuaternion(THREE, rightHand),
    stages: [
      { name: 'rightHand', object: rightHand.name, world: point(worldPosition(THREE, rightHand)) },
      { name: 'handLocalOffsetWorld', local: point(vectorFrom(THREE, config.proxy.handLocalOffset)), world: point(socketFromHand) },
      { name: 'modelLocalOffsetPlusGrip', local: point(vectorFrom(THREE, config.proxy.modelLocalOffset).add(vectorFrom(THREE, config.proxy.gripOffset))) },
      { name: 'socketLocalInActorRoot', local: point(socketLocal) },
    ],
  };
}

function legacyEndpointsFromSocket(THREE, socket, config) {
  const qLocal = eulerQuat(THREE, config.attachment.rotationDeg);
  const socketQ = socket.quaternion.clone().normalize();
  const hilt = socket.position.clone();
  const gripLocalRotated = vectorFrom(THREE, config.attachment.gripLocalPosition).multiplyScalar(config.attachment.scale).applyQuaternion(qLocal);
  const tipLocalRotated = vectorFrom(THREE, config.attachment.tipLocalPosition).multiplyScalar(config.attachment.scale).applyQuaternion(qLocal);
  const modelOrigin = hilt.clone().sub(gripLocalRotated.clone().applyQuaternion(socketQ));
  const tip = modelOrigin.clone().add(tipLocalRotated.clone().applyQuaternion(socketQ));
  return {
    hilt,
    tip,
    modelOrigin,
    gripLocalRotated,
    tipLocalRotated,
  };
}

function applyRuntimeWeaponAttachment(THREE, socket, weaponRoot, tip, config) {
  weaponRoot.scale.setScalar(Number(config.attachment.scale ?? 1));
  weaponRoot.rotation.set(...config.attachment.rotationDeg.map((value) => THREE.MathUtils.degToRad(value || 0)));
  if (Array.isArray(config.attachment.position)) weaponRoot.position.fromArray(config.attachment.position);
  else weaponRoot.position.set(0, 0, 0);
  const gripLocal = vectorFrom(THREE, config.attachment.gripLocalPosition).multiplyScalar(Number(config.attachment.scale ?? 1));
  gripLocal.applyQuaternion(weaponRoot.quaternion);
  weaponRoot.position.sub(gripLocal);
  const tipLocal = vectorFrom(THREE, config.attachment.tipLocalPosition).multiplyScalar(Number(config.attachment.scale ?? 1));
  tipLocal.applyQuaternion(weaponRoot.quaternion);
  tipLocal.add(weaponRoot.position);
  tip.position.copy(tipLocal);
  socket.add(weaponRoot);
  socket.add(tip);
  socket.updateMatrixWorld(true);
}

function createRuntimeWeaponScene(THREE, actor, root, config, weaponTemplate) {
  const rootSocket = new THREE.Bone();
  rootSocket.name = config.proxy.socketBone || config.attachment.socketBone || 'WeaponGrip';
  rootSocket.userData.syntheticWeaponBone = true;
  let parent;
  if (actor === 'fps') {
    parent = requireNode(root, 'Weapon.R');
    rootSocket.position.copy(vectorFrom(THREE, config.proxy.modelLocalOffset).add(vectorFrom(THREE, config.proxy.gripOffset)));
    parent.add(rootSocket);
  } else {
    parent = root;
    const rightHand = requireNode(root, 'RightHand');
    const rightWorld = rightHand.localToWorld(vectorFrom(THREE, config.proxy.handLocalOffset));
    const local = root.worldToLocal(rightWorld.clone()).add(vectorFrom(THREE, config.proxy.modelLocalOffset)).add(vectorFrom(THREE, config.proxy.gripOffset));
    rootSocket.position.copy(local);
    const modelWorldQuat = worldQuaternion(THREE, root).invert();
    rootSocket.quaternion.copy(modelWorldQuat.multiply(worldQuaternion(THREE, rightHand))).normalize();
    parent.add(rootSocket);
  }
  const weaponRoot = weaponTemplate.clone(true);
  weaponRoot.name = config.attachment.name || `${rootSocket.name}-model`;
  const tip = new THREE.Group();
  tip.name = config.attachment.tipMarker || 'WeaponGrip_end';
  applyRuntimeWeaponAttachment(THREE, rootSocket, weaponRoot, tip, config);
  root.updateMatrixWorld(true);
  return { parent, socket: rootSocket, weaponRoot, tip };
}

function removeRuntimeWeaponScene(scene) {
  if (scene?.parent && scene?.socket) scene.parent.remove(scene.socket);
}

function nodeChain(node) {
  const chain = [];
  let cursor = node;
  while (cursor) {
    chain.unshift(cursor.name || cursor.type || 'Object3D');
    cursor = cursor.parent;
  }
  return chain;
}

function collectMeshPoints(THREE, node, stride = 24, limit = 360) {
  const points = [];
  const v = new THREE.Vector3();
  node.updateMatrixWorld(true);
  node.traverse((child) => {
    const attr = child.isMesh ? child.geometry?.attributes?.position : null;
    if (!attr) return;
    for (let index = 0; index < attr.count; index += Math.max(1, stride)) {
      v.fromBufferAttribute(attr, index).applyMatrix4(child.matrixWorld);
      points.push(point(v, 4));
      if (points.length >= limit) return;
    }
  });
  return points;
}

function compareLandmark(THREE, label, legacy, rendered, trace) {
  const delta = distance(legacy, rendered);
  return {
    label,
    metricWorld: point(legacy),
    renderedWorld: point(rendered),
    distance: round(delta, 8),
    exactWithinEpsilon: delta <= EPSILON,
    trace,
  };
}

function stage(name, details = {}) {
  return { name, ...details };
}

function matrixArray(matrix) {
  return matrix.elements.map((value) => round(value, 6));
}

function actorTrace(THREE, actor, config, legacySocket, legacyEndpoints, runtime, renderedHilt, renderedTip) {
  const attachmentScale = Number(config.attachment.scale ?? 1);
  const qLocal = eulerQuat(THREE, config.attachment.rotationDeg);
  const gripUnrotated = vectorFrom(THREE, config.attachment.gripLocalPosition).multiplyScalar(attachmentScale);
  const tipUnrotated = vectorFrom(THREE, config.attachment.tipLocalPosition).multiplyScalar(attachmentScale);
  return {
    actor,
    hilt: [
      stage('source object', { object: actor === 'fps' ? 'Weapon.R sourceSocketBone' : 'RightHand handBone plus actor root local socket', parentNode: runtime.parent.name || runtime.parent.type }),
      ...legacySocket.stages,
      stage('runtime socket root', { object: runtime.socket.name, parentChain: nodeChain(runtime.socket), localPosition: point(runtime.socket.position), localQuaternion: point(runtime.socket.quaternion), worldMatrix: matrixArray(runtime.socket.matrixWorld) }),
      stage('metric hilt', { source: 'legacy diagnostic socket.position', world: point(legacyEndpoints.hilt) }),
      stage('rendered hilt marker', { source: 'runtime proxy.root world position', world: point(renderedHilt) }),
    ],
    tip: [
      stage('attachment local basis', { object: runtime.weaponRoot.name, rotationDeg: config.attachment.rotationDeg, scale: attachmentScale, localQuaternion: point(qLocal) }),
      stage('gripLocalPosition', { local: point(vectorFrom(THREE, config.attachment.gripLocalPosition)), scaled: point(gripUnrotated), rotatedScaled: point(legacyEndpoints.gripLocalRotated) }),
      stage('weapon model origin', { source: 'hilt - rotated gripLocalPosition', localPositionUnderSocket: point(runtime.weaponRoot.position), metricWorld: point(legacyEndpoints.modelOrigin), worldMatrix: matrixArray(runtime.weaponRoot.matrixWorld) }),
      stage('tipLocalPosition', { local: point(vectorFrom(THREE, config.attachment.tipLocalPosition)), scaled: point(tipUnrotated), rotatedScaled: point(legacyEndpoints.tipLocalRotated) }),
      stage('runtime tip marker', { object: runtime.tip.name, parentChain: nodeChain(runtime.tip), localPositionUnderSocket: point(runtime.tip.position), worldMatrix: matrixArray(runtime.tip.matrixWorld) }),
      stage('metric tip', { source: 'legacy diagnostic endpoint math', world: point(legacyEndpoints.tip) }),
      stage('rendered tip marker', { source: 'runtime tipMarker world position', world: point(renderedTip) }),
    ],
  };
}

function writePng(dataPath, pngPath) {
  const renderer = path.join(os.tmpdir(), 'pose-lab-metric-landmark-render.py');
  fs.writeFileSync(renderer, String.raw`#!/usr/bin/env python3
import json, sys, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
data=json.loads(Path(sys.argv[1]).read_text())
frames=data.get('renderFrames', [])
W,H=1900,1080
img=Image.new('RGB',(W,H),(7,10,14))
d=ImageDraw.Draw(img)
try:
  font=ImageFont.truetype('DejaVuSans.ttf',18)
  small=ImageFont.truetype('DejaVuSans.ttf',12)
except Exception:
  font=small=None
def valid(p): return isinstance(p,list) and len(p)>=3
def v(p): return p if valid(p) else [0,0,0]
def panel_bounds(points,panel,view):
  pts=[v(p) for p in points if valid(p)]
  if not pts: pts=[[0,0,0]]
  ai,bi=(0,1) if view=='front' else (0,2)
  mn_a,mx_a=min(p[ai] for p in pts),max(p[ai] for p in pts)
  mn_b,mx_b=min(p[bi] for p in pts),max(p[bi] for p in pts)
  span=max(mx_a-mn_a,mx_b-mn_b,0.001)
  return ((mn_a+mx_a)/2,(mn_b+mx_b)/2,min((panel[2]-panel[0])*0.78,(panel[3]-panel[1])*0.70)/span)
def project(p,panel,view,b):
  ai,bi=(0,1) if view=='front' else (0,2)
  p=v(p); cx,cy,s=b
  return ((panel[0]+panel[2])/2+(p[ai]-cx)*s,(panel[1]+panel[3])/2-(p[bi]-cy)*s)
def dot(p,panel,view,b,c,r=5,outline=None):
  x,y=project(p,panel,view,b)
  d.ellipse([x-r,y-r,x+r,y+r],fill=c,outline=outline)
def line(a,bp,panel,view,b,c,w=2):
  d.line([project(a,panel,view,b),project(bp,panel,view,b)],fill=c,width=w)
d.text((18,14),'Metric Landmark Audit: actual saber mesh points plus exact measured hilt/tip markers',fill=(255,244,190),font=font)
summary=data.get('summary',{})
d.text((18,40),f"metricTrustworthy={summary.get('metricTrustworthy')} firstDivergence={summary.get('firstDivergence','none')} maxMetricVsMarker={summary.get('maxMetricVsMarkerDistance')}",fill=(205,214,226),font=small)
d.text((18,58),'cyan/orange = exact rendered metric hilt/tip markers; green/red mesh points = actual FPS/Meshy saber geometry',fill=(164,181,201),font=small)
cols=max(1,len(frames))
panel_w=W//cols
panel_h=(H-96)//4
rows=[('fps','front'),('fps','top'),('meshy','front'),('meshy','top')]
for fi,frame in enumerate(frames):
  for ri,(actor,view) in enumerate(rows):
    panel=(fi*panel_w+6,92+ri*panel_h,(fi+1)*panel_w-6,92+(ri+1)*panel_h-8)
    layer=frame.get(actor,{})
    mesh=layer.get('meshPoints',[])
    pts=mesh+[layer.get('renderedHilt'),layer.get('renderedTip'),layer.get('metricHilt'),layer.get('metricTip')]
    b=panel_bounds(pts,panel,view)
    d.rectangle(panel,outline=(52,64,82),width=1)
    d.text((panel[0]+6,panel[1]+5),f"{actor.upper()} t={frame.get('time'):.3f} {view}",fill=(226,232,240),font=small)
    mesh_color=(52,211,153) if actor=='fps' else (248,113,113)
    for p in mesh:
      x,y=project(p,panel,view,b)
      d.point((x,y),fill=mesh_color)
    if valid(layer.get('renderedHilt')) and valid(layer.get('renderedTip')):
      line(layer.get('renderedHilt'),layer.get('renderedTip'),panel,view,b,(250,204,21),2)
    dot(layer.get('renderedHilt'),panel,view,b,(34,211,238),6,(255,255,255))
    dot(layer.get('renderedTip'),panel,view,b,(251,146,60),6,(255,255,255))
    dot(layer.get('metricHilt'),panel,view,b,(14,165,233),3)
    dot(layer.get('metricTip'),panel,view,b,(249,115,22),3)
    d.text((panel[0]+6,panel[3]-34),f"hilt delta={layer.get('hiltDistance')} tip delta={layer.get('tipDistance')}",fill=(248,220,160),font=small)
    d.text((panel[0]+6,panel[3]-18),f"marker sits on mesh? visual audit required",fill=(164,181,201),font=small)
out=Path(sys.argv[2]); out.parent.mkdir(parents=True,exist_ok=True); img.save(out)
`);
  execFileSync('python3', [renderer, dataPath, pngPath], { stdio: 'pipe' });
}

function writeTrace(outDir, payload) {
  const lines = [
    '# Metric Landmark Transform Trace',
    '',
    `Generated: ${payload.generatedAt}`,
    `Clip: ${payload.clip}`,
    `Metric trustworthy: ${payload.summary.metricTrustworthy}`,
    `First divergence: ${payload.summary.firstDivergence || 'none'}`,
    '',
    'This audit stops at marker parity. It does not repair or tune production retargeting, FK, roll, weapon basis, or attachment offsets.',
    '',
    '## Landmark Answers',
  ];
  for (const actor of ['fps', 'meshy']) {
    const result = payload.summary.byActor[actor];
    lines.push(`- ${actor.toUpperCase()} hilt: metric point exactly equals rendered point = ${result.hiltExact}`);
    lines.push(`- ${actor.toUpperCase()} tip: metric point exactly equals rendered point = ${result.tipExact}`);
  }
  lines.push('', '## Failure Classification');
  if (payload.summary.metricTrustworthy) {
    lines.push('- No metric-vs-rendered-marker divergence was found above epsilon.');
    lines.push('- This proves only that the diagnostic marker equals its rendered marker. It does not prove the chosen local landmark is semantically the true hilt center or blade tip; inspect the overlay for that.');
  } else {
    lines.push(`- Stop reason: ${payload.summary.stopReason}`);
    lines.push(`- First divergent transform: ${payload.summary.firstDivergence}`);
  }
  lines.push('', '## Per-Frame Trace Summary');
  for (const frame of payload.reports.perFrame) {
    lines.push(`### Frame ${frame.index} time ${frame.time}`);
    for (const actor of ['fps', 'meshy']) {
      const entry = frame[actor];
      lines.push(`- ${actor.toUpperCase()} hilt metric ${JSON.stringify(entry.hilt.metricWorld)} rendered ${JSON.stringify(entry.hilt.renderedWorld)} delta ${entry.hilt.distance}`);
      lines.push(`- ${actor.toUpperCase()} tip metric ${JSON.stringify(entry.tip.metricWorld)} rendered ${JSON.stringify(entry.tip.renderedWorld)} delta ${entry.tip.distance}`);
      lines.push(`- ${actor.toUpperCase()} parent check: hilt parent=${entry.parentAudit.hiltParent}; tip parent=${entry.parentAudit.tipParent}; source object=${entry.parentAudit.sourceObject}`);
    }
  }
  lines.push('', '## Detailed First Frame Chains');
  const first = payload.reports.perFrame[0];
  for (const actor of ['fps', 'meshy']) {
    lines.push(`### ${actor.toUpperCase()} Hilt`);
    for (const step of first[actor].transformTrace.hilt) lines.push(`- ${step.name}: ${JSON.stringify(step)}`);
    lines.push(`### ${actor.toUpperCase()} Tip`);
    for (const step of first[actor].transformTrace.tip) lines.push(`- ${step.name}: ${JSON.stringify(step)}`);
  }
  fs.writeFileSync(path.join(outDir, 'transform_trace.md'), lines.join('\n') + '\n');
}

async function main() {
  const args = parseArgs(process.argv);
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/FPSPlayer.glb'));
  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'));
  const saber = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb'));
  const fpsRoot = fps.scene;
  const meshyRoot = meshy.scene;
  const clip = fps.animations.find((entry) => entry.name === args.clip);
  const tpose = fps.animations.find((entry) => entry.name === '0T-Pose');
  if (!clip || !tpose) throw new Error(`missing ${args.clip} or 0T-Pose`);
  const fpsLoadPose = capturePose(fpsRoot);
  const meshyLoadPose = capturePose(meshyRoot);
  const fpsRestMap = clipRestQuaternionMap(THREE, fpsRoot, tpose);
  restorePose(fpsRoot, fpsLoadPose);
  restorePose(meshyRoot, meshyLoadPose);
  const meshyBindMap = bindRestLocalMap(THREE, meshyRoot);
  const calibratedRestMap = calibratedMeshyRestMap(THREE, fpsRoot, meshyRoot, fpsRestMap, meshyBindMap);
  const fpsConfig = parseWeaponConfig('player', 'arcane');
  const meshyConfig = parseWeaponConfig('meshyCharacter', 'meshyStatic');
  const scale = uniformProjectionScale(THREE, fpsRoot, meshyRoot);
  const sourceFrame = requireNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = requireNode(meshyRoot, 'Spine02');
  const times = keyTimesForImportantBones(clip);
  const rows = [];
  let maxMetricVsMarkerDistance = 0;
  let firstDivergence = null;
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    restorePose(fpsRoot, fpsLoadPose);
    restorePose(meshyRoot, meshyLoadPose);
    applyLocalRest(meshyRoot, calibratedRestMap);
    applyClipPose(THREE, fpsRoot, clip, time);
    const projected = projectSourceJoints(THREE, fpsRoot, meshyRoot, scale);
    applyFkProjection(THREE, meshyRoot, projected);
    const frame = { index, time };
    for (const actor of ['fps', 'meshy']) {
      const root = actor === 'fps' ? fpsRoot : meshyRoot;
      const config = actor === 'fps' ? fpsConfig : meshyConfig;
      const runtime = createRuntimeWeaponScene(THREE, actor, root, config, saber.scene);
      root.updateMatrixWorld(true);
      const legacySocket = legacySocketState(THREE, actor, root, config);
      const legacyEndpoints = legacyEndpointsFromSocket(THREE, legacySocket, config);
      const renderedHilt = worldPosition(THREE, runtime.socket);
      const renderedTip = worldPosition(THREE, runtime.tip);
      const hilt = compareLandmark(THREE, 'hilt', legacyEndpoints.hilt, renderedHilt, []);
      const tip = compareLandmark(THREE, 'tip', legacyEndpoints.tip, renderedTip, []);
      const transformTrace = actorTrace(THREE, actor, config, legacySocket, legacyEndpoints, runtime, renderedHilt, renderedTip);
      hilt.trace = transformTrace.hilt;
      tip.trace = transformTrace.tip;
      const actorRow = {
        hilt,
        tip,
        metricHilt: hilt.metricWorld,
        metricTip: tip.metricWorld,
        renderedHilt: hilt.renderedWorld,
        renderedTip: tip.renderedWorld,
        hiltDistance: hilt.distance,
        tipDistance: tip.distance,
        parentAudit: {
          sourceObject: actor === 'fps' ? 'Weapon.R' : 'RightHand',
          hiltParent: runtime.socket.parent?.name || runtime.socket.parent?.type || '',
          tipParent: runtime.tip.parent?.name || runtime.tip.parent?.type || '',
          modelParent: runtime.weaponRoot.parent?.name || runtime.weaponRoot.parent?.type || '',
        },
        transformTrace,
        meshPoints: collectMeshPoints(THREE, runtime.weaponRoot, args.meshSampleStride),
      };
      for (const entry of [hilt, tip]) {
        maxMetricVsMarkerDistance = Math.max(maxMetricVsMarkerDistance, entry.distance);
        if (!firstDivergence && entry.distance > EPSILON) {
          firstDivergence = {
            frame: index,
            time,
            actor,
            landmark: entry.label,
            distance: entry.distance,
            likelyCause: 'metric formula and runtime scene graph disagree before downstream blade-vector calculations',
          };
        }
      }
      frame[actor] = actorRow;
      removeRuntimeWeaponScene(runtime);
    }
    const fpsProjectedHilt = fromFrameLocal(THREE, targetFrame, toFrameLocal(THREE, sourceFrame, vectorFrom(THREE, frame.fps.renderedHilt)).multiplyScalar(scale));
    const fpsProjectedTip = fromFrameLocal(THREE, targetFrame, toFrameLocal(THREE, sourceFrame, vectorFrom(THREE, frame.fps.renderedTip)).multiplyScalar(scale));
    frame.crossRigContext = {
      note: 'Context only; not used for marker parity pass/fail.',
      projectedFpsHiltInMeshyFrame: point(fpsProjectedHilt),
      projectedFpsTipInMeshyFrame: point(fpsProjectedTip),
      meshyRenderedHilt: frame.meshy.renderedHilt,
      meshyRenderedTip: frame.meshy.renderedTip,
    };
    rows.push(frame);
  }
  const byActor = {};
  for (const actor of ['fps', 'meshy']) {
    byActor[actor] = {
      hiltExact: rows.every((row) => row[actor].hilt.exactWithinEpsilon),
      tipExact: rows.every((row) => row[actor].tip.exactWithinEpsilon),
      maxHiltDistance: round(Math.max(...rows.map((row) => row[actor].hilt.distance)), 8),
      maxTipDistance: round(Math.max(...rows.map((row) => row[actor].tip.distance)), 8),
    };
  }
  const summary = {
    metricTrustworthy: !firstDivergence,
    stopReason: firstDivergence ? 'metric/rendered marker parity failed; do not trust downstream blade vector metrics' : 'marker parity established; downstream metrics may proceed to semantic landmark review',
    firstDivergence,
    maxMetricVsMarkerDistance: round(maxMetricVsMarkerDistance, 8),
    epsilon: EPSILON,
    byActor,
    semanticLandmarkReviewRequired: true,
    semanticLandmarkNote: 'Even when metric and rendered marker positions match, the overlay must still be inspected to prove those markers sit on the physical hilt center and blade tip of the actual mesh.',
  };
  const renderFrames = [];
  const renderEvery = Math.max(1, Math.floor(rows.length / Math.max(1, Number(args.maxRenderFrames || 8))));
  for (let index = 0; index < rows.length; index += 1) {
    if (index % renderEvery === 0 || index === rows.length - 1) {
      const row = rows[index];
      renderFrames.push({
        index: row.index,
        time: row.time,
        fps: {
          metricHilt: row.fps.metricHilt,
          metricTip: row.fps.metricTip,
          renderedHilt: row.fps.renderedHilt,
          renderedTip: row.fps.renderedTip,
          hiltDistance: row.fps.hiltDistance,
          tipDistance: row.fps.tipDistance,
          meshPoints: row.fps.meshPoints,
        },
        meshy: {
          metricHilt: row.meshy.metricHilt,
          metricTip: row.meshy.metricTip,
          renderedHilt: row.meshy.renderedHilt,
          renderedTip: row.meshy.renderedTip,
          hiltDistance: row.meshy.hiltDistance,
          tipDistance: row.meshy.tipDistance,
          meshPoints: row.meshy.meshPoints,
        },
      });
    }
  }
  const payload = {
    schema: 'pose-lab-metric-landmark-audit-v1',
    generatedAt: new Date().toISOString(),
    diagnosticOnly: true,
    productionBehaviorModified: false,
    noCorrectiveSolver: true,
    noAttachmentTuning: true,
    clip: args.clip,
    sourceKeyCount: times.length,
    sourceKeyTimes: times,
    coordinateBridge: {
      targetBaseline: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]',
      policy: 'audit landmark measurement against runtime-style rendered marker scene graph; no production retarget edits',
      scale: round(scale, 6),
    },
    attachmentSnapshots: {
      fps: fpsConfig,
      meshy: meshyConfig,
    },
    reports: { perFrame: rows },
    summary,
    renderFrames,
  };
  fs.mkdirSync(args.out, { recursive: true });
  const dataPath = path.join(args.out, 'metric_landmark_audit.json');
  const pngPath = path.join(args.out, 'metric_landmark_overlay.png');
  const tracePath = path.join(args.out, 'transform_trace.md');
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2) + '\n');
  writeTrace(args.out, payload);
  writePng(dataPath, pngPath);
  console.log(JSON.stringify({
    ok: true,
    data: path.relative(projectRoot, dataPath),
    png: path.relative(projectRoot, pngPath),
    transformTrace: path.relative(projectRoot, tracePath),
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
