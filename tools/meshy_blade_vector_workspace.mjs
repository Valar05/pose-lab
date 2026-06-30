#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'blade_vector_workspace');
const SOURCE_BONES = ['ShoulderCenter', 'Arm.R', 'Forearm.R', 'Hand.R', 'Weapon.R', 'Arm.L', 'Forearm.L', 'Hand.L'];
const CHAINS = [
  { source: ['Arm.R', 'Forearm.R', 'Hand.R'], target: ['RightArm', 'RightForeArm', 'RightHand'] },
  { source: ['Arm.L', 'Forearm.L', 'Hand.L'], target: ['LeftArm', 'LeftForeArm', 'LeftHand'] },
];
const THRESHOLDS = {
  hiltSmall: 0.08,
  directionLargeDeg: 12,
  directionSmallDeg: 8,
  lengthRatioMismatch: 0.08,
};

function parseArgs(argv) {
  const args = { out: defaultOut, clip: 'OneHandReady', maxRenderFrames: 9 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--clip') args.clip = argv[++i] || args.clip;
    else if (arg.startsWith('--clip=')) args.clip = arg.slice('--clip='.length);
    else if (arg === '--max-render-frames') args.maxRenderFrames = Number(argv[++i] || args.maxRenderFrames);
    else if (arg.startsWith('--max-render-frames=')) args.maxRenderFrames = Number(arg.slice('--max-render-frames='.length));
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

function point(vector) {
  return [round(vector.x), round(vector.y), round(vector.z)];
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function max(values) {
  return values.length ? Math.max(...values) : 0;
}

function worldPosition(THREE, node) {
  return node.getWorldPosition(new THREE.Vector3());
}

function worldQuaternion(THREE, node) {
  return node.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

function worldDirection(THREE, node, axis = [0, 1, 0]) {
  return new THREE.Vector3(Number(axis[0] || 0), Number(axis[1] || 0), Number(axis[2] || 0)).normalize().applyQuaternion(worldQuaternion(THREE, node)).normalize();
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
  return avg(CHAINS.map((chain) => chainLength(THREE, requireNode(meshyRoot, chain.target[0]), requireNode(meshyRoot, chain.target[1]), requireNode(meshyRoot, chain.target[2])) / Math.max(0.0001, chainLength(THREE, requireNode(fpsRoot, chain.source[0]), requireNode(fpsRoot, chain.source[1]), requireNode(fpsRoot, chain.source[2])))));
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

function eulerQuat(THREE, deg) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...deg.map((value) => THREE.MathUtils.degToRad(value || 0)), 'XYZ')).normalize();
}

function angleDeg(THREE, a, b) {
  if (!a || !b || a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return 0;
  return THREE.MathUtils.radToDeg(a.clone().normalize().angleTo(b.clone().normalize()));
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
  const attachEndMarkers = ['\n    extraClipUrls:', '\n    ownClipOptions:', '\n    retargetOptions:', '\n    legSymmetry:'];
  const attachEnd = attachEndMarkers.map((marker) => block.indexOf(marker, attachStart)).filter((index) => index > attachStart).sort((a, b) => a - b)[0] || -1;
  const attachment = block.slice(attachStart, attachEnd > attachStart ? attachEnd : undefined);
  return {
    actorKey,
    proxy: {
      handLocalOffset: arrayFor(proxy, 'handLocalOffset', [0, 0, 0]),
      modelLocalOffset: arrayFor(proxy, 'modelLocalOffset', [0, 0, 0]),
      gripOffset: arrayFor(proxy, 'gripOffset', [0, 0, 0]),
      tipOffset: arrayFor(proxy, 'tipOffset', [0, 0, 0.85]),
    },
    attachment: {
      scale: numberFor(attachment, 'scale', 1),
      rotationDeg: arrayFor(attachment, 'rotationDeg', [0, 0, 0]),
      gripLocalPosition: arrayFor(attachment, 'gripLocalPosition', [0, 0, 0]),
      tipLocalPosition: arrayFor(attachment, 'tipLocalPosition', [0, 0.85, 0]),
    },
  };
}

function weaponEndpointsFromSocket(THREE, socket, config) {
  const qLocal = eulerQuat(THREE, config.attachment.rotationDeg);
  const socketQ = socket.quaternion.clone().normalize();
  const hilt = socket.position.clone();
  const gripLocal = new THREE.Vector3().fromArray(config.attachment.gripLocalPosition).multiplyScalar(config.attachment.scale).applyQuaternion(qLocal);
  const tipLocal = new THREE.Vector3().fromArray(config.attachment.tipLocalPosition).multiplyScalar(config.attachment.scale).applyQuaternion(qLocal);
  const modelOrigin = hilt.clone().sub(gripLocal.clone().applyQuaternion(socketQ));
  const tip = modelOrigin.clone().add(tipLocal.clone().applyQuaternion(socketQ));
  const vector = tip.clone().sub(hilt);
  return {
    hilt,
    tip,
    vector,
    direction: vector.lengthSq() > 1e-8 ? vector.clone().normalize() : new THREE.Vector3(0, 0, 1),
    length: hilt.distanceTo(tip),
  };
}

function fpsSocketState(THREE, fpsRoot, config) {
  const sourceSocket = requireNode(fpsRoot, 'Weapon.R');
  const local = new THREE.Vector3().fromArray(config.proxy.modelLocalOffset).add(new THREE.Vector3().fromArray(config.proxy.gripOffset));
  return {
    position: sourceSocket.localToWorld(local),
    quaternion: worldQuaternion(THREE, sourceSocket),
  };
}

function meshySocketState(THREE, meshyRoot, config) {
  const rightHand = requireNode(meshyRoot, 'RightHand');
  const socketFromHand = rightHand.localToWorld(new THREE.Vector3().fromArray(config.proxy.handLocalOffset));
  const socketLocal = meshyRoot.worldToLocal(socketFromHand.clone()).add(new THREE.Vector3().fromArray(config.proxy.modelLocalOffset)).add(new THREE.Vector3().fromArray(config.proxy.gripOffset));
  return {
    position: meshyRoot.localToWorld(socketLocal.clone()),
    quaternion: worldQuaternion(THREE, rightHand),
  };
}

function projectWorldPoint(THREE, pointWorld, sourceFrame, targetFrame, scale) {
  return fromFrameLocal(THREE, targetFrame, toFrameLocal(THREE, sourceFrame, pointWorld).multiplyScalar(scale));
}

function projectWeaponEndpoints(THREE, endpoints, sourceFrame, targetFrame, scale) {
  const hilt = projectWorldPoint(THREE, endpoints.hilt, sourceFrame, targetFrame, scale);
  const tip = projectWorldPoint(THREE, endpoints.tip, sourceFrame, targetFrame, scale);
  const vector = tip.clone().sub(hilt);
  return {
    hilt,
    tip,
    vector,
    direction: vector.lengthSq() > 1e-8 ? vector.clone().normalize() : new THREE.Vector3(0, 0, 1),
    length: hilt.distanceTo(tip),
  };
}

function classifyFrame(row, restGood = false, index = 0) {
  const hiltSmall = row.hiltDistance <= THRESHOLDS.hiltSmall;
  const directionLarge = row.bladeDirectionAngleDeg >= THRESHOLDS.directionLargeDeg;
  const directionSmall = row.bladeDirectionAngleDeg <= THRESHOLDS.directionSmallDeg;
  const lengthMismatch = Math.abs(row.bladeLengthRatio - 1) >= THRESHOLDS.lengthRatioMismatch;
  if (!hiltSmall) return 'attachment-placement';
  if (restGood && index > 0 && (directionLarge || row.tipDistance > THRESHOLDS.hiltSmall)) return 'animated-socket-rotation';
  if (directionLarge) return 'orientation/basis';
  if (directionSmall && lengthMismatch) return 'scale-or-tip-landmark';
  return 'within-threshold';
}

function aggregate(rows) {
  const classificationCounts = {};
  for (const row of rows) classificationCounts[row.classification] = (classificationCounts[row.classification] || 0) + 1;
  const sorted = Object.entries(classificationCounts).sort((a, b) => b[1] - a[1]);
  const [topClass, topCount] = sorted[0] || ['mixed', 0];
  const dominantClass = topCount >= rows.length * 0.5 ? topClass : 'mixed';
  return {
    averageSocketGripError: round(avg(rows.map((row) => row.socketGripDistance))),
    maxSocketGripError: round(max(rows.map((row) => row.socketGripDistance))),
    averageHiltError: round(avg(rows.map((row) => row.hiltDistance))),
    maxHiltError: round(max(rows.map((row) => row.hiltDistance))),
    averageBladeDirectionErrorDeg: round(avg(rows.map((row) => row.bladeDirectionAngleDeg)), 3),
    maxBladeDirectionErrorDeg: round(max(rows.map((row) => row.bladeDirectionAngleDeg)), 3),
    averageBladeLengthRatio: round(avg(rows.map((row) => row.bladeLengthRatio)), 5),
    averageTipError: round(avg(rows.map((row) => row.tipDistance))),
    maxTipError: round(max(rows.map((row) => row.tipDistance))),
    classificationCounts,
    dominantClass,
  };
}

function recommendationFor(dominantClass) {
  if (dominantClass === 'orientation/basis') return 'Fix Meshy attachment rotation/basis before changing arm motion or placement.';
  if (dominantClass === 'scale-or-tip-landmark') return 'Fix Meshy weapon scale or tipLocalPosition; hilt and direction are already aligned.';
  if (dominantClass === 'animated-socket-rotation') return 'Inspect animated WeaponGrip/RightHand orientation over OneHandReady keys; rest placement is not the dominant issue.';
  if (dominantClass === 'attachment-placement') return 'Align the actual attachment hilt/grip landmark or offset before blade-basis or scale fixes.';
  return 'Use per-frame classifications to separate placement, basis, and length before promoting a production fix.';
}

function writePng(dataPath, pngPath) {
  const renderer = path.join(os.tmpdir(), 'pose-lab-blade-vector-render.py');
  fs.writeFileSync(renderer, String.raw`#!/usr/bin/env python3
import json, sys, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
data=json.loads(Path(sys.argv[1]).read_text())
frames=data.get('renderFrames', [])
W,H=1800,940
img=Image.new('RGB',(W,H),(6,9,13)); d=ImageDraw.Draw(img)
try:
  font=ImageFont.truetype('DejaVuSans.ttf',18); small=ImageFont.truetype('DejaVuSans.ttf',12)
except Exception:
  font=small=None
def v(p): return p if isinstance(p,list) and len(p)>=3 else [0,0,0]
def bounds(frame,panel,view):
  keys=['fpsHilt','fpsTip','meshyHilt','meshyTip']
  pts=[v(frame.get(k)) for k in keys if frame.get(k)]
  ai,bi=(0,2) if view=='top' else (0,1)
  mn_a,mx_a=min(p[ai] for p in pts),max(p[ai] for p in pts)
  mn_b,mx_b=min(p[bi] for p in pts),max(p[bi] for p in pts)
  span=max(mx_a-mn_a,mx_b-mn_b,.001)
  return ((mn_a+mx_a)/2,(mn_b+mx_b)/2,min((panel[2]-panel[0])*.70,(panel[3]-panel[1])*.70)/span)
def project(p,panel,view,b):
  ai,bi=(0,2) if view=='top' else (0,1)
  cx,cy,s=b; p=v(p)
  return ((panel[0]+panel[2])/2+(p[ai]-cx)*s,(panel[1]+panel[3])/2-(p[bi]-cy)*s)
def dot(p,panel,view,b,c,r=5):
  x,y=project(p,panel,view,b); d.ellipse([x-r,y-r,x+r,y+r],fill=c)
def line(a,bp,panel,view,b,c,w=3):
  d.line([project(a,panel,view,b),project(bp,panel,view,b)],fill=c,width=w)
d.text((18,14),'Blade Vector Workspace: FPS projected blade green, Meshy actual blade red, hilt/tip points shown per key',fill=(255,240,180),font=font)
summary=data.get('summary',{})
d.text((18,40),f"dominant={summary.get('dominantClass')} avgHilt={summary.get('averageHiltError')} avgAngle={summary.get('averageBladeDirectionErrorDeg')} avgLenRatio={summary.get('averageBladeLengthRatio')} avgTip={summary.get('averageTipError')}",fill=(202,213,226),font=small)
panel_w=W//max(1,len(frames)); panel_h=(H-80)//2
for fi,frame in enumerate(frames):
  for vi,view in enumerate(['front','top']):
    panel=(fi*panel_w+8,72+vi*panel_h,(fi+1)*panel_w-8,72+(vi+1)*panel_h-10)
    b=bounds(frame,panel,view)
    d.rectangle(panel,outline=(51,65,85),width=1)
    d.text((panel[0]+6,panel[1]+5),f"t={frame.get('time'):.3f} {view}",fill=(226,232,240),font=small)
    line(frame.get('fpsHilt'),frame.get('fpsTip'),panel,view,b,(34,197,94),5)
    line(frame.get('meshyHilt'),frame.get('meshyTip'),panel,view,b,(248,113,113),4)
    line(frame.get('fpsTip'),frame.get('meshyTip'),panel,view,b,(250,204,21),1)
    dot(frame.get('fpsHilt'),panel,view,b,(52,211,153),6)
    dot(frame.get('fpsTip'),panel,view,b,(187,247,208),5)
    dot(frame.get('meshyHilt'),panel,view,b,(239,68,68),6)
    dot(frame.get('meshyTip'),panel,view,b,(252,165,165),5)
    d.text((panel[0]+6,panel[3]-48),f"angle={frame.get('bladeDirectionAngleDeg')} len fps/m={frame.get('fpsBladeLength')}/{frame.get('meshyBladeLength')}",fill=(248,220,160),font=small)
    d.text((panel[0]+6,panel[3]-31),f"hilt={frame.get('hiltDistance')} tip={frame.get('tipDistance')} {frame.get('classification')}",fill=(248,220,160),font=small)
out=Path(sys.argv[2]); out.parent.mkdir(parents=True,exist_ok=True); img.save(out)
`);
  execFileSync('python3', [renderer, dataPath, pngPath], { stdio: 'pipe' });
}

function writeSummary(outDir, payload) {
  const s = payload.summary;
  const lines = [
    '# Blade Vector Workspace Diagnostic',
    '',
    `Generated: ${payload.generatedAt}`,
    `Clip: ${payload.clip}`,
    `Dominant failure class: ${s.dominantClass}`,
    `Recommendation: ${s.recommendation}`,
    '',
    '## Aggregate Metrics',
    `- Average socket/grip error: ${s.averageSocketGripError}`,
    `- Average attachment hilt error: ${s.averageHiltError}`,
    `- Average blade direction error: ${s.averageBladeDirectionErrorDeg} deg`,
    `- Average blade length ratio: ${s.averageBladeLengthRatio}`,
    `- Average tip error: ${s.averageTipError}`,
    '',
    '## Classification Counts',
    ...Object.entries(s.classificationCounts).map(([name, count]) => `- ${name}: ${count}`),
    '',
    '## Interpretation',
    ...payload.diagnostics.findings.map((finding, index) => `${index + 1}. ${finding}`),
    '',
    'This is diagnostic-only. It does not modify FK, roll, production retarget behavior, startup clips, aliases, accepted baselines, or production retarget settings.',
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'diagnostic_summary.md'), lines.join('\n'));
}

async function main() {
  const args = parseArgs(process.argv);
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/FPSPlayer.glb'));
  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'));
  const fpsRoot = fps.scene;
  const meshyRoot = meshy.scene;
  const clip = fps.animations.find((entry) => entry.name === args.clip);
  const tpose = fps.animations.find((entry) => entry.name === '0T-Pose');
  if (!clip || !tpose) throw new Error('missing OneHandReady or 0T-Pose');
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
  const baseRows = [];
  for (let index = 0; index < times.length; index += 1) {
    const time = times[index];
    restorePose(fpsRoot, fpsLoadPose);
    restorePose(meshyRoot, meshyLoadPose);
    applyLocalRest(meshyRoot, calibratedRestMap);
    applyClipPose(THREE, fpsRoot, clip, time);
    const projected = projectSourceJoints(THREE, fpsRoot, meshyRoot, scale);
    applyFkProjection(THREE, meshyRoot, projected);
    const fpsSocket = fpsSocketState(THREE, fpsRoot, fpsConfig);
    const meshySocket = meshySocketState(THREE, meshyRoot, meshyConfig);
    const fpsSocketProjected = projectWorldPoint(THREE, fpsSocket.position, sourceFrame, targetFrame, scale);
    const fpsWeapon = weaponEndpointsFromSocket(THREE, fpsSocket, fpsConfig);
    const fpsProjected = projectWeaponEndpoints(THREE, fpsWeapon, sourceFrame, targetFrame, scale);
    const meshyWeapon = weaponEndpointsFromSocket(THREE, meshySocket, meshyConfig);
    const lengthRatio = meshyWeapon.length / Math.max(0.0001, fpsProjected.length);
    baseRows.push({
      index,
      time,
      socketGripDistance: round(meshySocket.position.distanceTo(fpsSocketProjected)),
      hiltDistance: round(meshyWeapon.hilt.distanceTo(fpsProjected.hilt)),
      fpsBladeLength: round(fpsProjected.length),
      meshyBladeLength: round(meshyWeapon.length),
      bladeLengthRatio: round(lengthRatio, 5),
      bladeDirectionAngleDeg: round(angleDeg(THREE, fpsProjected.vector, meshyWeapon.vector), 3),
      tipDistance: round(meshyWeapon.tip.distanceTo(fpsProjected.tip)),
      fpsHilt: point(fpsProjected.hilt),
      fpsTip: point(fpsProjected.tip),
      fpsSocket: point(fpsSocketProjected),
      fpsBladeVector: point(fpsProjected.vector),
      meshyHilt: point(meshyWeapon.hilt),
      meshyTip: point(meshyWeapon.tip),
      meshySocket: point(meshySocket.position),
      meshyBladeVector: point(meshyWeapon.vector),
    });
  }
  const rest = baseRows[0] || {};
  const restGood = rest.hiltDistance <= THRESHOLDS.hiltSmall
    && rest.bladeDirectionAngleDeg <= THRESHOLDS.directionSmallDeg
    && Math.abs((rest.bladeLengthRatio || 1) - 1) < THRESHOLDS.lengthRatioMismatch;
  const rows = baseRows.map((row, index) => ({ ...row, classification: classifyFrame(row, restGood, index) }));
  const summary = aggregate(rows);
  summary.restGood = restGood;
  summary.recommendation = recommendationFor(summary.dominantClass);
  const renderFrames = [];
  const renderEvery = Math.max(1, Math.floor(rows.length / Math.max(1, Number(args.maxRenderFrames || 9))));
  for (let index = 0; index < rows.length; index += 1) {
    if (index % renderEvery === 0 || index === rows.length - 1) renderFrames.push(rows[index]);
  }
  const diagnostics = {
    dominantClass: summary.dominantClass,
    thresholds: THRESHOLDS,
    findings: [
      `Average socket/grip error is ${summary.averageSocketGripError}; this separates arm socket alignment from actual attachment hilt landmark alignment.`,
      `Average hilt error is ${summary.averageHiltError}; hilt placement is ${summary.averageHiltError <= THRESHOLDS.hiltSmall ? 'inside' : 'outside'} the small-error threshold ${THRESHOLDS.hiltSmall}.`,
      `Average blade direction error is ${summary.averageBladeDirectionErrorDeg} deg; this ${summary.averageBladeDirectionErrorDeg >= THRESHOLDS.directionLargeDeg ? 'exceeds' : 'does not exceed'} the large-direction threshold ${THRESHOLDS.directionLargeDeg} deg.`,
      `Average blade length ratio is ${summary.averageBladeLengthRatio}; length is ${Math.abs(summary.averageBladeLengthRatio - 1) >= THRESHOLDS.lengthRatioMismatch ? 'meaningfully mismatched' : 'within tolerance'} by the ${THRESHOLDS.lengthRatioMismatch} ratio threshold.`,
      `Dominant class is ${summary.dominantClass}, so the single next production fix is: ${summary.recommendation}`,
    ],
  };
  const payload = {
    schema: 'pose-lab-meshy-blade-vector-workspace-v1',
    generatedAt: new Date().toISOString(),
    diagnosticOnly: true,
    productionBehaviorModified: false,
    clip: args.clip,
    sourceKeyCount: times.length,
    sourceKeyTimes: times,
    coordinateBridge: {
      targetBaseline: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]',
      policy: 'project FPS hilt/tip through calibrated T-pose frame; fixed FK arm projection; no IK, no roll, no retarget mutation',
      scale: round(scale, 6),
    },
    attachmentSnapshots: {
      fps: fpsConfig,
      meshy: meshyConfig,
    },
    thresholds: THRESHOLDS,
    reports: {
      perFrame: rows,
    },
    summary,
    diagnostics,
    renderFrames,
  };
  fs.mkdirSync(args.out, { recursive: true });
  const dataPath = path.join(args.out, 'blade_vector_workspace.json');
  const pngPath = path.join(args.out, 'blade_vector_workspace.png');
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2) + '\n');
  writeSummary(args.out, payload);
  writePng(dataPath, pngPath);
  console.log(JSON.stringify({
    ok: true,
    data: path.relative(projectRoot, dataPath),
    png: path.relative(projectRoot, pngPath),
    diagnosticSummary: path.relative(projectRoot, path.join(args.out, 'diagnostic_summary.md')),
    summary,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
