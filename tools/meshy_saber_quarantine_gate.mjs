#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const MIN_READABLE_BLADE_SCREEN_PX = 48;
const MAX_APPLIED_HILT_TO_HAND_SCREEN_PX = 72;
const MAX_APPLIED_HILT_TO_WEAPON_GRIP_WORLD = 0.08;

function parseArgs(argv) {
  const args = {
    artifact: path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest', 'visual_truth.json'),
    actor: 'meshyCharacter',
    clip: 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]',
    selfTestKnownRed: false,
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--artifact') args.artifact = path.resolve(argv[++index] || '');
    else if (arg === '--actor') args.actor = argv[++index] || args.actor;
    else if (arg === '--clip') args.clip = argv[++index] || args.clip;
    else if (arg === '--self-test-known-red') args.selfTestKnownRed = true;
    else if (arg === '--help' || arg === '-h') {
      console.log([
        'Usage: node tools/meshy_saber_quarantine_gate.mjs [--artifact path] [--actor key] [--clip name]',
        '',
        'Fails closed for Meshy saber visual truth artifacts that are human-red,',
        'missing the requested actor/clip, pose-degraded, or sword-hidden.',
      ].join('\n'));
      process.exit(0);
    }
  }
  return args;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return value == null ? '' : String(value);
}

function lower(value) {
  return text(value).toLowerCase();
}

function captureWeapon(capture = {}) {
  return capture.cloudTelemetry?.weapon?.weapon
    || capture.weapon?.weapon
    || capture.weapon
    || {};
}

function captureChecks(capture = {}) {
  return {
    ...(capture.evaluation?.checks || {}),
    ...(capture.checks || {}),
  };
}

function captureFailures(capture = {}) {
  return [
    ...array(capture.evaluation?.failures),
    ...array(capture.failures),
    ...array(capture.senseSynthesis?.failures),
  ];
}

function getPath(source, pathName) {
  return pathName.split('.').reduce((value, key) => (value == null ? undefined : value[key]), source);
}

function firstBoolean(source, pathNames) {
  for (const pathName of pathNames) {
    const value = getPath(source, pathName);
    if (typeof value === 'boolean') return { path: pathName, value };
  }
  return null;
}

function firstFiniteNumber(source, pathNames) {
  for (const pathName of pathNames) {
    const value = Number(getPath(source, pathName));
    if (Number.isFinite(value)) return { path: pathName, value };
  }
  return null;
}

function captureActorEvidence(capture = {}) {
  const weapon = captureWeapon(capture);
  return [
    capture.actor,
    capture.actorKey,
    capture.selectedActor,
    capture.snapshot?.selectedActor,
    capture.snapshot?.actor,
    weapon.actor,
    weapon.actorKey,
  ].filter(Boolean).map(text);
}

function captureClipEvidence(capture = {}) {
  const weapon = captureWeapon(capture);
  return [
    capture.clip,
    capture.clipName,
    capture.selectedClip,
    capture.snapshot?.selectedClip,
    capture.snapshot?.clip,
    weapon.clip,
    weapon.clipName,
  ].filter(Boolean).map(text);
}

function evidenceMentions(valueList, expected) {
  const wanted = text(expected);
  return valueList.some((value) => value === wanted || value.includes(wanted) || wanted.includes(value));
}

function isHumanRed(capture = {}, artifact = {}) {
  const visible = lower(capture.visibleRead || capture.observedVisibleRelationship);
  const verdict = lower(capture.verdict || capture.senseSynthesis?.verdict || capture.evaluation?.verdict);
  const failures = captureFailures(capture).join('\n').toLowerCase();
  return artifact.ok === false
    || capture.accepted === false
    || capture.evaluation?.ok === false
    || visible.includes('human-red')
    || verdict === 'human-red'
    || failures.includes('human-red')
    || failures.includes('red build')
    || failures.includes('metric-green / human-red');
}

function isSwordHidden(capture = {}) {
  const checks = captureChecks(capture);
  const weapon = captureWeapon(capture);
  return checks.realWeaponVisible === false
    || checks.weaponVisible === false
    || checks.modelVisible === false
    || weapon.visible === false
    || weapon.modelVisible === false
    || weapon.displayVisible === false;
}

function visibleWeaponRelationshipFailures(capture = {}) {
  const checks = captureChecks(capture);
  const weapon = captureWeapon(capture);
  const source = { capture, checks, weapon };
  const failures = [];

  const meshVisible = firstBoolean(source, [
    'checks.realSabreMeshVisible',
    'checks.realSaberMeshVisible',
    'checks.realWeaponVisible',
    'checks.weaponVisible',
    'checks.modelVisible',
    'weapon.realSabreMeshVisible',
    'weapon.realSaberMeshVisible',
    'weapon.modelVisible',
    'weapon.visible',
  ]);
  if (!meshVisible) failures.push('missing visible-weapon proof: real sabre mesh visible boolean is required');
  else if (meshVisible.value !== true) failures.push(`real sabre mesh is not visible: ${meshVisible.path}=false`);

  const bladeReadable = firstBoolean(source, [
    'checks.bladeLengthOnScreenReadable',
    'checks.bladeScreenLengthReadable',
    'checks.realBladeReadable',
    'checks.visibleBladeReadable',
    'weapon.screen.bladeLengthReadable',
  ]);
  const bladePx = firstFiniteNumber(source, [
    'checks.bladeLengthScreenPx',
    'checks.bladeScreenLengthPx',
    'checks.visibleBladeScreenPx',
    'weapon.bladeLengthScreenPx',
    'weapon.bladeScreenLengthPx',
    'weapon.screen.bladeLengthPx',
    'weapon.screenBladeLengthPx',
  ]);
  if (bladeReadable?.value === false) failures.push(`blade is not readable on screen: ${bladeReadable.path}=false`);
  if (bladePx && bladePx.value < MIN_READABLE_BLADE_SCREEN_PX) {
    failures.push(`blade length on screen below readable threshold: ${bladePx.path}=${bladePx.value} < ${MIN_READABLE_BLADE_SCREEN_PX}`);
  }
  if (!bladeReadable && !bladePx) {
    failures.push('missing visible-weapon proof: blade length on screen must be measured or explicitly marked readable');
  }

  const collapsedIntoTorso = firstBoolean(source, [
    'checks.hiltCollapsedIntoTorso',
    'checks.hiltCollapsedIntoBody',
    'checks.hiltAtBodyCenter',
    'checks.appliedHiltAtBodyCenter',
    'weapon.screen.hiltCollapsedIntoTorso',
  ]);
  if (collapsedIntoTorso?.value === true) failures.push(`hilt collapsed into torso/body center: ${collapsedIntoTorso.path}=true`);
  const awayFromTorso = firstBoolean(source, [
    'checks.hiltNotCollapsedIntoTorso',
    'checks.hiltAwayFromTorso',
    'checks.hiltAwayFromBodyCenter',
    'checks.appliedHiltAwayFromBodyCenter',
    'weapon.screen.hiltAwayFromBodyCenter',
  ]);
  if (awayFromTorso?.value === false) failures.push(`hilt is not clear of torso/body center: ${awayFromTorso.path}=false`);
  if (!awayFromTorso && !collapsedIntoTorso) {
    failures.push('missing visible-weapon proof: hilt must be shown clear of torso/body center');
  }

  const hiltNearHand = firstBoolean(source, [
    'checks.appliedHiltNearRightHand',
    'checks.visibleHiltNearRightHand',
    'checks.appliedHiltNearWeaponGrip',
    'checks.visibleHiltNearWeaponGrip',
    'weapon.screen.appliedHiltNearRightHand',
    'weapon.screen.visibleHiltNearWeaponGrip',
  ]);
  if (hiltNearHand?.value === false) failures.push(`applied hilt is not near right hand/WeaponGrip: ${hiltNearHand.path}=false`);
  const hiltToHandPx = firstFiniteNumber(source, [
    'checks.appliedHiltToRightHandScreenPx',
    'checks.visibleHiltToRightHandScreenPx',
    'checks.appliedHiltToWeaponGripScreenPx',
    'checks.visibleHiltToWeaponGripScreenPx',
    'weapon.screen.appliedHiltToRightHandPx',
    'weapon.screen.visibleHiltToWeaponGripPx',
  ]);
  if (hiltToHandPx && hiltToHandPx.value > MAX_APPLIED_HILT_TO_HAND_SCREEN_PX) {
    failures.push(`applied hilt too far from right hand/WeaponGrip on screen: ${hiltToHandPx.path}=${hiltToHandPx.value} > ${MAX_APPLIED_HILT_TO_HAND_SCREEN_PX}`);
  }
  const hiltToGripWorld = firstFiniteNumber(source, [
    'checks.visibleHiltToWeaponGripDistance',
    'checks.appliedHiltToWeaponGripDistance',
    'weapon.visibleHiltToWeaponGripDistance',
    'weapon.appliedHiltToWeaponGripDistance',
  ]);
  if (hiltToGripWorld && hiltToGripWorld.value > MAX_APPLIED_HILT_TO_WEAPON_GRIP_WORLD) {
    failures.push(`applied hilt too far from WeaponGrip: ${hiltToGripWorld.path}=${hiltToGripWorld.value} > ${MAX_APPLIED_HILT_TO_WEAPON_GRIP_WORLD}`);
  }
  if (!hiltNearHand && !hiltToHandPx && !hiltToGripWorld) {
    failures.push('missing visible-weapon proof: applied hilt must be measured near right hand/WeaponGrip');
  }

  return failures;
}

function isPoseDegraded(capture = {}) {
  const checks = captureChecks(capture);
  return checks.poseDegraded === true
    || checks.bodyPoseLandmarksPresent === false
    || checks.readyHandOrientationSane === false
    || checks.tposeWristRelationshipAccepted === false
    || checks.defaultSurfaceAccepted === false
    || checks.readyVisualRelationshipAccepted === false;
}

function relevantCaptures(artifact = {}, requestedClip = '') {
  const captures = array(artifact.captures);
  if (!requestedClip) return captures;
  const exact = captures.filter((capture) => evidenceMentions(captureClipEvidence(capture), requestedClip));
  if (exact.length) return exact;
  const ready = captures.filter((capture) => lower(capture.id).includes('ready'));
  return ready.length ? ready : captures;
}

export function evaluateMeshySaberQuarantine(artifact, options = {}) {
  const requestedActor = options.actor || 'meshyCharacter';
  const requestedClip = options.clip || 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]';
  const failures = [];
  if (!artifact || typeof artifact !== 'object') {
    return { ok: false, failures: ['artifact is missing or not an object'] };
  }

  if (artifact.schema && !/visual|truth|evidence|firebase/.test(artifact.schema)) {
    failures.push(`unexpected visual artifact schema: ${artifact.schema}`);
  }

  if (artifact.senseSynthesis?.verdict && artifact.senseSynthesis.verdict !== 'human-green') {
    failures.push(`human red or non-green Sense Synthesis verdict: ${artifact.senseSynthesis.verdict}`);
  }
  for (const [key, value] of Object.entries(artifact.truthLedger || {})) {
    if (['cloudBrowserCapture', 'landingUsable', 'tposeStableIdle', 'readyBoringFk', 'senseSynthesis'].includes(key) && value === false) {
      failures.push(`truth ledger is red: ${key}=false`);
    }
  }

  const captures = relevantCaptures(artifact, requestedClip);
  if (!captures.length) failures.push('visual artifact has no captures to review');

  const actorSeen = captures.some((capture) => evidenceMentions(captureActorEvidence(capture), requestedActor));
  const clipSeen = captures.some((capture) => evidenceMentions(captureClipEvidence(capture), requestedClip));
  if (!actorSeen) failures.push(`requested actor missing from visible review truth: ${requestedActor}`);
  if (!clipSeen) failures.push(`requested clip missing from visible review truth: ${requestedClip}`);

  for (const capture of captures) {
    const label = capture.id || capture.clip || capture.clipName || 'capture';
    const checks = captureChecks(capture);
    if (checks.actorSelected === false || checks.routeSelected === false || checks.autoLoadedMeshyFromColdUrl === false) {
      failures.push(`${label}: requested actor/route is not selected`);
    }
    if (checks.clipSelected === false) failures.push(`${label}: requested clip is not selected`);
    if (isHumanRed(capture, artifact)) failures.push(`${label}: human-red visible review truth`);
    if (isPoseDegraded(capture)) failures.push(`${label}: pose degraded or visual relationship rejected`);
    if (isSwordHidden(capture)) failures.push(`${label}: real sword hidden or not visible`);
    for (const failure of visibleWeaponRelationshipFailures(capture)) failures.push(`${label}: ${failure}`);
  }

  return {
    ok: failures.length === 0,
    failures,
    checkedCaptures: captures.map((capture) => capture.id || capture.clip || capture.clipName || 'capture'),
    requestedActor,
    requestedClip,
  };
}

function knownRedArtifact() {
  return {
    schema: 'pose-lab-firebase-visual-truth-v1',
    ok: false,
    senseSynthesis: { verdict: 'human-red', failures: ['ready: Ready missing readyVisualRelationshipAccepted'] },
    truthLedger: {
      cloudBrowserCapture: true,
      landingUsable: true,
      tposeStableIdle: true,
      readyBoringFk: false,
      senseSynthesis: false,
    },
    captures: [
      {
        id: 'ready',
        captureKind: 'android-screenshot',
        screenshot: '/storage/emulated/0/Pictures/Screenshots/Screenshot_20260703-224404.png',
        accepted: false,
        visibleRead: 'human-red: route recovered, but the real blade is not readable and the hilt/marker is collapsed around the torso/hand area instead of reading as a held saber',
        expectedVisibleRelationship: 'real sabre mesh visible, blade readable on screen, applied hilt near right hand/WeaponGrip, hilt clear of torso/body center',
        evaluation: {
          ok: false,
          failures: ['Ready route recovery is insufficient; visible weapon relationship remains red'],
          checks: {
            routeSelected: true,
            actorSelected: true,
            clipSelected: true,
            realWeaponVisible: true,
            realSabreMeshVisible: true,
            bladeLengthScreenPx: 18,
            hiltCollapsedIntoTorso: true,
            appliedHiltNearRightHand: false,
            readyHandOrientationSane: true,
            readyVisualRelationshipAccepted: false,
          },
        },
        cloudTelemetry: {
          weapon: {
            weapon: {
              actor: 'meshyCharacter',
              clip: 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]',
              visible: true,
              modelVisible: true,
            },
          },
        },
      },
    ],
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.selfTestKnownRed) {
    const result = evaluateMeshySaberQuarantine(knownRedArtifact(), args);
    if (result.ok) {
      console.error(JSON.stringify({ checked: ['meshy-saber-quarantine-known-red'], ok: false, error: 'known red artifact was accepted' }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({
      checked: ['meshy-saber-quarantine-known-red'],
      ok: true,
      rejectedKnownRed: true,
      failures: result.failures,
    }, null, 2));
    return;
  }

  if (!fs.existsSync(args.artifact)) {
    console.error(JSON.stringify({
      checked: ['meshy-saber-quarantine-gate'],
      ok: false,
      failures: [`missing visual truth artifact: ${path.relative(projectRoot, args.artifact)}`],
    }, null, 2));
    process.exit(1);
  }
  const artifact = JSON.parse(fs.readFileSync(args.artifact, 'utf8'));
  const result = evaluateMeshySaberQuarantine(artifact, args);
  console.log(JSON.stringify({
    checked: ['meshy-saber-quarantine-gate'],
    artifact: path.relative(projectRoot, args.artifact),
    ...result,
  }, null, 2));
  if (!result.ok) process.exit(1);
}

main();
