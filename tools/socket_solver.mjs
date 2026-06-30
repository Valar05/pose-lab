#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOut = path.join(projectRoot, 'generated', 'socket_solver');
const STABILITY = {
  maxDeviation: 0.025,
  standardDeviation: 0.01,
  promotionError: 0.08,
};
const MANUAL_PLACEMENT_LOCK = {
  locked: true,
  reason: 'Manual weapon placement is repository truth. Socket solver output is diagnostic-only and must not overwrite src/rig-profiles.js.',
  unlockPolicy: 'Only a separately confirmed user request for an exact placement may change production weapon placement values.',
};

function parseArgs(argv) {
  const args = { out: defaultOut, maxRenderFrames: 9 };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') args.out = path.resolve(projectRoot, argv[++index] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
    else if (arg === '--max-render-frames') args.maxRenderFrames = Number(argv[++index] || args.maxRenderFrames);
    else if (arg.startsWith('--max-render-frames=')) args.maxRenderFrames = Number(arg.slice('--max-render-frames='.length));
  }
  return args;
}

function round(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function vec(values = [0, 0, 0]) {
  return [Number(values[0] || 0), Number(values[1] || 0), Number(values[2] || 0)];
}

function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a, s) {
  return [a[0] * s, a[1] * s, a[2] * s];
}

function length(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

function point(a, digits = 5) {
  return vec(a).map((value) => round(value, digits));
}

function avg(values) {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function averageVector(vectors) {
  return point(scale(vectors.reduce((sum, value) => add(sum, value), [0, 0, 0]), 1 / Math.max(1, vectors.length)));
}

function standardDeviation(values) {
  const mean = avg(values);
  return Math.sqrt(avg(values.map((value) => (value - mean) ** 2)));
}

function runBladeWorkspace(outDir, maxRenderFrames) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-lab-socket-solver-blade-'));
  try {
    execFileSync('node', [
      path.join(projectRoot, 'tools', 'meshy_blade_vector_workspace.mjs'),
      '--out', tmp,
      '--max-render-frames', String(maxRenderFrames),
    ], { cwd: projectRoot, stdio: 'pipe' });
    const data = JSON.parse(fs.readFileSync(path.join(tmp, 'blade_vector_workspace.json'), 'utf8'));
    fs.mkdirSync(outDir, { recursive: true });
    return data;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function solveRows(blade) {
  return (blade.reports?.perFrame || []).map((row) => {
    const target = vec(row.fpsHilt);
    const socket = vec(row.meshySocket);
    const grip = vec(row.meshyHilt);
    const worldCorrection = sub(target, grip);
    const predictedGrip = add(grip, worldCorrection);
    return {
      index: row.index,
      time: row.time,
      projectedGripTargetWorld: point(target),
      currentSocketWorld: point(socket),
      currentGripWorld: point(grip),
      socketToProjectedTarget: point(sub(target, socket)),
      attachmentGripToProjectedTarget: point(worldCorrection),
      attachmentGripToSocket: point(sub(socket, grip)),
      socketParentLocalCorrection: point(worldCorrection),
      before: {
        socketError: row.socketError,
        pickedGripError: row.pickedGripError,
        hiltLandmarkError: row.hiltLandmarkError,
      },
      predictedWithExactCorrection: {
        gripWorld: point(predictedGrip),
        pickedGripError: round(length(sub(target, predictedGrip))),
      },
    };
  });
}

function applyAverage(rows, correction) {
  return rows.map((row) => {
    const predictedGrip = add(row.currentGripWorld, correction);
    const afterError = length(sub(row.projectedGripTargetWorld, predictedGrip));
    return {
      index: row.index,
      time: row.time,
      predictedGripWorld: point(predictedGrip),
      beforePickedGripError: row.before.pickedGripError,
      afterPickedGripError: round(afterError),
    };
  });
}

function writeOverlay(payload, pngPath) {
  const dataPath = path.join(path.dirname(pngPath), 'socket_solver.json');
  const renderer = path.join(os.tmpdir(), 'pose-lab-socket-solver-render.py');
  fs.writeFileSync(renderer, String.raw`#!/usr/bin/env python3
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
data=json.loads(Path(sys.argv[1]).read_text())
frames=data.get('renderFrames', [])
W,H=1800,860
img=Image.new('RGB',(W,H),(6,9,13)); d=ImageDraw.Draw(img)
try:
  font=ImageFont.truetype('DejaVuSans.ttf',18); small=ImageFont.truetype('DejaVuSans.ttf',12)
except Exception:
  font=small=None
def ok(p): return isinstance(p,list) and len(p)>=3
def pts(frame):
  out=[]
  for key in ['projectedGripTargetWorld','currentSocketWorld','currentGripWorld','predictedGripWorld']:
    if ok(frame.get(key)): out.append(frame[key])
  return out or [[0,0,0]]
def bounds(frame, panel, view):
  p=pts(frame); ai,bi=(0,1) if view=='front' else (0,2)
  mn_a,mx_a=min(x[ai] for x in p),max(x[ai] for x in p)
  mn_b,mx_b=min(x[bi] for x in p),max(x[bi] for x in p)
  span=max(mx_a-mn_a,mx_b-mn_b,0.001)
  return ((mn_a+mx_a)/2,(mn_b+mx_b)/2,min((panel[2]-panel[0])*.68,(panel[3]-panel[1])*.68)/span)
def project(p,panel,view,b):
  ai,bi=(0,1) if view=='front' else (0,2)
  cx,cy,s=b
  return ((panel[0]+panel[2])/2+(p[ai]-cx)*s,(panel[1]+panel[3])/2-(p[bi]-cy)*s)
def dot(p,panel,view,b,c,r=6):
  if not ok(p): return
  x,y=project(p,panel,view,b); d.ellipse([x-r,y-r,x+r,y+r],fill=c,outline=(255,255,255))
def line(a,bp,panel,view,b,c,w=2):
  if ok(a) and ok(bp): d.line([project(a,panel,view,b),project(bp,panel,view,b)],fill=c,width=w)
d.text((18,14),'WeaponGrip Socket Solver: target green, current grip red, socket blue, predicted grip yellow',fill=(255,244,190),font=font)
summary=data.get('summary',{})
d.text((18,40),f"promotable={data.get('candidate',{}).get('promotable')} avgCorrection={summary.get('averageCorrection')} maxDev={summary.get('maxDeviation')} std={summary.get('standardDeviation')}",fill=(205,214,226),font=small)
panel_w=W//max(1,len(frames)); panel_h=(H-78)//2
for i,frame in enumerate(frames):
  for vi,view in enumerate(['front','top']):
    panel=(i*panel_w+8,72+vi*panel_h,(i+1)*panel_w-8,72+(vi+1)*panel_h-10)
    b=bounds(frame,panel,view)
    d.rectangle(panel,outline=(52,64,82),width=1)
    d.text((panel[0]+6,panel[1]+5),f"t={frame.get('time'):.3f} {view}",fill=(226,232,240),font=small)
    line(frame.get('currentGripWorld'),frame.get('projectedGripTargetWorld'),panel,view,b,(248,113,113),2)
    line(frame.get('predictedGripWorld'),frame.get('projectedGripTargetWorld'),panel,view,b,(250,204,21),2)
    dot(frame.get('projectedGripTargetWorld'),panel,view,b,(34,197,94),7)
    dot(frame.get('currentGripWorld'),panel,view,b,(239,68,68),7)
    dot(frame.get('currentSocketWorld'),panel,view,b,(59,130,246),6)
    dot(frame.get('predictedGripWorld'),panel,view,b,(250,204,21),5)
    d.text((panel[0]+6,panel[3]-32),f"before={frame.get('beforePickedGripError')} after={frame.get('afterPickedGripError')}",fill=(248,220,160),font=small)
Path(sys.argv[2]).parent.mkdir(parents=True,exist_ok=True); img.save(sys.argv[2])
`);
  execFileSync('python3', [renderer, dataPath, pngPath], { stdio: 'pipe' });
}

function writeSummary(outDir, payload) {
  const s = payload.summary;
  const lines = [
    '# WeaponGrip Socket Solver',
    '',
    `Generated: ${payload.generatedAt}`,
    `Promotable: ${payload.candidate.promotable}`,
    `Stop reason: ${payload.candidate.stopReason}`,
    '',
    '## Correction',
    `- Average socket-local correction: ${JSON.stringify(s.averageCorrection)}`,
    `- Max deviation: ${s.maxDeviation}`,
    `- Standard deviation: ${s.standardDeviation}`,
    `- Before average pickedGripError: ${s.before.averagePickedGripError}`,
    `- After average pickedGripError: ${s.after.averagePickedGripError}`,
    '',
    '## Candidate',
    `- Current modelLocalOffset: ${JSON.stringify(payload.candidate.currentModelLocalOffset)}`,
    `- Candidate modelLocalOffset: ${JSON.stringify(payload.candidate.candidateModelLocalOffset)}`,
    '',
    'Diagnostic-only. This does not modify grip landmarks, tip landmarks, weapon basis, FK, roll, arm animation, startup clips, aliases, or production retarget logic.',
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'diagnostic_summary.md'), lines.join('\n'));
}

function summarize(rows, predictions, correction) {
  const deviations = rows.map((row) => length(sub(row.socketParentLocalCorrection, correction)));
  const before = rows.map((row) => row.before.pickedGripError);
  const after = predictions.map((row) => row.afterPickedGripError);
  return {
    averageCorrection: point(correction),
    maxDeviation: round(Math.max(...deviations, 0)),
    standardDeviation: round(standardDeviation(deviations)),
    before: {
      averagePickedGripError: round(avg(before)),
      maxPickedGripError: round(Math.max(...before, 0)),
    },
    after: {
      averagePickedGripError: round(avg(after)),
      maxPickedGripError: round(Math.max(...after, 0)),
    },
  };
}

function main() {
  const args = parseArgs(process.argv);
  fs.mkdirSync(args.out, { recursive: true });
  const blade = runBladeWorkspace(args.out, args.maxRenderFrames);
  const rows = solveRows(blade);
  if (rows.length !== 31) throw new Error(`expected 31 OneHandReady keys, got ${rows.length}`);
  const correction = averageVector(rows.map((row) => row.socketParentLocalCorrection));
  const predictions = applyAverage(rows, correction);
  const summary = summarize(rows, predictions, correction);
  const stable = summary.maxDeviation <= STABILITY.maxDeviation && summary.standardDeviation <= STABILITY.standardDeviation;
  const afterGood = summary.after.averagePickedGripError <= STABILITY.promotionError && summary.after.maxPickedGripError <= STABILITY.promotionError;
  const currentOffset = vec(blade.attachmentSnapshots?.meshy?.proxy?.modelLocalOffset || [0, 0, 0]);
  const candidateOffset = point(add(currentOffset, correction));
  const solverWouldBePromotable = Boolean(stable && afterGood);
  const candidate = {
    diagnosticOnly: true,
    productionBehaviorModified: false,
    manualPlacementLock: MANUAL_PLACEMENT_LOCK,
    promotable: false,
    solverWouldBePromotable,
    stopReason: MANUAL_PLACEMENT_LOCK.reason,
    correctionSpace: 'Meshy actor/model local space applied as weaponProxy.modelLocalOffset delta',
    currentModelLocalOffset: point(currentOffset),
    averageSocketLocalCorrection: point(correction),
    candidateModelLocalOffset: candidateOffset,
    stabilityThresholds: STABILITY,
    productionSnippet: null,
    rotationAdjustmentReportedOnly: {
      requiredByEvidence: false,
      note: 'This solver only evaluates socket position. Socket rotation is not applied or proposed.',
    },
  };
  const renderEvery = Math.max(1, Math.floor(rows.length / Math.max(1, Number(args.maxRenderFrames || 9))));
  const predictionByIndex = new Map(predictions.map((row) => [row.index, row]));
  const renderFrames = rows
    .filter((row, index) => index % renderEvery === 0 || index === rows.length - 1)
    .map((row) => ({ ...row, ...predictionByIndex.get(row.index) }));
  const payload = {
    schema: 'pose-lab-weapon-grip-socket-solver-v1',
    generatedAt: new Date().toISOString(),
    diagnosticOnly: true,
    productionBehaviorModified: false,
    source: {
      bladeWorkspaceSchema: blade.schema,
      sourceKeyCount: blade.sourceKeyCount,
      coordinateBridge: blade.coordinateBridge,
      attachmentSnapshots: blade.attachmentSnapshots,
    },
    summary,
    candidate,
    reports: {
      perFrame: rows,
      predictedWithAverageCorrection: predictions,
    },
    renderFrames,
  };
  const dataPath = path.join(args.out, 'socket_solver.json');
  const candidatePath = path.join(args.out, 'socket_candidate.json');
  const pngPath = path.join(args.out, 'socket_overlay.png');
  fs.writeFileSync(dataPath, JSON.stringify(payload, null, 2) + '\n');
  fs.writeFileSync(candidatePath, JSON.stringify(candidate, null, 2) + '\n');
  writeOverlay(payload, pngPath);
  writeSummary(args.out, payload);
  console.log(JSON.stringify({
    ok: true,
    data: path.relative(projectRoot, dataPath),
    candidate: path.relative(projectRoot, candidatePath),
    png: path.relative(projectRoot, pngPath),
    diagnosticSummary: path.relative(projectRoot, path.join(args.out, 'diagnostic_summary.md')),
    summary,
    promotable: candidate.promotable,
    candidateModelLocalOffset: candidate.candidateModelLocalOffset,
    averageSocketLocalCorrection: candidate.averageSocketLocalCorrection,
  }, null, 2));
}

main();
