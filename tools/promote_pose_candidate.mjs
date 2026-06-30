#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  baselinePath,
  currentCacheToken,
  currentRuntimeBuild,
  projectRoot,
  readJson,
  relative,
  validateCandidatePromotion,
} from './pose_lab_workflow_lib.mjs';

function argValue(name) {
  const prefix = `--${name}=`;
  const inline = process.argv.find((entry) => entry.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : '';
}

function usage() {
  return [
    'Usage:',
    '  node tools/promote_pose_candidate.mjs --candidate PATH --evidence PATH --metrics PATH [--apply]',
    '',
    'Default mode validates only. --apply records a promotion attempt; it does not edit runtime defaults.',
  ].join('\n');
}

const candidatePath = argValue('candidate');
const evidencePath = argValue('evidence');
const metricsPath = argValue('metrics');
const apply = process.argv.includes('--apply');

if (!candidatePath || !evidencePath || !metricsPath) {
  console.error(usage());
  process.exit(2);
}

function resolveInput(file) {
  return path.isAbsolute(file) ? file : path.join(projectRoot, file);
}

const baseline = readJson(baselinePath);
const candidateFile = resolveInput(candidatePath);
const evidenceFile = resolveInput(evidencePath);
const metricsFile = resolveInput(metricsPath);
const candidate = readJson(candidateFile);
const evidence = readJson(evidenceFile);
const metrics = readJson(metricsFile);
const validation = validateCandidatePromotion({
  baseline,
  candidate,
  evidence,
  metrics,
  cacheToken: currentCacheToken(),
  runtimeBuild: currentRuntimeBuild(),
});

const report = {
  schema: 'pose-lab-promotion-attempt-v1',
  generatedAt: new Date().toISOString(),
  apply,
  ok: validation.ok,
  baseline: relative(baselinePath),
  candidate: relative(candidateFile),
  evidence: relative(evidenceFile),
  metrics: relative(metricsFile),
  errors: validation.errors,
  warnings: validation.warnings,
  promotedClip: candidate.clipName || candidate.name || candidate.targetClip || '',
  actorKey: candidate.actorKey || candidate.targetActorKey || baseline.actorKey,
};

if (apply) {
  const outDir = path.join(projectRoot, 'generated', 'workflow_state');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'latest_promotion_attempt.json'), JSON.stringify(report, null, 2) + '\n');
}

console.log(JSON.stringify(report, null, 2));
if (!validation.ok) process.exit(1);
