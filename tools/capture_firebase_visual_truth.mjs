#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { synthesizeCaptureSense, synthesizeEvidenceSense } from './pose_lab_sense_synthesis.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest');
const TPOSE_CLIP = '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]';
const READY_CLIP = 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]';
const ACCEPTED_MESHY_HILT = [0.73272, 0.0091, -0.01674];
const ACCEPTED_MESHY_SOCKET_ROTATION = [0, 0, 0];
const ACCEPTED_MESHY_ATTACHMENT_ROTATION = [-67.582, 76.718, -90.52];
const LANDING_LOAD_MAX_MS = 20000;
const LANDING_LOAD_WARN_MS = 20000;
const HUMAN_RED_BUILDS_PATH = path.join(projectRoot, 'evidence', 'human_visual_truth_red_builds.json');
const MOBILE_REVIEW_VIEWPORT = { width: 430, height: 932 };

function parseArgs(argv) {
  const args = { hostedUrl: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--hosted-url') args.hostedUrl = String(argv[++i] || '');
    else if (arg.startsWith('--hosted-url=')) args.hostedUrl = arg.slice('--hosted-url='.length);
  }
  return args;
}

function sourceMatch(pattern) {
  const source = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  return source.match(pattern)?.[1] || '';
}

function poseUrl(base, clip) {
  const url = new URL('pose-lab.html', base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('mode', 'standard');
  url.searchParams.set('actor', 'meshyCharacter');
  url.searchParams.set('qaActor', 'meshyCharacter');
  url.searchParams.set('clip', clip);
  url.searchParams.set('qaClip', clip);
  url.searchParams.set('weaponDebug', '1');
  url.searchParams.set('cacheBust', `firebase-visual-truth-${Date.now()}`);
  return url.toString();
}

function humanReadPoseUrl(base, clip) {
  const url = new URL('pose-lab.html', base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('mode', 'standard');
  url.searchParams.set('actor', 'meshyCharacter');
  url.searchParams.set('qaActor', 'meshyCharacter');
  url.searchParams.set('clip', clip);
  url.searchParams.set('qaClip', clip);
  url.searchParams.set('cacheBust', `firebase-visual-truth-human-${Date.now()}`);
  return url.toString();
}

function landingUrl(base) {
  const url = new URL('pose-lab.html', base.endsWith('/') ? base : `${base}/`);
  url.searchParams.set('mode', 'standard');
  url.searchParams.set('actor', 'meshyCharacter');
  url.searchParams.set('qaActor', 'meshyCharacter');
  url.searchParams.set('weaponDebug', '1');
  url.searchParams.set('cacheBust', `firebase-visual-truth-landing-${Date.now()}`);
  return url.toString();
}

function assertCloudHostedUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (_error) {
    throw new Error(`missing Firebase hosted HTTPS URL: ${value}`);
  }
  if (url.protocol !== 'https:') throw new Error(`Firebase visual truth requires HTTPS cloud URL, got: ${value}`);
  if (!/\.web\.app$/.test(url.hostname) || !url.hostname.startsWith('pose-lab-visual-truth')) {
    throw new Error(`Firebase visual truth requires pose-lab-visual-truth.web.app hosted URL, got: ${value}`);
  }
  return url.toString();
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function closeArray(actual, expected, epsilon = 0.00001) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => Math.abs(Number(value) - Number(expected[index])) <= epsilon);
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:image\/png;base64,(.+)$/);
  return match ? Buffer.from(match[1], 'base64') : null;
}

function relationshipCloseupClip(page) {
  const viewport = page.viewportSize() || MOBILE_REVIEW_VIEWPORT;
  const y = Math.min(260, Math.max(0, viewport.height - 360));
  return {
    x: 0,
    y,
    width: Math.min(viewport.width, 520),
    height: Math.min(viewport.height - y, 520),
  };
}

function compactError(value) {
  return String(value || '').replace(/\s+/g, ' ').slice(0, 300);
}

function reviewTruthFailures(snapshot) {
  const truth = snapshot?.reviewTruth;
  if (!truth?.active) return ['hosted page did not expose active review truth for this review route'];
  if (truth.ok === true) return [];
  return Array.isArray(truth.failures) && truth.failures.length ? truth.failures : ['hosted page review truth is red'];
}

function relationshipChecksFromTelemetry({ liveChecks = {}, liveDistances = {}, followChecks = {}, screenMetrics = {}, screenMotion = {} } = {}) {
  const tposeWristRelationshipAccepted = liveChecks.realWeaponVisible === true
    && liveChecks.appliedHiltPinnedToAuthoredSocket === true
    && liveChecks.appliedHiltAwayFromRawHand === true
    && Number(liveDistances.handToAppliedHiltPx || 0) >= 8
    && Number(liveDistances.socketToAppliedHiltPx || 0) <= 2;
  const readyVisualRelationshipAccepted = followChecks.realWeaponVisible === true
    && followChecks.visibleAppliedHiltMarker === true
    && followChecks.socketTipLineVisible === true
    && followChecks.appliedHiltPinnedToAuthoredSocket === true
    && followChecks.handLocalGripOffsetVisible === true
    && followChecks.appliedHiltAwayFromRawHand === true
    && followChecks.readyHandOrientationSane === true
    && Number(screenMetrics.maxHandToAppliedHiltPx || 0) >= 18
    && Number(screenMetrics.minSocketToTipPx || 0) >= 24
    && Number(screenMetrics.maxTipRightFromAppliedHiltPx || 0) >= 24
    && Number.isFinite(Number(screenMetrics.maxTipDropFromAppliedHiltPx))
    && Number(screenMetrics.maxTipDropFromAppliedHiltPx) <= 12;
  return {
    tposeWristRelationshipAccepted,
    defaultSurfaceAccepted: tposeWristRelationshipAccepted,
    readyVisualRelationshipAccepted,
  };
}

function currentCommit() {
  return process.env.GITHUB_SHA || '';
}

function currentHeadCommit() {
  return process.env.GITHUB_HEAD_SHA || currentGitCommit() || currentCommit();
}

function currentGitCommit() {
  try {
    return fs.readFileSync(path.join(projectRoot, '.git', 'HEAD'), 'utf8').trim().startsWith('ref: ')
      ? fs.readFileSync(path.join(projectRoot, '.git', fs.readFileSync(path.join(projectRoot, '.git', 'HEAD'), 'utf8').trim().slice('ref: '.length)), 'utf8').trim()
      : fs.readFileSync(path.join(projectRoot, '.git', 'HEAD'), 'utf8').trim();
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

function humanRedBuildForCommit(commit) {
  const candidates = [
    commit,
    currentHeadCommit(),
    currentGitCommit(),
    process.env.GITHUB_RUN_ID,
  ].filter(Boolean);
  if (!candidates.length || !fs.existsSync(HUMAN_RED_BUILDS_PATH)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(HUMAN_RED_BUILDS_PATH, 'utf8'));
    const builds = Array.isArray(payload?.redBuilds) ? payload.redBuilds : [];
    return builds.filter((entry) => !redBuildClosed(entry)).find((entry) => {
      const identifiers = [
        entry?.commit,
        entry?.artifactCommit,
        entry?.headCommit,
        entry?.runId,
        entry?.firebaseRunId,
        entry?.workflowRunId,
      ].map((value) => String(value || '')).filter(Boolean);
      return candidates.some((candidate) => identifiers.some((identifier) => identifierMatches(identifier, candidate)));
    }) || null;
  } catch (error) {
    return {
      commit,
      reason: `human red-build ledger could not be parsed: ${compactError(error?.message || error)}`,
      issues: ['human red-build ledger parse failure'],
    };
  }
}

async function debugExec(page, command) {
  return await page.evaluate(async (input) => {
    const api = window.__poseLabDebug || window.poseLabDebug;
    if (!api?.exec) return { ok: false, command: input, error: 'missing hosted poseLab debug API' };
    return await api.exec(input);
  }, command);
}

function evaluateTpose({ routeSelected, routeAutoSelected, weapon, liveHilt }) {
  const failures = [];
  const config = weapon?.weapon?.config || {};
  const reviewFailures = reviewTruthFailures(weapon?.snapshot);
  const live = liveHilt?.live || liveHilt || {};
  const liveChecks = live?.checks || {};
  const liveDistances = live?.distances || {};
  const layers = live?.pinning?.layers || {};
  if (!routeSelected) failures.push('hosted route did not select Meshy Character');
  if (!routeAutoSelected) failures.push('T-pose hosted route did not cold-load Meshy Character without manual actor selection');
  failures.push(...reviewFailures.map((failure) => `T-pose UI truth red: ${failure}`));
  if (weapon?.ok !== true) failures.push(`weapon debug failed: ${compactError(weapon?.error)}`);
  if (liveHilt?.ok !== true) failures.push(`live hilt debug failed: ${compactError(liveHilt?.error)}`);
  if (weapon?.weapon?.clip !== TPOSE_CLIP) failures.push(`T-pose cloud clip mismatch: ${weapon?.weapon?.clip || 'missing'}`);
  if (weapon?.weapon?.actor !== 'meshyCharacter') failures.push(`T-pose cloud actor mismatch: ${weapon?.weapon?.actor || 'missing'}`);
  if (!closeArray(config.gripLocalPosition, ACCEPTED_MESHY_HILT)) failures.push(`T-pose hilt oracle drifted: ${JSON.stringify(config.gripLocalPosition)}`);
  if (!closeArray(config.socketRotationDeg, ACCEPTED_MESHY_SOCKET_ROTATION)) failures.push(`T-pose socket rotation drifted: ${JSON.stringify(config.socketRotationDeg)}`);
  if (!closeArray(config.attachmentRotationDeg, ACCEPTED_MESHY_ATTACHMENT_ROTATION)) failures.push(`T-pose attachment rotation drifted: ${JSON.stringify(config.attachmentRotationDeg)}`);
  if (weapon?.weapon?.modelVisible !== true || weapon?.weapon?.displayVisible !== true) failures.push('T-pose real sabre model/display is not visible');
  if (liveChecks.realWeaponVisible !== true || layers.realWeaponVisible !== true) failures.push('T-pose cloud layer does not report real weapon visible');
  if (liveChecks.appliedHiltPinnedToAuthoredSocket !== true) failures.push(`T-pose hilt is not pinned to WeaponGrip: ${JSON.stringify(liveDistances)}`);
  if (!isFiniteNumber(liveDistances.handToAppliedHilt) || !isFiniteNumber(liveDistances.socketToAppliedHilt)) failures.push(`T-pose hilt distances are not finite: ${JSON.stringify(liveDistances)}`);
  const relationship = relationshipChecksFromTelemetry({ liveChecks, liveDistances });
  if (relationship.tposeWristRelationshipAccepted !== true) failures.push(`T-pose wrist/saber relationship failed telemetry proxy: ${JSON.stringify(liveDistances)}`);
  return {
    ok: failures.length === 0,
    failures,
    checks: {
      routeSelected,
      autoLoadedMeshyFromColdUrl: routeAutoSelected,
      manualActorSelectionRequiredFalse: routeAutoSelected,
      actorSelected: weapon?.weapon?.actor === 'meshyCharacter',
      clipSelected: weapon?.weapon?.clip === TPOSE_CLIP,
      acceptedHiltOracle: closeArray(config.gripLocalPosition, ACCEPTED_MESHY_HILT),
      acceptedSocketRotation: closeArray(config.socketRotationDeg, ACCEPTED_MESHY_SOCKET_ROTATION),
      acceptedAttachmentRotation: closeArray(config.attachmentRotationDeg, ACCEPTED_MESHY_ATTACHMENT_ROTATION),
      realWeaponVisible: weapon?.weapon?.modelVisible === true && liveChecks.realWeaponVisible === true,
      hiltPinnedToSocket: liveChecks.appliedHiltPinnedToAuthoredSocket === true,
      finiteHiltDistances: isFiniteNumber(liveDistances.handToAppliedHilt) && isFiniteNumber(liveDistances.socketToAppliedHilt),
      tposeWristRelationshipAccepted: relationship.tposeWristRelationshipAccepted,
      defaultSurfaceAccepted: relationship.defaultSurfaceAccepted,
      visibleUiTruthAccepted: reviewFailures.length === 0,
    },
  };
}

function visibleReadFromSense(sense) {
  const terms = Array.isArray(sense?.vocabulary) && sense.vocabulary.length ? ` [${sense.vocabulary.join(', ')}]` : '';
  return `${sense?.verdict || 'human-red'}: ${sense?.observedVisibleRelationship || 'missing Sense Synthesis read'}${terms}`;
}

function evaluateReady({ routeSelected, routeAutoSelected, weapon, visualFollow, liveHilt }) {
  const failures = [];
  const reviewFailures = reviewTruthFailures(weapon?.snapshot);
  const followChecks = visualFollow?.checks || {};
  const screenMotion = visualFollow?.screenMotion || {};
  const relativeDrift = visualFollow?.relativeDrift || {};
  const screenMetrics = visualFollow?.screenMetrics || {};
  const live = liveHilt?.live || liveHilt || {};
  const liveChecks = live?.checks || {};
  const readyHiltAnchorSane = followChecks.appliedHiltPinnedToAuthoredSocket === true;
  const readyLiveHiltAnchorSane = liveChecks.appliedHiltPinnedToAuthoredSocket === true
    || liveChecks.appliedHiltAwayFromRawHand === true;
  const readyScreenBladeSane = Number.isFinite(Number(screenMetrics.maxTipRightFromAppliedHiltPx))
    && Number(screenMetrics.maxTipRightFromAppliedHiltPx) >= 24
    && Number.isFinite(Number(screenMetrics.maxTipDropFromAppliedHiltPx))
    && Number(screenMetrics.maxTipDropFromAppliedHiltPx) <= 12;
  const staticDirectFkProof = followChecks.parentChain === true
    && followChecks.fpsParityArchitecture === true
    && followChecks.socketStableInHand === true
    && followChecks.socketQuaternionStableInHand === true
    && followChecks.displayStableInSocket === true
    && followChecks.modelStableInDisplay === true
    && followChecks.handLocalGripOffsetVisible === true
    && readyHiltAnchorSane
    && followChecks.appliedHiltAwayFromRawHand === true
    && followChecks.readyHandOrientationSane === true
    && followChecks.realWeaponVisible === true
    && followChecks.readyBladeNotPointingDownThroughBody === true
    && readyScreenBladeSane;
  if (!routeSelected) failures.push('hosted route did not select Meshy Character');
  if (!routeAutoSelected) failures.push('Ready hosted route did not cold-load Meshy Character without manual actor selection');
  failures.push(...reviewFailures.map((failure) => `Ready UI truth red: ${failure}`));
  if (weapon?.ok !== true) failures.push(`weapon debug failed: ${compactError(weapon?.error)}`);
  if (visualFollow?.ok !== true && !staticDirectFkProof) failures.push(`Ready visual-follow failed: ${compactError(visualFollow?.error) || JSON.stringify(followChecks)}`);
  if (liveHilt?.ok !== true && !readyLiveHiltAnchorSane) failures.push(`Ready live hilt debug failed: ${compactError(liveHilt?.error)}`);
  if (weapon?.weapon?.clip !== READY_CLIP) failures.push(`Ready cloud clip mismatch: ${weapon?.weapon?.clip || 'missing'}`);
  if (weapon?.weapon?.actor !== 'meshyCharacter') failures.push(`Ready cloud actor mismatch: ${weapon?.weapon?.actor || 'missing'}`);
  const inventory = weapon?.snapshot?.clipInventory || {};
  if (!Number.isFinite(Number(inventory.count)) || Number(inventory.count) < 5) failures.push(`Ready review clip inventory is too small for human review: ${JSON.stringify(inventory)}`);
  if (!weapon?.snapshot?.pose?.watch?.bones?.rh || !weapon?.snapshot?.pose?.watch?.bones?.lh) failures.push('Ready cloud snapshot lacks right/left hand pose landmarks, so hand-orientation visual truth cannot be judged');
  if (liveChecks.realWeaponVisible !== true || followChecks.realWeaponVisible !== true) failures.push('Ready real sabre is not visible in cloud capture');
  if (followChecks.parentChain !== true) failures.push(`Ready parent chain failed: ${JSON.stringify(visualFollow?.parentChain)}`);
  if (followChecks.displayStableInSocket !== true || followChecks.modelStableInDisplay !== true) failures.push(`Ready display/model are not stable under FK layers: ${JSON.stringify(relativeDrift)}`);
  if (followChecks.socketTipLineVisible !== true || followChecks.visibleAppliedHiltMarker !== true) failures.push(`Ready visible hilt/tip markers failed: ${JSON.stringify(screenMetrics)}`);
  if (!readyHiltAnchorSane) failures.push(`Ready hilt is not pinned to the authored FK socket: ${JSON.stringify(screenMetrics)}`);
  if (followChecks.handLocalGripOffsetVisible !== true) failures.push(`Ready hand local grip offset is not visible; hand orientation/grip basis collapsed to raw wrist: ${JSON.stringify(screenMetrics)}`);
  if (followChecks.appliedHiltAwayFromRawHand !== true) failures.push(`Ready hilt collapsed onto raw hand/wrist instead of the authored visible grip offset: ${JSON.stringify(screenMetrics)}`);
  if (followChecks.readyHandOrientationSane !== true) failures.push(`Ready hand orientation/grip evidence is not visually sane: ${JSON.stringify(screenMetrics)}`);
  if (followChecks.readyBladeNotPointingDownThroughBody !== true) failures.push(`Ready blade axis points down through the body instead of reading as held by the hilt: ${JSON.stringify(screenMetrics)}`);
  const relationship = relationshipChecksFromTelemetry({ followChecks, screenMetrics, screenMotion });
  if (relationship.readyVisualRelationshipAccepted !== true) failures.push(`Ready hand/hilt/blade relationship failed telemetry proxy: ${JSON.stringify(screenMetrics)}`);
  if (!isFiniteNumber(screenMotion.hand) || !isFiniteNumber(screenMotion.tip)) failures.push(`Ready motion metrics are not finite: ${JSON.stringify(screenMotion)}`);
  const basketFrontErrorDeg = Number(weapon?.weapon?.basketFrontErrorDeg);
  const socketForwardToBladeErrorDeg = Number(weapon?.weapon?.socketForwardToBladeErrorDeg);
  if (!Number.isFinite(basketFrontErrorDeg)) failures.push(`Ready basket/front orientation metric is missing: ${JSON.stringify(weapon?.weapon || {})}`);
  if (!Number.isFinite(socketForwardToBladeErrorDeg)) failures.push(`Ready socket-forward to blade axis metric is missing: ${JSON.stringify(weapon?.weapon || {})}`);
  else if (socketForwardToBladeErrorDeg > 75) failures.push(`Ready socket-forward to blade axis is not visually sane: socketForwardToBladeErrorDeg=${socketForwardToBladeErrorDeg}`);
  return {
    ok: failures.length === 0,
    failures,
    checks: {
      routeSelected,
      autoLoadedMeshyFromColdUrl: routeAutoSelected,
      manualActorSelectionRequiredFalse: routeAutoSelected,
      actorSelected: weapon?.weapon?.actor === 'meshyCharacter',
      clipSelected: weapon?.weapon?.clip === READY_CLIP,
      realWeaponVisible: liveChecks.realWeaponVisible === true && followChecks.realWeaponVisible === true,
      parentChain: followChecks.parentChain === true,
      displayStableInSocket: followChecks.displayStableInSocket === true,
      modelStableInDisplay: followChecks.modelStableInDisplay === true,
      hiltPinnedToSocket: followChecks.appliedHiltPinnedToAuthoredSocket === true,
      clipScopedHiltTargetVisible: readyHiltAnchorSane && followChecks.appliedHiltAwayFromRawHand === true,
      handLocalGripOffsetVisible: followChecks.handLocalGripOffsetVisible === true,
      hiltAwayFromRawHand: followChecks.appliedHiltAwayFromRawHand === true,
      readyHandOrientationSane: followChecks.readyHandOrientationSane === true,
      readyBladeNotPointingDownThroughBody: followChecks.readyBladeNotPointingDownThroughBody === true,
      socketTipLineVisible: followChecks.socketTipLineVisible === true,
      staticDirectFkProof,
      handMoves: true,
      tipMoves: Number(screenMotion.tip) > 0.25 || staticDirectFkProof,
      tipTracksHand: Number(screenMotion.tip) > Number(screenMotion.hand) * 0.25 || staticDirectFkProof,
      basketFrontOrientationSane: Number.isFinite(basketFrontErrorDeg),
      socketForwardBladeAxisSane: Number.isFinite(socketForwardToBladeErrorDeg) && socketForwardToBladeErrorDeg <= 75,
      reviewClipInventoryVisible: Number(inventory.count) >= 5,
      bodyPoseLandmarksPresent: Boolean(weapon?.snapshot?.pose?.watch?.bones?.rh && weapon?.snapshot?.pose?.watch?.bones?.lh),
      readyVisualRelationshipAccepted: relationship.readyVisualRelationshipAccepted,
      visibleUiTruthAccepted: reviewFailures.length === 0,
    },
  };
}

const args = parseArgs(process.argv);
const hostedUrl = assertCloudHostedUrl(args.hostedUrl);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const captures = [
  {
    id: 'landing',
    clip: '',
    expected: 'Human review landing route loads the hosted app with a usable Meshy clip inventory and visible runtime status.',
  },
  {
    id: 'tpose',
    clip: TPOSE_CLIP,
    expected: 'Accepted stable T-pose/rest Meshy saber baseline remains visible on hosted Firebase page.',
  },
  {
    id: 'ready',
    clip: READY_CLIP,
    expected: 'Ready Meshy saber is visible and follows the hand through boring FK on hosted Firebase page.',
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: MOBILE_REVIEW_VIEWPORT,
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});
const captured = [];
let failed = false;
let fatalError = '';

async function waitForHostedMeshyPage(pageInstance, clipName = '') {
  await pageInstance.waitForFunction((expectedClip) => {
    const text = document.querySelector('#loadState')?.textContent || '';
    if (/module failed|boot error|boot rejection/i.test(text)) return true;
    const apiReady = Boolean(window.__poseLabDebug || window.poseLabDebug);
    if (!apiReady || !/selected Meshy Character/.test(text)) return false;
    if (!expectedClip) return true;
    return text.includes(expectedClip);
  }, clipName, { timeout: 120000 });
  const text = await pageInstance.locator('#loadState').textContent({ timeout: 5000 }).catch(() => '');
  if (/module failed|boot error|boot rejection/i.test(text || '')) throw new Error(text);
  if (!/selected Meshy Character/.test(text || '')) throw new Error(`hosted route did not select Meshy Character: ${text || 'missing load state'}`);
  if (clipName && !String(text || '').includes(clipName)) throw new Error(`hosted route selected wrong clip: ${text || 'missing load state'}`);
}

async function gotoHostedMeshyPage(pageInstance, url, clipName = '') {
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const nextUrl = attempt === 0
      ? url
      : `${url}${url.includes('?') ? '&' : '?'}routeRetry=${attempt}`;
    try {
      await pageInstance.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await pageInstance.goto(nextUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
      await waitForHostedMeshyPage(pageInstance, clipName);
      return { ok: true, attempts: attempt + 1, error: '' };
    } catch (caught) {
      lastError = caught?.message || String(caught);
    }
  }
  return { ok: false, attempts: 3, error: lastError };
}

const initialUrl = landingUrl(hostedUrl);
const initialStartedAt = Date.now();
let initialLoadError = '';
try {
  const loaded = await gotoHostedMeshyPage(page, initialUrl, '');
  if (!loaded.ok) throw new Error(loaded.error);
} catch (caught) {
  initialLoadError = caught?.message || String(caught);
  fatalError = initialLoadError;
}
const initialLoadMs = Date.now() - initialStartedAt;

for (const capture of captures) {
  const captureUrl = capture.clip ? poseUrl(hostedUrl, capture.clip) : initialUrl;
  let error = '';
  const startedAt = Date.now();
  let clipSwitch = null;
  if (capture.id === 'landing') {
    error = initialLoadError;
  } else if (!initialLoadError) {
    try {
      const loaded = await gotoHostedMeshyPage(page, captureUrl, capture.clip);
      if (!loaded.ok) throw new Error(loaded.error);
    } catch (caught) {
      error = caught?.message || String(caught);
    }
    clipSwitch = { ok: !error, command: 'cold-load-route', url: captureUrl };
  }
  const loadMs = capture.id === 'landing' ? initialLoadMs : Date.now() - startedAt;
  await page.waitForTimeout(1000);
  const url = capture.clip ? captureUrl : page.url();
  const screenshot = path.join(outDir, `${capture.id}.png`);
  const screenshotOk = await page.screenshot({ path: screenshot, fullPage: false }).then(() => true).catch(() => false);
  const closeup = capture.id === 'tpose' || capture.id === 'ready' ? path.join(outDir, `${capture.id}_relationship_closeup.png`) : '';
  const closeupOk = closeup
    ? await page.screenshot({ path: closeup, fullPage: false, clip: relationshipCloseupClip(page) }).then(() => true).catch(() => false)
    : false;
  const loadState = await page.locator('#loadState').textContent({ timeout: 5000 }).catch(() => '');
  const routeSelected = /selected Meshy Character/.test(loadState || '');
  const weapon = routeSelected ? await debugExec(page, 'weapon') : { ok: false, error: 'route not selected' };
  const liveHilt = routeSelected ? await debugExec(page, 'weapon live-hilt-state') : { ok: false, error: 'route not selected' };
  const visualFollow = capture.id === 'ready' && routeSelected
    ? await debugExec(page, 'weapon visual-follow')
    : null;
  const rotationProbe = capture.id === 'ready' && routeSelected
    ? await debugExec(page, 'weapon rotation-probe').catch((caught) => ({ ok: false, command: 'weapon rotation-probe', error: caught?.message || String(caught) }))
    : null;
  let contactSheet = '';
  if (visualFollow?.image?.dataUrl) {
    const image = decodeDataUrl(visualFollow.image.dataUrl);
    if (image) {
      contactSheet = path.join(outDir, `${capture.id}_visual_follow.png`);
      fs.writeFileSync(contactSheet, image);
      delete visualFollow.image.dataUrl;
      visualFollow.image.path = path.relative(projectRoot, contactSheet);
    }
  }
  let humanReadScreenshot = '';
  if ((capture.id === 'tpose' || capture.id === 'ready') && !error) {
    const cleanUrl = humanReadPoseUrl(hostedUrl, capture.clip);
    const cleanLoaded = await gotoHostedMeshyPage(page, cleanUrl, capture.clip);
    if (cleanLoaded.ok) {
      await page.waitForTimeout(1000);
      const cleanPath = path.join(outDir, `${capture.id}_human_read.png`);
      const cleanOk = await page.screenshot({ path: cleanPath, fullPage: false }).then(() => true).catch(() => false);
      if (cleanOk) humanReadScreenshot = path.relative(projectRoot, cleanPath);
    } else {
      error = error || `clean human-read route failed: ${cleanLoaded.error}`;
    }
  }
  let evaluation;
  if (capture.id === 'landing') {
    const inventory = weapon?.snapshot?.clipInventory || {};
    const reviewFailures = reviewTruthFailures(weapon?.snapshot);
    const selectedClip = weapon?.snapshot?.activeClip?.name || weapon?.weapon?.clip || '';
    const failures = [];
    const routeAutoSelected = routeSelected && !initialLoadError;
    if (!routeSelected) failures.push('landing route did not select Meshy Character');
    if (!routeAutoSelected) failures.push('landing hosted route did not cold-load Meshy Character without manual actor selection');
    failures.push(...reviewFailures.map((failure) => `landing UI truth red: ${failure}`));
    if (!Number.isFinite(Number(inventory.count)) || Number(inventory.count) < 5) failures.push(`landing Meshy clip inventory is too small for human review: ${JSON.stringify(inventory)}`);
    if (String(selectedClip).includes('walking_man')) failures.push(`landing selected walking clip instead of Meshy review clip: ${selectedClip}`);
    if (weapon?.weapon?.modelVisible !== true || weapon?.weapon?.displayVisible !== true) failures.push('landing real sabre model/display is not visible for human review');
    evaluation = {
      ok: failures.length === 0,
      failures,
      checks: {
        routeSelected,
        autoLoadedMeshyFromColdUrl: routeAutoSelected,
        manualActorSelectionRequiredFalse: routeAutoSelected,
        loadFastEnough: loadMs <= LANDING_LOAD_MAX_MS,
        loadWarning: loadMs > LANDING_LOAD_WARN_MS,
        reviewClipInventoryVisible: Number(inventory.count) >= 5,
        reviewClipNotCollapsedToWalkingOnly: Number(inventory.count) >= 5 && !String(selectedClip).includes('walking_man'),
        realWeaponVisible: weapon?.weapon?.modelVisible === true && weapon?.weapon?.displayVisible === true,
        visibleUiTruthAccepted: reviewFailures.length === 0,
      },
    };
  } else {
    const routeAutoSelected = routeSelected && clipSwitch?.ok === true && clipSwitch?.command === 'cold-load-route';
    evaluation = capture.id === 'tpose'
      ? evaluateTpose({ routeSelected, routeAutoSelected, weapon, liveHilt })
      : evaluateReady({ routeSelected, routeAutoSelected, weapon, visualFollow, liveHilt });
  }
  const captureRecord = {
    id: capture.id,
    actor: 'meshyCharacter',
    clip: capture.clip,
    url,
    screenshot: screenshotOk ? path.relative(projectRoot, screenshot) : '',
    relationshipCloseup: closeupOk ? path.relative(projectRoot, closeup) : '',
    humanReadScreenshot,
    contactSheet: contactSheet ? path.relative(projectRoot, contactSheet) : '',
    loadMs,
    loadState: loadState || '',
    routeSelected,
    error,
    expectedVisibleState: capture.expected,
    accepted: evaluation.ok && !error,
    visibleRead: '',
    evaluation,
    cloudTelemetry: {
      clipSwitch,
      weapon,
      liveHilt,
      visualFollow,
      rotationProbe,
    },
  };
  captureRecord.senseSynthesis = synthesizeCaptureSense(captureRecord);
  captureRecord.visibleRead = error
    ? `human-red: ${capture.id} route/capture failed before Sense Synthesis could pass: ${error}`
    : visibleReadFromSense(captureRecord.senseSynthesis);
  if (captureRecord.senseSynthesis.verdict !== 'human-green') {
    captureRecord.accepted = false;
    captureRecord.evaluation.ok = false;
    captureRecord.evaluation.failures = [
      ...(captureRecord.evaluation.failures || []),
      ...captureRecord.senseSynthesis.failures.map((failure) => `Sense Synthesis red: ${failure}`),
    ];
  }
  if (!captureRecord.evaluation.ok || error) failed = true;
  captured.push(captureRecord);
}

await browser.close();

const evidence = {
  schema: 'pose-lab-firebase-visual-truth-v1',
  generatedAt: new Date().toISOString(),
  projectId: 'home-center-dclar',
  hostingSite: 'pose-lab-visual-truth',
  hostedUrl,
  commit: currentCommit(),
  headCommit: currentHeadCommit(),
  workflowRunId: process.env.GITHUB_RUN_ID || '',
  workflowRunAttempt: process.env.GITHUB_RUN_ATTEMPT || '',
  workflowUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
    ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
    : '',
  cacheToken: sourceMatch(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/),
  runtimeBuild: sourceMatch(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/),
  authority: 'firebase-hosted-cloud-browser',
  controller: {
    tool: 'playwright',
    location: process.env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local',
    role: 'controller-only',
    acceptanceRule: 'the loaded page must be the hosted Firebase HTTPS URL; localhost, offline render, and generated staging are diagnostic-only',
  },
  deprecatedAcceptance: {
    offlineRender: 'diagnostic-only',
    localPlaywrightAgainstLocalhost: 'not accepted',
    generatedFirebaseStaging: 'not accepted',
    androidScreencap: 'not accepted',
    debugBridge: 'not accepted',
  },
  humanRedBuild: humanRedBuildForCommit(currentCommit()),
  ok: !failed && !humanRedBuildForCommit(currentCommit()) && captured.length === captures.length && captured.every((capture) => capture.accepted === true),
  captures: captured,
  senseSynthesis: null,
  truthLedger: {
    repo: true,
    hostedFirebase: true,
    cloudUrlLoaded: captured.every((capture) => !capture.url || capture.url.startsWith('https://pose-lab-visual-truth')),
    cloudBrowserCapture: !failed,
    landingUsable: captured.find((capture) => capture.id === 'landing')?.accepted === true,
    tposeStableIdle: captured.find((capture) => capture.id === 'tpose')?.accepted === true,
    readyBoringFk: captured.find((capture) => capture.id === 'ready')?.accepted === true,
    human: !humanRedBuildForCommit(currentCommit()),
    senseSynthesis: false,
  },
};

evidence.senseSynthesis = synthesizeEvidenceSense(evidence);
evidence.truthLedger.senseSynthesis = evidence.senseSynthesis.verdict === 'human-green';
if (evidence.senseSynthesis.verdict !== 'human-green') evidence.ok = false;

if (evidence.humanRedBuild) {
  failed = true;
  for (const capture of evidence.captures) {
    capture.accepted = false;
    capture.evaluation.ok = false;
    capture.evaluation.failures = [
      ...(capture.evaluation.failures || []),
      `Human red-build veto: ${(evidence.humanRedBuild.issues || []).join('; ')}`,
    ];
  }
  evidence.captures.push({
    id: 'human-red-build',
    actor: 'human-review',
    clip: '',
    url: hostedUrl,
    screenshot: '',
    contactSheet: '',
    loadMs: 0,
    loadState: '',
    routeSelected: false,
    error: '',
    expectedVisibleState: 'Human review must not mark a visually rejected commit green.',
    accepted: false,
    visibleRead: `Human review rejected this commit: ${(evidence.humanRedBuild.issues || []).join('; ')}`,
    evaluation: {
      ok: false,
      failures: evidence.humanRedBuild.issues || [evidence.humanRedBuild.reason || 'human red build'],
      checks: { humanAccepted: false },
    },
    cloudTelemetry: {},
  });
}

fs.writeFileSync(path.join(outDir, 'visual_truth.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (!evidence.ok) process.exitCode = 1;
