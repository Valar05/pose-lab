#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {
    json: false,
    noFail: false,
    offline: 'generated/pose_lab_offline_render/latest/pose_weapon_render.json',
    live: 'generated/weapon_visual_follow/latest/weapon_visual_follow.json',
    screenshot: '',
    out: 'generated/visual_parity/meshy_saber_live_in_hand/latest.json',
    handPx: 40,
    socketPx: 36,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') args.json = true;
    else if (arg === '--no-fail') args.noFail = true;
    else if (arg === '--offline') args.offline = String(argv[++i] || args.offline);
    else if (arg.startsWith('--offline=')) args.offline = arg.slice('--offline='.length);
    else if (arg === '--live') args.live = String(argv[++i] || args.live);
    else if (arg.startsWith('--live=')) args.live = arg.slice('--live='.length);
    else if (arg === '--screenshot') args.screenshot = String(argv[++i] || '');
    else if (arg.startsWith('--screenshot=')) args.screenshot = arg.slice('--screenshot='.length);
    else if (arg === '--out') args.out = String(argv[++i] || args.out);
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--hand-px') args.handPx = Number(argv[++i] || args.handPx);
    else if (arg === '--socket-px') args.socketPx = Number(argv[++i] || args.socketPx);
    else throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function rel(file) {
  return path.relative(projectRoot, file).replace(/\\/g, '/');
}

function resolveProjectPath(file) {
  return path.isAbsolute(file) ? file : path.join(projectRoot, file);
}

function readJsonMaybe(file) {
  const absolute = resolveProjectPath(file);
  if (!fs.existsSync(absolute)) return { ok: false, path: file, error: 'missing' };
  try {
    return { ok: true, path: file, absolute, data: JSON.parse(fs.readFileSync(absolute, 'utf8')) };
  } catch (error) {
    return { ok: false, path: file, absolute, error: error.message };
  }
}

function currentCacheToken() {
  const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
  return html.match(/pose-lab\.js\?v=([^'"\s]+)/)?.[1] || '';
}

function currentRuntimeBuild() {
  const source = fs.readFileSync(path.join(projectRoot, 'src/pose-lab.js'), 'utf8');
  return source.match(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function newestScreenshot() {
  try {
    const output = execFileSync('find', [
      '/storage/emulated/0/Pictures/Screenshots',
      '-maxdepth', '1',
      '-type', 'f',
      '(',
      '-iname', '*.png',
      '-o',
      '-iname', '*.jpg',
      '-o',
      '-iname', '*.jpeg',
      ')',
      '-printf', '%T@ %p\n',
    ], { encoding: 'utf8' });
    const first = output.trim().split(/\r?\n/).filter(Boolean).sort((a, b) => Number(b.split(' ')[0]) - Number(a.split(' ')[0]))[0];
    return first ? first.replace(/^[^ ]+\s+/, '') : '';
  } catch (_error) {
    return '';
  }
}

function bool(value) {
  return value === true;
}

function mtimeMsMaybe(file) {
  if (!file || !fs.existsSync(file)) return null;
  try {
    return fs.statSync(file).mtimeMs;
  } catch (_error) {
    return null;
  }
}

function buildReport(args) {
  const offline = readJsonMaybe(args.offline);
  const live = readJsonMaybe(args.live);
  const screenshot = args.screenshot || newestScreenshot();
  const screenshotMtimeMs = mtimeMsMaybe(screenshot);
  const liveMtimeMs = live.absolute ? mtimeMsMaybe(live.absolute) : null;
  const cacheToken = currentCacheToken();
  const runtimeBuild = currentRuntimeBuild();
  const offlineData = offline.data || {};
  const liveData = live.data || {};
  const metrics = liveData.screenMetrics || {};
  const liveChecks = liveData.checks || {};
  const maxHandToAppliedHiltPx = Number(metrics.maxHandToAppliedHiltPx);
  const maxHandToSocketPx = Number(metrics.maxHandToSocketPx);
  const maxHandBaselineToAppliedHiltPx = Number(metrics.maxHandBaselineToAppliedHiltPx);
  const maxHandBaselineToSocketPx = Number(metrics.maxHandBaselineToSocketPx);
  const maxPalmTargetToAppliedHiltPx = Number(metrics.maxPalmTargetToAppliedHiltPx);
  const authoredHiltInHandRegion = (
    bool(liveChecks.appliedHiltPinnedToHandBaseline)
    || (Number.isFinite(maxHandBaselineToAppliedHiltPx) && maxHandBaselineToAppliedHiltPx <= Math.min(args.socketPx, 8))
  );
  const authoredSocketInHandRegion = (
    bool(liveChecks.socketPinnedToHandBaseline)
    || (Number.isFinite(maxHandBaselineToSocketPx) && maxHandBaselineToSocketPx <= Math.min(args.socketPx, 8))
  );
  const rawHandHiltInHandRegion = Number.isFinite(maxHandToAppliedHiltPx) && maxHandToAppliedHiltPx <= args.handPx;
  const palmHiltInHandRegion = Number.isFinite(maxPalmTargetToAppliedHiltPx) && maxPalmTargetToAppliedHiltPx <= args.handPx;
  const hiltInHandRegion = rawHandHiltInHandRegion && palmHiltInHandRegion;
  const socketNearHandRegion = Number.isFinite(maxHandToSocketPx) && maxHandToSocketPx <= args.socketPx;
  const bladeEmergesFromHand = hiltInHandRegion
    && authoredSocketInHandRegion
    && Number(metrics.minSocketToTipPx || 0) > 10
    && (bool(liveChecks.socketTipLineVisible) || bool(liveChecks.visibleWeaponCluster));
  const liveCacheMatches = live.ok && liveData.cacheToken === cacheToken;
  const routeMatches = liveData.actor === 'meshyCharacter'
    && String(liveData.clip || '').includes('OneHandReady')
    && String(liveData.clip || '').includes('FPS-VISUAL-IK R-120 L-90');
  const debugMarkerNotSubstituteProof = !(bool(liveChecks.visibleAppliedHiltMarker) && !hiltInHandRegion);
  const newestScreenshotCoveredByLiveEvidence = !screenshotMtimeMs
    || !liveMtimeMs
    || screenshotMtimeMs <= liveMtimeMs + 1000;
  const assertions = {
    offlineGreen: offline.ok && offlineData.ok === true,
    liveEvidencePresent: live.ok,
    liveCacheMatches,
    routeMatches,
    realSaberVisible: bool(metrics.realWeaponVisible) || bool(liveChecks.realWeaponVisible),
    fallbackHiddenWithRealWeapon: bool(metrics.fallbackHiddenWithRealWeapon) || bool(liveChecks.fallbackHiddenWithRealWeapon),
    authoredHiltInHandRegion,
    authoredSocketInHandRegion,
    rawHandHiltInHandRegion,
    palmHiltInHandRegion,
    hiltInHandRegion,
    socketNearHandRegion,
    bladeEmergesFromHand,
    debugMarkerNotSubstituteProof,
    offlineLiveAgreement: offlineData.ok === liveData.ok && liveCacheMatches && hiltInHandRegion,
    screenshotPathPresent: Boolean(screenshot && fs.existsSync(screenshot)),
    newestScreenshotCoveredByLiveEvidence,
  };
  const visualProofDivergence = assertions.offlineGreen && (
    !assertions.liveEvidencePresent
    || !assertions.liveCacheMatches
    || !assertions.hiltInHandRegion
    || !assertions.bladeEmergesFromHand
    || !assertions.debugMarkerNotSubstituteProof
    || !assertions.newestScreenshotCoveredByLiveEvidence
  );
  const ok = Object.values(assertions).every((value) => value === true) && !visualProofDivergence;
  return {
    schema: 'pose-lab-visual-proof-divergence-v1',
    generatedAt: new Date().toISOString(),
    ok,
    classification: visualProofDivergence ? 'visual-proof-divergence' : (ok ? 'visual-proof-green' : 'visual-proof-missing-or-red'),
    cacheToken,
    runtimeBuild,
    actor: liveData.actor || 'meshyCharacter',
    clip: liveData.clip || 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]',
    offline: {
      path: offline.absolute ? rel(offline.absolute) : args.offline,
      present: offline.ok,
      ok: offlineData.ok === true,
      actualVisibleRead: offlineData.actualVisibleRead || '',
    },
    live: {
      path: live.absolute ? rel(live.absolute) : args.live,
      present: live.ok,
      ok: liveData.ok === true,
      cacheToken: liveData.cacheToken || '',
      imagePath: liveData.image?.path || '',
      screenMetrics: metrics,
      checks: liveChecks,
      authoredHandRegion: {
        target: 'raw hand/palm visible hilt region, with socketHandBaseline reported only as a consistency diagnostic',
        reason: 'A stable authored baseline can still be the wrong visible point. Red-build acceptance requires the real hilt point to land in the user-visible hand/palm region, not just on the debug marker or socket baseline.',
        maxHandBaselineToAppliedHiltPx: Number.isFinite(maxHandBaselineToAppliedHiltPx) ? maxHandBaselineToAppliedHiltPx : null,
        maxHandBaselineToSocketPx: Number.isFinite(maxHandBaselineToSocketPx) ? maxHandBaselineToSocketPx : null,
        maxRawHandToAppliedHiltPx: Number.isFinite(maxHandToAppliedHiltPx) ? maxHandToAppliedHiltPx : null,
        maxPalmTargetToAppliedHiltPx: Number.isFinite(maxPalmTargetToAppliedHiltPx) ? maxPalmTargetToAppliedHiltPx : null,
      },
    },
    screenshot: {
      path: screenshot,
      present: Boolean(screenshot && fs.existsSync(screenshot)),
      source: args.screenshot ? 'explicit' : 'newest-android-screenshot',
      mtimeMs: screenshotMtimeMs,
      newerThanLiveEvidence: Boolean(screenshotMtimeMs && liveMtimeMs && screenshotMtimeMs > liveMtimeMs + 1000),
    },
    thresholds: {
      handPx: args.handPx,
      socketPx: args.socketPx,
    },
    assertions,
    visualRead: visualProofDivergence
      ? 'Offline/debug evidence is not enough: current live/screenshot-style visual evidence does not prove the real saber hilt is in the user-visible hand/palm region.'
      : 'Offline and live visual proof agree that the real saber is in the authored hand region.',
  };
}

function renderText(report) {
  return [
    `classification: ${report.classification}`,
    `ok: ${report.ok}`,
    `offline: ${report.offline.ok ? 'green' : 'red-or-missing'} (${report.offline.path})`,
    `live: ${report.live.ok ? 'green' : 'red-or-missing'} cache=${report.live.cacheToken || 'missing'} (${report.live.path})`,
    `screenshot: ${report.screenshot.present ? report.screenshot.path : 'missing'}`,
    `visual: ${report.visualRead}`,
  ].join('\n') + '\n';
}

function writeReport(report, out) {
  if (!out) return '';
  const absolute = resolveProjectPath(out);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`);
  return rel(absolute);
}

const args = parseArgs(process.argv);
const report = buildReport(args);
const outPath = writeReport(report, args.out);
if (outPath) report.outPath = outPath;
if (args.json) console.log(JSON.stringify(report, null, 2));
else console.log(renderText(report));
if (!args.noFail && !report.ok) process.exitCode = 1;
