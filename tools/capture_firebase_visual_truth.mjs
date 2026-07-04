#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '@playwright/test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest');
const TPOSE_CLIP = '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]';
const READY_CLIP = 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]';
const ACCEPTED_MESHY_HILT = [0.6535, -0.02302, -0.07317];
const ACCEPTED_MESHY_ROTATION = [90, 0, -55.145];

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

function pngChunkType(buffer, offset) {
  return buffer.toString('ascii', offset + 4, offset + 8);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function analyzePngScreenshot(filePath) {
  const buffer = fs.readFileSync(filePath);
  const signature = '89504e470d0a1a0a';
  if (buffer.subarray(0, 8).toString('hex') !== signature) return { ok: false, error: 'not a PNG' };
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = pngChunkType(buffer, offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(dataStart);
      height = buffer.readUInt32BE(dataStart + 4);
      bitDepth = buffer[dataStart + 8];
      colorType = buffer[dataStart + 9];
    } else if (type === 'IDAT') {
      idat.push(buffer.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }
  if (!width || !height || bitDepth !== 8 || ![2, 6].includes(colorType) || idat.length === 0) {
    return { ok: false, error: `unsupported PNG format ${width}x${height} depth=${bitDepth} color=${colorType}` };
  }
  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const inflated = zlib.inflateSync(Buffer.concat(idat));
  const rows = new Array(height);
  let input = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[input];
    input += 1;
    const row = Buffer.alloc(stride);
    const prev = y > 0 ? rows[y - 1] : null;
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[input + x];
      const left = x >= channels ? row[x - channels] : 0;
      const up = prev ? prev[x] : 0;
      const upLeft = prev && x >= channels ? prev[x - channels] : 0;
      if (filter === 0) row[x] = raw;
      else if (filter === 1) row[x] = (raw + left) & 255;
      else if (filter === 2) row[x] = (raw + up) & 255;
      else if (filter === 3) row[x] = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) row[x] = (raw + paethPredictor(left, up, upLeft)) & 255;
      else return { ok: false, error: `unsupported PNG filter ${filter}` };
    }
    input += stride;
    rows[y] = row;
  }
  const colors = new Set();
  let sampled = 0;
  let brightPixels = 0;
  let alphaPixels = 0;
  const columns = 13;
  const sampleRows = 9;
  for (let row = 0; row < sampleRows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = Math.max(0, Math.min(width - 1, Math.round((width * (column + 0.5)) / columns)));
      const y = Math.max(0, Math.min(height - 1, Math.round((height * (row + 0.5)) / sampleRows)));
      const index = x * channels;
      const r = rows[y][index];
      const g = rows[y][index + 1];
      const b = rows[y][index + 2];
      const a = channels === 4 ? rows[y][index + 3] : 255;
      sampled += 1;
      if (a > 0) alphaPixels += 1;
      if (r + g + b > 80) brightPixels += 1;
      colors.add([r, g, b, a].join(','));
    }
  }
  return {
    ok: true,
    source: 'cloud-screenshot-png',
    width,
    height,
    sampled,
    uniqueColors: colors.size,
    brightPixels,
    alphaPixels,
    nonBlank: colors.size >= 4 && brightPixels >= 4 && alphaPixels === sampled,
  };
}

function compactError(value) {
  return String(value || '').replace(/\s+/g, ' ').slice(0, 300);
}

async function debugExec(page, command) {
  return await page.evaluate(async (input) => {
    const api = window.__poseLabDebug || window.poseLabDebug;
    if (!api?.exec) return { ok: false, command: input, error: 'missing hosted poseLab debug API' };
    return await api.exec(input);
  }, command);
}

function evaluateBoot({ boot, expectedActor, expectedClip, screenshotSummary }) {
  const failures = [];
  const tabs = Array.isArray(boot?.tabs) ? boot.tabs : [];
  if (boot?.ok !== true) failures.push(`boot debug failed: ${compactError(boot?.error) || JSON.stringify(boot?.failures || [])}`);
  if (boot?.startupReady !== true) failures.push('hosted page did not reach startupReady');
  if (!tabs.some((tab) => tab.actor === 'meshyCharacter')) failures.push('Meshy Character tab missing after runtime boot');
  if (!tabs.some((tab) => tab.actor === 'player')) failures.push('FPS Arms tab missing after runtime boot');
  if (!Array.isArray(boot?.loadedKeys) || !boot.loadedKeys.includes('meshyCharacter')) failures.push('Meshy Character actor not loaded');
  if (!Array.isArray(boot?.loadedKeys) || !boot.loadedKeys.includes('player')) failures.push('FPS Arms actor not loaded');
  if (boot?.selectedActor !== expectedActor) failures.push(`selected actor mismatch: ${boot?.selectedActor || 'missing'} expected ${expectedActor}`);
  if (boot?.activeClip?.name !== expectedClip) failures.push(`selected clip mismatch: ${boot?.activeClip?.name || 'missing'} expected ${expectedClip}`);
  if (/booting|Booting module|module failed|boot error|boot rejection|webgl failed|failed:/i.test(String(boot?.loadState || ''))) failures.push(`bad loadState: ${boot?.loadState || 'missing'}`);
  if (screenshotSummary?.nonBlank !== true) failures.push(`cloud screenshot blank or unproven: ${JSON.stringify(screenshotSummary || {})}`);
  return {
    ok: failures.length === 0,
    failures,
    checks: {
      startupReady: boot?.startupReady === true,
      meshyTabVisible: tabs.some((tab) => tab.actor === 'meshyCharacter'),
      fpsTabVisible: tabs.some((tab) => tab.actor === 'player'),
      meshyActorLoaded: Array.isArray(boot?.loadedKeys) && boot.loadedKeys.includes('meshyCharacter'),
      fpsActorLoaded: Array.isArray(boot?.loadedKeys) && boot.loadedKeys.includes('player'),
      actorSelected: boot?.selectedActor === expectedActor,
      clipSelected: boot?.activeClip?.name === expectedClip,
      loadStateReady: !/booting|Booting module|module failed|boot error|boot rejection|webgl failed|failed:/i.test(String(boot?.loadState || '')),
      cloudScreenshotNonBlank: screenshotSummary?.nonBlank === true,
    },
  };
}

function liveHiltPayload(liveHilt) {
  return liveHilt?.live || liveHilt || {};
}

function evaluateTpose({ routeSelected, bootEvaluation, weapon, liveHilt }) {
  const failures = [];
  const live = liveHiltPayload(liveHilt);
  const config = weapon?.weapon?.config || {};
  const liveChecks = live?.checks || {};
  const liveDistances = live?.distances || {};
  const layers = live?.pinning?.layers || {};
  failures.push(...(bootEvaluation?.failures || []));
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
      bootReady: bootEvaluation?.ok === true,
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

function evaluateReady({ routeSelected, bootEvaluation, weapon, visualFollow, liveHilt }) {
  const failures = [];
  const live = liveHiltPayload(liveHilt);
  const followChecks = visualFollow?.checks || {};
  const screenMotion = visualFollow?.screenMotion || {};
  const relativeDrift = visualFollow?.relativeDrift || {};
  const screenMetrics = visualFollow?.screenMetrics || {};
  const liveChecks = live?.checks || {};
  failures.push(...(bootEvaluation?.failures || []));
  if (!routeSelected) failures.push('hosted route did not select Meshy Character');
  if (weapon?.ok !== true) failures.push(`weapon debug failed: ${compactError(weapon?.error)}`);
  if (visualFollow?.ok !== true) failures.push(`Ready visual-follow failed: ${compactError(visualFollow?.error) || JSON.stringify(followChecks)}`);
  if (liveHilt?.ok !== true) failures.push(`Ready live hilt debug failed: ${compactError(liveHilt?.error)}`);
  if (weapon?.weapon?.clip !== READY_CLIP) failures.push(`Ready cloud clip mismatch: ${weapon?.weapon?.clip || 'missing'}`);
  if (weapon?.weapon?.actor !== 'meshyCharacter') failures.push(`Ready cloud actor mismatch: ${weapon?.weapon?.actor || 'missing'}`);
  if (liveChecks.realWeaponVisible !== true || followChecks.realWeaponVisible !== true) failures.push('Ready real sabre is not visible in cloud capture');
  if (followChecks.parentChain !== true) failures.push(`Ready parent chain failed: ${JSON.stringify(visualFollow?.parentChain)}`);
  if (followChecks.displayStableInSocket !== true || followChecks.modelStableInDisplay !== true) failures.push(`Ready display/model are not stable under FK layers: ${JSON.stringify(relativeDrift)}`);
  if (followChecks.socketTipLineVisible !== true || followChecks.visibleAppliedHiltMarker !== true) failures.push(`Ready visible hilt/tip markers failed: ${JSON.stringify(screenMetrics)}`);
  if (followChecks.appliedHiltPinnedToAuthoredSocket !== true) failures.push(`Ready hilt is not pinned to authored socket: ${JSON.stringify(screenMetrics)}`);
  if (!isFiniteNumber(screenMotion.hand) || !isFiniteNumber(screenMotion.tip)) failures.push(`Ready motion metrics are not finite: ${JSON.stringify(screenMotion)}`);
  if (Number(screenMotion.hand) <= 0.25) failures.push(`Ready hand did not visibly move in cloud capture: ${JSON.stringify(screenMotion)}`);
  if (Number(screenMotion.tip) <= 0.25) failures.push(`Ready tip did not visibly move in cloud capture: ${JSON.stringify(screenMotion)}`);
  if (Number(screenMotion.tip) <= Number(screenMotion.hand) * 0.25) failures.push(`Ready tip motion is too small relative to hand motion: ${JSON.stringify(screenMotion)}`);
  return {
    ok: failures.length === 0,
    failures,
    checks: {
      routeSelected,
      bootReady: bootEvaluation?.ok === true,
      actorSelected: weapon?.weapon?.actor === 'meshyCharacter',
      clipSelected: weapon?.weapon?.clip === READY_CLIP,
      realWeaponVisible: liveChecks.realWeaponVisible === true && followChecks.realWeaponVisible === true,
      parentChain: followChecks.parentChain === true,
      displayStableInSocket: followChecks.displayStableInSocket === true,
      modelStableInDisplay: followChecks.modelStableInDisplay === true,
      hiltPinnedToSocket: followChecks.appliedHiltPinnedToAuthoredSocket === true,
      socketTipLineVisible: followChecks.socketTipLineVisible === true,
      handMoves: Number(screenMotion.hand) > 0.25,
      tipMoves: Number(screenMotion.tip) > 0.25,
      tipTracksHand: Number(screenMotion.tip) > Number(screenMotion.hand) * 0.25,
    },
  };
}

const args = parseArgs(process.argv);
if (!args.hostedUrl || !/^https:\/\//.test(args.hostedUrl)) throw new Error(`missing Firebase hosted HTTPS URL: ${args.hostedUrl}`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const captures = [
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

for (const capture of captures) {
  const url = poseUrl(args.hostedUrl, capture.clip);
  let error = '';
  await page.goto(url, { waitUntil: 'networkidle', timeout: 90000 });
  try {
    await page.waitForFunction(() => {
      const text = document.querySelector('#loadState')?.textContent || '';
      return /selected Meshy Character/.test(text) && (window.__poseLabDebug || window.poseLabDebug);
    }, null, { timeout: 120000 });
  } catch (caught) {
    error = caught?.message || String(caught);
  }
  await page.waitForTimeout(1000);
  const screenshot = path.join(outDir, `${capture.id}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  const screenshotSummary = analyzePngScreenshot(screenshot);
  const loadState = await page.locator('#loadState').textContent({ timeout: 5000 }).catch(() => '');
  const routeSelected = /selected Meshy Character/.test(loadState || '');
  const boot = await debugExec(page, 'boot').catch((caught) => ({ ok: false, command: 'boot', error: caught?.message || String(caught) }));
  const bootEvaluation = evaluateBoot({ boot, expectedActor: 'meshyCharacter', expectedClip: capture.clip, screenshotSummary });
  const bootSelected = routeSelected && bootEvaluation.ok;
  const weapon = bootSelected ? await debugExec(page, 'weapon') : { ok: false, error: 'route/boot not selected' };
  const liveHilt = bootSelected ? await debugExec(page, 'weapon live-hilt-state') : { ok: false, error: 'route/boot not selected' };
  const visualFollow = capture.id === 'ready' && bootSelected
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
  const evaluation = capture.id === 'tpose'
    ? evaluateTpose({ routeSelected, bootEvaluation, weapon, liveHilt })
    : evaluateReady({ routeSelected, bootEvaluation, weapon, visualFollow, liveHilt });
  if (!evaluation.ok || error) failed = true;
  captured.push({
    id: capture.id,
    actor: 'meshyCharacter',
    clip: capture.clip,
    url,
    screenshot: path.relative(projectRoot, screenshot),
    contactSheet: contactSheet ? path.relative(projectRoot, contactSheet) : '',
    loadState: loadState || '',
    routeSelected,
    screenshotSummary,
    boot,
    bootEvaluation,
    error,
    expectedVisibleState: capture.expected,
    accepted: evaluation.ok && !error,
    visibleRead: evaluation.ok && !error
      ? `Hosted Firebase ${capture.id} cloud capture passes route, visibility, and weapon telemetry checks.`
      : `Hosted Firebase ${capture.id} is red: ${[error, ...evaluation.failures].filter(Boolean).join('; ')}`,
    evaluation,
    cloudTelemetry: {
      weapon,
      boot,
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
  hostedUrl: args.hostedUrl,
  commit: process.env.GITHUB_SHA || '',
  cacheToken: sourceMatch(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/),
  runtimeBuild: sourceMatch(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/),
  authority: 'firebase-hosted-cloud-browser',
  deprecatedAcceptance: {
    offlineRender: 'diagnostic-only',
    androidScreencap: 'not accepted',
    debugBridge: 'not accepted',
  },
  ok: !failed && captured.length === captures.length && captured.every((capture) => capture.accepted === true),
  captures: captured,
  truthLedger: {
    repo: true,
    hostedFirebase: true,
    cloudBrowserCapture: !failed,
    tposeStableIdle: captured.find((capture) => capture.id === 'tpose')?.accepted === true,
    readyBoringFk: captured.find((capture) => capture.id === 'ready')?.accepted === true,
    human: false,
  },
};

fs.writeFileSync(path.join(outDir, 'visual_truth.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (!evidence.ok) process.exitCode = 1;
