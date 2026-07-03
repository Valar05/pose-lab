#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest');
const TPOSE_CLIP = '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]';
const READY_CLIP = 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]';
const ACCEPTED_MESHY_HILT = [0.6535, -0.02302, -0.07317];
const ACCEPTED_MESHY_ROTATION = [90, 0, -55.145];
const HUMAN_RED_BUILDS_PATH = path.join(projectRoot, 'evidence', 'human_visual_truth_red_builds.json');

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

function compactError(value) {
  return String(value || '').replace(/\s+/g, ' ').slice(0, 300);
}

function currentCommit() {
  return process.env.GITHUB_SHA || '';
}

function humanRedBuildForCommit(commit) {
  if (!commit || !fs.existsSync(HUMAN_RED_BUILDS_PATH)) return null;
  try {
    const payload = JSON.parse(fs.readFileSync(HUMAN_RED_BUILDS_PATH, 'utf8'));
    const builds = Array.isArray(payload?.redBuilds) ? payload.redBuilds : [];
    return builds.find((entry) => String(entry?.commit || '').startsWith(commit) || commit.startsWith(String(entry?.commit || ''))) || null;
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

function evaluateTpose({ routeSelected, weapon, liveHilt }) {
  const failures = [];
  const config = weapon?.weapon?.config || {};
  const live = liveHilt?.live || liveHilt || {};
  const liveChecks = live?.checks || {};
  const liveDistances = live?.distances || {};
  const layers = live?.pinning?.layers || {};
  if (!routeSelected) failures.push('hosted route did not select Meshy Character');
  if (weapon?.ok !== true) failures.push(`weapon debug failed: ${compactError(weapon?.error)}`);
  if (liveHilt?.ok !== true) failures.push(`live hilt debug failed: ${compactError(liveHilt?.error)}`);
  if (weapon?.weapon?.clip !== TPOSE_CLIP) failures.push(`T-pose cloud clip mismatch: ${weapon?.weapon?.clip || 'missing'}`);
  if (weapon?.weapon?.actor !== 'meshyCharacter') failures.push(`T-pose cloud actor mismatch: ${weapon?.weapon?.actor || 'missing'}`);
  if (!closeArray(config.gripLocalPosition, ACCEPTED_MESHY_HILT)) failures.push(`T-pose hilt oracle drifted: ${JSON.stringify(config.gripLocalPosition)}`);
  if (!closeArray(config.attachmentRotationDeg, ACCEPTED_MESHY_ROTATION)) failures.push(`T-pose attachment rotation drifted: ${JSON.stringify(config.attachmentRotationDeg)}`);
  if (weapon?.weapon?.modelVisible !== true || weapon?.weapon?.displayVisible !== true) failures.push('T-pose real sabre model/display is not visible');
  if (liveChecks.realWeaponVisible !== true || layers.realWeaponVisible !== true) failures.push('T-pose cloud layer does not report real weapon visible');
  if (liveChecks.appliedHiltPinnedToAuthoredSocket !== true) failures.push(`T-pose hilt is not pinned to WeaponGrip: ${JSON.stringify(liveDistances)}`);
  if (!isFiniteNumber(liveDistances.handToAppliedHilt) || !isFiniteNumber(liveDistances.socketToAppliedHilt)) failures.push(`T-pose hilt distances are not finite: ${JSON.stringify(liveDistances)}`);
  return {
    ok: failures.length === 0,
    failures,
    checks: {
      routeSelected,
      actorSelected: weapon?.weapon?.actor === 'meshyCharacter',
      clipSelected: weapon?.weapon?.clip === TPOSE_CLIP,
      acceptedHiltOracle: closeArray(config.gripLocalPosition, ACCEPTED_MESHY_HILT),
      acceptedAttachmentRotation: closeArray(config.attachmentRotationDeg, ACCEPTED_MESHY_ROTATION),
      realWeaponVisible: weapon?.weapon?.modelVisible === true && liveChecks.realWeaponVisible === true,
      hiltPinnedToSocket: liveChecks.appliedHiltPinnedToAuthoredSocket === true,
      finiteHiltDistances: isFiniteNumber(liveDistances.handToAppliedHilt) && isFiniteNumber(liveDistances.socketToAppliedHilt),
    },
  };
}

function evaluateReady({ routeSelected, weapon, visualFollow, liveHilt }) {
  const failures = [];
  const followChecks = visualFollow?.checks || {};
  const screenMotion = visualFollow?.screenMotion || {};
  const relativeDrift = visualFollow?.relativeDrift || {};
  const screenMetrics = visualFollow?.screenMetrics || {};
  const live = liveHilt?.live || liveHilt || {};
  const liveChecks = live?.checks || {};
  const readyHiltAnchorSane = followChecks.appliedHiltPinnedToAuthoredSocket === true
    || followChecks.clipScopedHiltTargetVisible === true;
  const readyLiveHiltAnchorSane = liveChecks.appliedHiltPinnedToAuthoredSocket === true
    || liveChecks.appliedHiltAwayFromRawHand === true;
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
    && followChecks.realWeaponVisible === true;
  if (!routeSelected) failures.push('hosted route did not select Meshy Character');
  if (weapon?.ok !== true) failures.push(`weapon debug failed: ${compactError(weapon?.error)}`);
  if (visualFollow?.ok !== true) failures.push(`Ready visual-follow failed: ${compactError(visualFollow?.error) || JSON.stringify(followChecks)}`);
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
  if (!readyHiltAnchorSane) failures.push(`Ready hilt has neither socket pin nor visible clip-scoped hilt target: ${JSON.stringify(screenMetrics)}`);
  if (followChecks.handLocalGripOffsetVisible !== true) failures.push(`Ready hand local grip offset is not visible; hand orientation/grip basis collapsed to raw wrist: ${JSON.stringify(screenMetrics)}`);
  if (followChecks.appliedHiltAwayFromRawHand !== true) failures.push(`Ready hilt collapsed onto raw hand/wrist instead of the authored visible grip offset: ${JSON.stringify(screenMetrics)}`);
  if (followChecks.readyHandOrientationSane !== true) failures.push(`Ready hand orientation/grip evidence is not visually sane: ${JSON.stringify(screenMetrics)}`);
  if (!staticDirectFkProof) {
    if (!isFiniteNumber(screenMotion.hand) || !isFiniteNumber(screenMotion.tip)) failures.push(`Ready motion metrics are not finite: ${JSON.stringify(screenMotion)}`);
    if (Number(screenMotion.hand) <= 0.25) failures.push(`Ready hand did not visibly move in cloud capture: ${JSON.stringify(screenMotion)}`);
    if (Number(screenMotion.tip) <= 0.25) failures.push(`Ready tip did not visibly move in cloud capture: ${JSON.stringify(screenMotion)}`);
    if (Number(screenMotion.tip) <= Number(screenMotion.hand) * 0.25) failures.push(`Ready tip motion is too small relative to hand motion: ${JSON.stringify(screenMotion)}`);
  }
  return {
    ok: failures.length === 0,
    failures,
    checks: {
      routeSelected,
      actorSelected: weapon?.weapon?.actor === 'meshyCharacter',
      clipSelected: weapon?.weapon?.clip === READY_CLIP,
      realWeaponVisible: liveChecks.realWeaponVisible === true && followChecks.realWeaponVisible === true,
      parentChain: followChecks.parentChain === true,
      displayStableInSocket: followChecks.displayStableInSocket === true,
      modelStableInDisplay: followChecks.modelStableInDisplay === true,
      hiltPinnedToSocket: followChecks.appliedHiltPinnedToAuthoredSocket === true,
      clipScopedHiltTargetVisible: followChecks.clipScopedHiltTargetVisible === true,
      handLocalGripOffsetVisible: followChecks.handLocalGripOffsetVisible === true,
      hiltAwayFromRawHand: followChecks.appliedHiltAwayFromRawHand === true,
      readyHandOrientationSane: followChecks.readyHandOrientationSane === true,
      socketTipLineVisible: followChecks.socketTipLineVisible === true,
      staticDirectFkProof,
      handMoves: Number(screenMotion.hand) > 0.25,
      tipMoves: Number(screenMotion.tip) > 0.25,
      tipTracksHand: Number(screenMotion.tip) > Number(screenMotion.hand) * 0.25,
      reviewClipInventoryVisible: Number(inventory.count) >= 5,
      bodyPoseLandmarksPresent: Boolean(weapon?.snapshot?.pose?.watch?.bones?.rh && weapon?.snapshot?.pose?.watch?.bones?.lh),
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
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
const captured = [];
let failed = false;
let fatalError = '';

async function waitForHostedMeshyPage(pageInstance, clipName = '') {
  await pageInstance.waitForFunction((expectedClip) => {
    const text = document.querySelector('#loadState')?.textContent || '';
    const apiReady = Boolean(window.__poseLabDebug || window.poseLabDebug);
    if (!apiReady || !/selected Meshy Character/.test(text)) return false;
    if (!expectedClip) return true;
    return text.includes(expectedClip);
  }, clipName, { timeout: 120000 });
}

const initialUrl = landingUrl(hostedUrl);
const initialStartedAt = Date.now();
let initialLoadError = '';
try {
  await page.goto(initialUrl, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitForHostedMeshyPage(page, '');
} catch (caught) {
  initialLoadError = caught?.message || String(caught);
  fatalError = initialLoadError;
}
const initialLoadMs = Date.now() - initialStartedAt;

for (const capture of captures) {
  let error = initialLoadError;
  const startedAt = Date.now();
  let clipSwitch = null;
  if (capture.clip && !initialLoadError) {
    clipSwitch = await debugExec(page, `clip ${capture.clip}`);
    if (clipSwitch?.ok !== true) error = clipSwitch?.error || `debug clip switch failed: ${capture.clip}`;
    else {
      try {
        await waitForHostedMeshyPage(page, capture.clip);
      } catch (caught) {
        error = caught?.message || String(caught);
      }
    }
  }
  const loadMs = capture.id === 'landing' ? initialLoadMs : Date.now() - startedAt;
  await page.waitForTimeout(1000);
  const url = page.url();
  const screenshot = path.join(outDir, `${capture.id}.png`);
  const screenshotOk = await page.screenshot({ path: screenshot, fullPage: false }).then(() => true).catch(() => false);
  const loadState = await page.locator('#loadState').textContent({ timeout: 5000 }).catch(() => '');
  const routeSelected = /selected Meshy Character/.test(loadState || '');
  const weapon = routeSelected ? await debugExec(page, 'weapon') : { ok: false, error: 'route not selected' };
  const liveHilt = routeSelected ? await debugExec(page, 'weapon live-hilt-state') : { ok: false, error: 'route not selected' };
  const visualFollow = capture.id === 'ready' && routeSelected
    ? await debugExec(page, 'weapon visual-follow')
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
  let evaluation;
  if (capture.id === 'landing') {
    const inventory = weapon?.snapshot?.clipInventory || {};
    const failures = [];
    if (!routeSelected) failures.push('landing route did not select Meshy Character');
    if (loadMs > 15000) failures.push(`landing route loaded too slowly for human review: ${loadMs}ms`);
    if (!Number.isFinite(Number(inventory.count)) || Number(inventory.count) < 5) failures.push(`landing Meshy clip inventory is too small for human review: ${JSON.stringify(inventory)}`);
    evaluation = {
      ok: failures.length === 0,
      failures,
      checks: {
        routeSelected,
        loadFastEnough: loadMs <= 15000,
        reviewClipInventoryVisible: Number(inventory.count) >= 5,
      },
    };
  } else {
    evaluation = capture.id === 'tpose'
      ? evaluateTpose({ routeSelected, weapon, liveHilt })
      : evaluateReady({ routeSelected, weapon, visualFollow, liveHilt });
  }
  if (!evaluation.ok || error) failed = true;
  captured.push({
    id: capture.id,
    actor: 'meshyCharacter',
    clip: capture.clip,
    url,
    screenshot: screenshotOk ? path.relative(projectRoot, screenshot) : '',
    contactSheet: contactSheet ? path.relative(projectRoot, contactSheet) : '',
    loadMs,
    loadState: loadState || '',
    routeSelected,
    error,
    expectedVisibleState: capture.expected,
    accepted: evaluation.ok && !error,
    visibleRead: evaluation.ok && !error
      ? `Hosted Firebase ${capture.id} cloud capture passes route, visibility, and weapon telemetry checks.`
      : `Hosted Firebase ${capture.id} is red: ${[error, ...evaluation.failures].filter(Boolean).join('; ')}`,
    evaluation,
    cloudTelemetry: {
      clipSwitch,
      weapon,
      liveHilt,
      visualFollow,
    },
  });
}

await browser.close();

const evidence = {
  schema: 'pose-lab-firebase-visual-truth-v1',
  generatedAt: new Date().toISOString(),
  projectId: 'home-center-dclar',
  hostingSite: 'pose-lab-visual-truth',
  hostedUrl,
  commit: currentCommit(),
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
  truthLedger: {
    repo: true,
    hostedFirebase: true,
    cloudUrlLoaded: captured.every((capture) => !capture.url || capture.url.startsWith('https://pose-lab-visual-truth')),
    cloudBrowserCapture: !failed,
    landingUsable: captured.find((capture) => capture.id === 'landing')?.accepted === true,
    tposeStableIdle: captured.find((capture) => capture.id === 'tpose')?.accepted === true,
    readyBoringFk: captured.find((capture) => capture.id === 'ready')?.accepted === true,
    human: !humanRedBuildForCommit(currentCommit()),
  },
};

if (evidence.humanRedBuild) {
  failed = true;
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
