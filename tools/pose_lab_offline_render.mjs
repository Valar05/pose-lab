#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  applyClipPoseAtTime,
  captureNamedBoneLandmarks,
  collectPoseRuntimeChains,
  findRuntimeNode,
  fitModelToHeight,
  poseDistanceMetrics,
  serializableLandmarks,
  serializablePoint,
} from '../src/pose-runtime-rules.mjs';
import {
  applyWeaponAttachmentRuntimeRules,
  applyWeaponSocketRuntimeRules,
  captureWeaponRuntimeLandmarks,
  captureWeaponPinningRuntimeState,
} from '../src/weapon-runtime-rules.mjs';
import { buildMeshyFpsVisualIkReadyClip } from '../src/meshy-ready-runtime.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultClip = 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]';
const defaultOut = path.join(projectRoot, 'generated', 'pose_lab_offline_render', 'latest');
const poseBones = ['Hips', 'Spine', 'Spine01', 'Spine02', 'Head', 'RightArm', 'RightForeArm', 'RightHand', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightUpLeg', 'RightLeg', 'RightFoot', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'];
const poseChains = [
  { name: 'torso', bones: ['Hips', 'Spine', 'Spine01', 'Spine02', 'Head'] },
  { name: 'rightArm', bones: ['Spine02', 'RightArm', 'RightForeArm', 'RightHand'] },
  { name: 'leftArm', bones: ['Spine02', 'LeftArm', 'LeftForeArm', 'LeftHand'] },
  { name: 'rightLeg', bones: ['Hips', 'RightUpLeg', 'RightLeg', 'RightFoot'] },
  { name: 'leftLeg', bones: ['Hips', 'LeftUpLeg', 'LeftLeg', 'LeftFoot'] },
];

function parseArgs(argv) {
  const args = { out: defaultOut, actor: 'meshyCharacter', clip: defaultClip, time: null, assertFixed: false, assertRepro: false, samples: 4 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--actor') args.actor = String(argv[++i] || args.actor);
    else if (arg.startsWith('--actor=')) args.actor = arg.slice('--actor='.length);
    else if (arg === '--clip') args.clip = String(argv[++i] || args.clip);
    else if (arg.startsWith('--clip=')) args.clip = arg.slice('--clip='.length);
    else if (arg === '--time') args.time = Number(argv[++i] || 0);
    else if (arg.startsWith('--time=')) args.time = Number(arg.slice('--time='.length));
    else if (arg === '--samples') args.samples = Math.max(1, Number(argv[++i] || args.samples));
    else if (arg.startsWith('--samples=')) args.samples = Math.max(1, Number(arg.slice('--samples='.length)));
    else if (arg === '--assert-fixed') args.assertFixed = true;
    else if (arg === '--assert-repro') args.assertRepro = true;
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
  const dir = path.join(sandbox, 'node_modules', 'three');
  if (!fs.existsSync(path.join(dir, 'build', 'three.module.js')) || !fs.existsSync(path.join(dir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js'))) {
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

function profileBlock(name, nextName = '') {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
  const start = source.indexOf(`  ${name}:`);
  if (start < 0) throw new Error(`missing profile ${name}`);
  const end = nextName ? source.indexOf(`\n  ${nextName}:`, start) : -1;
  return source.slice(start, end > start ? end : undefined);
}

function objectBlock(source, key) {
  const start = source.indexOf(`${key}: {`);
  if (start < 0) throw new Error(`missing block ${key}`);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`unterminated block ${key}`);
}

function arrayFor(block, name, fallback) {
  const match = block.match(new RegExp(`${name}:\\s*\\[([^\\]]*)\\]`));
  return match ? match[1].split(',').map((value) => Number(value.trim())).filter(Number.isFinite) : fallback;
}

function numberFor(block, name, fallback) {
  const match = block.match(new RegExp(`${name}:\\s*(-?[0-9.]+)`));
  return match ? Number(match[1]) : fallback;
}

function stringFor(block, name, fallback) {
  const match = block.match(new RegExp(`${name}:\\s*'([^']*)'`));
  return match ? match[1] : fallback;
}

function parseMeshyConfig() {
  const block = profileBlock('meshyCharacter', 'meshyStatic');
  const proxy = objectBlock(block, 'weaponProxy');
  const attachment = objectBlock(block, 'weaponAttachment');
  return {
    actor: {
      url: stringFor(block, 'url', 'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'),
      targetHeight: numberFor(block, 'targetHeight', 1.89),
    },
    proxy: {
      handBone: stringFor(proxy, 'handBone', 'RightHand'),
      leftHandBone: stringFor(proxy, 'leftHandBone', 'LeftHand'),
      socketBone: stringFor(proxy, 'socketBone', 'WeaponGrip'),
      syntheticSourceSocketBone: stringFor(proxy, 'syntheticSourceSocketBone', 'WeaponR'),
      parentMode: stringFor(proxy, 'parentMode', 'synthetic-source-socket'),
      positionMode: stringFor(proxy, 'positionMode', 'right-hand'),
      handLocalOffset: arrayFor(proxy, 'handLocalOffset', [0, 0, 0]),
      modelLocalOffset: arrayFor(proxy, 'modelLocalOffset', [0, 0, 0]),
      gripOffset: arrayFor(proxy, 'gripOffset', [0, 0, 0]),
      tipOffset: arrayFor(proxy, 'tipOffset', [0, 0, 0.85]),
      rotationDeg: arrayFor(proxy, 'rotationDeg', [0, 0, 0]),
      length: numberFor(proxy, 'length', 0.85),
      hideFallbackOnAttachment: false,
    },
    attachment: {
      url: stringFor(attachment, 'url', 'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb'),
      name: stringFor(attachment, 'name', 'Meshy French Revolution Sabre'),
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

function findClip(animations, requested) {
  const clean = String(requested || '').replace(/^own:/, '');
  return animations.find((clip) => clip.name === clean)
    || animations.find((clip) => clean.includes(clip.name))
    || animations.find((clip) => /walking|idle|base/i.test(clip.name))
    || animations[0]
    || null;
}

function trackTargetsNode(clip, nodeName) {
  const wanted = String(nodeName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return (clip?.tracks || []).some((track) => {
    const target = String(track.name || '').replace(/^\.bones\[(.+?)\]\.(position|quaternion|scale)$/, '$1.$2').replace(/\.(position|quaternion|scale|morphTargetInfluences)$/, '');
    return target.toLowerCase().replace(/[^a-z0-9]/g, '') === wanted && String(track.name || '').endsWith('.quaternion');
  });
}

function wantsGeneratedReadyClip(requested) {
  return /OneHandReady\s*->\s*meshyCharacter\s*\[FPS-VISUAL-IK R-120 L-90\]/i.test(String(requested || ''));
}

function createWeaponProxy(THREE, actorRoot, sabreRoot, config) {
  const rightHand = findRuntimeNode(actorRoot, config.proxy.handBone);
  const leftHand = findRuntimeNode(actorRoot, config.proxy.leftHandBone);
  if (!rightHand) throw new Error(`missing right hand ${config.proxy.handBone}`);
  const syntheticSourceSocket = new THREE.Bone();
  syntheticSourceSocket.name = config.proxy.syntheticSourceSocketBone || 'WeaponR';
  rightHand.add(syntheticSourceSocket);
  const root = new THREE.Bone();
  root.name = config.proxy.socketBone || 'WeaponGrip';
  syntheticSourceSocket.add(root);
  const displayRoot = new THREE.Group();
  displayRoot.name = root.name + '-display-root';
  root.add(displayRoot);
  const fallbackHilt = new THREE.Group();
  fallbackHilt.name = root.name + '-fallback-hilt';
  fallbackHilt.userData.weaponFallbackHilt = true;
  const fallbackBlade = new THREE.Group();
  fallbackBlade.name = root.name + '-fallback-blade';
  fallbackBlade.userData.weaponFallbackBlade = true;
  fallbackBlade.userData.weaponFallbackBladeBaseLength = Number(config.proxy.length || 0.85);
  displayRoot.add(fallbackHilt);
  displayRoot.add(fallbackBlade);
  const model = sabreRoot;
  model.name = config.attachment.name;
  displayRoot.add(model);
  const tipMarker = new THREE.Group();
  tipMarker.name = config.attachment.tipMarker;
  displayRoot.add(tipMarker);
  const proxy = {
    root,
    displayRoot,
    config: config.proxy,
    rightHand,
    leftHand,
    syntheticSourceSocket,
    model,
    tipMarker,
    attachmentConfig: config.attachment,
    fkPlacementSignature: '',
    fkLocalPosition: null,
    fkLocalQuaternion: null,
  };
  applyWeaponSocketRuntimeRules(THREE, { model: actorRoot, proxy, placementSignature: 'offline-init', force: true });
  applyWeaponAttachmentRuntimeRules(THREE, { actorModel: actorRoot, proxy, config: config.attachment });
  return proxy;
}

function finitePoint(point) {
  return Array.isArray(point) && point.length === 3 && point.every(Number.isFinite);
}

function distance3(a, b) {
  return finitePoint(a) && finitePoint(b) ? Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) : null;
}

function finiteQuaternion(value) {
  return Array.isArray(value) && value.length === 4 && value.every(Number.isFinite);
}

function quaternionAngleDeg(a, b) {
  if (!finiteQuaternion(a) || !finiteQuaternion(b)) return null;
  const dot = Math.min(1, Math.max(-1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3])));
  return (2 * Math.acos(dot) * 180) / Math.PI;
}

function vectorFromArray(THREE, value, fallback = [0, 0, 0]) {
  const source = Array.isArray(value) ? value : fallback;
  return new THREE.Vector3(Number(source[0] || 0), Number(source[1] || 0), Number(source[2] || 0));
}

function worldPosition(THREE, object) {
  return object?.getWorldPosition ? object.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3();
}

function worldQuaternion(THREE, object) {
  return object?.getWorldQuaternion ? object.getWorldQuaternion(new THREE.Quaternion()).normalize() : new THREE.Quaternion();
}

function worldDirection(THREE, object, local = [0, 0, 1]) {
  return vectorFromArray(THREE, local, [0, 0, 1]).applyQuaternion(worldQuaternion(THREE, object)).normalize();
}

function mapDirectionBetweenFrames(THREE, direction, sourceFrame, targetFrame) {
  if (!direction || direction.lengthSq() < 1e-8 || !sourceFrame || !targetFrame) return new THREE.Vector3(0, 0, 1);
  const sourceLocal = direction.clone().normalize().applyQuaternion(worldQuaternion(THREE, sourceFrame).invert());
  return sourceLocal.applyQuaternion(worldQuaternion(THREE, targetFrame)).normalize();
}

function angleBetweenVectorsDeg(a, b) {
  if (!a || !b || a.lengthSq() < 1e-8 || b.lengthSq() < 1e-8) return null;
  return (Math.acos(Math.min(1, Math.max(-1, a.clone().normalize().dot(b.clone().normalize())))) * 180) / Math.PI;
}

function serializableVector(vector, digits = 5) {
  return vector ? serializablePoint(vector, digits) : null;
}

function collectMeshWorldPoints(THREE, root, limit = 900) {
  const points = [];
  root?.updateMatrixWorld?.(true);
  root?.traverse?.((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    const attr = object.geometry.attributes.position;
    const step = Math.max(1, Math.floor(attr.count / Math.max(1, Math.floor(limit / 3))));
    for (let i = 0; i < attr.count && points.length < limit; i += step) {
      const point = new THREE.Vector3().fromBufferAttribute(attr, i);
      if (object.isSkinnedMesh && typeof object.boneTransform === 'function') object.boneTransform(i, point);
      object.localToWorld(point);
      points.push(serializablePoint(point));
    }
  });
  return points;
}

function serializableRuntimeDistances(distances, digits = 6) {
  const round = (value) => Number(Number(value || 0).toFixed(digits));
  return Object.fromEntries(Object.entries(distances || {}).map(([key, value]) => [
    key,
    Number.isFinite(value) ? round(value) : null,
  ]));
}

function serializableRuntimeLocal(local) {
  const round = (value) => Number(Number(value || 0).toFixed(6));
  return Object.fromEntries(Object.entries(local || {}).map(([key, value]) => {
    if (value && Number.isFinite(value.w)) return [key, [round(value.x), round(value.y), round(value.z), round(value.w)]];
    return [key, serializablePoint(value)];
  }));
}

function writeSheet(outPng, samples, result) {
  const payloadPath = path.join(path.dirname(outPng), 'pose_weapon_sheet_payload.json');
  fs.writeFileSync(payloadPath, JSON.stringify({ samples, result }, null, 2));
  const script = String.raw`
import json, sys
from PIL import Image, ImageDraw, ImageFont
payload=json.load(open(sys.argv[1]))
out=sys.argv[2]
samples=payload["samples"]
W,H=1320,980
img=Image.new("RGB",(W,H),(7,10,14))
d=ImageDraw.Draw(img)
try:
    font=ImageFont.truetype("DejaVuSans.ttf",14)
    small=ImageFont.truetype("DejaVuSans.ttf",11)
except Exception:
    font=small=None
colors={"torso":(235,238,245),"rightArm":(82,169,255),"leftArm":(94,220,150),"rightLeg":(180,185,195),"leftLeg":(180,185,195)}
allpts=[]
for s in samples:
    for c in s["chains"]:
        for p in c["points"]:
            if p: allpts.append(p)
    for p in s["weapon"].values():
        if p: allpts.append(p)
    for p in s.get("weaponMesh", []):
        if p: allpts.append(p)
if not allpts: allpts=[[0,0,0],[1,1,1]]
minx,maxx=min(p[0] for p in allpts),max(p[0] for p in allpts)
miny,maxy=min(p[1] for p in allpts),max(p[1] for p in allpts)
minz,maxz=min(p[2] for p in allpts),max(p[2] for p in allpts)
def project(p, panel, i):
    if panel=="front":
        x,y=p[0],p[1]
        ax,bx=minx,maxx; ay,by=miny,maxy
    else:
        x,y=p[0],p[2]
        ax,bx=minx,maxx; ay,by=minz,maxz
    colw=W/len(samples)
    panelh=310
    ox=i*colw+22
    oy=72 if panel=="front" else 420
    sx=ox+(x-ax)/max(0.0001,bx-ax)*(colw-44)
    sy=oy+panelh-20-(y-ay)/max(0.0001,by-ay)*(panelh-40)
    return sx,sy
title=payload["result"]["clipRequested"]
d.text((20,18),f"Pose Lab offline pose+weapon render | {title}",fill=(242,245,247),font=font)
d.text((20,42),f"schema={payload['result']['schema']} generatedClipResolved={payload['result']['generatedClipResolved']} ok={payload['result']['ok']}",fill=(255,214,109),font=small)
for i,s in enumerate(samples):
    colw=W/len(samples)
    d.text((i*colw+22,64),f"t={s['time']:.3f}s {s['clipSource']}",fill=(220,225,232),font=small)
    d.text((i*colw+22,404),"top view",fill=(150,160,174),font=small)
    for panel in ("front","top"):
        for chain in s["chains"]:
            pts=[project(p,panel,i) for p in chain["points"] if p]
            if len(pts)>=2: d.line(pts,fill=colors.get(chain["name"],(210,210,210)),width=4)
            for pt in pts: d.ellipse((pt[0]-4,pt[1]-4,pt[0]+4,pt[1]+4),fill=colors.get(chain["name"],(210,210,210)))
        w=s["weapon"]
        for p in s.get("weaponMesh", []):
            x,y=project(p,panel,i)
            d.point((x,y),fill=(180,98,42))
        for a,b,color,width in [("rightHand","syntheticSourceSocket",(80,169,255),3),("syntheticSourceSocket","socket",(255,255,255),3),("palmTarget","socket",(148,163,184),1),("socket","appliedHilt",(255,70,210),4),("appliedHilt","tip",(255,180,75),4),("syntheticSourceSocket","tip",(66,233,255),2)]:
            if w.get(a) and w.get(b):
                pa,pb=project(w[a],panel,i),project(w[b],panel,i)
                d.line([pa,pb],fill=color,width=width)
        for key,color,rad in [("rightHand",(80,169,255),6),("syntheticSourceSocket",(255,255,255),7),("socketHandBaseline",(255,255,255),4),("palmTarget",(148,163,184),4),("socket",(255,230,80),6),("appliedHilt",(255,70,210),7),("tip",(255,180,75),6),("model",(255,110,70),5)]:
            if w.get(key):
                x,y=project(w[key],panel,i)
                d.ellipse((x-rad,y-rad,x+rad,y+rad),fill=color)
                if panel=="front": d.text((x+7,y-7),key,fill=color,font=small)
def zoom_project(p, bounds, rect, mode):
    x0,y0,x1,y1=rect
    if mode=="front":
        x,y=p[0],p[1]; ax,bx,ay,by=bounds["fx0"],bounds["fx1"],bounds["fy0"],bounds["fy1"]
    else:
        x,y=p[0],p[2]; ax,bx,ay,by=bounds["tx0"],bounds["tx1"],bounds["tz0"],bounds["tz1"]
    return (x0+(x-ax)/max(0.0001,bx-ax)*(x1-x0), y1-(y-ay)/max(0.0001,by-ay)*(y1-y0))
if samples:
    s=samples[0]
    pts=[p for k,p in s["weapon"].items() if p and k in ("rightHand","syntheticSourceSocket","socketHandBaseline","palmTarget","socket","appliedHilt","tip","model","fallbackBlade","fallbackHilt")]
    if pts:
        padx=max(0.08,(max(p[0] for p in pts)-min(p[0] for p in pts))*0.22)
        pady=max(0.08,(max(p[1] for p in pts)-min(p[1] for p in pts))*0.22)
        padz=max(0.08,(max(p[2] for p in pts)-min(p[2] for p in pts))*0.22)
        bounds={"fx0":min(p[0] for p in pts)-padx,"fx1":max(p[0] for p in pts)+padx,"fy0":min(p[1] for p in pts)-pady,"fy1":max(p[1] for p in pts)+pady,"tx0":min(p[0] for p in pts)-padx,"tx1":max(p[0] for p in pts)+padx,"tz0":min(p[2] for p in pts)-padz,"tz1":max(p[2] for p in pts)+padz}
        d.rectangle((18,748,1302,948),outline=(70,80,92),width=1)
        d.text((28,758),"FK close-up: generated ready frame, raw hand vs WeaponR sword bone vs WeaponGrip/applied hilt",fill=(242,245,247),font=font)
        for label,rect,mode in [("front x/y",(40,790,640,930),"front"),("top x/z",(690,790,1290,930),"top")]:
            d.rectangle(rect,outline=(38,48,60),width=1)
            d.text((rect[0]+8,rect[1]+8),label,fill=(150,160,174),font=small)
            w=s["weapon"]
            for a,b,color,width in [("rightHand","syntheticSourceSocket",(80,169,255),4),("syntheticSourceSocket","socket",(255,255,255),4),("palmTarget","socket",(148,163,184),1),("socket","appliedHilt",(255,70,210),5),("appliedHilt","tip",(255,180,75),5),("syntheticSourceSocket","tip",(66,233,255),2)]:
                if w.get(a) and w.get(b):
                    d.line([zoom_project(w[a],bounds,rect,mode),zoom_project(w[b],bounds,rect,mode)],fill=color,width=width)
            for key,color,rad in [("rightHand",(80,169,255),8),("syntheticSourceSocket",(255,255,255),9),("socketHandBaseline",(255,255,255),5),("palmTarget",(148,163,184),5),("socket",(255,230,80),8),("appliedHilt",(255,70,210),9),("tip",(255,180,75),8),("model",(255,110,70),6)]:
                if w.get(key):
                    x,y=zoom_project(w[key],bounds,rect,mode)
                    d.ellipse((x-rad,y-rad,x+rad,y+rad),fill=color)
                    d.text((x+9,y-9),key,fill=color,font=small)
legend_y=960
d.text((20,legend_y),"blue=RightHand, white=WeaponR sword FK bone, gray=palm target diagnostic, yellow=WeaponGrip compatibility child, magenta=applied hilt, orange=real sabre mesh/tip.",fill=(210,215,222),font=small)
img.save(out)
`;
  const run = spawnSync('python3', ['-c', script, payloadPath, outPng], { cwd: projectRoot, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`failed to write offline render PNG: ${run.stderr || run.stdout}`);
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const { clone: cloneSkinnedObject } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'utils', 'SkeletonUtils.js')));
  const config = parseMeshyConfig();
  const actorPath = path.join(projectRoot, config.actor.url);
  const weaponPath = path.join(projectRoot, config.attachment.url);
  const fpsPath = path.join(projectRoot, 'assets', 'models', 'FPSPlayer.glb');
  const actor = await loadGlb(GLTFLoader, actorPath);
  const weapon = await loadGlb(GLTFLoader, weaponPath);
  const fps = await loadGlb(GLTFLoader, fpsPath);
  fitModelToHeight(THREE, actor.scene, config.actor.targetHeight);
  const proxy = createWeaponProxy(THREE, actor.scene, weapon.scene, config);
  const generated = wantsGeneratedReadyClip(args.clip)
    ? buildMeshyFpsVisualIkReadyClip(THREE, cloneSkinnedObject, fps.scene, actor.scene, fps.animations || [], { clipName: args.clip })
    : { clip: null, generatedClipResolved: false, reason: 'not-generated-ready-request' };
  const fallbackClip = findClip(actor.animations || [], args.clip);
  const clip = generated.clip || fallbackClip;
  const generatedClipResolved = Boolean(generated.generatedClipResolved && clip?.name === args.clip);
  const clipSource = generatedClipResolved ? 'requested-generated-ready-clip' : `fallback-glb-clip:${clip?.name || 'none'}`;
  const duration = Math.max(0.001, Number(clip?.duration || 0.001));
  const sourceReadyClip = (fps.animations || []).find((entry) => entry.name === 'OneHandReady') || null;
  const sourceWeapon = findRuntimeNode(fps.scene, 'Weapon.R');
  const sourceFrame = findRuntimeNode(fps.scene, 'ShoulderCenter');
  const targetFrame = findRuntimeNode(actor.scene, 'Spine02');
  const sourceTimeOffset = Number(generated.clip?.userData?.keyConvert?.trimmedInitialRestTime || 0);
  const times = args.time !== null
    ? [Math.max(0, Math.min(duration, args.time))]
    : Array.from({ length: args.samples }, (_, index) => duration * (index / Math.max(1, args.samples - 1)));
  const samples = [];
  for (const time of times) {
    applyClipPoseAtTime(THREE, actor.scene, clip, time);
    applyWeaponSocketRuntimeRules(THREE, {
      model: actor.scene,
      proxy,
      placementSignature: 'offline-fk-stable',
      force: samples.length === 0,
      animatedSourceSocketRotation: trackTargetsNode(clip, proxy.syntheticSourceSocket?.name || 'WeaponR'),
      animatedSocketRotation: trackTargetsNode(clip, proxy.root?.name || 'WeaponGrip'),
    });
    applyWeaponAttachmentRuntimeRules(THREE, { actorModel: actor.scene, proxy, config: config.attachment });
    actor.scene.updateMatrixWorld(true);
    proxy.root.updateMatrixWorld(true);
    proxy.model?.updateMatrixWorld?.(true);
    const landmarks = captureNamedBoneLandmarks(THREE, actor.scene, poseBones);
    const weaponLandmarks = captureWeaponRuntimeLandmarks(THREE, proxy);
    const pinningState = captureWeaponPinningRuntimeState(THREE, proxy);
    const weaponMesh = collectMeshWorldPoints(THREE, proxy.model, 900);
    let sourceWeaponOrientation = null;
    if (generatedClipResolved && sourceReadyClip && sourceWeapon && sourceFrame && targetFrame) {
      applyClipPoseAtTime(THREE, fps.scene, sourceReadyClip, time + sourceTimeOffset);
      fps.scene.updateMatrixWorld(true);
      actor.scene.updateMatrixWorld(true);
      const sourceTipWorld = sourceWeapon.localToWorld(new THREE.Vector3(0.00854, 0.57786, 0.00995));
      const sourceBladeWorld = sourceTipWorld.sub(worldPosition(THREE, sourceWeapon));
      const sourceUpWorld = worldDirection(THREE, sourceWeapon, [0, 1, 0]);
      const mappedBlade = mapDirectionBetweenFrames(THREE, sourceBladeWorld, sourceFrame, targetFrame);
      const mappedUp = mapDirectionBetweenFrames(THREE, sourceUpWorld, sourceFrame, targetFrame);
      const visibleBlade = weaponLandmarks.tip && weaponLandmarks.appliedHilt
        ? weaponLandmarks.tip.clone().sub(weaponLandmarks.appliedHilt)
        : null;
      const visibleUp = proxy.syntheticSourceSocket
        ? worldDirection(THREE, proxy.syntheticSourceSocket, generated.clip?.userData?.keyConvert?.weaponTargetUpLocal || [0, 1, 0])
        : null;
      sourceWeaponOrientation = {
        sourceTime: Number((time + sourceTimeOffset).toFixed(6)),
        mappedBlade: serializableVector(mappedBlade),
        mappedUp: serializableVector(mappedUp),
        visibleBlade: serializableVector(visibleBlade?.clone?.().normalize?.()),
        visibleUp: serializableVector(visibleUp?.clone?.().normalize?.()),
        bladeErrorDeg: Number.isFinite(angleBetweenVectorsDeg(mappedBlade, visibleBlade)) ? Number(angleBetweenVectorsDeg(mappedBlade, visibleBlade).toFixed(4)) : null,
        upErrorDeg: Number.isFinite(angleBetweenVectorsDeg(mappedUp, visibleUp)) ? Number(angleBetweenVectorsDeg(mappedUp, visibleUp).toFixed(4)) : null,
      };
    }
    samples.push({
      time,
      clipSource,
      generatedClipResolved,
      landmarks: serializableLandmarks(landmarks),
      metrics: poseDistanceMetrics(THREE, landmarks),
      chains: collectPoseRuntimeChains(THREE, actor.scene, poseChains).map((chain) => ({
        name: chain.name,
        bones: chain.bones,
        points: chain.points.map((point) => serializablePoint(point)),
      })),
      weapon: serializableLandmarks(weaponLandmarks),
      weaponMesh,
      weaponPinning: {
        schema: pinningState.schema,
        distances: serializableRuntimeDistances(pinningState.distances),
        local: serializableRuntimeLocal(pinningState.local),
        checks: pinningState.checks,
        thresholds: pinningState.thresholds,
      },
      sourceWeaponOrientation,
      closeupPanel: {
        center: serializablePoint(weaponLandmarks.palmTarget || weaponLandmarks.rightHand || weaponLandmarks.socket || null),
        blueRightHand: serializablePoint(weaponLandmarks.rightHand),
        whiteHandBaseline: serializablePoint(weaponLandmarks.socketHandBaseline),
        whitePalmTarget: serializablePoint(weaponLandmarks.palmTarget),
        yellowSocket: serializablePoint(weaponLandmarks.socket),
        magentaAppliedHilt: serializablePoint(weaponLandmarks.appliedHilt),
        orangeTip: serializablePoint(weaponLandmarks.tip),
      },
      parentChain: [proxy.model?.name, proxy.displayRoot?.name, proxy.root?.name, proxy.syntheticSourceSocket?.name, proxy.rightHand?.name].filter(Boolean),
    });
  }
  const allKeyBonesFinite = samples.every((sample) => ['Hips', 'RightHand', 'LeftHand', 'RightArm', 'LeftArm'].every((name) => finitePoint(sample.landmarks[name])));
  const weaponFinite = samples.every((sample) => ['rightHand', 'socket', 'appliedHilt', 'tip', 'model'].every((name) => finitePoint(sample.weapon[name])));
  const hiltSocketDistances = samples.map((sample) => distance3(sample.weapon.socket, sample.weapon.appliedHilt));
  const rawHandHiltDistances = samples.map((sample) => distance3(sample.weapon.rightHand, sample.weapon.appliedHilt));
  const palmTargetSocketDistances = samples.map((sample) => distance3(sample.weapon.palmTarget, sample.weapon.socket));
  const palmTargetHiltDistances = samples.map((sample) => distance3(sample.weapon.palmTarget, sample.weapon.appliedHilt));
  const weaponRSocketDistances = samples.map((sample) => distance3(sample.weapon.syntheticSourceSocket, sample.weapon.socket));
  const weaponRHiltDistances = samples.map((sample) => distance3(sample.weapon.syntheticSourceSocket, sample.weapon.appliedHilt));
  const handBaselineSocketDistances = samples.map((sample) => distance3(sample.weapon.socketHandBaseline, sample.weapon.socket));
  const handBaselineHiltDistances = samples.map((sample) => distance3(sample.weapon.socketHandBaseline, sample.weapon.appliedHilt));
  const tipDistances = samples.map((sample) => distance3(sample.weapon.appliedHilt, sample.weapon.tip));
  const weaponBladeDirectionErrorsDeg = samples.map((sample) => Number(sample.sourceWeaponOrientation?.bladeErrorDeg)).filter(Number.isFinite);
  const weaponUpDirectionErrorsDeg = samples.map((sample) => Number(sample.sourceWeaponOrientation?.upErrorDeg)).filter(Number.isFinite);
  const maxFinite = (values) => {
    const finite = values.filter(Number.isFinite);
    return finite.length ? Math.max(...finite) : null;
  };
  const palmTargetTolerance = samples.find((sample) => Number.isFinite(sample.weaponPinning?.thresholds?.palmTargetTolerance))?.weaponPinning?.thresholds?.palmTargetTolerance ?? 0.015;
  const handBaselineTolerance = samples.find((sample) => Number.isFinite(sample.weaponPinning?.thresholds?.handBaselineTolerance))?.weaponPinning?.thresholds?.handBaselineTolerance ?? 0.005;
  const localDriftTolerance = 0.005;
  const localQuaternionDriftToleranceDeg = 0.5;
  const weaponBladeDirectionToleranceDeg = 8;
  const socketPinnedToPalmTarget = palmTargetSocketDistances.every((value) => Number.isFinite(value) && value <= palmTargetTolerance);
  const appliedHiltPinnedToPalmTarget = palmTargetHiltDistances.every((value) => Number.isFinite(value) && value <= palmTargetTolerance);
  const displacementMinDistance = 0.05;
  const weaponGripDisplacedFromWeaponR = weaponRSocketDistances.every((value) => Number.isFinite(value) && value >= displacementMinDistance);
  const appliedHiltDisplacedFromWeaponR = weaponRHiltDistances.every((value) => Number.isFinite(value) && value >= displacementMinDistance);
  const appliedHiltAwayFromRawHand = rawHandHiltDistances.every((value) => Number.isFinite(value) && value >= displacementMinDistance);
  const socketPinnedToHandBaseline = handBaselineSocketDistances.every((value) => Number.isFinite(value) && value <= handBaselineTolerance);
  const appliedHiltPinnedToHandBaseline = handBaselineHiltDistances.every((value) => Number.isFinite(value) && value <= handBaselineTolerance);
  const localPositionDrift = (field) => samples.map((sample) => distance3(samples[0]?.weaponPinning?.local?.[field], sample.weaponPinning?.local?.[field]));
  const localQuaternionDrift = (field) => samples.map((sample) => quaternionAngleDeg(samples[0]?.weaponPinning?.local?.[field], sample.weaponPinning?.local?.[field]));
  const socketInSourceSocketDrift = localPositionDrift('socketInSourceSocket');
  const socketQuaternionInSourceSocketDriftDeg = localQuaternionDrift('socketQuaternionInSourceSocket');
  const displayInSocketDrift = localPositionDrift('displayInSocket');
  const displayQuaternionInSocketDriftDeg = localQuaternionDrift('displayQuaternionInSocket');
  const modelInDisplayDrift = localPositionDrift('modelInDisplay');
  const modelQuaternionInDisplayDriftDeg = localQuaternionDrift('modelQuaternionInDisplay');
  const socketStableInSourceSocket = socketInSourceSocketDrift.every((value) => Number.isFinite(value) && value <= localDriftTolerance);
  const socketQuaternionStableInSourceSocket = socketQuaternionInSourceSocketDriftDeg.every((value) => Number.isFinite(value) && value <= localQuaternionDriftToleranceDeg);
  const displayStableInSocket = displayInSocketDrift.every((value) => Number.isFinite(value) && value <= localDriftTolerance);
  const displayQuaternionStableInSocket = displayQuaternionInSocketDriftDeg.every((value) => Number.isFinite(value) && value <= localQuaternionDriftToleranceDeg);
  const modelStableInDisplay = modelInDisplayDrift.every((value) => Number.isFinite(value) && value <= localDriftTolerance);
  const modelQuaternionStableInDisplay = modelQuaternionInDisplayDriftDeg.every((value) => Number.isFinite(value) && value <= localQuaternionDriftToleranceDeg);
  const reproducesLiveRed = generatedClipResolved
    && hiltSocketDistances.every((value) => Number.isFinite(value) && value <= 0.0005)
    && (!appliedHiltAwayFromRawHand || !(weaponBladeDirectionErrorsDeg.length === samples.length && maxFinite(weaponBladeDirectionErrorsDeg) <= weaponBladeDirectionToleranceDeg));
  const checks = {
    actorResolved: Boolean(actor.scene),
    poseChecksPresent: true,
    weaponChecksPresent: true,
    allKeyBonesFinite,
    weaponFinite,
    weaponMeshRendered: samples.every((sample) => Array.isArray(sample.weaponMesh) && sample.weaponMesh.length > 50),
    parentChainMatchesFpsArmsShape: samples.every((sample) => sample.parentChain.join('>') === `${config.attachment.name}>WeaponGrip-display-root>WeaponGrip>WeaponR>RightHand`),
    hiltSocketDistanceFinite: hiltSocketDistances.every(Number.isFinite),
    handBaselineDistanceFinite: handBaselineSocketDistances.every(Number.isFinite) && handBaselineHiltDistances.every(Number.isFinite),
    palmTargetDistanceFinite: palmTargetSocketDistances.every(Number.isFinite) && palmTargetHiltDistances.every(Number.isFinite),
    weaponRDistanceFinite: weaponRSocketDistances.every(Number.isFinite) && weaponRHiltDistances.every(Number.isFinite),
    weaponGripDisplacedFromWeaponR,
    appliedHiltDisplacedFromWeaponR,
    appliedHiltAwayFromRawHand,
    weaponGripLocalStableUnderWeaponR: socketStableInSourceSocket,
    weaponGripQuaternionStableUnderWeaponR: socketQuaternionStableInSourceSocket,
    displayRootLocalStableUnderWeaponGrip: displayStableInSocket,
    displayRootQuaternionStableUnderWeaponGrip: displayQuaternionStableInSocket,
    weaponMeshLocalStableUnderDisplayRoot: modelStableInDisplay,
    weaponMeshQuaternionStableUnderDisplayRoot: modelQuaternionStableInDisplay,
    weaponOrientationComparedToFpsSource: weaponBladeDirectionErrorsDeg.length === samples.length,
    weaponBladeDirectionMatchesFpsSource: weaponBladeDirectionErrorsDeg.length === samples.length && maxFinite(weaponBladeDirectionErrorsDeg) <= weaponBladeDirectionToleranceDeg,
    appliedHiltPinnedToWeaponGrip: samples.every((sample) => sample.weaponPinning?.checks?.appliedHiltPinnedToSocket === true),
    socketPinnedToHandBaseline,
    appliedHiltPinnedToHandBaseline,
    socketPinnedToPalmTarget,
    appliedHiltPinnedToPalmTarget,
    reproducesLiveRed,
    bladeLengthFinite: tipDistances.every((value) => Number.isFinite(value) && value > 0.05),
  };
  const ok = checks.actorResolved
    && checks.poseChecksPresent
    && checks.weaponChecksPresent
    && checks.allKeyBonesFinite
    && checks.weaponFinite
    && checks.weaponMeshRendered
    && checks.parentChainMatchesFpsArmsShape
    && checks.hiltSocketDistanceFinite
    && checks.displayRootLocalStableUnderWeaponGrip
    && checks.displayRootQuaternionStableUnderWeaponGrip
    && checks.weaponMeshLocalStableUnderDisplayRoot
    && checks.weaponMeshQuaternionStableUnderDisplayRoot
    && checks.weaponOrientationComparedToFpsSource
    && checks.weaponBladeDirectionMatchesFpsSource
    && checks.appliedHiltPinnedToWeaponGrip
    && checks.weaponGripLocalStableUnderWeaponR
    && checks.weaponGripDisplacedFromWeaponR
    && checks.appliedHiltDisplacedFromWeaponR
    && checks.appliedHiltAwayFromRawHand
    && checks.bladeLengthFinite
    && generatedClipResolved;
  const result = {
    schema: 'pose-lab-offline-pose-weapon-render-v1',
    diagnosticOnly: true,
    productionBehaviorModified: false,
    actor: args.actor,
    actorAsset: path.relative(projectRoot, actorPath),
    sourceActorAsset: path.relative(projectRoot, fpsPath),
    weaponAsset: path.relative(projectRoot, weaponPath),
    clipRequested: args.clip,
    clipApplied: clip?.name || null,
    generatedClipResolved,
    generatedClipReason: generated.reason,
    generatedClipStats: {
      sourceKeyCount: generated.sourceKeyCount || null,
      targetKeyCount: generated.targetKeyCount || null,
      droppedInitialRestKey: generated.clip?.userData?.keyConvert?.droppedInitialRestKey === true,
      trimmedInitialRestTime: generated.clip?.userData?.keyConvert?.trimmedInitialRestTime ?? null,
      weaponTrackEnabled: generated.clip?.userData?.keyConvert?.weaponTrackEnabled === true,
      weaponTrackTarget: generated.clip?.userData?.keyConvert?.weaponTrackTarget || null,
      weaponOrientationMode: generated.clip?.userData?.keyConvert?.weaponOrientationMode || null,
      weaponTargetBladeLocal: generated.clip?.userData?.keyConvert?.weaponTargetBladeLocal || null,
      weaponTargetUpLocal: generated.clip?.userData?.keyConvert?.weaponTargetUpLocal || null,
      rightRollOffsetDeg: generated.clip?.userData?.keyConvert?.rightRollOffsetDeg ?? null,
      leftRollOffsetDeg: generated.clip?.userData?.keyConvert?.leftRollOffsetDeg ?? null,
      rightRestTargetLocalAxis: generated.clip?.userData?.keyConvert?.rightRestTargetLocalAxis || null,
      leftRestRollOverride: generated.clip?.userData?.keyConvert?.leftRestRollOverride ?? null,
    },
    generatedClipResolutionNote: generatedClipResolved
      ? 'Requested browser-generated Pose Lab ready clip was rebuilt offline from FPS OneHandReady using the shared Meshy ready runtime builder.'
      : 'Requested generated Pose Lab clip is not embedded in the Meshy GLB; this verifier deliberately marks fixed-mode false instead of pretending browser-generated clip parity.',
    samples: samples.length,
    checks,
    thresholds: {
      palmTargetTolerance,
      handBaselineTolerance,
      localDriftTolerance,
      localQuaternionDriftToleranceDeg,
      weaponBladeDirectionToleranceDeg,
      displacementMinDistance,
      socketToAppliedHiltTolerance: 0.0005,
    },
    hiltSocketDistances,
    rawHandHiltDistances,
    handBaselineSocketDistances,
    handBaselineHiltDistances,
    palmTargetSocketDistances,
    palmTargetHiltDistances,
    weaponRSocketDistances,
    weaponRHiltDistances,
    tipDistances,
    localDrift: {
      socketInSourceSocket: socketInSourceSocketDrift,
      socketQuaternionInSourceSocketDeg: socketQuaternionInSourceSocketDriftDeg,
      displayInSocket: displayInSocketDrift,
      displayQuaternionInSocketDeg: displayQuaternionInSocketDriftDeg,
      modelInDisplay: modelInDisplayDrift,
      modelQuaternionInDisplayDeg: modelQuaternionInDisplayDriftDeg,
    },
    weaponBladeDirectionErrorsDeg,
    weaponUpDirectionErrorsDeg,
    maxDistances: {
      socketToAppliedHilt: maxFinite(hiltSocketDistances),
      rawHandToAppliedHilt: maxFinite(rawHandHiltDistances),
      handBaselineToSocket: maxFinite(handBaselineSocketDistances),
      handBaselineToAppliedHilt: maxFinite(handBaselineHiltDistances),
      weaponRToWeaponGrip: maxFinite(weaponRSocketDistances),
      weaponRToAppliedHilt: maxFinite(weaponRHiltDistances),
      palmTargetToSocket: maxFinite(palmTargetSocketDistances),
      palmTargetToAppliedHilt: maxFinite(palmTargetHiltDistances),
    },
    maxLocalDrift: {
      socketInSourceSocket: maxFinite(socketInSourceSocketDrift),
      socketQuaternionInSourceSocketDeg: maxFinite(socketQuaternionInSourceSocketDriftDeg),
      displayInSocket: maxFinite(displayInSocketDrift),
      displayQuaternionInSocketDeg: maxFinite(displayQuaternionInSocketDriftDeg),
      modelInDisplay: maxFinite(modelInDisplayDrift),
      modelQuaternionInDisplayDeg: maxFinite(modelQuaternionInDisplayDriftDeg),
    },
    maxWeaponOrientationErrorDeg: {
      blade: maxFinite(weaponBladeDirectionErrorsDeg),
      up: maxFinite(weaponUpDirectionErrorsDeg),
    },
    reproducesLiveRed,
    expectedVisibleState: 'full body skeleton plus right-hand raw hand, WeaponR sword FK bone, displaced stable WeaponGrip child, applied hilt, and real sabre mesh visible in the same offline sheet',
    actualVisibleRead: generatedClipResolved
      ? (reproducesLiveRed
          ? 'offline renderer proves the hilt is pinned to WeaponGrip, but still reproduces the live red displacement or blade-orientation mismatch'
          : 'offline renderer resolves the generated ready clip, proves the sabre mesh is owned by displaced WeaponGrip under WeaponR FK, and proves the visible blade direction matches mapped FPS Weapon.R')
      : 'offline renderer shows the actual GLB pose fallback and weapon hierarchy, but cannot yet resolve the browser-generated ready clip offline',
    ok,
    artifacts: {
      png: 'pose_weapon_render.png',
      svg: 'pose_weapon_render.svg',
      json: 'pose_weapon_render.json',
      summary: 'pose_weapon_render_summary.md',
    },
  };
  const jsonPath = path.join(args.out, result.artifacts.json);
  const pngPath = path.join(args.out, result.artifacts.png);
  const svgPath = path.join(args.out, result.artifacts.svg);
  const summaryPath = path.join(args.out, result.artifacts.summary);
  fs.writeFileSync(jsonPath, JSON.stringify({ ...result, sampleData: samples }, null, 2));
  writeSheet(pngPath, samples, result);
  fs.writeFileSync(svgPath, `<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="780"><image href="${path.basename(pngPath)}" width="1320" height="780"/></svg>\n`);
  fs.writeFileSync(summaryPath, [
    '# Pose Lab Offline Pose And Weapon Render',
    '',
    `- Schema: ${result.schema}`,
    `- Actor: ${result.actor}`,
    `- Clip requested: ${result.clipRequested}`,
    `- Clip applied: ${result.clipApplied}`,
    `- Generated clip resolved: ${result.generatedClipResolved}`,
    `- OK: ${result.ok}`,
    `- PNG: ${path.relative(projectRoot, pngPath)}`,
    `- JSON: ${path.relative(projectRoot, jsonPath)}`,
    '',
    result.generatedClipResolutionNote,
    '',
  ].join('\n'));
  if (args.assertFixed && !ok) {
    throw new Error(`offline pose+weapon render did not prove fixed state; see ${path.relative(projectRoot, jsonPath)}`);
  }
  if (args.assertRepro && !reproducesLiveRed) {
    throw new Error(`offline pose+weapon render did not reproduce the live red marker disparity; see ${path.relative(projectRoot, jsonPath)}`);
  }
  console.log(JSON.stringify({ ok, reproducesLiveRed, path: path.relative(projectRoot, jsonPath), png: path.relative(projectRoot, pngPath), generatedClipResolved }, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
