#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(projectRoot, 'generated', 'post_socket_promotion');
const beforePath = path.join(projectRoot, 'generated', 'post_grip_baseline', 'blade_vector_workspace.json');
const solverPath = path.join(projectRoot, 'generated', 'socket_solver', 'socket_solver.json');
const candidatePath = path.join(projectRoot, 'generated', 'socket_solver', 'socket_candidate.json');
const bladeDir = path.join(outDir, '_blade');
const projectionDir = path.join(outDir, '_projection');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function round(value, digits = 5) {
  const scale = 10 ** digits;
  return Math.round(Number(value || 0) * scale) / scale;
}

function metricDelta(before, after, key) {
  return {
    before: before.summary?.[key] ?? null,
    after: after.summary?.[key] ?? null,
    delta: before.summary?.[key] != null && after.summary?.[key] != null
      ? round(after.summary[key] - before.summary[key])
      : null,
  };
}

function assertGate(candidate, solver, currentProfileText) {
  const failures = [];
  const expectedCurrent = candidate.currentModelLocalOffset || [];
  const expectedCandidate = candidate.candidateModelLocalOffset || [];
  if (!candidate.promotable) failures.push('socket candidate is not promotable');
  if (solver.summary?.maxDeviation > 0.01) failures.push(`solver maxDeviation ${solver.summary.maxDeviation} exceeds 0.01`);
  if (solver.summary?.after?.averagePickedGripError > 0.01) failures.push(`solver predicted average picked grip error ${solver.summary.after.averagePickedGripError} exceeds 0.01`);
  if (solver.summary?.after?.maxPickedGripError > 0.01) failures.push(`solver predicted max picked grip error ${solver.summary.after.maxPickedGripError} exceeds 0.01`);
  if (!currentProfileText.includes(`modelLocalOffset: [${expectedCandidate.join(', ')}]`)) {
    failures.push(`production Meshy modelLocalOffset does not match candidate [${expectedCandidate.join(', ')}]`);
  }
  if (!solver.source?.attachmentSnapshots?.meshy?.proxy?.modelLocalOffset
    || solver.source.attachmentSnapshots.meshy.proxy.modelLocalOffset.join(',') !== expectedCurrent.join(',')) {
    failures.push('solver source snapshot does not match candidate currentModelLocalOffset');
  }
  if (!currentProfileText.includes('gripLocalPosition: [0.66607, -0.03924, -0.07431]')) failures.push('Meshy gripLocalPosition changed');
  if (!currentProfileText.includes('tipLocalPosition: [-0.95561, 0.1368, 0]')) failures.push('Meshy tipLocalPosition changed');
  if (failures.length) throw new Error(failures.join('\n'));
}

function writeContactSheet(bladePng, projectionPng, contactPath, before, after, projection, candidate) {
  const script = path.join(os.tmpdir(), 'pose-lab-post-socket-contact-sheet.py');
  const metaPath = path.join(outDir, 'post_socket_promotion_meta.json');
  fs.writeFileSync(metaPath, JSON.stringify({
    changedField: 'meshyCharacter.weaponProxy.modelLocalOffset',
    candidateModelLocalOffset: candidate.candidateModelLocalOffset,
    metrics: {
      pickedGrip: metricDelta(before, after, 'averagePickedGripError'),
      tip: metricDelta(before, after, 'averageTipError'),
      bladeDirectionDeg: metricDelta(before, after, 'averageBladeDirectionErrorDeg'),
      postDominantClass: after.summary?.dominantClass,
      projectionSwordTipAvgError: projection.summary?.swordTipAvgError,
    },
  }, null, 2) + '\n');
  fs.writeFileSync(script, String.raw`#!/usr/bin/env python3
import json, sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

blade_path, projection_path, meta_path, out_path = map(Path, sys.argv[1:5])
blade = Image.open(blade_path).convert('RGB')
projection = Image.open(projection_path).convert('RGB')
meta = json.loads(meta_path.read_text())
W = 1900
banner_h = 180
gap = 20
blade_h = int(blade.height * (W / blade.width))
projection_h = int(projection.height * (W / projection.width))
canvas = Image.new('RGB', (W, banner_h + blade_h + projection_h + gap * 3), (6, 9, 13))
d = ImageDraw.Draw(canvas)
try:
    font = ImageFont.truetype('DejaVuSans.ttf', 28)
    small = ImageFont.truetype('DejaVuSans.ttf', 18)
    tiny = ImageFont.truetype('DejaVuSans.ttf', 14)
except Exception:
    font = small = tiny = None
metrics = meta.get('metrics', {})
d.text((24,18), 'Post Socket Promotion Contact Sheet - OneHandReady', fill=(255,244,190), font=font)
d.text((24,58), 'Top: FPS source blade axis vs Meshy saber-attached axis with grip/tip markers. Bottom: projected FPS pins, Meshy FK/retarget structure, bone basis, and sword target evidence.', fill=(205,214,226), font=small)
d.text((24,92), f"Changed field: {meta.get('changedField')} -> {meta.get('candidateModelLocalOffset')}", fill=(202,213,226), font=tiny)
d.text((24,116), f"pickedGrip avg {metrics.get('pickedGrip',{}).get('before')} -> {metrics.get('pickedGrip',{}).get('after')} | tip avg {metrics.get('tip',{}).get('before')} -> {metrics.get('tip',{}).get('after')} | blade angle avg {metrics.get('bladeDirectionDeg',{}).get('before')} -> {metrics.get('bladeDirectionDeg',{}).get('after')} deg", fill=(248,220,160), font=tiny)
d.text((24,140), f"post class={metrics.get('postDominantClass')} | projection sword tip avg={metrics.get('projectionSwordTipAvgError')}", fill=(248,220,160), font=tiny)
y = banner_h + gap
canvas.paste(blade.resize((W, blade_h)), (0, y))
y += blade_h + gap
canvas.paste(projection.resize((W, projection_h)), (0, y))
out_path.parent.mkdir(parents=True, exist_ok=True)
canvas.save(out_path)
`);
  execFileSync('python3', [script, bladePng, projectionPng, metaPath, contactPath], { stdio: 'pipe' });
}

function writeSummary(before, after, projection, solver, candidate) {
  const picked = metricDelta(before, after, 'averagePickedGripError');
  const tip = metricDelta(before, after, 'averageTipError');
  const bladeAngle = metricDelta(before, after, 'averageBladeDirectionErrorDeg');
  const lines = [
    '# Post Socket Promotion Diagnostic',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    '## Promotion Gate',
    `- Candidate promotable: ${candidate.promotable}`,
    `- Solver max deviation: ${solver.summary.maxDeviation}`,
    `- Solver predicted picked grip error avg/max: ${solver.summary.after.averagePickedGripError} / ${solver.summary.after.maxPickedGripError}`,
    `- Changed production field: Meshy Character weaponProxy.modelLocalOffset`,
    `- Candidate value: ${JSON.stringify(candidate.candidateModelLocalOffset)}`,
    '',
    '## Metrics',
    `- Average picked grip error: ${picked.before} -> ${picked.after} (${picked.delta})`,
    `- Average tip error: ${tip.before} -> ${tip.after} (${tip.delta})`,
    `- Average blade direction error: ${bladeAngle.before} -> ${bladeAngle.after} deg (${bladeAngle.delta})`,
    `- Post-promotion dominant class: ${after.summary.dominantClass}`,
    `- Projection sword tip avg/max: ${projection.summary.swordTipAvgError} / ${projection.summary.swordTipMaxError}`,
    '',
    '## Visual Read',
    after.summary.averagePickedGripError <= 0.01
      ? '- The saber grip now follows the projected arm/socket in a retarget-friendly way: placement error is below 0.01 across the authored keys.'
      : '- The saber grip still does not follow the projected arm/socket closely enough; do not continue to orientation work.',
    '- The remaining blocker is blade direction/orientation: grip placement is solved, but blade direction error remains high and tip error remains much larger than grip error.',
    '- Do not tune further in this pass; next work should isolate attachment/basis or socket rotation evidence without changing FK, roll, or arm motion.',
    '',
  ];
  fs.writeFileSync(path.join(outDir, 'diagnostic_summary.md'), lines.join('\n'));
}

function main() {
  const before = readJson(beforePath);
  const after = readJson(path.join(bladeDir, 'blade_vector_workspace.json'));
  const projection = readJson(path.join(projectionDir, 'projection_workspace.json'));
  const solver = readJson(solverPath);
  const candidate = readJson(candidatePath);
  const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
  assertGate(candidate, solver, profiles);
  fs.copyFileSync(path.join(bladeDir, 'blade_vector_workspace.json'), path.join(outDir, 'blade_vector_workspace.json'));
  fs.copyFileSync(path.join(projectionDir, 'projection_workspace.json'), path.join(outDir, 'projection_workspace.json'));
  writeContactSheet(
    path.join(bladeDir, 'blade_vector_workspace.png'),
    path.join(projectionDir, 'projection_workspace.png'),
    path.join(outDir, 'visual_contact_sheet.png'),
    before,
    after,
    projection,
    candidate,
  );
  writeSummary(before, after, projection, solver, candidate);
  console.log(JSON.stringify({
    ok: true,
    changedField: 'meshyCharacter.weaponProxy.modelLocalOffset',
    candidateModelLocalOffset: candidate.candidateModelLocalOffset,
    artifacts: {
      bladeVector: path.relative(projectRoot, path.join(outDir, 'blade_vector_workspace.json')),
      projection: path.relative(projectRoot, path.join(outDir, 'projection_workspace.json')),
      contactSheet: path.relative(projectRoot, path.join(outDir, 'visual_contact_sheet.png')),
      diagnosticSummary: path.relative(projectRoot, path.join(outDir, 'diagnostic_summary.md')),
    },
    metrics: {
      averagePickedGripError: metricDelta(before, after, 'averagePickedGripError'),
      averageTipError: metricDelta(before, after, 'averageTipError'),
      averageBladeDirectionErrorDeg: metricDelta(before, after, 'averageBladeDirectionErrorDeg'),
      dominantClass: after.summary.dominantClass,
      projectionSwordTipAvgError: projection.summary.swordTipAvgError,
    },
  }, null, 2));
}

main();
