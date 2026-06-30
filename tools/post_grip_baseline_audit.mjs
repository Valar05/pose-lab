#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'post_grip_baseline');
const previousPath = path.join(projectRoot, 'generated', 'blade_vector_workspace', 'blade_vector_workspace.json');
const METRICS = [
  ['averageHiltError', 'Average hilt error', 'distance'],
  ['maxHiltError', 'Maximum hilt error', 'distance'],
  ['averageBladeDirectionErrorDeg', 'Average blade direction error', 'deg'],
  ['maxBladeDirectionErrorDeg', 'Maximum blade direction error', 'deg'],
  ['averageBladeLengthRatio', 'Average blade length ratio', 'ratio'],
  ['averageTipError', 'Average tip error', 'distance'],
  ['maxTipError', 'Maximum tip error', 'distance'],
];
const EPS = { distance: 0.01, deg: 1, ratio: 0.01 };
const HILT_SMALL = 0.08;
const TIP_HIGH_AVG = 0.08;
const TIP_HIGH_MAX = 0.12;

function parseArgs(argv) {
  const args = { out: defaultOut, maxRenderFrames: 9, meshSampleStride: 1 };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++index] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--previous') args.previous = path.resolve(projectRoot, argv[++index] || previousPath);
    else if (arg.startsWith('--previous=')) args.previous = path.resolve(projectRoot, arg.slice('--previous='.length));
    else if (arg === '--max-render-frames') args.maxRenderFrames = Number(argv[++index] || args.maxRenderFrames);
    else if (arg.startsWith('--max-render-frames=')) args.maxRenderFrames = Number(arg.slice('--max-render-frames='.length));
    else if (arg === '--mesh-sample-stride') args.meshSampleStride = Number(argv[++index] || args.meshSampleStride);
    else if (arg.startsWith('--mesh-sample-stride=')) args.meshSampleStride = Number(arg.slice('--mesh-sample-stride='.length));
  }
  args.previous ||= previousPath;
  return args;
}

function round(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function point(vector, digits = 5) {
  return [round(vector.x, digits), round(vector.y, digits), round(vector.z, digits)];
}

function metricStatus(delta, unit) {
  const threshold = EPS[unit] ?? 0.01;
  if (Math.abs(delta) < threshold) return 'unchanged';
  return delta < 0 ? 'improved' : 'worse';
}

function improvement(previous, current) {
  const absolute = round(previous - current);
  const relative = previous > 0 ? round(absolute / previous, 5) : 0;
  return { absolute, relative, material: absolute >= 0.05 || relative >= 0.25 };
}

function recomputeDominant(summary = {}) {
  const counts = summary.classificationCounts || {};
  const total = Object.values(counts).reduce((sum, count) => sum + Number(count || 0), 0);
  const top = Object.entries(counts).sort((a, b) => Number(b[1]) - Number(a[1]))[0];
  if (top && total > 0 && Number(top[1]) >= total * 0.5) return normalizeClass(top[0]);
  if (summary.averageHiltError > HILT_SMALL) return 'attachment placement';
  if (summary.averageBladeDirectionErrorDeg >= 12) return 'blade direction / attachment basis';
  if (Math.abs((summary.averageBladeLengthRatio || 1) - 1) >= 0.08) return 'blade length';
  if (summary.averageTipError > TIP_HIGH_AVG || summary.maxTipError > TIP_HIGH_MAX) return 'blade landmark';
  return 'mixed';
}

function normalizeClass(name = '') {
  if (name === 'attachment-placement') return 'attachment placement';
  if (name === 'orientation/basis') return 'blade direction / attachment basis';
  if (name === 'scale-or-tip-landmark') return 'blade landmark or blade length';
  if (name === 'animated-socket-rotation') return 'animated socket divergence';
  if (name === 'within-threshold') return 'mixed';
  return name || 'mixed';
}

function recommendationFor(className, tipAuditRequired) {
  if (tipAuditRequired) return 'tip landmark';
  if (className === 'attachment placement') return 'attachment placement';
  if (className === 'blade direction / attachment basis') return 'blade basis';
  if (className === 'blade length') return 'blade length';
  if (className === 'animated socket divergence') return 'animated socket rotation';
  if (className.includes('blade landmark')) return 'tip landmark';
  return 'mixed / inspect per-frame evidence';
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

function collectMeshPoints(THREE, root, stride = 1) {
  const samples = [];
  const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((child) => {
    const attr = child.isMesh ? child.geometry?.attributes?.position : null;
    if (!attr) return;
    for (let index = 0; index < attr.count; index += Math.max(1, stride)) {
      v.fromBufferAttribute(attr, index).applyMatrix4(child.matrixWorld);
      samples.push({ point: v.clone(), mesh: child.name || '', vertexIndex: index });
    }
  });
  return samples;
}

function visibleBladeEndpoint(THREE, samples) {
  let minX = Infinity;
  for (const sample of samples) minX = Math.min(minX, sample.point.x);
  const near = samples.filter((sample) => Math.abs(sample.point.x - minX) <= 0.015);
  const box = new THREE.Box3();
  for (const sample of near.length ? near : samples) box.expandByPoint(sample.point);
  const center = box.getCenter(new THREE.Vector3());
  let nearest = samples[0] || null;
  for (const sample of samples) {
    if (!nearest || sample.point.distanceTo(center) < nearest.point.distanceTo(center)) nearest = sample;
  }
  return { point: center, nearest, clusterCount: near.length, minX };
}

function nearestSample(THREE, samples, pointValue) {
  const pointVec = new THREE.Vector3().fromArray(pointValue);
  let nearest = samples[0] || null;
  for (const sample of samples) {
    if (!nearest || sample.point.distanceTo(pointVec) < nearest.point.distanceTo(pointVec)) nearest = sample;
  }
  return { point: pointVec, nearest, distance: nearest ? nearest.point.distanceTo(pointVec) : 0 };
}

function writeTipOverlay(dataPath, pngPath) {
  const renderer = path.join(os.tmpdir(), 'pose-lab-post-grip-tip-render.py');
  fs.writeFileSync(renderer, String.raw`#!/usr/bin/env python3
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
data=json.loads(Path(sys.argv[1]).read_text())
W,H=1300,780
img=Image.new('RGB',(W,H),(7,10,14)); d=ImageDraw.Draw(img)
try:
  font=ImageFont.truetype('DejaVuSans.ttf',18); small=ImageFont.truetype('DejaVuSans.ttf',12)
except Exception:
  font=small=None
points=data.get('meshPoints',[])
configured=data.get('configuredTipLocalPosition')
visible=data.get('visibleBladeEndpoint')
def ok(p): return isinstance(p,list) and len(p)>=3
def all_points():
  out=[p for p in points if ok(p)]
  for p in [configured, visible]:
    if ok(p): out.append(p)
  return out or [[0,0,0]]
def bounds(view):
  pts=all_points(); ai,bi=(0,1) if view=='front' else (0,2)
  mn_a,mx_a=min(p[ai] for p in pts),max(p[ai] for p in pts)
  mn_b,mx_b=min(p[bi] for p in pts),max(p[bi] for p in pts)
  span=max(mx_a-mn_a,mx_b-mn_b,0.001)
  return ((mn_a+mx_a)/2,(mn_b+mx_b)/2,min(W*.42,H*.36)/span)
def project(p,panel,view,b):
  ai,bi=(0,1) if view=='front' else (0,2)
  cx,cy,s=b
  return ((panel[0]+panel[2])/2+(p[ai]-cx)*s,(panel[1]+panel[3])/2-(p[bi]-cy)*s)
def dot(p,panel,view,b,c,r=8):
  if not ok(p): return
  x,y=project(p,panel,view,b); d.ellipse([x-r,y-r,x+r,y+r],fill=c,outline=(255,255,255))
d.text((18,14),'Post-Grip Tip Landmark Audit: mesh samples, configured tip, visible blade endpoint',fill=(255,244,190),font=font)
d.text((18,40),f"distance={data.get('distanceConfiguredToVisible')} onEndpoint={data.get('configuredPointOnPhysicalBladeEndpoint')}",fill=(205,214,226),font=small)
for i,view in enumerate(['front','top']):
  panel=(20,82+i*330,W-20,392+i*330)
  b=bounds(view)
  d.rectangle(panel,outline=(52,64,82),width=1)
  d.text((panel[0]+8,panel[1]+8),view,fill=(226,232,240),font=small)
  for p in points:
    if ok(p):
      x,y=project(p,panel,view,b); d.point((x,y),fill=(52,211,153))
  dot(configured,panel,view,b,(251,146,60),9)
  dot(visible,panel,view,b,(239,68,68),7)
out=Path(sys.argv[2]); out.parent.mkdir(parents=True,exist_ok=True); img.save(out)
`);
  execFileSync('python3', [renderer, dataPath, pngPath], { stdio: 'pipe' });
}

async function writeTipAudit(current, outDir, required) {
  ensureBrowserShim();
  const threeDir = ensureThreeSandbox();
  const THREE = await import(pathToFileURL(path.join(threeDir, 'build', 'three.module.js')));
  const { GLTFLoader } = await import(pathToFileURL(path.join(threeDir, 'examples/jsm/loaders/GLTFLoader.js')));
  const attachment = current.attachmentSnapshots?.meshy?.attachment || {};
  const url = attachment.url || 'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb';
  const glb = await loadGlb(GLTFLoader, path.join(projectRoot, url));
  const samples = collectMeshPoints(THREE, glb.scene, 1);
  const visible = visibleBladeEndpoint(THREE, samples);
  const configured = attachment.tipLocalPosition || [-0.95561, 0.1368, 0];
  const nearest = nearestSample(THREE, samples, configured);
  const distance = nearest.point.distanceTo(visible.point);
  const payload = {
    schema: 'pose-lab-post-grip-tip-landmark-audit-v1',
    generatedAt: new Date().toISOString(),
    diagnosticOnly: true,
    productionBehaviorModified: false,
    investigationRequired: required,
    weaponUrl: url,
    configuredTipLocalPosition: configured,
    visibleBladeEndpoint: point(visible.point),
    distanceConfiguredToVisible: round(distance),
    configuredNearestMesh: nearest.nearest?.mesh || '',
    configuredNearestVertexIndex: nearest.nearest?.vertexIndex ?? null,
    configuredNearestVertexDistance: round(nearest.distance),
    visibleEndpointNearestMesh: visible.nearest?.mesh || '',
    visibleEndpointNearestVertexIndex: visible.nearest?.vertexIndex ?? null,
    visibleEndpointClusterCount: visible.clusterCount,
    configuredPointOnPhysicalBladeEndpoint: distance <= 0.03,
    meshPoints: samples.filter((_, index) => index % 8 === 0).map((sample) => point(sample.point, 4)),
  };
  const dataPath = path.join(outDir, 'tip_landmark_audit.json');
  const pngPath = path.join(outDir, 'tip_landmark_overlay.png');
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2) + '\n');
  writeTipOverlay(dataPath, pngPath);
  return payload;
}

function comparisonRows(previous, current) {
  return METRICS.map(([key, label, unit]) => {
    const previousValue = Number(previous.summary?.[key] || 0);
    const currentValue = Number(current.summary?.[key] || 0);
    const delta = round(currentValue - previousValue, unit === 'deg' ? 3 : 5);
    return { key, label, unit, previous: previousValue, current: currentValue, delta, status: metricStatus(delta, unit) };
  });
}

function writeComparison(outDir, previous, current, rows, className, tipAudit, recommendation) {
  const hiltGain = improvement(previous.summary.averageHiltError, current.summary.averageHiltError);
  const lines = [
    '# Post-Grip Blade Baseline Comparison',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Previous baseline: generated/blade_vector_workspace/blade_vector_workspace.json`,
    `Current baseline: generated/post_grip_baseline/blade_vector_workspace.json`,
    '',
    '| Metric | Previous | Current | Delta | Status |',
    '| --- | ---: | ---: | ---: | --- |',
    ...rows.map((row) => `| ${row.label} | ${row.previous} | ${row.current} | ${row.delta} | ${row.status} |`),
    '',
    '## Classification',
    `- Previous dominant class: ${normalizeClass(previous.summary.dominantClass)}`,
    `- Current dominant class: ${className}`,
    `- Current raw classification counts: ${JSON.stringify(current.summary.classificationCounts || {})}`,
    `- Grip placement materially improved: ${hiltGain.material}`,
    `- Hilt improvement: ${hiltGain.absolute} absolute, ${round(hiltGain.relative * 100, 2)}% relative`,
    `- Grip picks solved placement issue: ${current.summary.averageHiltError <= HILT_SMALL ? 'yes' : 'no'}`,
    `- Tip landmark audit required: ${tipAudit.investigationRequired}`,
    `- Configured tip on physical blade endpoint: ${tipAudit.configuredPointOnPhysicalBladeEndpoint}`,
    `- Next production target: ${recommendation}`,
    '',
    'This artifact is diagnostic-only. It does not modify production grip picks, FK, roll, retarget logic, weapon basis, startup clips, aliases, or accepted baselines.',
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'comparison_report.md'), lines.join('\n'));
}

async function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });
  const previous = JSON.parse(fs.readFileSync(args.previous, 'utf8'));
  execFileSync('node', [
    path.join(projectRoot, 'tools', 'meshy_blade_vector_workspace.mjs'),
    '--out', args.out,
    '--max-render-frames', String(args.maxRenderFrames),
  ], { cwd: projectRoot, stdio: 'pipe' });
  const currentPath = path.join(args.out, 'blade_vector_workspace.json');
  const current = JSON.parse(fs.readFileSync(currentPath, 'utf8'));
  const rows = comparisonRows(previous, current);
  const hiltGain = improvement(previous.summary.averageHiltError, current.summary.averageHiltError);
  const tipStillHigh = current.summary.averageTipError > TIP_HIGH_AVG || current.summary.maxTipError > TIP_HIGH_MAX;
  const tipAuditRequired = hiltGain.material && tipStillHigh;
  const className = recomputeDominant(current.summary);
  const tipAudit = await writeTipAudit(current, args.out, tipAuditRequired);
  const recommendation = recommendationFor(className, tipAuditRequired);
  writeComparison(args.out, previous, current, rows, className, tipAudit, recommendation);
  const result = {
    ok: true,
    schema: 'pose-lab-post-grip-baseline-audit-v1',
    diagnosticOnly: true,
    productionBehaviorModified: false,
    outDir: path.relative(projectRoot, args.out),
    current: path.relative(projectRoot, currentPath),
    comparison: path.relative(projectRoot, path.join(args.out, 'comparison_report.md')),
    tipAudit: path.relative(projectRoot, path.join(args.out, 'tip_landmark_audit.json')),
    tipOverlay: path.relative(projectRoot, path.join(args.out, 'tip_landmark_overlay.png')),
    previousSummary: previous.summary,
    currentSummary: current.summary,
    comparisonRows: rows,
    dominantFailure: className,
    gripPicksSolvedPlacement: current.summary.averageHiltError <= HILT_SMALL,
    nextProductionTarget: recommendation,
  };
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
