#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultClip = 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]';

function parseArgs(argv) {
  const args = { kind: '', actor: 'meshyCharacter', clip: defaultClip, json: false };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--kind') args.kind = String(argv[++i] || '');
    else if (arg.startsWith('--kind=')) args.kind = arg.slice('--kind='.length);
    else if (arg === '--actor') args.actor = String(argv[++i] || args.actor);
    else if (arg.startsWith('--actor=')) args.actor = arg.slice('--actor='.length);
    else if (arg === '--clip') args.clip = String(argv[++i] || args.clip);
    else if (arg.startsWith('--clip=')) args.clip = arg.slice('--clip='.length);
    else if (arg === '--json') args.json = true;
  }
  return args;
}

function normalizeKind(kind) {
  const text = String(kind || '').toLowerCase().replace(/[_\s]+/g, '-');
  if (['weapon', 'weapon-fk', 'sword', 'hilt', 'mesh-weapon'].includes(text)) return 'weapon-fk';
  if (['cache', 'server', 'stale', 'cache-server'].includes(text)) return 'cache-server';
  if (['pose', 'retarget', 'animation', 'pose-retarget'].includes(text)) return 'pose-retarget';
  if (['ui', 'panel', 'controls', 'ui-state'].includes(text)) return 'ui-state';
  if (['promotion', 'candidate', 'baseline'].includes(text)) return 'promotion';
  if (['live', 'visual', 'browser', 'live-visual'].includes(text)) return 'live-visual';
  return text || 'weapon-fk';
}

function command(text) {
  return { command: text, cwd: projectRoot };
}

function routeFor(args) {
  const kind = normalizeKind(args.kind);
  const clip = args.clip || defaultClip;
  const actor = args.actor || 'meshyCharacter';
  const commonForbidden = [
    'deprecated standalone screencap as acceptance evidence',
    'source-string tests as final proof of a visual fix',
    'stale browser tabs without cache-token confirmation',
  ];
  const routes = {
    'weapon-fk': {
      kind: 'weapon-fk',
      authoritativeEvidence: 'offline-render-artifact',
      summary: 'Use the offline pose+weapon renderer as the first proof for Meshy/FPS weapon hierarchy, hilt displacement, blade direction, and parent-chain regressions.',
      commands: [
        command(`node tools/pose_lab_offline_render.mjs --actor ${actor} --clip ${JSON.stringify(clip)} --samples 4 --assert-fixed`),
        command('node tools/test_pose_lab_offline_render_contract.mjs'),
        command('node tools/test_weapon_fk_attachment_contract.mjs'),
        command('node tools/test_meshy_full_body_weapon_attachment.mjs'),
        command('node tools/test_manual_weapon_placement_lock.mjs'),
      ],
      requiredArtifacts: [
        'generated/pose_lab_offline_render/latest/pose_weapon_render.json',
        'generated/pose_lab_offline_render/latest/pose_weapon_render.png',
      ],
      acceptance: [
        'artifact.ok === true',
        'checks.appliedHiltPinnedToWeaponGrip === true',
        'checks.appliedHiltAwayFromRawHand === true',
        'checks.weaponGripDisplacedFromWeaponR === true',
        'checks.weaponBladeDirectionMatchesFpsSource === true',
        'maxDistances.rawHandToAppliedHilt >= thresholds.displacementMinDistance',
      ],
      forbiddenProof: commonForbidden,
      negativeControl: command(`node tools/pose_lab_offline_render.mjs --actor ${actor} --clip ${JSON.stringify(clip)} --samples 2 --fault collapse-displacement`),
    },
    'cache-server': {
      kind: 'cache-server',
      authoritativeEvidence: 'server-header-and-module-token',
      summary: 'Use no-cache server checks before debugging stale visual state.',
      commands: [
        command('node tools/test_no_cache_server_contract.mjs'),
        command('tmux ls'),
        command('curl -I --max-time 5 http://127.0.0.1:8798/pose-lab/pose-lab.html'),
      ],
      requiredArtifacts: ['generated/server_logs/pose-lab-server-8798.log'],
      acceptance: ['HTTP 200', 'Cache-Control includes no-store/no-cache', 'served module URLs use current LAB_CACHE_TOKEN'],
      forbiddenProof: ['browser memory of a previous URL', ...commonForbidden],
    },
    'pose-retarget': {
      kind: 'pose-retarget',
      authoritativeEvidence: 'offline-pose-or-workbench-artifact',
      summary: 'Use generated pose/workbench artifacts before changing accepted retarget baselines.',
      commands: [
        command('node tools/pose_lab_workflow_status.mjs'),
        command('node tools/test_meshy_core_retarget_contract.mjs'),
      ],
      requiredArtifacts: ['generated/workflow_state/meshy_fps_accepted_baseline.json'],
      acceptance: ['baseline surfaces remain protected', 'candidate changes stay candidate-only until promoted'],
      forbiddenProof: commonForbidden,
    },
    'ui-state': {
      kind: 'ui-state',
      authoritativeEvidence: 'live-ui-or-visual-qa-artifact',
      summary: 'Use live UI evidence for panel, control, transport, and phone layout failures.',
      commands: [
        command('node tools/test_ux_critique_workflow.mjs'),
        command('node tools/test_pose_lab_debug_console_contract.mjs'),
      ],
      requiredArtifacts: ['fresh screenshot, visual QA report, or debug snapshot with cache token'],
      acceptance: ['visible control state matches the requested workflow', 'cache token is current'],
      forbiddenProof: commonForbidden,
    },
    promotion: {
      kind: 'promotion',
      authoritativeEvidence: 'promotion-gate-report',
      summary: 'Use the promotion gate for accepted Meshy/FPS baseline changes.',
      commands: [
        command('node tools/pose_lab_workflow_status.mjs'),
        command('node tools/test_pose_lab_no_bad_promotions.mjs'),
      ],
      requiredArtifacts: ['candidate JSON', 'fresh visual evidence JSON', 'promotion metrics JSON'],
      acceptance: ['promotion gate passes with fresh matching visual and metric evidence'],
      forbiddenProof: ['manual profile edits without promotion evidence', ...commonForbidden],
    },
    'live-visual': {
      kind: 'live-visual',
      authoritativeEvidence: 'fresh-live-browser-capture',
      summary: 'Use live browser or visual QA evidence for failures that only exist in runtime UI.',
      commands: [
        command('node tools/pose_lab_debug.mjs serve --port 8899 --page-url http://127.0.0.1:8798/pose-lab/pose-lab.html'),
        command('node tools/pose_lab_weapon_visual_follow.mjs --bridge http://127.0.0.1:8899 --out generated/weapon_visual_follow/meshy_ready'),
      ],
      requiredArtifacts: ['rendered contact-sheet PNG or fresh user screenshot with current cache token'],
      acceptance: ['artifact reports current cache token', 'visible read matches the user-facing claim'],
      forbiddenProof: commonForbidden,
    },
  };
  return routes[kind] || {
    kind,
    authoritativeEvidence: 'unknown',
    summary: `No route is registered for ${kind}; default to PROJECT_ORIENTATION.md troubleshooting order before editing.`,
    commands: [command('sed -n "48,86p" PROJECT_ORIENTATION.md')],
    requiredArtifacts: [],
    acceptance: [],
    forbiddenProof: commonForbidden,
  };
}

const args = parseArgs(process.argv);
const route = {
  schema: 'pose-lab-route-v1',
  actor: args.actor,
  clip: args.clip,
  route: routeFor(args),
};

if (args.json) {
  console.log(JSON.stringify(route, null, 2));
} else {
  console.log(`# Pose Lab Route: ${route.route.kind}`);
  console.log(route.route.summary);
  console.log('\nCommands:');
  for (const item of route.route.commands) console.log(`- ${item.command}`);
  console.log('\nAcceptance:');
  for (const item of route.route.acceptance) console.log(`- ${item}`);
  console.log('\nForbidden proof:');
  for (const item of route.route.forbiddenProof) console.log(`- ${item}`);
}
