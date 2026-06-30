#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'semantic_landmark_calibration');

function parseArgs(argv) {
  const args = { out: defaultOut, actor: 'player', meshSampleStride: 18, pickFromBounds: false, hilt: null, tip: null };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++index] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--actor') args.actor = argv[++index] || args.actor;
    else if (arg.startsWith('--actor=')) args.actor = arg.slice('--actor='.length);
    else if (arg === '--mesh-sample-stride') args.meshSampleStride = Number(argv[++index] || args.meshSampleStride);
    else if (arg.startsWith('--mesh-sample-stride=')) args.meshSampleStride = Number(arg.slice('--mesh-sample-stride='.length));
    else if (arg === '--pick-from-bounds') args.pickFromBounds = true;
    else if (arg === '--hilt') args.hilt = parseVec(argv[++index]);
    else if (arg.startsWith('--hilt=')) args.hilt = parseVec(arg.slice('--hilt='.length));
    else if (arg === '--tip') args.tip = parseVec(argv[++index]);
    else if (arg.startsWith('--tip=')) args.tip = parseVec(arg.slice('--tip='.length));
  }
  return args;
}

function parseVec(text = '') {
  const values = String(text).split(',').map((value) => Number(value.trim()));
  return values.length === 3 && values.every(Number.isFinite) ? values : null;
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

function round(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function point(vector, digits = 5) {
  return [round(vector.x, digits), round(vector.y, digits), round(vector.z, digits)];
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

function parseAttachment(actorKey) {
  const nextKey = actorKey === 'player' ? 'arcane' : 'meshyStatic';
  const block = profileBlock(actorKey, nextKey);
  const attachStart = block.indexOf('weaponAttachment:');
  if (attachStart < 0) throw new Error(`missing weaponAttachment for ${actorKey}`);
  const attachEndMarkers = ['\n    extraClipUrls:', '\n    ownClipOptions:', '\n    retargetOptions:', '\n    legSymmetry:', '\n    autoRetargetSources:'];
  const attachEnd = attachEndMarkers.map((marker) => block.indexOf(marker, attachStart)).filter((index) => index > attachStart).sort((a, b) => a - b)[0] || -1;
  const attachment = block.slice(attachStart, attachEnd > attachStart ? attachEnd : undefined);
  return {
    actorKey,
    url: stringFor(attachment, 'url', 'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb'),
    name: stringFor(attachment, 'name', 'Weapon'),
    gripLocalPosition: arrayFor(attachment, 'gripLocalPosition', [0, 0, 0]),
    tipLocalPosition: arrayFor(attachment, 'tipLocalPosition', [0, 0.85, 0]),
  };
}

function collectMeshPoints(THREE, root, stride = 18) {
  const points = [];
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    const attr = child.isMesh ? child.geometry?.attributes?.position : null;
    if (!attr) return;
    for (let index = 0; index < attr.count; index += Math.max(1, stride)) {
      v.fromBufferAttribute(attr, index).applyMatrix4(child.matrixWorld);
      points.push({ point: v.clone(), mesh: child.name || '', vertexIndex: index });
    }
  });
  return points;
}

function boundsPick(THREE, samples) {
  const box = new THREE.Box3();
  for (const sample of samples) box.expandByPoint(sample.point);
  const center = box.getCenter(new THREE.Vector3());
  let hilt = samples[0];
  let tip = samples[0];
  for (const sample of samples) {
    if (sample.point.distanceTo(center) < hilt.point.distanceTo(center)) hilt = sample;
    if (sample.point.x < tip.point.x) tip = sample;
  }
  return { hilt, tip, bounds: { min: point(box.min), max: point(box.max), center: point(center) } };
}

function candidateFromVec(THREE, vec, samples, label) {
  if (!vec) return null;
  const target = new THREE.Vector3().fromArray(vec);
  let nearest = samples[0] || null;
  for (const sample of samples) {
    if (!nearest || sample.point.distanceTo(target) < nearest.point.distanceTo(target)) nearest = sample;
  }
  return {
    label,
    local: point(target),
    world: point(target),
    nearestMesh: nearest?.mesh || '',
    nearestVertexIndex: nearest?.vertexIndex ?? null,
    nearestVertexDistance: nearest ? round(nearest.point.distanceTo(target)) : null,
  };
}

function writePng(dataPath, pngPath) {
  const renderer = path.join(os.tmpdir(), 'pose-lab-semantic-landmark-render.py');
  fs.writeFileSync(renderer, String.raw`#!/usr/bin/env python3
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
data=json.loads(Path(sys.argv[1]).read_text())
W,H=1200,740
img=Image.new('RGB',(W,H),(7,10,14))
d=ImageDraw.Draw(img)
try:
  font=ImageFont.truetype('DejaVuSans.ttf',18)
  small=ImageFont.truetype('DejaVuSans.ttf',12)
except Exception:
  font=small=None
points=data.get('meshPoints',[])
existing=data.get('existing',{})
candidate=data.get('candidate',{})
def ok(p): return isinstance(p,list) and len(p)>=3
def all_points():
  out=[p for p in points if ok(p)]
  for p in [existing.get('gripLocalPosition'), existing.get('tipLocalPosition'), candidate.get('gripLocalPosition'), candidate.get('tipLocalPosition')]:
    if ok(p): out.append(p)
  return out or [[0,0,0]]
def bounds(view):
  pts=all_points(); ai,bi=(0,1) if view=='front' else (0,2)
  mn_a,mx_a=min(p[ai] for p in pts),max(p[ai] for p in pts)
  mn_b,mx_b=min(p[bi] for p in pts),max(p[bi] for p in pts)
  span=max(mx_a-mn_a,mx_b-mn_b,0.001)
  return ((mn_a+mx_a)/2,(mn_b+mx_b)/2, min(W*.40,H*.34)/span)
def project(p,panel,view,b):
  ai,bi=(0,1) if view=='front' else (0,2)
  cx,cy,s=b
  return ((panel[0]+panel[2])/2+(p[ai]-cx)*s,(panel[1]+panel[3])/2-(p[bi]-cy)*s)
def dot(p,panel,view,b,c,r=6):
  if not ok(p): return
  x,y=project(p,panel,view,b); d.ellipse([x-r,y-r,x+r,y+r],fill=c,outline=(255,255,255))
def line(a,bp,panel,view,b,c,w=2):
  if ok(a) and ok(bp): d.line([project(a,panel,view,b),project(bp,panel,view,b)],fill=c,width=w)
d.text((18,14),'Semantic Landmark Calibration: actual saber mesh plus configured/candidate local markers',fill=(255,244,190),font=font)
d.text((18,40),f"actor={data.get('actor')} candidateComplete={candidate.get('complete')} productionBehaviorModified={data.get('productionBehaviorModified')}",fill=(205,214,226),font=small)
for i,view in enumerate(['front','top']):
  panel=(20,80+i*320,W-20,380+i*320)
  b=bounds(view)
  d.rectangle(panel,outline=(52,64,82),width=1)
  d.text((panel[0]+8,panel[1]+8),view,fill=(226,232,240),font=small)
  for p in points:
    x,y=project(p,panel,view,b); d.point((x,y),fill=(52,211,153))
  line(existing.get('gripLocalPosition'),existing.get('tipLocalPosition'),panel,view,b,(250,204,21),2)
  line(candidate.get('gripLocalPosition'),candidate.get('tipLocalPosition'),panel,view,b,(248,113,113),2)
  dot(existing.get('gripLocalPosition'),panel,view,b,(34,211,238),7)
  dot(existing.get('tipLocalPosition'),panel,view,b,(251,146,60),7)
  dot(candidate.get('gripLocalPosition'),panel,view,b,(59,130,246),5)
  dot(candidate.get('tipLocalPosition'),panel,view,b,(239,68,68),5)
out=Path(sys.argv[2]); out.parent.mkdir(parents=True,exist_ok=True); img.save(out)
`);
  execFileSync('python3', [renderer, dataPath, pngPath], { stdio: 'pipe' });
}

function writeSummary(outDir, payload) {
  const lines = [
    '# Semantic Weapon Landmark Calibration',
    '',
    `Generated: ${payload.generatedAt}`,
    `Actor: ${payload.actor}`,
    `Candidate complete: ${payload.candidate.complete}`,
    '',
    '## Existing',
    `- gripLocalPosition: ${JSON.stringify(payload.existing.gripLocalPosition)}`,
    `- tipLocalPosition: ${JSON.stringify(payload.existing.tipLocalPosition)}`,
    '',
    '## Candidate',
    `- gripLocalPosition: ${JSON.stringify(payload.candidate.gripLocalPosition)}`,
    `- tipLocalPosition: ${JSON.stringify(payload.candidate.tipLocalPosition)}`,
    '',
    'Candidate values are evidence only. This artifact does not change production retarget behavior, attachment offsets, FK, roll, weapon basis, startup clips, aliases, or accepted baselines.',
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'candidate_summary.md'), lines.join('\n'));
}

async function main() {
  const args = parseArgs(process.argv);
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const attachment = parseAttachment(args.actor);
  const glb = await loadGlb(GLTFLoader, path.join(projectRoot, attachment.url));
  const samples = collectMeshPoints(THREE, glb.scene, args.meshSampleStride);
  const bounds = boundsPick(THREE, samples);
  const hiltVec = args.hilt || (args.pickFromBounds ? bounds.hilt.point.toArray() : null);
  const tipVec = args.tip || (args.pickFromBounds ? bounds.tip.point.toArray() : null);
  const candidateHilt = candidateFromVec(THREE, hiltVec, samples, 'hilt');
  const candidateTip = candidateFromVec(THREE, tipVec, samples, 'tip');
  const payload = {
    schema: 'pose-lab-semantic-weapon-landmark-calibration-v1',
    generatedAt: new Date().toISOString(),
    diagnosticOnly: true,
    candidateOnly: true,
    productionBehaviorModified: false,
    actor: args.actor,
    weaponModel: attachment.name,
    weaponUrl: attachment.url,
    existing: {
      gripLocalPosition: attachment.gripLocalPosition,
      tipLocalPosition: attachment.tipLocalPosition,
    },
    candidate: {
      complete: Boolean(candidateHilt && candidateTip),
      gripLocalPosition: candidateHilt?.local || null,
      tipLocalPosition: candidateTip?.local || null,
      hilt: candidateHilt,
      tip: candidateTip,
    },
    meshBounds: bounds.bounds,
    meshPoints: samples.map((sample) => point(sample.point, 4)),
  };
  fs.mkdirSync(args.out, { recursive: true });
  const dataPath = path.join(args.out, 'semantic_landmark_calibration.json');
  const pngPath = path.join(args.out, 'semantic_landmark_overlay.png');
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2) + '\n');
  writeSummary(args.out, payload);
  writePng(dataPath, pngPath);
  console.log(JSON.stringify({
    ok: true,
    data: path.relative(projectRoot, dataPath),
    png: path.relative(projectRoot, pngPath),
    summary: path.relative(projectRoot, path.join(args.out, 'candidate_summary.md')),
    candidate: payload.candidate,
  }, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
