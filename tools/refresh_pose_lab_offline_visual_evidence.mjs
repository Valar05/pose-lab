#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { currentCacheToken, currentRuntimeBuild, projectRoot } from './pose_lab_workflow_lib.mjs';

const clip = '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]';
const outDir = path.join(projectRoot, 'generated', 'pose_lab_offline_render', 'visual_red_build_tpose');
const evidenceDir = path.join(projectRoot, 'generated', 'visual_red_build');
const evidencePath = path.join(evidenceDir, 'pose_lab_latest.json');

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(evidenceDir, { recursive: true });

execFileSync('node', [
  'tools/pose_lab_offline_render.mjs',
  '--actor', 'meshyCharacter',
  '--clip', clip,
  '--samples', '3',
  '--assert-fixed',
  '--out', outDir,
], {
  cwd: projectRoot,
  stdio: 'inherit',
});

const reportPath = path.join(outDir, 'pose_weapon_render.json');
const capturePath = path.join(outDir, 'pose_weapon_render.png');
const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

const evidence = {
  schema: 'pose-lab-visual-evidence-v1',
  captureKind: 'offline-pose-render',
  offlineTruthOnly: true,
  cacheToken: currentCacheToken(),
  runtimeBuild: currentRuntimeBuild(),
  actorKey: 'meshyCharacter',
  clipName: clip,
  capturePath: path.relative(projectRoot, capturePath),
  reportPath: path.relative(projectRoot, reportPath),
  visualRead: report.actualVisibleRead,
  motionEvidencePending: false,
 visualAssertions: {
    offlineRendererIsTierOneTruth: true,
    generatedClipResolved: report.generatedClipResolved === true,
    clipAppliedEqualsRequested: report.clipApplied === report.clipRequested && report.clipRequested === clip,
    realMeshySabreRendered: report.checks?.weaponMeshRendered === true,
    pureFkParentChainImplemented: report.checks?.parentChainMatchesPureFkShape === true,
    weaponGripPinnedToRightHandFk: report.checks?.weaponGripLocalStableUnderRightHand === true
      && report.checks?.weaponGripQuaternionStableUnderRightHand === true,
    appliedHiltPinnedToWeaponGrip: report.checks?.appliedHiltPinnedToWeaponGrip === true,
    visibleMeshHiltPinnedToWeaponGrip: report.checks?.visibleMeshHiltPinnedToWeaponGrip === true,
    fpsWeaponRReferenceOnly: report.generatedClipStats?.weaponTrackEnabled !== true
      && report.generatedClipStats?.weaponTrackTarget == null,
    hiltHandRelationshipExposed: Number.isFinite(report.maxDistances?.rawHandToAppliedHilt)
      && Number.isFinite(report.maxDistances?.palmTargetToAppliedHilt)
      && Number.isFinite(report.maxDistances?.visibleMeshHiltToWeaponGrip)
      && Number.isFinite(report.maxDistances?.visibleMeshHiltToRawHand),
  },
  offlineReportSummary: {
    schema: report.schema,
    ok: report.ok,
    generatedClipResolved: report.generatedClipResolved,
    clipApplied: report.clipApplied,
    maxDistances: {
      rawHandToAppliedHilt: report.maxDistances?.rawHandToAppliedHilt,
      palmTargetToAppliedHilt: report.maxDistances?.palmTargetToAppliedHilt,
      visibleMeshHiltToWeaponGrip: report.maxDistances?.visibleMeshHiltToWeaponGrip,
      visibleMeshHiltToRawHand: report.maxDistances?.visibleMeshHiltToRawHand,
      visibleMeshHiltToAppliedHilt: report.maxDistances?.visibleMeshHiltToAppliedHilt,
    },
    maxWeaponOrientationErrorDeg: report.maxWeaponOrientationErrorDeg,
  },
};

fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  evidencePath: path.relative(projectRoot, evidencePath),
  capturePath: evidence.capturePath,
  reportPath: evidence.reportPath,
}, null, 2));
