#!/usr/bin/env node
import fs from 'node:fs';
import {
  baselinePath,
  compareSelectionSurfaces,
  currentCacheToken,
  currentCommit,
  currentMeshySelectionSurfaces,
  currentRuntimeBuild,
  gitStatusLines,
  latestEvidenceStatus,
  projectRoot,
  protectedDirtyFiles,
  readJson,
  relative,
} from './pose_lab_workflow_lib.mjs';

const baseline = readJson(baselinePath);
const statusLines = gitStatusLines();
const evidence = latestEvidenceStatus();
const current = currentMeshySelectionSurfaces();
const mismatches = compareSelectionSurfaces(baseline, current);
const protectedDirty = protectedDirtyFiles(statusLines);
const candidateDirs = [
  'generated/ready_pose_workbench',
  'generated/visual_parity',
  'generated/weapon_retarget_debug',
].filter((entry) => fs.existsSync(`${projectRoot}/${entry}`));

const report = {
  schema: 'pose-lab-workflow-status-v1',
  baseline: {
    name: baseline.name,
    actorKey: baseline.actorKey,
    acceptedClip: baseline.acceptedClip,
    acceptedAtCommit: baseline.acceptedAtCommit,
  },
  current: {
    commit: currentCommit(),
    cacheToken: currentCacheToken(),
    runtimeBuild: currentRuntimeBuild(),
    selectionSurfaces: current,
  },
  gate: {
    okToPromote: false,
    reason: 'promotion requires tools/promote_pose_candidate.mjs with fresh visual and metric evidence',
    selectionSurfaceMismatches: mismatches,
    protectedDirtyFiles: protectedDirty,
    latestEvidence: {
      path: relative(evidence.path),
      exists: evidence.exists,
      stale: evidence.stale,
      blocked: evidence.blocked,
      errors: evidence.errors,
      cacheToken: evidence.evidence?.cacheToken || '',
      runtimeBuild: evidence.evidence?.runtimeBuild || '',
      captureKind: evidence.evidence?.captureKind || '',
    },
    candidateArtifactDirs: candidateDirs,
  },
};

console.log(JSON.stringify(report, null, 2));
