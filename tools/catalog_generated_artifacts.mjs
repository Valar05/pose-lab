#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatedRoot = path.join(projectRoot, 'generated');
const defaultOut = path.join(generatedRoot, 'artifact_manifest.json');
const imageExts = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg']);
const metadataExts = new Set(['.json', '.md', '.txt', '.log', '.html']);
const jsonReadLimit = 512 * 1024;

const keepTopLevel = new Set([
  'blade_vector_workspace',
  'cases',
  'core_transform_audit',
  'fpv_camera_audit',
  'metric_landmark_audit',
  'pose_lab_offline_render',
  'post_grip_baseline',
  'ready_pose_workbench',
  'semantic_landmark_calibration',
  'socket_solver',
  'visual_parity',
  'visual_red_build',
  'weapon_basis_workspace',
  'workflow_state',
]);

const reviewTopLevel = new Set([
  'critique_packets',
  'manual_renders',
  'pose_renders',
  'projection_workspace',
  'visual_qa',
  'weapon_retarget_debug',
  'weapon_visual_follow',
  'weapon_visual_repro_offline',
]);

const deleteTopLevel = new Set([
  'browser_import_probe.html',
  'browser_parse_probe.html',
  'browser_syntax_probe.html',
]);

const keepTestRuns = new Set([
  'tpose-baseline-before-fix',
]);

const reviewTestRunPrefixes = [
  'baseline-fix-probe',
  'offline-assert-fixed',
  'offline-tpose',
];

function parseArgs(argv) {
  const args = { out: defaultOut, dryRun: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--out') args.out = path.resolve(projectRoot, argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = path.resolve(projectRoot, arg.slice('--out='.length));
  }
  return args;
}

function rel(file) {
  return path.relative(projectRoot, file).replace(/\\/g, '/');
}

function safeStat(file) {
  try {
    return fs.statSync(file);
  } catch {
    return null;
  }
}

function walkFiles(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out.sort();
}

function firstLine(file) {
  try {
    const fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(4096);
    const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    return buffer.subarray(0, bytes).toString('utf8').split(/\r?\n/).find((line) => line.trim()) || '';
  } catch {
    return '';
  }
}

function readJsonSchema(file) {
  const stat = safeStat(file);
  if (!stat || stat.size === 0) return { schema: null, jsonStatus: stat?.size === 0 ? 'empty' : 'missing' };
  if (stat.size > jsonReadLimit) return { schema: null, jsonStatus: 'too-large-for-schema-read' };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    return {
      schema: parsed.schema || parsed.kind || parsed.captureKind || parsed.status || null,
      jsonStatus: 'ok',
      keys: Object.keys(parsed).slice(0, 12),
    };
  } catch {
    return { schema: null, jsonStatus: 'invalid' };
  }
}

function summarizeEntry(absPath) {
  const stat = safeStat(absPath);
  const isDir = Boolean(stat?.isDirectory());
  const files = isDir ? walkFiles(absPath) : [absPath];
  let sizeBytes = 0;
  let latestModifiedMs = stat?.mtimeMs || 0;
  let imageCount = 0;
  let jsonCount = 0;
  let markdownCount = 0;
  const schemas = new Set();
  const jsonStatuses = new Set();
  const representative = [];

  for (const file of files) {
    const fileStat = safeStat(file);
    if (!fileStat) continue;
    sizeBytes += fileStat.size;
    latestModifiedMs = Math.max(latestModifiedMs, fileStat.mtimeMs);
    const ext = path.extname(file).toLowerCase();
    if (imageExts.has(ext)) {
      imageCount += 1;
      continue;
    }
    if (ext === '.json') {
      jsonCount += 1;
      const info = readJsonSchema(file);
      if (info.schema) schemas.add(info.schema);
      if (info.jsonStatus) jsonStatuses.add(info.jsonStatus);
    } else if (ext === '.md') {
      markdownCount += 1;
    }
    if (metadataExts.has(ext) && representative.length < 10) {
      representative.push(rel(file));
    }
  }

  return {
    path: rel(absPath),
    kind: isDir ? 'directory' : 'file',
    sizeBytes,
    fileCount: files.length,
    imageCount,
    jsonCount,
    markdownCount,
    latestModified: latestModifiedMs ? new Date(latestModifiedMs).toISOString() : null,
    schemas: [...schemas].sort(),
    jsonStatuses: [...jsonStatuses].sort(),
    representativeFiles: representative,
    title: !isDir && path.extname(absPath).toLowerCase() === '.md' ? firstLine(absPath) : '',
  };
}

function pidLike(name) {
  return /-\d{4,}$/.test(name) || /-\d{4,}-repro$/.test(name);
}

function classify(entry) {
  const parts = entry.path.split('/');
  const top = parts[1] || '';
  const name = parts[parts.length - 1] || top;
  const schemaText = entry.schemas.join(' ');

  if (entry.path === 'generated/artifact_manifest.json') {
    return { retention: 'keep', reason: 'current generated artifact manifest' };
  }
  if (
    entry.path === 'generated/artifact_manifest_review.md'
    || entry.path === 'generated/artifact_deletion_log.json'
    || entry.path === 'generated/artifact_deletion_plan.json'
    || entry.path === 'generated/artifact_mining_index.json'
    || entry.path === 'generated/artifact_review_log.json'
  ) {
    return { retention: 'keep', reason: 'generated artifact cleanup audit trail' };
  }
  if (entry.fileCount === 1 && entry.sizeBytes === 0) {
    return { retention: 'delete', reason: 'empty generated file with no usable metadata' };
  }
  if (deleteTopLevel.has(top)) {
    return { retention: 'delete', reason: 'one-off browser probe, not durable evidence' };
  }
  if (top === 'test_runs') {
    if (entry.path === 'generated/test_runs') {
      return { retention: 'review', reason: 'mixed container with keep/review/delete child runs; do not delete the whole directory from this marker' };
    }
    if (keepTestRuns.has(name)) return { retention: 'keep', reason: 'named baseline artifact used for comparison' };
    if (reviewTestRunPrefixes.some((prefix) => name.startsWith(prefix))) {
      return { retention: 'review', reason: 'named diagnostic run may document a specific regression stage' };
    }
    if (name.includes('fault') || name.includes('contract') || name.includes('wrapper') || pidLike(name)) {
      return { retention: 'delete', reason: 'repeat process-id or contract scratch run; reproducible from tools' };
    }
    return { retention: 'delete', reason: 'uncurated generated test run; keep only named baselines or latest canonical artifacts' };
  }
  if (keepTopLevel.has(top)) {
    return { retention: 'keep', reason: 'canonical diagnostic, workflow, baseline, or latest evidence root' };
  }
  if (reviewTopLevel.has(top)) {
    return { retention: 'review', reason: 'image-heavy or critique evidence requires a later visual review before deletion' };
  }
  if (schemaText.includes('pose-lab-world-metrics') || schemaText.includes('pose-lab-sf2-attack-batch')) {
    return { retention: 'keep', reason: 'structured pose/attack metrics with project-specific schema' };
  }
  if (entry.jsonStatuses.includes('invalid') || entry.jsonStatuses.includes('empty')) {
    return { retention: 'delete', reason: 'invalid or empty generated metadata' };
  }
  if (entry.imageCount > 0) {
    return { retention: 'review', reason: 'contains images; usefulness requires later visual inspection' };
  }
  return { retention: 'review', reason: 'unclassified generated metadata; review before deletion' };
}

function catalogEntries() {
  if (!fs.existsSync(generatedRoot)) throw new Error(`missing generated root: ${generatedRoot}`);
  const entries = [];
  const topEntries = fs.readdirSync(generatedRoot, { withFileTypes: true })
    .map((entry) => path.join(generatedRoot, entry.name))
    .sort();

  for (const full of topEntries) {
    const topSummary = summarizeEntry(full);
    entries.push({ ...topSummary, ...classify(topSummary) });
    const topStat = safeStat(full);
    if (!topStat?.isDirectory()) continue;
    const childDirs = fs.readdirSync(full, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(full, entry.name))
      .sort();
    for (const child of childDirs) {
      const childSummary = summarizeEntry(child);
      entries.push({ ...childSummary, ...classify(childSummary) });
    }
  }
  return entries;
}

function summarize(entries) {
  const byRetention = {};
  for (const entry of entries) {
    byRetention[entry.retention] ||= { count: 0, sizeBytes: 0, imageCount: 0, fileCount: 0 };
    byRetention[entry.retention].count += 1;
    byRetention[entry.retention].sizeBytes += entry.sizeBytes;
    byRetention[entry.retention].imageCount += entry.imageCount;
    byRetention[entry.retention].fileCount += entry.fileCount;
  }
  return byRetention;
}

function main() {
  const args = parseArgs(process.argv);
  const entries = catalogEntries();
  const manifest = {
    schema: 'pose-lab-generated-artifact-manifest-v1',
    generatedAt: new Date().toISOString(),
    imageInspection: 'not-performed',
    imageHandling: 'image files counted by extension only; script does not import image libraries or decode image pixels',
    retentionPolicy: 'conservative',
    root: 'generated',
    summary: summarize(entries),
    entries,
  };
  const text = JSON.stringify(manifest, null, 2) + '\n';
  if (!args.dryRun) {
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, text);
  }
  console.log(JSON.stringify({
    ok: true,
    dryRun: args.dryRun,
    out: rel(args.out),
    entries: entries.length,
    summary: manifest.summary,
  }, null, 2));
  if (args.dryRun) {
    console.log(text);
  }
}

main();
