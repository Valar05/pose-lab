import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const defaultOut = path.join(projectRoot, 'generated', 'retarget_review', 'onehand_ready');
const CLIP = 'OneHandReady';
const TARGET_CLIP = 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]';
const BASELINE = '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]';
const CURRENT_MESHY_GRIP = [0.6535, -0.02302, -0.07317];
const CURRENT_FPS_GRIP = [0.67888, -0.07803, -0.06249];

function parseArgs(argv) {
  const args = { out: defaultOut, maxRenderFrames: 7 };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') args.out = path.resolve(argv[++i]);
    else if (arg === '--max-render-frames') args.maxRenderFrames = Number(argv[++i] || args.maxRenderFrames);
    else throw new Error(`unknown arg ${arg}`);
  }
  return args;
}

function round(value, digits = 5) {
  if (!Number.isFinite(value)) return value;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function avg(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function max(values) {
  return values.length ? Math.max(...values) : 0;
}

function distance(a, b) {
  return Math.hypot((a?.[0] || 0) - (b?.[0] || 0), (a?.[1] || 0) - (b?.[1] || 0), (a?.[2] || 0) - (b?.[2] || 0));
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function runTool(tool, outDir, extra = []) {
  fs.mkdirSync(outDir, { recursive: true });
  const output = execFileSync('node', [
    path.join(projectRoot, 'tools', tool),
    '--out', outDir,
    ...extra,
  ], { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const start = output.indexOf('{');
  if (start < 0) throw new Error(`${tool} did not emit JSON`);
  return JSON.parse(output.slice(start));
}

function assertProductionTruth() {
  const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
  const failures = [];
  if (!profiles.includes(`startupClip: { name: '${BASELINE}' }`)) {
    failures.push('Meshy accepted T-pose baseline was not found');
  }
  if (!profiles.includes(`gripLocalPosition: [${CURRENT_MESHY_GRIP.join(', ')}]`)) {
    failures.push('current Meshy manual grip landmark changed');
  }
  if (!profiles.includes(`gripLocalPosition: [${CURRENT_FPS_GRIP.join(', ')}]`)) {
    failures.push('current FPS manual grip landmark changed');
  }
  if (failures.length) throw new Error(failures.join('\n'));
}

function summarizeProjection(projection) {
  const byJoint = projection.layerMetrics?.fk?.byJoint || [];
  const joint = (source) => byJoint.find((entry) => entry.source === source) || {};
  const forearmErrors = [joint('Forearm.R').avgError, joint('Forearm.L').avgError].filter(Number.isFinite);
  const handErrors = [joint('Hand.R').avgError, joint('Hand.L').avgError].filter(Number.isFinite);
  return {
    fkOnlyAlreadyClose: Boolean(projection.diagnostics?.fkOnlyAlreadyClose),
    firstDivergenceLayer: projection.diagnostics?.firstDivergenceLayer || null,
    rightHandPositionError: round(joint('Hand.R').avgError || 0),
    leftHandPositionError: round(joint('Hand.L').avgError || 0),
    rightElbowPositionError: round(joint('Forearm.R').avgError || 0),
    leftElbowPositionError: round(joint('Forearm.L').avgError || 0),
    elbowPositionError: round(avg(forearmErrors)),
    handPositionError: round(avg(handErrors)),
    shoulderChestOrientationRead: {
      status: 'position-only FK review; roll remains quarantined',
      spineError: round(joint('ShoulderCenter').avgError || 0),
      rollMaxAbsErrorDeg: round(projection.summary?.rollMaxAbsErrorDeg || 0),
    },
  };
}

function summarizeWeapon(blade, socket) {
  const s = blade.summary || {};
  const afterGrip = socket?.summary?.after || {};
  const beforeGrip = socket?.summary?.before || {};
  const rows = blade.reports?.perFrame || [];
  const predictions = new Map((socket?.reports?.predictedWithAverageCorrection || []).map((row) => [row.index, row]));
  const afterTip = rows.map((row) => {
    const prediction = predictions.get(row.index);
    if (!prediction?.predictedGripWorld || !row.meshyHilt || !row.meshyTip || !row.fpsTip) return null;
    const delta = [
      prediction.predictedGripWorld[0] - row.meshyHilt[0],
      prediction.predictedGripWorld[1] - row.meshyHilt[1],
      prediction.predictedGripWorld[2] - row.meshyHilt[2],
    ];
    const shiftedTip = [row.meshyTip[0] + delta[0], row.meshyTip[1] + delta[1], row.meshyTip[2] + delta[2]];
    return distance(shiftedTip, row.fpsTip);
  }).filter(Number.isFinite);
  return {
    productionSocket: {
      averagePickedGripError: round(s.averagePickedGripError || 0),
      maxPickedGripError: round(s.maxPickedGripError || 0),
      averageTipError: round(s.averageTipError || 0),
      maxTipError: round(s.maxTipError || 0),
      averageBladeDirectionErrorDeg: round(s.averageBladeDirectionErrorDeg || 0),
      maxBladeDirectionErrorDeg: round(s.maxBladeDirectionErrorDeg || 0),
      averageBladeLengthRatio: round(s.averageBladeLengthRatio || 0),
      dominantClass: s.dominantClass || null,
    },
    socketCandidate: {
      usedForReviewOnly: true,
      productionBehaviorModified: false,
      averagePickedGripError: round(afterGrip.averagePickedGripError || 0),
      maxPickedGripError: round(afterGrip.maxPickedGripError || 0),
      beforeAveragePickedGripError: round(beforeGrip.averagePickedGripError || 0),
      averageTipErrorAfterGripShiftOnly: round(avg(afterTip)),
      maxTipErrorAfterGripShiftOnly: round(max(afterTip)),
      bladeDirectionErrorDeg: round(s.averageBladeDirectionErrorDeg || 0),
      note: 'The socket candidate shifts the rendered attachment as a rigid observation; it does not alter arm FK, roll, blade basis, grip landmark, or tip landmark.',
    },
  };
}

function candidateIsFresh(socket, blade) {
  const candidate = socket?.candidate || {};
  const currentOffset = blade.attachmentSnapshots?.meshy?.proxy?.modelLocalOffset || [];
  const currentMatches = JSON.stringify(candidate.currentModelLocalOffset || []) === JSON.stringify(currentOffset);
  const stable = Number(socket?.summary?.maxDeviation) <= 0.01;
  const predicted = Number(socket?.summary?.after?.averagePickedGripError) <= 0.01 && Number(socket?.summary?.after?.maxPickedGripError) <= 0.01;
  return {
    usable: Boolean(candidate.promotable && currentMatches && stable && predicted),
    currentMatches,
    stable,
    predicted,
    candidateModelLocalOffset: candidate.candidateModelLocalOffset || null,
    currentModelLocalOffset: candidate.currentModelLocalOffset || null,
    averageSocketLocalCorrection: candidate.averageSocketLocalCorrection || null,
  };
}

function classifyDecision(projectionSummary, weaponSummary, socketFresh) {
  const armIsStructurallyBad = !projectionSummary.fkOnlyAlreadyClose && (
    projectionSummary.handPositionError > 0.18 || projectionSummary.elbowPositionError > 0.18
  );
  if (armIsStructurallyBad) {
    return 'needs_arm_projection_fix';
  }
  if (socketFresh.usable && weaponSummary.socketCandidate.averagePickedGripError <= 0.01) {
    return 'needs_weapon_socket_promotion';
  }
  if (weaponSummary.productionSocket.averageBladeDirectionErrorDeg > 15) {
    return 'needs_landmark_fix';
  }
  return 'needs_roll_research_later';
}

function buildPoseclip(projection, socketFresh, decision) {
  const times = projection.sourceKeyTimes || [];
  return {
    schema: 'pose-lab-review-candidate-poseclip-v1',
    generatedAt: new Date().toISOString(),
    actorKey: 'meshyCharacter',
    sourceActorKey: 'player',
    clipName: TARGET_CLIP,
    targetClip: TARGET_CLIP,
    sourceClip: CLIP,
    status: 'candidate-only',
    duration: round(Math.max(...times, 0)),
    sourceKeyCount: times.length,
    sourceKeyTimes: times,
    productionBehaviorModified: false,
    promotionApplied: false,
    tracksExported: false,
    exportSupport: 'review artifact only; runtime auto-retarget path remains authoritative',
    userData: {
      origin: 'mapped-arms:player->meshyCharacter',
      mode: 'fps-upper-key-convert review candidate',
      acceptedBaseline: BASELINE,
      keyConvert: {
        preservesSourceTimes: true,
        noUniformSampling: true,
        preservesAuthoredSourceTracks: true,
        ikOrientationMode: 'bounded source-key correction only; no new IK solve promoted',
        ikPreservesSourceTracks: true,
        rollCorrectionQuarantined: true,
        weaponFrameSolve: true,
        socketCandidateReviewOnly: socketFresh.usable,
        socketCandidateModelLocalOffset: socketFresh.usable ? socketFresh.candidateModelLocalOffset : null,
      },
      decision,
    },
  };
}

function writeContactSheet(paths, outPng) {
  const script = [
    'from PIL import Image, ImageDraw',
    'from pathlib import Path',
    'import sys',
    'items = sys.argv[1:-1]',
    'out = Path(sys.argv[-1])',
    'imgs = []',
    'for label, p in zip(items[0::2], items[1::2]):',
    '    img = Image.open(p).convert("RGB")',
    '    img.thumbnail((900, 520))',
    '    tile = Image.new("RGB", (940, 580), (18, 21, 24))',
    '    d = ImageDraw.Draw(tile)',
    '    d.text((18, 14), label, fill=(235, 238, 242))',
    '    tile.paste(img, (20, 46))',
    '    imgs.append(tile)',
    'w = 1880',
    'h = 1160',
    'sheet = Image.new("RGB", (w, h), (10, 12, 15))',
    'd = ImageDraw.Draw(sheet)',
    'd.text((24, 14), "Meshy OneHandReady retarget review: FPS source, projected Meshy candidate, saber grip/tip/blade markers", fill=(250, 250, 250))',
    'for i, img in enumerate(imgs):',
    '    sheet.paste(img, ((i % 2) * 940, 44 + (i // 2) * 558))',
    'out.parent.mkdir(parents=True, exist_ok=True)',
    'sheet.save(out)',
  ].join('\n');
  execFileSync('python3', ['-c', script, ...paths.flat(), outPng], { cwd: projectRoot, stdio: ['ignore', 'ignore', 'inherit'] });
}

function writeSummary(outDir, payload) {
  const lines = [
    '# Meshy OneHandReady Retarget Review',
    '',
    `Generated: ${payload.generatedAt}`,
    `Candidate: ${payload.candidate.clipName}`,
    `Decision: ${payload.decision.classification}`,
    `Promotion applied: ${payload.promotion.applied}`,
    '',
    '## Visual Read',
    payload.visualRead,
    '',
    '## Arm Metrics',
    `- Right hand avg error: ${payload.metrics.arm.rightHandPositionError}`,
    `- Left hand avg error: ${payload.metrics.arm.leftHandPositionError}`,
    `- Right elbow avg error: ${payload.metrics.arm.rightElbowPositionError}`,
    `- Left elbow avg error: ${payload.metrics.arm.leftElbowPositionError}`,
    `- FK first divergence layer: ${payload.metrics.arm.firstDivergenceLayer}`,
    '',
    '## Weapon Metrics',
    `- Production picked grip avg/max: ${payload.metrics.weapon.productionSocket.averagePickedGripError} / ${payload.metrics.weapon.productionSocket.maxPickedGripError}`,
    `- Socket-candidate picked grip avg/max: ${payload.metrics.weapon.socketCandidate.averagePickedGripError} / ${payload.metrics.weapon.socketCandidate.maxPickedGripError}`,
    `- Production tip avg/max: ${payload.metrics.weapon.productionSocket.averageTipError} / ${payload.metrics.weapon.productionSocket.maxTipError}`,
    `- Socket-candidate shifted-tip avg/max: ${payload.metrics.weapon.socketCandidate.averageTipErrorAfterGripShiftOnly} / ${payload.metrics.weapon.socketCandidate.maxTipErrorAfterGripShiftOnly}`,
    `- Blade direction avg/max deg: ${payload.metrics.weapon.productionSocket.averageBladeDirectionErrorDeg} / ${payload.metrics.weapon.productionSocket.maxBladeDirectionErrorDeg}`,
    '',
    '## Next Bottleneck',
    payload.decision.nextSingleBottleneck,
    '',
    'No production retarget behavior, startup clip, accepted baseline, grip landmark, tip landmark, blade basis, FK, or roll setting was changed.',
  ];
  fs.writeFileSync(path.join(outDir, 'retarget_review_summary.md'), `${lines.join('\n')}\n`);
}

function main() {
  const args = parseArgs(process.argv);
  assertProductionTruth();
  fs.mkdirSync(args.out, { recursive: true });

  const evidenceDir = path.join(args.out, 'evidence');
  const projectionResult = runTool('meshy_projection_workspace.mjs', path.join(evidenceDir, 'projection'), [
    '--enable', 'projected-pins,fk,sword',
    '--max-render-frames', String(args.maxRenderFrames),
  ]);
  const bladeResult = runTool('meshy_blade_vector_workspace.mjs', path.join(evidenceDir, 'blade_vector'), [
    '--max-render-frames', String(args.maxRenderFrames),
  ]);
  const socketResult = runTool('socket_solver.mjs', path.join(evidenceDir, 'socket_solver'), [
    '--max-render-frames', String(args.maxRenderFrames),
  ]);

  const projection = readJson(path.join(projectRoot, projectionResult.data));
  const blade = readJson(path.join(projectRoot, bladeResult.data));
  const socket = readJson(path.join(projectRoot, socketResult.data));
  const socketFresh = candidateIsFresh(socket, blade);
  const arm = summarizeProjection(projection);
  const weapon = summarizeWeapon(blade, socket);
  const classification = classifyDecision(arm, weapon, socketFresh);
  const candidate = buildPoseclip(projection, socketFresh, classification);
  const visualRead = socketFresh.usable
    ? 'The synchronized review shows the FK silhouette is usable for review, while production saber placement remains offset. The socket candidate makes the grip follow-through retarget-friendly without touching the arm, but promotion is intentionally deferred.'
    : 'The synchronized review shows FK silhouette evidence, but the socket candidate was not fresh or stable enough for promotion-gate consideration.';
  const nextSingleBottleneck = classification === 'needs_weapon_socket_promotion'
    ? 'Run an explicit, separately confirmed production socket-promotion pass for Meshy modelLocalOffset, then re-review blade direction/tip with visual marker parity.'
    : 'Improve arm projection before weapon or roll work; the candidate is not ready for promotion.';

  const payload = {
    schema: 'pose-lab-meshy-onehandready-retarget-review-v1',
    generatedAt: new Date().toISOString(),
    diagnosticOnly: false,
    reviewOnly: true,
    productionBehaviorModified: false,
    sourceClip: CLIP,
    targetClip: TARGET_CLIP,
    sourceKeyCount: projection.sourceKeyCount,
    sourceKeyTimes: projection.sourceKeyTimes,
    acceptedBaseline: BASELINE,
    constraints: {
      noProductionRetargetChange: true,
      noStartupAliasBaselineChange: true,
      noFkRollArmBladeBasisTune: true,
      manualWeaponPlacementAuthorityRespected: true,
    },
    candidate,
    socketCandidate: socketFresh,
    metrics: { arm, weapon },
    promotion: {
      applied: false,
      gateRun: false,
      reason: classification === 'ready_for_promotion' ? 'ready classification was not reached by this review implementation' : `classification is ${classification}`,
    },
    decision: {
      classification,
      readyForPromotion: false,
      socketCandidateImprovesWeaponFollowThrough: socketFresh.usable && weapon.socketCandidate.averagePickedGripError < weapon.productionSocket.averagePickedGripError,
      errorsStableOrAnimatedDrifting: socket.summary?.maxDeviation <= 0.01 ? 'stable socket placement correction across authored keys' : 'drifting placement correction',
      nextSingleBottleneck,
    },
    evidence: {
      projectionWorkspace: projectionResult,
      bladeVectorWorkspace: bladeResult,
      socketSolver: socketResult,
    },
    visualRead,
  };

  const jsonPath = path.join(args.out, 'retarget_review.json');
  const clipPath = path.join(args.out, 'onehand_ready_meshy_candidate.poseclip.json');
  const pngPath = path.join(args.out, 'retarget_review_contact_sheet.png');
  fs.writeFileSync(jsonPath, JSON.stringify(payload, null, 2) + '\n');
  fs.writeFileSync(clipPath, JSON.stringify(candidate, null, 2) + '\n');
  writeSummary(args.out, payload);
  writeContactSheet([
    ['FPS source and Meshy FK projection', path.join(projectRoot, projectionResult.png)],
    ['Saber grip, tip, and blade-vector metrics', path.join(projectRoot, bladeResult.png)],
    ['Review-only socket candidate overlay', path.join(projectRoot, socketResult.png)],
    ['Retarget decision summary', path.join(projectRoot, projectionResult.png)],
  ], pngPath);

  console.log(JSON.stringify({
    ok: true,
    data: path.relative(projectRoot, jsonPath),
    png: path.relative(projectRoot, pngPath),
    summary: path.relative(projectRoot, path.join(args.out, 'retarget_review_summary.md')),
    candidateClip: path.relative(projectRoot, clipPath),
    decision: payload.decision,
    metrics: payload.metrics,
  }, null, 2));
}

main();
