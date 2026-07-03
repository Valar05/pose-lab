#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'firebase_visual_truth', 'latest');

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

const args = parseArgs(process.argv);
if (!args.hostedUrl || !/^https:\/\//.test(args.hostedUrl)) throw new Error(`missing Firebase hosted HTTPS URL: ${args.hostedUrl}`);

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const captures = [
  {
    id: 'tpose',
    clip: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]',
    expected: 'T-pose/rest Meshy saber baseline visible on hosted Firebase page',
  },
  {
    id: 'ready',
    clip: 'OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]',
    expected: 'Ready Meshy saber visible on hosted Firebase page',
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
      return /selected Meshy Character/.test(text);
    }, null, { timeout: 120000 });
  } catch (caught) {
    failed = true;
    error = caught?.message || String(caught);
  }
  await page.waitForTimeout(1000);
  const screenshot = path.join(outDir, `${capture.id}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  const loadState = await page.locator('#loadState').textContent({ timeout: 5000 }).catch(() => '');
  const routeSelected = /selected Meshy Character/.test(loadState || '');
  if (!routeSelected) failed = true;
  captured.push({
    id: capture.id,
    actor: 'meshyCharacter',
    clip: capture.clip,
    url,
    screenshot: path.relative(projectRoot, screenshot),
    loadState: loadState || '',
    routeSelected,
    error,
    expectedVisibleState: capture.expected,
    visibleRead: routeSelected
      ? `Hosted Firebase screenshot captured for ${capture.id}; human review still decides visual correctness.`
      : `Hosted Firebase capture did not reach Meshy Character for ${capture.id}; route/load truth is red.`,
  });
  if (!routeSelected) break;
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
  ok: !failed && captured.length === captures.length && captured.every((capture) => capture.routeSelected === true),
  captures: captured,
  truthLedger: {
    repo: true,
    hostedFirebase: true,
    cloudBrowserCapture: !failed,
    human: false,
  },
};

fs.writeFileSync(path.join(outDir, 'visual_truth.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
if (!evidence.ok) process.exitCode = 1;
