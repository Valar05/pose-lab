#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'authoring', 'meshy_saber', 'exports');
const reviewRoot = path.join(projectRoot, 'generated', 'firebase_hosting', 'meshy_saber_blender_review');
const publicRoot = path.join(reviewRoot, 'public');

const required = {
  tpose: path.join(sourceRoot, 'headless_review', 'meshy_saber_tpose.png'),
  ready: path.join(sourceRoot, 'headless_review', 'meshy_saber_ready.png'),
  rightHandClose: path.join(sourceRoot, 'headless_review', 'meshy_saber_right_hand_close.png'),
  contactSheet: path.join(sourceRoot, 'headless_review', 'meshy_saber_contact_sheet.html'),
  contract: path.join(sourceRoot, 'meshy_ready_saber_contract.json'),
};

function gitValue(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (_err) {
    return fallback;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function copyNamed(source, targetName) {
  const target = path.join(publicRoot, targetName);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return {
    source: path.relative(projectRoot, source),
    target: targetName,
    bytes: fs.statSync(target).size,
  };
}

for (const [name, file] of Object.entries(required)) {
  if (!fs.existsSync(file)) fail(`missing ${name} artifact: ${path.relative(projectRoot, file)}; run node tools/meshy_saber_blender_workbench.mjs --json first`);
}

fs.rmSync(reviewRoot, { recursive: true, force: true });
fs.mkdirSync(publicRoot, { recursive: true });

const artifacts = {
  tpose: copyNamed(required.tpose, 'meshy_saber_tpose.png'),
  ready: copyNamed(required.ready, 'meshy_saber_ready.png'),
  rightHandClose: copyNamed(required.rightHandClose, 'meshy_saber_right_hand_close.png'),
  contactSheet: copyNamed(required.contactSheet, 'meshy_saber_contact_sheet.html'),
  contract: copyNamed(required.contract, 'meshy_ready_saber_contract.json'),
};

const contract = JSON.parse(fs.readFileSync(required.contract, 'utf8'));
const manifest = {
  schema: 'pose-lab-meshy-saber-blender-cloud-review-v1',
  generatedAt: new Date().toISOString(),
  sourceCommit: gitValue(['rev-parse', 'HEAD']),
  sourceBranch: gitValue(['branch', '--show-current']),
  authority: 'thin cloud review of local headless Blender artifacts',
  acceptance: 'This is visible evidence only. It is red unless a human says the T-pose and Ready renders read as correct.',
  notPoseLabRuntime: true,
  artifacts,
  contractSummary: {
    status: contract.status,
    authority: contract.authority,
    hierarchy: contract.hierarchy,
    weaponGripLocal: contract.weaponGripLocal,
    sabreLocal: contract.sabreLocal,
  },
};

fs.writeFileSync(path.join(publicRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(reviewRoot, 'firebase.json'), JSON.stringify({
  hosting: {
    site: 'pose-lab-visual-truth',
    public: 'public',
    ignore: ['firebase.json', '**/.*', '**/node_modules/**'],
    headers: [
      {
        source: '**',
        headers: [{ key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, max-age=0' }],
      },
    ],
  },
}, null, 2) + '\n');

fs.writeFileSync(path.join(publicRoot, 'index.html'), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Meshy Saber Blender Review</title>
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; background: #101112; color: #f0f0ec; }
    body { margin: 0; }
    header { padding: 14px 16px 10px; border-bottom: 1px solid #333; background: #181a1b; }
    h1 { margin: 0 0 6px; font-size: 20px; font-weight: 700; letter-spacing: 0; }
    p { margin: 0; color: #c9c9c1; font-size: 13px; line-height: 1.35; }
    main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 10px; }
    figure { margin: 0; border: 1px solid #303236; background: #151617; }
    img { display: block; width: 100%; height: auto; }
    figcaption { padding: 8px 10px; font-size: 13px; color: #ddd; border-top: 1px solid #303236; }
    section { padding: 0 10px 12px; }
    pre { overflow: auto; margin: 0; padding: 10px; border: 1px solid #303236; background: #151617; color: #ddd; font-size: 12px; line-height: 1.4; }
    a { color: #9ed0ff; }
    @media (max-width: 760px) { main { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>Meshy Saber Blender Review</h1>
    <p>Thin cloud layer for headless Blender artifacts. This is not Pose Lab runtime and not a green claim.</p>
  </header>
  <main>
    <figure>
      <img src="./meshy_saber_tpose.png" alt="Meshy saber T-pose render">
      <figcaption>T-pose / rest canary</figcaption>
    </figure>
    <figure>
      <img src="./meshy_saber_ready.png" alt="Meshy saber rest duplicate render">
      <figcaption>Rest duplicate; no authored Ready source yet</figcaption>
    </figure>
    <figure>
      <img src="./meshy_saber_right_hand_close.png" alt="Meshy saber right hand close-up render">
      <figcaption>Right hand / sabre close-up</figcaption>
    </figure>
  </main>
  <section>
    <pre>${JSON.stringify(manifest.contractSummary, null, 2).replace(/[<&]/g, (c) => c === '<' ? '&lt;' : '&amp;')}</pre>
  </section>
</body>
</html>
`);

console.log(JSON.stringify({
  ok: true,
  reviewRoot: path.relative(projectRoot, reviewRoot),
  publicRoot: path.relative(projectRoot, publicRoot),
  firebaseConfig: path.relative(projectRoot, path.join(reviewRoot, 'firebase.json')),
  files: Object.keys(artifacts).length + 2,
}, null, 2));
