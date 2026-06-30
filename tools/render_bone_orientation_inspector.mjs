#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'bone_orientation_inspector', 'onehand_ready');

const FPS_BONES = ['ShoulderCenter', 'Arm.R', 'Forearm.R', 'Hand.R', 'Weapon.R', 'Arm.L', 'Forearm.L', 'Hand.L'];
const MESHY_BONES = ['Spine02', 'RightArm', 'RightForeArm', 'RightHand', 'WeaponGrip', 'LeftArm', 'LeftForeArm', 'LeftHand'];
const BONE_MAP = {
  Spine02: 'ShoulderCenter',
  RightArm: 'Arm.R',
  RightForeArm: 'Forearm.R',
  RightHand: 'Hand.R',
  WeaponGrip: 'Weapon.R',
  LeftArm: 'Arm.L',
  LeftForeArm: 'Forearm.L',
  LeftHand: 'Hand.L',
};

function parseArgs(argv) {
  const out = { clip: 'OneHandReady', frames: 'representative', out: defaultOut, views: ['front', 'top'], labels: true };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-labels') out.labels = false;
    else if (arg.startsWith('--clip=')) out.clip = arg.slice('--clip='.length);
    else if (arg === '--clip') out.clip = argv[++i] || out.clip;
    else if (arg.startsWith('--frames=')) out.frames = arg.slice('--frames='.length);
    else if (arg === '--frames') out.frames = argv[++i] || out.frames;
    else if (arg.startsWith('--view=')) out.views = arg.slice('--view='.length).split(',').filter(Boolean);
    else if (arg === '--view') out.views = String(argv[++i] || 'front,top').split(',').filter(Boolean);
    else if (arg.startsWith('--out=')) out.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--out') out.out = path.resolve(projectRoot, argv[++i] || out.out);
  }
  return out;
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

function firstBoneChild(node) {
  return node?.children?.find((child) => child.isBone) || null;
}

function round(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function point(v) {
  return [round(v.x), round(v.y), round(v.z)];
}

function vec(THREE, value, fallback = [0, 1, 0]) {
  const src = Array.isArray(value) ? value : fallback;
  return new THREE.Vector3(Number(src[0] || 0), Number(src[1] || 0), Number(src[2] ?? 0)).normalize();
}

function worldPosition(THREE, node) {
  return node.getWorldPosition(new THREE.Vector3());
}

function worldQuaternion(THREE, node) {
  return node.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

function worldDirection(THREE, node, localAxis) {
  return vec(THREE, localAxis).applyQuaternion(worldQuaternion(THREE, node)).normalize();
}

function safeDirection(THREE, from, to, fallback = [0, 0, 1]) {
  const out = to.clone().sub(from);
  return out.lengthSq() > 1e-9 ? out.normalize() : vec(THREE, fallback);
}

function projectedAroundAxis(THREE, direction, axis) {
  const next = direction.clone().sub(axis.clone().multiplyScalar(direction.dot(axis)));
  return next.lengthSq() > 1e-9 ? next.normalize() : new THREE.Vector3(0, 1, 0);
}

function signedAngleAroundAxis(THREE, from, to, axis) {
  const a = projectedAroundAxis(THREE, from, axis);
  const b = projectedAroundAxis(THREE, to, axis);
  const cross = new THREE.Vector3().crossVectors(a, b);
  return THREE.MathUtils.radToDeg(Math.atan2(cross.dot(axis.clone().normalize()), a.dot(b)));
}

function mapDirectionBetweenFrames(THREE, direction, sourceFrame, targetFrame) {
  const local = direction.clone().normalize().applyQuaternion(worldQuaternion(THREE, sourceFrame).invert()).normalize();
  return local.applyQuaternion(worldQuaternion(THREE, targetFrame)).normalize();
}

function applyClipRotationPose(THREE, root, clip, time) {
  if (!clip) return;
  for (const track of clip.tracks || []) {
    if (!track.name.endsWith('.quaternion')) continue;
    const nodeName = track.name.replace(/\.quaternion$/, '');
    const node = findNode(root, nodeName);
    if (!node) continue;
    const result = track.createInterpolant(new Float32Array(4)).evaluate(time);
    node.quaternion.copy(new THREE.Quaternion(result[0], result[1], result[2], result[3]).normalize());
  }
  root.updateMatrixWorld(true);
}

function representativeTimes(clip, frameArg) {
  const duration = Math.max(0.001, clip?.duration || 0.001);
  if (frameArg === 'all') return Array.from(new Set((clip.tracks || []).flatMap((track) => Array.from(track.times || [])))).sort((a, b) => a - b);
  if (/^[0-9,.\s]+$/.test(frameArg)) return frameArg.split(',').map((entry) => Number(entry.trim())).filter(Number.isFinite).map((frame) => frame > duration ? frame / 30 : frame);
  return [0, duration * 0.25, duration * 0.5, duration * 0.75, duration].map((time) => round(time, 5));
}

function sampleMeshPoints(THREE, root, maxPerMesh = 260) {
  const samples = [];
  root.updateMatrixWorld(true);
  root.traverse((node) => {
    if (!node.isMesh && !node.isSkinnedMesh) return;
    const attr = node.geometry?.attributes?.position;
    if (!attr) return;
    const step = Math.max(1, Math.ceil(attr.count / maxPerMesh));
    const local = new THREE.Vector3();
    const world = new THREE.Vector3();
    for (let i = 0; i < attr.count; i += step) {
      if (node.isSkinnedMesh && typeof node.boneTransform === 'function') {
        node.boneTransform(i, world);
        world.applyMatrix4(node.matrixWorld);
      } else {
        local.fromBufferAttribute(attr, i);
        world.copy(local).applyMatrix4(node.matrixWorld);
      }
      samples.push(point(world));
    }
  });
  return samples;
}

function buildTriad(THREE, root, boneName, localUpAxis = [0, 1, 0], desiredUp = null) {
  const bone = findNode(root, boneName);
  if (!bone) return { name: boneName, missing: true };
  const head = worldPosition(THREE, bone);
  const child = firstBoneChild(bone);
  const tail = child ? worldPosition(THREE, child) : head.clone().add(worldDirection(THREE, bone, [0, 0, 1]).multiplyScalar(0.16));
  const forward = safeDirection(THREE, head, tail);
  const actualUp = projectedAroundAxis(THREE, worldDirection(THREE, bone, localUpAxis), forward);
  const desired = desiredUp ? projectedAroundAxis(THREE, desiredUp, forward) : null;
  const side = new THREE.Vector3().crossVectors(forward, actualUp).normalize();
  return {
    name: boneName,
    head: point(head),
    tail: point(tail),
    forward: point(forward),
    actualUp: point(actualUp),
    desiredUp: desired ? point(desired) : null,
    side: point(side),
    rollErrorDeg: desired ? round(signedAngleAroundAxis(THREE, actualUp, desired, forward), 2) : null,
  };
}

function parseMeshyWeaponAttachment() {
  const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
  const start = profiles.indexOf('meshyCharacter:');
  const end = profiles.indexOf('\n  meshyStatic:', start);
  const profileBlock = profiles.slice(start, end > start ? end : undefined);
  const weaponStart = profileBlock.indexOf('weaponAttachment:');
  const weaponEnd = profileBlock.indexOf('\n    extraClipUrls:', weaponStart);
  const block = profileBlock.slice(weaponStart, weaponEnd > weaponStart ? weaponEnd : undefined);
  const arrayFor = (name, fallback) => {
    const match = block.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`));
    return match ? match[1].split(',').map((value) => Number(value.trim())).filter(Number.isFinite) : fallback;
  };
  return {
    handLocalOffset: arrayFor('handLocalOffset', [0, 0, 0]),
    rotationDeg: arrayFor('rotationDeg', [0, 0, 0]),
    gripLocalPosition: arrayFor('gripLocalPosition', [0, 0, 0]),
    tipLocalPosition: arrayFor('tipLocalPosition', [0, 0.85, 0]),
    sourceBoundsMin: arrayFor('min', null),
    sourceBoundsMax: arrayFor('max', null),
    scale: Number(block.match(/scale:\s*([0-9.]+)/)?.[1] || 1),
  };
}

function ensureSyntheticWeaponGrip(THREE, meshyRoot, config) {
  const existing = findNode(meshyRoot, 'WeaponGrip');
  if (existing) return existing;
  const hand = findNode(meshyRoot, 'RightHand');
  if (!hand) return null;
  const grip = new THREE.Object3D();
  grip.name = 'WeaponGrip';
  grip.position.fromArray(config.handLocalOffset || [0, 0, 0]);
  const end = new THREE.Object3D();
  end.name = 'WeaponGrip_end';
  end.position.set(0, 0, 0.85);
  grip.add(end);
  hand.add(grip);
  meshyRoot.updateMatrixWorld(true);
  return grip;
}

function rawMeshBounds(THREE, root) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const local = new THREE.Vector3();
  root.traverse((node) => {
    if (!node.isMesh) return;
    const attr = node.geometry?.attributes?.position;
    if (!attr) return;
    for (let i = 0; i < attr.count; i += 1) {
      local.fromBufferAttribute(attr, i);
      min.min(local);
      max.max(local);
    }
  });
  if (!Number.isFinite(min.x) || !Number.isFinite(max.x)) {
    min.set(0, 0, 0);
    max.set(1, 1, 1);
  }
  const size = max.clone().sub(min);
  return { min, max, size, maxDimension: Math.max(size.x, size.y, size.z) };
}

function configuredSourceMaxDimension(THREE, config) {
  if (!Array.isArray(config.sourceBoundsMin) || !Array.isArray(config.sourceBoundsMax)) return null;
  const min = new THREE.Vector3().fromArray(config.sourceBoundsMin);
  const max = new THREE.Vector3().fromArray(config.sourceBoundsMax);
  const size = max.sub(min);
  return Math.max(size.x, size.y, size.z);
}

function weaponSourceUnitScale(THREE, sabreRoot, config) {
  const bounds = rawMeshBounds(THREE, sabreRoot);
  const configuredMax = configuredSourceMaxDimension(THREE, config);
  if (configuredMax && bounds.maxDimension > 1e-6) {
    return { scale: configuredMax / bounds.maxDimension, bounds, configuredMax };
  }
  return { scale: bounds.maxDimension > 20 ? 0.01 : 1, bounds, configuredMax: null };
}

function transformedWeaponPoints(THREE, meshyRoot, sabreRoot, config) {
  const hand = findNode(meshyRoot, 'RightHand');
  const spine = findNode(meshyRoot, 'Spine02');
  if (!hand || !spine) return null;
  const sourceScale = weaponSourceUnitScale(THREE, sabreRoot, config);
  const localScale = sourceScale.scale * config.scale;
  const socketWorld = hand.localToWorld(new THREE.Vector3().fromArray(config.handLocalOffset || [0, 0, 0]));
  const socketQuat = worldQuaternion(THREE, hand);
  const weaponQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(...config.rotationDeg.map((value) => THREE.MathUtils.degToRad(value)), 'XYZ'));
  const gripLocal = new THREE.Vector3().fromArray(config.gripLocalPosition || [0, 0, 0]).multiplyScalar(localScale).applyQuaternion(weaponQuat);
  const weaponWorldPosition = socketWorld.clone().sub(gripLocal.applyQuaternion(socketQuat));
  const weaponWorldQuat = socketQuat.clone().multiply(weaponQuat).normalize();
  const toWorld = (local) => new THREE.Vector3().fromArray(local).multiplyScalar(localScale).applyQuaternion(weaponWorldQuat).add(weaponWorldPosition);
  const hilt = socketWorld.clone();
  const tip = toWorld(config.tipLocalPosition || [-0.95561, 0.1368, 0]);
  const bladeAxis = safeDirection(THREE, hilt, tip);
  const basketFront = new THREE.Vector3(0, 0, 1).applyQuaternion(weaponWorldQuat).normalize();
  const torso = worldPosition(THREE, spine);
  const desiredFront = safeDirection(THREE, torso, hilt, [-1, 0, 0]);
  const mesh = [];
  sabreRoot.updateMatrixWorld(true);
  sabreRoot.traverse((node) => {
    if (!node.isMesh) return;
    const attr = node.geometry?.attributes?.position;
    if (!attr) return;
    const step = Math.max(1, Math.ceil(attr.count / 360));
    const local = new THREE.Vector3();
    for (let i = 0; i < attr.count; i += step) {
      local.fromBufferAttribute(attr, i);
      mesh.push(point(toWorld(local.toArray())));
    }
  });
  return {
    hilt: point(hilt),
    tip: point(tip),
    bladeLength: round(hilt.distanceTo(tip)),
    bladeAxis: point(bladeAxis),
    basketFront: point(basketFront),
    desiredBasketFront: point(desiredFront),
    basketFrontErrorDeg: round(THREE.MathUtils.radToDeg(basketFront.angleTo(desiredFront)), 2),
    hiltToHandDistance: round(hilt.distanceTo(worldPosition(THREE, hand))),
    sourceUnitScale: round(sourceScale.scale, 8),
    sourceMaxDimensionRaw: round(sourceScale.bounds.maxDimension, 5),
    sourceMaxDimensionConfigured: sourceScale.configuredMax ? round(sourceScale.configuredMax, 5) : null,
    mesh,
  };
}

function renderPng(dataPath, pngPath) {
  const renderer = path.join(os.tmpdir(), 'pose-lab-bone-orientation-render.py');
  fs.writeFileSync(renderer, String.raw`#!/usr/bin/env python3
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

data = json.loads(Path(sys.argv[1]).read_text())
out = Path(sys.argv[2])
W, H = 1900, 1180
img = Image.new('RGB', (W, H), (7, 10, 14))
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('DejaVuSans.ttf', 18)
    small = ImageFont.truetype('DejaVuSans.ttf', 13)
except Exception:
    font = small = None

def v(p): return p if isinstance(p, list) and len(p) >= 3 else [0, 0, 0]
def add(a,b): return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]
def mul(a,s): return [a[0]*s, a[1]*s, a[2]*s]
def project(p, panel, view, bounds):
    x0,y0,x1,y1 = panel
    p = v(p)
    if view == 'top':
        ai, bi = 0, 2
    else:
        ai, bi = 0, 1
    cx, cy, scale = bounds
    return ((x0+x1)/2 + (p[ai]-cx)*scale, (y0+y1)/2 - (p[bi]-cy)*scale)

def bounds_for(frame, view, panel):
    pts = []
    for key in ['fpsMesh','meshyMesh']:
        pts += frame.get(key, [])
    if frame.get('weapon'):
        pts += frame['weapon'].get('mesh', [])
    for rig in ['fpsTriads','meshyTriads']:
        for t in frame.get(rig, []):
            if not t.get('missing'):
                pts.append(t.get('head')); pts.append(t.get('tail'))
    pts = [v(p) for p in pts if isinstance(p, list)]
    if not pts: return (0,0,1)
    ai, bi = (0,2) if view == 'top' else (0,1)
    mn_a, mx_a = min(p[ai] for p in pts), max(p[ai] for p in pts)
    mn_b, mx_b = min(p[bi] for p in pts), max(p[bi] for p in pts)
    span = max(mx_a-mn_a, mx_b-mn_b, 0.001)
    scale = min((panel[2]-panel[0])*.72, (panel[3]-panel[1])*.72) / span
    return ((mn_a+mx_a)/2, (mn_b+mx_b)/2, scale)

def dotcloud(points, panel, view, bounds, color):
    for p in points:
        x,y = project(p, panel, view, bounds)
        d.point((x,y), fill=color)

def line(a,b,panel,view,bounds,color,width=2):
    d.line([project(a,panel,view,bounds), project(b,panel,view,bounds)], fill=color, width=width)

def sphere(p,panel,view,bounds,color,r=4):
    x,y = project(p,panel,view,bounds)
    d.ellipse([x-r,y-r,x+r,y+r], fill=color)

def draw_triads(triads, panel, view, bounds, labels):
    for t in triads:
        if t.get('missing'): continue
        h = v(t['head'])
        f_end = add(h, mul(v(t['forward']), 0.14))
        u_end = add(h, mul(v(t['actualUp']), 0.13))
        s_end = add(h, mul(v(t['side']), 0.11))
        line(h, t['tail'], panel, view, bounds, (180,180,190), 1)
        line(h, f_end, panel, view, bounds, (245,208,66), 3)
        line(h, u_end, panel, view, bounds, (52,211,153), 3)
        line(h, s_end, panel, view, bounds, (96,165,250), 2)
        if t.get('desiredUp'):
            du = add(h, mul(v(t['desiredUp']), 0.16))
            line(h, du, panel, view, bounds, (248,113,113), 3)
        sphere(h, panel, view, bounds, (255,255,255), 3)
        sphere(t['tail'], panel, view, bounds, (148,163,184), 3)
        if labels:
            x,y = project(h, panel, view, bounds)
            err = '' if t.get('rollErrorDeg') is None else f" {t['rollErrorDeg']}d"
            d.text((x+4,y-12), t['name']+err, fill=(226,232,240), font=small)

def draw_weapon(weapon, panel, view, bounds):
    if not weapon: return
    dotcloud(weapon.get('mesh', []), panel, view, bounds, (180,150,88))
    h = v(weapon.get('hilt'))
    line(h, weapon.get('tip'), panel, view, bounds, (250,204,21), 5)
    line(h, add(h, mul(v(weapon.get('basketFront')), .22)), panel, view, bounds, (239,68,68), 5)
    line(h, add(h, mul(v(weapon.get('desiredBasketFront')), .22)), panel, view, bounds, (34,197,94), 4)
    sphere(h, panel, view, bounds, (255,255,255), 5)

frames = data['frames']
views = data.get('views', ['front','top'])
panel_w = W // max(1, len(frames))
panel_h = (H-110) // max(1, len(views))
d.text((18, 16), 'Bone Orientation Inspector: yellow=forward, green=actual up, red=desired up/basket front, blue=side', fill=(255,240,180), font=font)
d.text((18, 42), f"clip={data['clip']} | frames={len(frames)} | scoped bones only | mesh point-cloud included", fill=(202,213,226), font=small)
for fi, frame in enumerate(frames):
    for vi, view in enumerate(views):
        panel = (fi*panel_w+8, 72+vi*panel_h, (fi+1)*panel_w-8, 72+(vi+1)*panel_h-10)
        bounds = bounds_for(frame, view, panel)
        d.rectangle(panel, outline=(51,65,85), width=1)
        d.text((panel[0]+8,panel[1]+6), f"t={frame['time']:.3f} {view}", fill=(226,232,240), font=small)
        dotcloud(frame.get('fpsMesh', []), panel, view, bounds, (78,72,44))
        dotcloud(frame.get('meshyMesh', []), panel, view, bounds, (41,68,86))
        draw_weapon(frame.get('weapon'), panel, view, bounds)
        draw_triads(frame.get('fpsTriads', []), panel, view, bounds, data.get('labels', True))
        draw_triads(frame.get('meshyTriads', []), panel, view, bounds, data.get('labels', True))
        if frame.get('weapon'):
            w = frame['weapon']
            d.text((panel[0]+8,panel[3]-22), f"basketErr={w.get('basketFrontErrorDeg')} hiltHand={w.get('hiltToHandDistance')}", fill=(248,113,113), font=small)
out.parent.mkdir(parents=True, exist_ok=True)
img.save(out)
`);
  execFileSync('python3', [renderer, dataPath, pngPath], { stdio: 'pipe' });
}

async function main() {
  const args = parseArgs(process.argv);
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const fps = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb'));
  const meshy = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'meshy_character_sheet', 'animated', 'Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'));
  const sabre = await loadGlb(GLTFLoader, path.join(projectRoot, 'assets', 'models', 'meshy_sabre', 'Meshy_AI_A_French_revolution_c_0628223518_texture.glb'));
  const fpsRoot = fps.scene;
  const meshyRoot = meshy.scene;
  const clip = fps.animations.find((entry) => entry.name === args.clip);
  if (!clip) throw new Error(`missing FPS clip ${args.clip}`);
  const sourceFrame = findNode(fpsRoot, 'ShoulderCenter');
  const targetFrame = findNode(meshyRoot, 'Spine02');
  const weaponConfig = parseMeshyWeaponAttachment();
  ensureSyntheticWeaponGrip(THREE, meshyRoot, weaponConfig);
  const frames = [];
  for (const time of representativeTimes(clip, args.frames).slice(0, args.frames === 'all' ? 999 : 5)) {
    applyClipRotationPose(THREE, fpsRoot, clip, time);
    meshyRoot.updateMatrixWorld(true);
    const desiredByMeshy = new Map();
    for (const [targetName, sourceName] of Object.entries(BONE_MAP)) {
      const sourceBone = findNode(fpsRoot, sourceName);
      if (!sourceBone || !sourceFrame || !targetFrame) continue;
      const sourceUpAxis = sourceName === 'Weapon.R' ? [0, 1, 0] : [0, 0, 1];
      desiredByMeshy.set(targetName, mapDirectionBetweenFrames(THREE, worldDirection(THREE, sourceBone, sourceUpAxis), sourceFrame, targetFrame));
    }
    frames.push({
      time: round(time, 5),
      fpsMesh: sampleMeshPoints(THREE, fpsRoot),
      meshyMesh: sampleMeshPoints(THREE, meshyRoot),
      fpsTriads: FPS_BONES.map((name) => buildTriad(THREE, fpsRoot, name, name === 'Weapon.R' ? [0, 1, 0] : [0, 0, 1])),
      meshyTriads: MESHY_BONES.map((name) => buildTriad(THREE, meshyRoot, name, name === 'WeaponGrip' ? [0, 1, 0] : [0, -1, 0], desiredByMeshy.get(name) || null)),
      weapon: transformedWeaponPoints(THREE, meshyRoot, sabre.scene, weaponConfig),
    });
  }
  fs.mkdirSync(args.out, { recursive: true });
  const dataPath = path.join(args.out, 'bone_orientation_inspector.json');
  const pngPath = path.join(args.out, 'bone_orientation_inspector.png');
  const payload = {
    schema: 'pose-lab-bone-orientation-inspector-v1',
    generatedAt: new Date().toISOString(),
    clip: args.clip,
    views: args.views,
    labels: args.labels,
    sourceBones: FPS_BONES,
    targetBones: MESHY_BONES,
    meshPointCloudIncluded: true,
    weaponLandmarksIncluded: true,
    triadContract: {
      forward: 'parent/head to child/tail direction',
      actualUp: 'local reference axis transformed by bone world quaternion and projected around forward',
      side: 'forward x actualUp',
      desiredUp: 'FPS source up mapped into Meshy frame, then projected around target forward',
      rollErrorDeg: 'signed angle from actualUp to desiredUp around forward',
    },
    weaponContract: {
      hilt: 'current WeaponGrip/socket world position from Meshy RightHand + handLocalOffset',
      bladeAxis: 'hilt to current Meshy sabre tipLocalPosition',
      basketFront: 'current sabre local +Z transformed by attachment',
      desiredBasketFront: 'torso-to-hilt outward direction',
    },
    frames,
  };
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2) + '\n');
  renderPng(dataPath, pngPath);
  console.log(JSON.stringify({ ok: true, data: path.relative(projectRoot, dataPath), png: path.relative(projectRoot, pngPath), frames: frames.length }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
