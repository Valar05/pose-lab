#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const ledgerPath = path.join(projectRoot, 'evidence', 'human_visual_truth_red_builds.json');

function currentCommit() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (_error) {
    return '';
  }
}

function redBuildClosed(entry) {
  return entry?.status === 'superseded'
    && entry?.humanAccepted === true
    && Boolean(entry?.supersededByCommit)
    && Boolean(entry?.acceptedEvidencePath);
}

function identifierMatches(identifier = '', candidate = '') {
  if (!identifier || !candidate) return false;
  const left = String(identifier);
  const right = String(candidate);
  if (/^https?:\/\//.test(left) || /^https?:\/\//.test(right)) {
    return left.replace(/\/$/, '') === right.replace(/\/$/, '');
  }
  return left === right || left.startsWith(right) || right.startsWith(left);
}

function commitIsAncestorOfHead(commit = '') {
  const value = String(commit || '').trim();
  if (!/^[0-9a-f]{7,40}$/i.test(value)) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', value, 'HEAD'], { cwd: projectRoot, stdio: 'ignore' });
    return true;
  } catch (_error) {
    return false;
  }
}

function readLedger() {
  if (!fs.existsSync(ledgerPath)) return { redBuilds: [] };
  return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
}

function activeVeto() {
  const head = currentCommit();
  const candidates = [
    head,
    process.env.GITHUB_SHA,
    process.env.GITHUB_HEAD_SHA,
    process.env.GITHUB_RUN_ID,
  ].filter(Boolean);
  const builds = Array.isArray(readLedger().redBuilds) ? readLedger().redBuilds : [];
  return builds.filter((entry) => !redBuildClosed(entry)).find((entry) => {
    const identifiers = [
      entry?.commit,
      entry?.artifactCommit,
      entry?.headCommit,
      entry?.runId,
      entry?.firebaseRunId,
      entry?.workflowRunId,
    ].map((value) => String(value || '')).filter(Boolean);
    return candidates.some((candidate) => identifiers.some((identifier) => identifierMatches(identifier, candidate)))
      || commitIsAncestorOfHead(entry?.commit)
      || commitIsAncestorOfHead(entry?.headCommit)
      || commitIsAncestorOfHead(entry?.artifactCommit);
  }) || null;
}

const veto = activeVeto();
if (veto) {
  const issues = Array.isArray(veto.issues) ? veto.issues : [veto.reason || 'human red build'];
  console.log(JSON.stringify({
    ok: false,
    status: 'AUTHORITY_REVOKED_FALSE_GREEN',
    commit: currentCommit(),
    vetoCommit: veto.commit || '',
    runId: veto.runId || '',
    authority: veto.authority || 'human-review',
    screenshots: veto.screenshots || [],
    failures: [
      `AUTHORITY_REVOKED_FALSE_GREEN: ${issues.join('; ')}`,
    ],
    blocks: veto.blocks || [],
  }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  status: 'VISUAL_TRUTH_PREFLIGHT_OK',
  commit: currentCommit(),
}, null, 2));
