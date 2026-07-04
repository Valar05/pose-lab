#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(projectRoot, 'authoring', 'meshy_saber', 'saber_bench');
const outRoot = path.join(projectRoot, 'generated', 'firebase_hosting', 'saber_bench_review');
const publicRoot = path.join(outRoot, 'public');

const requiredAssets = [
  'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb',
  'assets/models/meshy_character_sheet/static/Meshy_AI_Meshy_Character_Sheet_0628173422_texture.glb',
  'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb',
];

function rel(file) {
  return path.relative(projectRoot, file);
}

function gitValue(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (_error) {
    return fallback;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function copyFile(relativePath) {
  const source = path.join(projectRoot, relativePath);
  const target = path.join(publicRoot, relativePath);
  if (!fs.existsSync(source)) fail(`missing file: ${relativePath}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDir(relativePath) {
  const source = path.join(projectRoot, relativePath);
  const target = path.join(publicRoot, relativePath);
  if (!fs.existsSync(source)) fail(`missing directory: ${relativePath}`);
  fs.cpSync(source, target, {
    recursive: true,
    filter(sourcePath) {
      const base = path.basename(sourcePath);
      return base !== '.git' && base !== 'node_modules' && base !== '.DS_Store';
    },
  });
}

function copyBenchFile(name) {
  const source = path.join(sourceRoot, name);
  const target = path.join(publicRoot, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function countFiles(dir) {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) count += countFiles(full);
    else if (entry.isFile()) count += 1;
  }
  return count;
}

for (const name of ['index.html', 'saber-bench.css', 'saber-bench.js']) {
  const file = path.join(sourceRoot, name);
  if (!fs.existsSync(file)) fail(`missing bench source: ${rel(file)}`);
}
for (const asset of requiredAssets) copyFile(asset);

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(publicRoot, { recursive: true });
for (const name of ['index.html', 'saber-bench.css', 'saber-bench.js']) copyBenchFile(name);
copyDir('vendor/three');
for (const asset of requiredAssets) copyFile(asset);

const manifest = {
  schema: 'pose-lab-meshy-saber-bench-cloud-review-v1',
  generatedAt: new Date().toISOString(),
  sourceCommit: gitValue(['rev-parse', 'HEAD']),
  sourceBranch: gitValue(['branch', '--show-current']),
  authority: 'cloud-hosted live minimal saber editing surface',
  notPoseLabRuntime: true,
  entrypoint: 'index.html',
  stagedFiles: countFiles(publicRoot),
  assets: requiredAssets,
};

fs.writeFileSync(path.join(publicRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
fs.writeFileSync(path.join(outRoot, 'firebase.json'), JSON.stringify({
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

console.log(JSON.stringify({
  ok: true,
  publicRoot: rel(publicRoot),
  firebaseConfig: rel(path.join(outRoot, 'firebase.json')),
  manifest: rel(path.join(publicRoot, 'manifest.json')),
  stagedFiles: manifest.stagedFiles,
}, null, 2));
