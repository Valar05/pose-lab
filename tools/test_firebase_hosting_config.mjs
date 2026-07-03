import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const firebaseJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'firebase.json'), 'utf8'));
const firebaserc = JSON.parse(fs.readFileSync(path.join(projectRoot, '.firebaserc'), 'utf8'));
const buildScript = fs.readFileSync(path.join(projectRoot, 'tools', 'build_firebase_pose_lab_release.mjs'), 'utf8');
const workflow = fs.readFileSync(path.join(projectRoot, '.github', 'workflows', 'firebase-visual-truth.yml'), 'utf8');
const gitignore = fs.readFileSync(path.join(projectRoot, '.gitignore'), 'utf8');

assert(firebaseJson.hosting?.site === 'pose-lab-visual-truth', 'Firebase Hosting must use the isolated Pose Lab site');
assert(firebaseJson.hosting?.public === 'generated/firebase_hosting/pose_lab_release', 'Firebase Hosting must deploy the staged release directory');
assert(firebaserc.projects?.default === 'home-center-dclar', 'Firebase default project should use current gcloud default home-center-dclar');
assert(Array.isArray(firebaserc.targets?.['home-center-dclar']?.hosting?.['pose-lab-visual-truth']), 'Firebase target should map pose-lab-visual-truth hosting site');

const headers = JSON.stringify(firebaseJson.hosting?.headers || []);
assert(headers.includes('no-store, no-cache'), 'Firebase headers should disable stale HTML/module caching');
assert(headers.includes('**/*.{js,mjs,css,json}'), 'Firebase headers should cover JS module assets');

assert(buildScript.includes("for (const file of ['index.html', 'pose-lab.html', 'pose-critique.html'])"), 'release build should stage Pose Lab entrypoints');
assert(buildScript.includes("copyDir('assets/models')"), 'release build should stage runtime model assets');
assert(!buildScript.includes("copyDir('generated'"), 'release build must not stage generated scratch output');
const captureScript = fs.readFileSync(path.join(projectRoot, 'tools', 'capture_firebase_visual_truth.mjs'), 'utf8');
assert(captureScript.includes("url.searchParams.set('qaActor', 'meshyCharacter')"), 'Firebase capture should force the hosted actor through qaActor');
assert(captureScript.includes('selected Meshy Character'), 'Firebase capture should wait for the hosted page to actually select Meshy Character');
assert(captureScript.includes('null, { timeout: 120000 }'), 'Firebase capture should pass the wait timeout as Playwright options');
assert(captureScript.includes('if (!evidence.ok) process.exitCode = 1'), 'Firebase capture should fail the workflow while preserving evidence');
assert(workflow.includes('lfs: true') && workflow.includes('git lfs pull'), 'Firebase workflow must fetch Git LFS assets before staging');
assert(workflow.includes('Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb') && workflow.includes('-gt 1000000'), 'Firebase workflow must fail if Meshy GLBs are LFS pointer files');
assert(gitignore.includes('/generated/firebase_hosting/'), 'generated Firebase staging output should stay untracked');
assert(gitignore.includes('/generated/firebase_visual_truth/artifacts/'), 'Firebase screenshot artifacts should stay untracked');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['firebase-hosting-config', 'isolated-site', 'staged-release', 'no-cache-headers'] }, null, 2));
