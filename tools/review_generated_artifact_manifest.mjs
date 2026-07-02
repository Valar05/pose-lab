#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultManifest = path.join(projectRoot, 'generated', 'artifact_manifest.json');
const defaultReport = path.join(projectRoot, 'generated', 'artifact_manifest_review.md');
const defaultPlan = path.join(projectRoot, 'generated', 'artifact_deletion_plan.json');
const defaultLog = path.join(projectRoot, 'generated', 'artifact_deletion_log.json');
const defaultMining = path.join(projectRoot, 'generated', 'artifact_mining_index.json');
const defaultReviewLog = path.join(projectRoot, 'generated', 'artifact_review_log.json');

function parseArgs(argv) {
  const args = {
    manifest: defaultManifest,
    report: defaultReport,
    plan: defaultPlan,
    log: defaultLog,
    mining: defaultMining,
    reviewLog: defaultReviewLog,
    deleteMarked: false,
    dryRun: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--delete-marked') args.deleteMarked = true;
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--manifest') args.manifest = path.resolve(projectRoot, argv[++i]);
    else if (arg.startsWith('--manifest=')) args.manifest = path.resolve(projectRoot, arg.slice('--manifest='.length));
    else if (arg === '--report') args.report = path.resolve(projectRoot, argv[++i]);
    else if (arg.startsWith('--report=')) args.report = path.resolve(projectRoot, arg.slice('--report='.length));
    else if (arg === '--plan') args.plan = path.resolve(projectRoot, argv[++i]);
    else if (arg.startsWith('--plan=')) args.plan = path.resolve(projectRoot, arg.slice('--plan='.length));
    else if (arg === '--log') args.log = path.resolve(projectRoot, argv[++i]);
    else if (arg.startsWith('--log=')) args.log = path.resolve(projectRoot, arg.slice('--log='.length));
    else if (arg === '--mining') args.mining = path.resolve(projectRoot, argv[++i]);
    else if (arg.startsWith('--mining=')) args.mining = path.resolve(projectRoot, arg.slice('--mining='.length));
    else if (arg === '--review-log') args.reviewLog = path.resolve(projectRoot, argv[++i]);
    else if (arg.startsWith('--review-log=')) args.reviewLog = path.resolve(projectRoot, arg.slice('--review-log='.length));
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function rel(file) {
  return path.relative(projectRoot, file).replace(/\\/g, '/');
}

function ensureInsideGenerated(relativePath) {
  if (!relativePath || relativePath === 'generated' || !relativePath.startsWith('generated/')) return false;
  const absolute = path.resolve(projectRoot, relativePath);
  const generatedRoot = path.resolve(projectRoot, 'generated');
  return absolute.startsWith(`${generatedRoot}${path.sep}`);
}

function byReason(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.reason || 'unclassified';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  }
  return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function sum(entries, key) {
  return entries.reduce((total, entry) => total + (entry[key] || 0), 0);
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function samplePaths(entries, limit = 12) {
  return entries.slice(0, limit).map((entry) => `  - \`${entry.path}\``).join('\n');
}

const miningFamilies = [
  {
    id: 'weapon_pinning_and_fk',
    label: 'Weapon Pinning / FK Attachment',
    description: 'Evidence about sabre hilt placement, hand-relative pinning, WeaponGrip/WeaponR behavior, and whether the weapon follows pose animation like FPS arms.',
    tokens: ['weapon_visual_follow', 'weapon_visual_repro_offline', 'weapon-fk', 'hilt', 'socket_solver', 'weapon_basis', 'blade_vector', 'post_grip', 'semantic_landmark'],
  },
  {
    id: 'meshy_fps_retarget',
    label: 'Meshy/FPS Retarget And Roll Offsets',
    description: 'Evidence about mapping FPS Arms clips onto Meshy, rest/ready/tpose deltas, roll corrections, projected pins, and visual IK variants.',
    tokens: ['meshy', 'fps', 'onehand_ready', 'tpose', 'projection_workspace', 'ready_pose_workbench', 'core_transform_audit', 'visual_ik', 'roll'],
  },
  {
    id: 'visual_truth_and_capture',
    label: 'Visual Truth / Capture Parity',
    description: 'Evidence about Android/browser/offline visual disagreement, red builds, stale captures, visual QA, and renderer parity.',
    tokens: ['visual_qa', 'visual_red_build', 'visual_parity', 'offline_render', 'offline-pose-render', 'assert-fixed', 'assert-red', 'cache_check', 'browser'],
  },
  {
    id: 'manual_pose_and_attack_iteration',
    label: 'Manual Pose / Attack Iteration',
    description: 'Evidence from authored pose renders, critique packets, attack metrics, and manual render families used to judge pose quality.',
    tokens: ['manual_renders', 'critique_packets', 'pose_renders', 'axekick', 'frontkick', 'lowbackkick', 'spinninghighkick', 'last_attack_batch'],
  },
  {
    id: 'workflow_hygiene_and_generated_churn',
    label: 'Workflow Hygiene / Generated Churn',
    description: 'Evidence about repeated process-id outputs, manifests, cleanup logs, server logs, methods notes, and artifacts that indicate workflow friction.',
    tokens: ['artifact_', 'test_runs', 'server_logs', 'workflow_state', 'pose_lab_methods', 'deletion', 'manifest', 'baseline-fix-probe', 'generated/cases'],
  },
  {
    id: 'bone_orientation_and_basis',
    label: 'Bone Orientation / Basis Diagnostics',
    description: 'Evidence about hand/arm bone orientation, basis transforms, blade vectors, landmark overlays, and local/world transform audits.',
    tokens: ['bone_orientation', 'basis', 'metric_landmark', 'landmark', 'transform', 'core_transform', 'blade_vector', 'fpv_camera'],
  },
];

function entrySearchText(entry) {
  return [
    entry.path,
    entry.reason,
    ...(entry.schemas || []),
    ...(entry.representativeFiles || []),
  ].join(' ').toLowerCase();
}

function mineEntryFamilies(entry) {
  const text = entrySearchText(entry);
  return miningFamilies
    .filter((family) => family.tokens.some((token) => text.includes(token.toLowerCase())))
    .map((family) => family.id);
}

function summarizeFamily(family, entries) {
  const matched = entries.filter((entry) => mineEntryFamilies(entry).includes(family.id));
  const retention = {};
  const reasons = {};
  const schemas = {};
  for (const entry of matched) {
    retention[entry.retention] = (retention[entry.retention] || 0) + 1;
    reasons[entry.reason] = (reasons[entry.reason] || 0) + 1;
    for (const schema of entry.schemas || []) schemas[schema] = (schemas[schema] || 0) + 1;
  }
  return {
    id: family.id,
    label: family.label,
    description: family.description,
    count: matched.length,
    retention,
    sizeBytes: sum(matched, 'sizeBytes'),
    fileCount: sum(matched, 'fileCount'),
    imageCount: sum(matched, 'imageCount'),
    topReasons: Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([reason, count]) => ({ reason, count })),
    topSchemas: Object.entries(schemas).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([schema, count]) => ({ schema, count })),
    representativePaths: matched.slice(0, 16).map((entry) => entry.path),
  };
}

function inferRecurringProblems(families) {
  const problems = [];
  const byId = Object.fromEntries(families.map((family) => [family.id, family]));
  if ((byId.weapon_pinning_and_fk?.count || 0) > 0) {
    problems.push({
      problem: 'Weapon attachment has repeatedly diverged between stored socket data, bone hierarchy, runtime visual layer, and offline verification.',
      evidenceFamilies: ['weapon_pinning_and_fk', 'bone_orientation_and_basis', 'visual_truth_and_capture'],
      implication: 'A fix is not trustworthy unless it proves the same hand-local hilt offset and blade basis in browser/runtime and offline renderer artifacts.',
    });
  }
  if ((byId.visual_truth_and_capture?.count || 0) > 0) {
    problems.push({
      problem: 'Visual evidence has fragmented across screenshots, browser state, debug bridge output, and offline renderers.',
      evidenceFamilies: ['visual_truth_and_capture', 'workflow_hygiene_and_generated_churn'],
      implication: 'Reports should name the exact route, actor, clip, cache token, renderer, and artifact path before declaring visual success.',
    });
  }
  if ((byId.meshy_fps_retarget?.count || 0) > 0) {
    problems.push({
      problem: 'Meshy/FPS retarget work has mixed rest-pose deltas, ready-pose deltas, roll offsets, visual IK, projected pins, and manual offsets.',
      evidenceFamilies: ['meshy_fps_retarget', 'bone_orientation_and_basis'],
      implication: 'Future mining should separate target-minus-tpose calibration, clip-specific offsets, and user-authored manual fixes as different contracts.',
    });
  }
  if ((byId.workflow_hygiene_and_generated_churn?.count || 0) > 0) {
    problems.push({
      problem: 'Generated evidence churn hides which artifacts are canonical versus scratch, especially when tests emit process-id folders.',
      evidenceFamilies: ['workflow_hygiene_and_generated_churn'],
      implication: 'Tools should write stable latest/baseline paths by default and reserve process-id outputs for temporary debug runs.',
    });
  }
  if ((byId.manual_pose_and_attack_iteration?.count || 0) > 0) {
    problems.push({
      problem: 'Pose-quality iteration produces useful visual history, but image-heavy folders require explicit visual review before retention decisions.',
      evidenceFamilies: ['manual_pose_and_attack_iteration'],
      implication: 'Cleanup must not delete critique/manual render families until a visual contact-sheet review labels the useful baselines.',
    });
  }
  return problems;
}

function buildMiningIndex(manifest, plan, log) {
  const entries = manifest.entries || [];
  const families = miningFamilies.map((family) => summarizeFamily(family, entries));
  const recurringProblems = inferRecurringProblems(families);
  const unmapped = entries.filter((entry) => mineEntryFamilies(entry).length === 0);
  return {
    schema: 'pose-lab-generated-artifact-mining-index-v1',
    generatedAt: new Date().toISOString(),
    sourceManifest: rel(args.manifest),
    imageInspection: manifest.imageInspection || 'not-performed',
    miningMethod: 'metadata-only: path names, retention reasons, schemas, representative file names, file/image counts; no image decoding or visual judgment',
    deletionSummary: {
      currentRun: log?.summary || null,
      currentRunDeleteMarked: Boolean(log?.deleteMarked),
      previousDeletionSummary: log?.previousDeletionSummary || null,
    },
    familySummary: families,
    recurringProblems,
    unmappedReviewOrKeep: unmapped.filter((entry) => entry.retention !== 'delete').map((entry) => ({
      path: entry.path,
      retention: entry.retention,
      reason: entry.reason,
      schemas: entry.schemas || [],
      imageCount: entry.imageCount,
      fileCount: entry.fileCount,
    })),
    nextMiningPasses: [
      {
        name: 'visual-baseline contact sheet review',
        targetFamilies: ['manual_pose_and_attack_iteration', 'visual_truth_and_capture'],
        output: 'label which image-heavy artifacts are canonical baselines, failed attempts, or disposable duplicates',
      },
      {
        name: 'weapon FK contract map',
        targetFamilies: ['weapon_pinning_and_fk', 'bone_orientation_and_basis'],
        output: 'trace each hilt/socket/basis artifact to the source code path or rig-profile field it validates',
      },
      {
        name: 'generated-output normalization',
        targetFamilies: ['workflow_hygiene_and_generated_churn'],
        output: 'move recurring tools toward stable latest/baseline outputs and fewer process-id scratch folders',
      },
    ],
  };
}

function buildPlan(manifest) {
  const entries = manifest.entries || [];
  const retained = entries.filter((entry) => entry.retention !== 'delete');
  const deleteEntries = entries.filter((entry) => entry.retention === 'delete');
  const deletable = [];
  const skipped = [];

  for (const entry of deleteEntries) {
    const blockers = retained
      .filter((candidate) => candidate.path.startsWith(`${entry.path}/`))
      .map((candidate) => ({ path: candidate.path, retention: candidate.retention, reason: candidate.reason }));
    if (!ensureInsideGenerated(entry.path)) {
      skipped.push({ ...entry, skipReason: 'outside generated root or unsafe generated root path' });
    } else if (blockers.length) {
      skipped.push({ ...entry, skipReason: 'contains retained child entries', blockers });
    } else {
      deletable.push(entry);
    }
  }

  return {
    schema: 'pose-lab-generated-artifact-deletion-plan-v1',
    generatedAt: new Date().toISOString(),
    sourceManifest: rel(args.manifest),
    summary: {
      deleteEntries: deleteEntries.length,
      deletableEntries: deletable.length,
      skippedEntries: skipped.length,
      bytesPlanned: sum(deletable, 'sizeBytes'),
      imageCountPlanned: sum(deletable, 'imageCount'),
      fileCountPlanned: sum(deletable, 'fileCount'),
    },
    deletable,
    skipped,
  };
}

function buildReport(manifest, plan, log, mining) {
  const entries = manifest.entries || [];
  const keep = entries.filter((entry) => entry.retention === 'keep');
  const review = entries.filter((entry) => entry.retention === 'review');
  const del = entries.filter((entry) => entry.retention === 'delete');
  const lines = [];

  lines.push('# Generated Artifact Manifest Review');
  lines.push('');
  lines.push(`- Source manifest: \`${rel(args.manifest)}\``);
  lines.push(`- Image inspection: ${manifest.imageInspection || 'not-performed'}`);
  lines.push(`- Keep entries justified: ${keep.length} (${formatBytes(sum(keep, 'sizeBytes'))})`);
  lines.push(`- Review/mixed entries retained for later review: ${review.length} (${formatBytes(sum(review, 'sizeBytes'))})`);
  lines.push(`- Delete entries selected: ${del.length} (${formatBytes(sum(del, 'sizeBytes'))})`);
  lines.push(`- Delete execution this run: ${log?.deleteMarked ? (log.dryRun ? 'dry run only' : 'executed') : 'not requested'}`);
  if (log?.deleteMarked) {
    lines.push(`- Deleted paths this run: ${log.summary.deletedEntries}; missing before delete: ${log.summary.missingEntries}; skipped: ${log.summary.skippedEntries}; errors: ${log.summary.errorEntries}`);
  } else if (mining?.deletionSummary?.previousDeletionSummary) {
    const previous = mining.deletionSummary.previousDeletionSummary;
    lines.push(`- Last actual deletion summary: ${previous.deletedEntries} deleted; ${previous.missingEntries} missing; ${previous.skippedEntries} skipped; ${previous.errorEntries} errors`);
  }
  if (mining) lines.push(`- Mining index: \`${rel(args.mining)}\``);
  lines.push('');

  if (mining) {
    lines.push('## Mining Summary');
    lines.push('');
    lines.push(`Method: ${mining.miningMethod}.`);
    lines.push('');
    for (const family of mining.familySummary.filter((item) => item.count > 0)) {
      lines.push(`### ${family.label}`);
      lines.push('');
      lines.push(family.description);
      lines.push('');
      lines.push(`- Entries: ${family.count}`);
      lines.push(`- Size: ${formatBytes(family.sizeBytes)}`);
      lines.push(`- Files: ${family.fileCount}`);
      if (family.imageCount) lines.push(`- Images: ${family.imageCount}`);
      if (family.topReasons.length) {
        lines.push('- Main retention reasons:');
        for (const item of family.topReasons.slice(0, 4)) lines.push(`  - ${item.count}x ${item.reason}`);
      }
      if (family.topSchemas.length) {
        lines.push('- Frequent schemas:');
        for (const item of family.topSchemas.slice(0, 4)) lines.push(`  - ${item.count}x \`${item.schema}\``);
      }
      lines.push('- Representative paths:');
      lines.push(family.representativePaths.slice(0, 8).map((item) => `  - \`${item}\``).join('\n'));
      lines.push('');
    }

    lines.push('## Recurring Problems Mined');
    lines.push('');
    for (const item of mining.recurringProblems) {
      lines.push(`### ${item.problem}`);
      lines.push('');
      lines.push(`- Evidence families: ${item.evidenceFamilies.map((family) => `\`${family}\``).join(', ')}`);
      lines.push(`- Implication: ${item.implication}`);
      lines.push('');
    }

    lines.push('## Next Mining Passes');
    lines.push('');
    for (const item of mining.nextMiningPasses) {
      lines.push(`- ${item.name}: ${item.output}`);
    }
    lines.push('');
  }

  lines.push('## Keep Justification');
  lines.push('');
  lines.push('Keep entries are retained because they are current manifests, structured metrics with project schemas, named baselines, or canonical diagnostic roots used to compare pose/weapon/rendering regressions.');
  lines.push('');
  for (const [reason, grouped] of byReason(keep)) {
    lines.push(`### ${reason}`);
    lines.push('');
    lines.push(`- Count: ${grouped.length}`);
    lines.push(`- Size: ${formatBytes(sum(grouped, 'sizeBytes'))}`);
    lines.push(`- Files: ${sum(grouped, 'fileCount')}`);
    if (grouped.some((entry) => entry.imageCount)) lines.push(`- Images: ${sum(grouped, 'imageCount')}`);
    lines.push('- Representative paths:');
    lines.push(samplePaths(grouped));
    lines.push('');
  }

  lines.push('## Review / Mixed');
  lines.push('');
  lines.push('Review entries are not deleted. They are image-heavy, mixed containers, named diagnostic stages, or unclassified metadata where usefulness cannot be proven without later artifact review.');
  lines.push('');
  for (const [reason, grouped] of byReason(review)) {
    lines.push(`### ${reason}`);
    lines.push('');
    lines.push(`- Count: ${grouped.length}`);
    lines.push(`- Size: ${formatBytes(sum(grouped, 'sizeBytes'))}`);
    lines.push(`- Files: ${sum(grouped, 'fileCount')}`);
    if (grouped.some((entry) => entry.imageCount)) lines.push(`- Images: ${sum(grouped, 'imageCount')}`);
    lines.push('- Representative paths:');
    lines.push(samplePaths(grouped));
    lines.push('');
  }

  lines.push('## Delete');
  lines.push('');
  lines.push('Delete entries are empty files, one-off browser probes, or repeated process-id/contract scratch runs that can be regenerated from checked-in tools.');
  lines.push('');
  for (const [reason, grouped] of byReason(del)) {
    lines.push(`### ${reason}`);
    lines.push('');
    lines.push(`- Count: ${grouped.length}`);
    lines.push(`- Size: ${formatBytes(sum(grouped, 'sizeBytes'))}`);
    lines.push(`- Files: ${sum(grouped, 'fileCount')}`);
    if (grouped.some((entry) => entry.imageCount)) lines.push(`- Images: ${sum(grouped, 'imageCount')}`);
    lines.push('- Representative paths:');
    lines.push(samplePaths(grouped));
    lines.push('');
  }

  lines.push('## Safety Checks');
  lines.push('');
  lines.push(`- Planned deletable entries: ${plan.summary.deletableEntries}`);
  lines.push(`- Planned skipped entries: ${plan.summary.skippedEntries}`);
  lines.push('- Refused deletion for any path outside `generated/`, the `generated` root itself, or a delete-marked ancestor containing keep/review children.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function removePlannedEntries(plan, dryRun) {
  const deleted = [];
  const missing = [];
  const errors = [];

  if (dryRun) return { deleted, missing, errors };

  const entries = [...plan.deletable].sort((a, b) => b.path.length - a.path.length);
  for (const entry of entries) {
    const absolute = path.resolve(projectRoot, entry.path);
    try {
      if (!fs.existsSync(absolute)) {
        missing.push(entry);
        continue;
      }
      fs.rmSync(absolute, { recursive: true, force: false });
      deleted.push(entry);
    } catch (error) {
      errors.push({ ...entry, error: error.message });
    }
  }
  return { deleted, missing, errors };
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function readJsonIfExists(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

const args = parseArgs(process.argv);
const manifest = JSON.parse(fs.readFileSync(args.manifest, 'utf8'));
const plan = buildPlan(manifest);
if (args.deleteMarked || plan.summary.deletableEntries > 0) writeJson(args.plan, plan);

const result = args.deleteMarked
  ? removePlannedEntries(plan, args.dryRun)
  : { deleted: [], missing: [], errors: [] };

const log = {
  schema: args.deleteMarked ? 'pose-lab-generated-artifact-deletion-log-v1' : 'pose-lab-generated-artifact-review-log-v1',
  generatedAt: new Date().toISOString(),
  sourceManifest: rel(args.manifest),
  dryRun: args.dryRun,
  deleteMarked: args.deleteMarked,
  summary: {
    plannedEntries: plan.summary.deletableEntries,
    plannedBytes: plan.summary.bytesPlanned,
    plannedImages: plan.summary.imageCountPlanned,
    plannedFiles: plan.summary.fileCountPlanned,
    skippedEntries: plan.summary.skippedEntries,
    deletedEntries: result.deleted.length,
    missingEntries: result.missing.length,
    errorEntries: result.errors.length,
  },
  skipped: plan.skipped,
  deleted: result.deleted,
  missing: result.missing,
  errors: result.errors,
};
writeJson(args.deleteMarked ? args.log : args.reviewLog, log);
const previousDeletionLog = args.deleteMarked ? null : readJsonIfExists(args.log);
const mining = buildMiningIndex(manifest, plan, { ...log, previousDeletionSummary: previousDeletionLog?.summary || null });
writeJson(args.mining, mining);
fs.writeFileSync(args.report, buildReport(manifest, plan, log, mining));

console.log(JSON.stringify({
  dryRun: args.dryRun,
  deleteMarked: args.deleteMarked,
  plannedEntries: plan.summary.deletableEntries,
  skippedEntries: plan.summary.skippedEntries,
  deletedEntries: result.deleted.length,
  missingEntries: result.missing.length,
  errorEntries: result.errors.length,
  miningFamilies: mining.familySummary.filter((family) => family.count > 0).length,
  recurringProblems: mining.recurringProblems.length,
  plannedBytes: plan.summary.bytesPlanned,
}, null, 2));

if (result.errors.length) process.exitCode = 1;
