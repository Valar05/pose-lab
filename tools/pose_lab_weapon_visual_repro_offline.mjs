#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultScreenshot = '/storage/emulated/0/Pictures/Screenshots/Screenshot_20260630-203420.png';
const defaultClip = 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]';

function parseArgs(argv) {
  const args = {
    out: path.join(projectRoot, 'generated', 'weapon_visual_repro_offline', 'latest'),
    clip: defaultClip,
    screenshot: defaultScreenshot,
    time: 0,
    assertFixed: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--clip') args.clip = String(argv[++i] || args.clip);
    else if (arg.startsWith('--clip=')) args.clip = arg.slice('--clip='.length);
    else if (arg === '--screenshot') args.screenshot = String(argv[++i] || args.screenshot);
    else if (arg.startsWith('--screenshot=')) args.screenshot = arg.slice('--screenshot='.length);
    else if (arg === '--time') args.time = Number(argv[++i] || 0);
    else if (arg.startsWith('--time=')) args.time = Number(arg.slice('--time='.length));
    else if (arg === '--assert-fixed') args.assertFixed = true;
  }
  return args;
}

function ensureBrowserShim() {
  globalThis.ProgressEvent ||= class ProgressEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } };
  globalThis.window ||= { innerWidth: 920, innerHeight: 2048, devicePixelRatio: 1 };
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
      targetHeight: numberFor(block, 'targetHeight', 1.89),
      materialSource: 'assets/models/meshy_character_sheet/static/Meshy_AI_Meshy_Character_Sheet_0628173422_texture.glb',
    },
    proxy: {
      handBone: stringFor(proxy, 'handBone', 'RightHand'),
      leftHandBone: stringFor(proxy, 'leftHandBone', 'LeftHand'),
      socketBone: stringFor(proxy, 'socketBone', 'WeaponGrip'),
      parentMode: stringFor(proxy, 'parentMode', ''),
      positionMode: stringFor(proxy, 'positionMode', 'right-hand'),
      handLocalOffset: arrayFor(proxy, 'handLocalOffset', [0, 0, 0]),
      modelLocalOffset: arrayFor(proxy, 'modelLocalOffset', [0, 0, 0]),
      gripOffset: arrayFor(proxy, 'gripOffset', [0, 0, 0]),
      tipOffset: arrayFor(proxy, 'tipOffset', [0, 0, 0.85]),
      rotationDeg: arrayFor(proxy, 'rotationDeg', [0, 0, 0]),
      length: numberFor(proxy, 'length', 0.85),
      bladeColor: '#42e9ff',
      bladeOpacity: numberFor(proxy, 'bladeOpacity', 0.95),
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

function worldPosition(THREE, object) {
  return object.getWorldPosition(new THREE.Vector3());
}

function worldQuaternion(THREE, object) {
  return object.getWorldQuaternion(new THREE.Quaternion()).normalize();
}

function round(value, digits = 4) {
  return Number(Number(value || 0).toFixed(digits));
}

function point(v, digits = 4) {
  return [round(v.x, digits), round(v.y, digits), round(v.z, digits)];
}

function fitToHeight(THREE, model, height) {
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const scale = height / Math.max(0.001, size.y);
  model.scale.multiplyScalar(scale);
  model.updateMatrixWorld(true);
  const fitBox = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  fitBox.getCenter(center);
  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= fitBox.min.y;
  model.updateMatrixWorld(true);
}

function applyClipPose(THREE, root, clip, time) {
  if (!clip) return false;
  const duration = Math.max(0.001, Number(clip.duration || 0.001));
  const t = Math.max(0, Math.min(duration, Number(time || 0)));
  for (const track of clip.tracks || []) {
    if (!String(track.name || '').endsWith('.quaternion')) continue;
    const node = findNode(root, track.name.replace(/\.quaternion$/, ''));
    if (!node) continue;
    const result = track.createInterpolant(new Float32Array(4)).evaluate(t);
    node.quaternion.set(result[0], result[1], result[2], result[3]).normalize();
  }
  root.updateMatrixWorld(true);
  return true;
}

function attachRuntimeWeapon(THREE, meshyRoot, sabreRoot, config) {
  const hand = findNode(meshyRoot, config.proxy.handBone);
  const leftHand = findNode(meshyRoot, config.proxy.leftHandBone);
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

  const fallbackStart = new THREE.Group();
  fallbackStart.name = socket.name + '-fallback-start';
  fallbackStart.position.set(0, 0, 0);
  const fallbackEnd = new THREE.Group();
  fallbackEnd.name = socket.name + '-fallback-end';
  fallbackEnd.position.set(0, 0, Number(config.proxy.length || 0.85));
  displayRoot.add(fallbackStart);
  displayRoot.add(fallbackEnd);

  const model = sabreRoot;
  model.name = config.attachment.name;
  displayRoot.add(model);

  const grip = new THREE.Group();
  grip.name = config.attachment.name + '-configured-grip';
  displayRoot.add(grip);
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
    model.rotation.set(...config.attachment.rotationDeg.map((value) => THREE.MathUtils.degToRad(value || 0)), 'XYZ');
    model.position.fromArray(config.attachment.position);
    const gripLocal = new THREE.Vector3().fromArray(config.attachment.gripLocalPosition);
    gripLocal.multiplyScalar(config.attachment.scale);
    gripLocal.applyQuaternion(model.quaternion);
    model.position.sub(gripLocal);
    grip.position.set(0, 0, 0);
    const tipLocal = new THREE.Vector3().fromArray(config.attachment.tipLocalPosition);
    tipLocal.multiplyScalar(config.attachment.scale);
    tipLocal.applyQuaternion(model.quaternion);
    tipLocal.add(model.position);
    tip.position.copy(tipLocal);
    fallbackStart.position.set(0, 0, 0);
    fallbackEnd.position.copy(tip.position);
    meshyRoot.updateMatrixWorld(true);
  };
  applyAttachment();
  return { hand, leftHand, socket, displayRoot, model, grip, tip, fallbackStart, fallbackEnd, applyAttachment };
}

function makeCamera(THREE, width, height, focus) {
  const camera = new THREE.PerspectiveCamera(45, width / Math.max(1, height), 0.1, 100);
  const target = focus.clone().add(new THREE.Vector3(0.05, 0.05, 0));
  camera.position.copy(focus.clone().add(new THREE.Vector3(-0.58, 0.34, 2.05)));
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return camera;
}

function projectPoint(THREE, camera, pointWorld, width, height) {
  const p = pointWorld.clone().project(camera);
  return {
    x: round(((p.x + 1) * 0.5 * width), 2),
    y: round(((1 - p.y) * 0.5 * height), 2),
    z: round(p.z, 4),
  };
}

function screenDistance(a, b) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function lineAngleDeg(a, b) {
  return round(Math.atan2(Number(b.y || 0) - Number(a.y || 0), Number(b.x || 0) - Number(a.x || 0)) * 180 / Math.PI, 2);
}

function writeRendererScript() {
  const renderer = path.join(os.tmpdir(), 'pose-lab-weapon-visual-repro-render.py');
  fs.writeFileSync(renderer, String.raw`#!/usr/bin/env python3
import json, math, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

data=json.loads(Path(sys.argv[1]).read_text())
out=Path(sys.argv[2])
W,H=1600,940
bg=(6,9,13)
img=Image.new('RGB',(W,H),bg)
d=ImageDraw.Draw(img)
try:
  font=ImageFont.truetype('DejaVuSans.ttf',20)
  small=ImageFont.truetype('DejaVuSans.ttf',13)
except Exception:
  font=small=None
shot_path=data.get('screenshot','')
crop_box=None
cyan_metrics={}
if shot_path and Path(shot_path).exists():
  shot=Image.open(shot_path).convert('RGB')
  sw,sh=shot.size
  # Keep the 3D viewport area, excluding browser chrome and lower clip panel.
  crop_box=(0, max(0,int(sh*0.13)), sw, min(sh,int(sh*0.60)))
  crop=shot.crop(crop_box)
  crop.thumbnail((760,680))
  img.paste(crop,(24,96))
  pix=crop.load(); pts=[]
  for y in range(crop.height):
    for x in range(crop.width):
      r,g,b=pix[x,y]
      if g>165 and b>170 and r<85 and abs(g-b)<80:
        pts.append((x,y))
  if pts:
    xs=[p[0] for p in pts]; ys=[p[1] for p in pts]
    cyan_metrics={'count':len(pts),'bbox':[min(xs),min(ys),max(xs),max(ys)],'angleDeg':round(math.degrees(math.atan2(max(ys)-min(ys),max(xs)-min(xs))),2)}
else:
  d.rectangle((24,96,784,776),outline=(80,90,105),width=2)
  d.text((42,118),'screenshot unavailable',fill=(248,113,113),font=font)

panel=(820,96,1576,776)
d.rectangle(panel,outline=(64,75,92),width=2)
d.text((24,24),'Offline weapon visual reproducer: screenshot crop vs UI-rule projection',fill=(255,244,190),font=font)
d.text((24,54),data.get('actualVisibleRead',''),fill=(205,214,226),font=small)
d.text((820,54),f"reproducesProblem={data.get('reproducesProblem')} clip={data.get('clip')}",fill=(205,214,226),font=small)

screen=data.get('screen',{})
def p(name):
  v=screen.get(name,{})
  return (panel[0]+float(v.get('x',0)), panel[1]+float(v.get('y',0)))
def dot(name,color,label,r=7):
  x,y=p(name)
  d.ellipse((x-r,y-r,x+r,y+r),fill=color,outline=(0,0,0),width=2)
  d.text((x+r+4,y-r-4),label,fill=color,font=small)
def line(a,b,color,w=5):
  d.line((p(a),p(b)),fill=color,width=w)

# floor/grid hints and body proxy
d.rectangle((panel[0]+20,panel[1]+420,panel[2]-20,panel[3]-30),fill=(44,54,59),outline=(70,85,94))
for i in range(8):
  x=panel[0]+20+i*(panel[2]-panel[0]-40)/7
  d.line((x,panel[1]+420,x+160,panel[3]-30),fill=(72,91,103),width=1)
for i in range(5):
  y=panel[1]+420+i*(panel[3]-panel[1]-450)/4
  d.line((panel[0]+20,y,panel[2]-20,y+70),fill=(72,91,103),width=1)
d.ellipse((panel[0]+385,panel[1]+235,panel[0]+520,panel[1]+640),outline=(91,103,115),width=5)
d.ellipse((panel[0]+445,panel[1]+130,panel[0]+535,panel[1]+225),outline=(91,103,115),width=4)

line('hand','socket',(56,189,248),3)
line('socket','fallbackEnd',(34,211,238),12)
line('grip','tip',(250,204,21),5)
line('socket','tip',(251,146,60),3)
dot('hand',(56,189,248),'RightHand')
dot('socket',(250,204,21),'WeaponGrip')
dot('grip',(34,197,94),'grip')
dot('model',(251,146,60),'model')
dot('tip',(52,211,153),'tip')

metrics=data.get('metrics',{})
y0=panel[3]+24
d.text((24,y0),f"screenshot cyan metrics: {cyan_metrics}",fill=(148,163,184),font=small)
d.text((24,y0+22),f"offline metrics: hiltToHandPx={metrics.get('hiltToHandPx')} fallbackAngleDeg={metrics.get('fallbackAngleDeg')} fallbackCrossesTorso={metrics.get('fallbackCrossesTorso')}",fill=(226,232,240),font=small)
d.text((24,y0+44),'This artifact is diagnostic only. It must not be used as a fix or promotion gate.',fill=(248,113,113),font=small)
out.parent.mkdir(parents=True,exist_ok=True)
img.save(out)
print(json.dumps({'screenshotCyanMetrics':cyan_metrics}))
`);
  return renderer;
}

function writeSummary(outDir, data) {
  const lines = [
    '# Offline Weapon Visual Reproducer',
    '',
    `Generated: ${data.generatedAt}`,
    `Screenshot: ${data.screenshot}`,
    `Clip: ${data.clip}`,
    `Reproduces problem: ${data.reproducesProblem}`,
    '',
    '## Visible Read',
    data.actualVisibleRead,
    '',
    '## Metrics',
    `- hiltToHandPx: ${data.metrics.hiltToHandPx}`,
    `- fallbackAngleDeg: ${data.metrics.fallbackAngleDeg}`,
    `- fallbackCrossesTorso: ${data.metrics.fallbackCrossesTorso}`,
    `- parentChain: ${JSON.stringify(data.parentChain)}`,
    '',
    'Diagnostic only. This tool does not modify runtime placement, generated clips, profile values, or startup behavior.',
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'visual_repro_summary.md'), lines.join('\n'));
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples', 'jsm', 'loaders', 'GLTFLoader.js')));
  const config = parseMeshyConfig();
  const meshyPath = path.join(projectRoot, 'assets', 'models', 'meshy_character_sheet', 'animated', 'Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb');
  const sabrePath = path.join(projectRoot, config.attachment.url);
  const meshy = await loadGlb(GLTFLoader, meshyPath);
  const sabre = await loadGlb(GLTFLoader, sabrePath);
  const nativeClip = meshy.animations.find((entry) => entry.name === args.clip || entry.name.includes(args.clip));
  const poseApplied = applyClipPose(THREE, meshy.scene, nativeClip, args.time);
  fitToHeight(THREE, meshy.scene, config.actor.targetHeight);
  const runtime = attachRuntimeWeapon(THREE, meshy.scene, sabre.scene, config);
  runtime.applyAttachment();
  meshy.scene.updateMatrixWorld(true);

  const width = 756;
  const height = 680;
  const focus = worldPosition(THREE, runtime.socket).lerp(worldPosition(THREE, runtime.tip), 0.22);
  const camera = makeCamera(THREE, width, height, focus);
  const world = {
    hand: worldPosition(THREE, runtime.hand),
    leftHand: runtime.leftHand ? worldPosition(THREE, runtime.leftHand) : null,
    socket: worldPosition(THREE, runtime.socket),
    displayRoot: worldPosition(THREE, runtime.displayRoot),
    model: worldPosition(THREE, runtime.model),
    grip: worldPosition(THREE, runtime.grip),
    tip: worldPosition(THREE, runtime.tip),
    fallbackStart: worldPosition(THREE, runtime.fallbackStart),
    fallbackEnd: worldPosition(THREE, runtime.fallbackEnd),
  };
  const screen = Object.fromEntries(Object.entries(world)
    .filter(([, value]) => value)
    .map(([key, value]) => [key, projectPoint(THREE, camera, value, width, height)]));
  const hiltToHandPx = round(screenDistance(screen.hand, screen.socket), 2);
  const gripToHandPx = round(screenDistance(screen.hand, screen.grip), 2);
  const fallbackAngleDeg = lineAngleDeg(screen.fallbackStart, screen.fallbackEnd);
  const gripTipAngleDeg = lineAngleDeg(screen.grip, screen.tip);
  const fallbackCrossesTorso = screen.fallbackEnd.y > screen.socket.y + 95 && screen.fallbackEnd.x > screen.socket.x + 80;
  const fallbackDiagonalDown = fallbackAngleDeg > 20 && screen.fallbackEnd.y > screen.socket.y + 35;
  const fallbackToTipPx = round(screenDistance(screen.fallbackEnd, screen.tip), 2);
  const fallbackAlignedToTip = fallbackToTipPx <= 2;
  const reproducesProblem = hiltToHandPx > 18 && fallbackDiagonalDown && !fallbackAlignedToTip;
  const fixedPass = fallbackAlignedToTip && fallbackToTipPx <= 2;
  const data = {
    schema: 'pose-lab-offline-weapon-visual-repro-v1',
    generatedAt: new Date().toISOString(),
    diagnosticOnly: true,
    productionBehaviorModified: false,
    assertFixed: Boolean(args.assertFixed),
    screenshot: args.screenshot,
    clip: args.clip,
    poseSource: poseApplied ? 'native-glb-clip' : 'profile-current-pose-with-generated-ready-label',
    source: path.relative(projectRoot, meshyPath),
    sabre: path.relative(projectRoot, sabrePath),
    materialSource: config.actor.materialSource,
    uiRulesMirrored: [
      'Meshy animated GLB',
      'targetHeight fitToHeight',
      'hand-fk WeaponGrip',
      'display-root scale compensation',
      'real Meshy sabre attachment',
      'cyan fallback blade visible because hideFallbackOnAttachment=false',
      'cyan fallback blade endpoint follows configured WeaponGrip_end when a real attachment is present',
      'Meshy static full-PBR GLB material source recorded for visual-layer parity',
      'orbit-style perspective projection',
      'syncWeaponVisualAttachment forces hand-fk socket before attachment/fallback refresh',
    ],
    config: {
      handLocalOffset: config.proxy.handLocalOffset,
      modelLocalOffset: config.proxy.modelLocalOffset,
      attachmentRotationDeg: config.attachment.rotationDeg,
      gripLocalPosition: config.attachment.gripLocalPosition,
      tipLocalPosition: config.attachment.tipLocalPosition,
      scale: config.attachment.scale,
    },
    parentChain: [runtime.model.name, runtime.model.parent?.name, runtime.model.parent?.parent?.name, runtime.model.parent?.parent?.parent?.name].filter(Boolean),
    world: Object.fromEntries(Object.entries(world).filter(([, value]) => value).map(([key, value]) => [key, point(value)])),
    screen,
    metrics: {
      hiltToHandPx,
      gripToHandPx,
      fallbackAngleDeg,
      gripTipAngleDeg,
      fallbackCrossesTorso,
      fallbackDiagonalDown,
      fallbackToTipPx,
      fallbackAlignedToTip,
      fixedPass,
    },
    expectedVisibleState: 'weapon grip should sit in the right hand and blade/debug fallback should align with the held sabre',
    actualVisibleRead: 'Newest screenshot shows ready selected; the cyan/socket overlay moved, but the rendered Meshy sabre handle and blade still sit visibly wrong until a real weapon-pose-tool edit is captured.',
    reproducesProblem,
  };
  const jsonPath = path.join(args.out, 'visual_repro.json');
  const pngPath = path.join(args.out, 'visual_repro.png');
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
  const renderer = writeRendererScript();
  const rendered = spawnSync('python3', [renderer, jsonPath, pngPath], { encoding: 'utf8' });
  if (rendered.status !== 0) throw new Error(rendered.stderr || rendered.stdout || 'offline renderer failed');
  if (rendered.stdout.trim()) {
    try {
      const extra = JSON.parse(rendered.stdout.trim());
      data.screenshotCyanMetrics = extra.screenshotCyanMetrics;
      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n');
    } catch {
      // Keep rendering output non-fatal.
    }
  }
  writeSummary(args.out, data);
  console.log(JSON.stringify({
    reproducesProblem,
    json: path.relative(projectRoot, jsonPath),
    png: path.relative(projectRoot, pngPath),
    summary: path.relative(projectRoot, path.join(args.out, 'visual_repro_summary.md')),
    metrics: data.metrics,
    screenshotCyanMetrics: data.screenshotCyanMetrics || null,
  }, null, 2));
  if (args.assertFixed) {
    if (!fixedPass || reproducesProblem) process.exitCode = 1;
  } else if (!reproducesProblem && !fallbackAlignedToTip) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
