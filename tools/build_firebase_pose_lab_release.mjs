#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(projectRoot, 'generated', 'firebase_hosting', 'pose_lab_release');
const manifestPath = path.join(outDir, 'firebase-release-manifest.json');

function readText(relPath) {
  return fs.readFileSync(path.join(projectRoot, relPath), 'utf8');
}

function currentCacheToken() {
  return readText('src/pose-lab.js').match(/const\s+LAB_CACHE_TOKEN\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function currentRuntimeBuild() {
  return readText('src/pose-lab.js').match(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/)?.[1] || '';
}

function gitValue(args, fallback = '') {
  try {
    return execFileSync('git', args, { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch (_error) {
    return fallback;
  }
}

function copyFile(relPath) {
  const source = path.join(projectRoot, relPath);
  const target = path.join(outDir, relPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function copyDir(relPath) {
  const source = path.join(projectRoot, relPath);
  const target = path.join(outDir, relPath);
  fs.cpSync(source, target, {
    recursive: true,
    filter(sourcePath) {
      const base = path.basename(sourcePath);
      if (base === '.DS_Store' || base === 'node_modules' || base === '.git') return false;
      return true;
    },
  });
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

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of ['index.html', 'pose-lab.html', 'pose-critique.html']) copyFile(file);
for (const dir of ['src', 'vendor']) copyDir(dir);

fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
copyDir('assets/models');
copyFile('assets/asset_manifest.json');

const manifest = {
  schema: 'pose-lab-firebase-release-manifest-v1',
  generatedAt: new Date().toISOString(),
  projectId: 'home-center-dclar',
  hostingSite: 'pose-lab-visual-truth',
  commit: gitValue(['rev-parse', 'HEAD']),
  branch: gitValue(['branch', '--show-current']),
  cacheToken: currentCacheToken(),
  runtimeBuild: currentRuntimeBuild(),
  publicDir: path.relative(projectRoot, outDir),
  stagedFiles: countFiles(outDir),
  entrypoints: [
    'index.html',
    'pose-lab.html',
    'pose-critique.html',
  ],
  runtimeAssetRoots: [
    'src',
    'vendor',
    'assets/models',
    'assets/asset_manifest.json',
  ],
};

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify(manifest, null, 2));
