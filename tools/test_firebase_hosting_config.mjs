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
const humanRedBuilds = JSON.parse(fs.readFileSync(path.join(projectRoot, 'evidence', 'human_visual_truth_red_builds.json'), 'utf8'));

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
assert(captureScript.includes('function assertCloudHostedUrl'), 'Firebase capture should reject localhost/offline/staged URLs before Playwright control');
assert(captureScript.includes("role: 'controller-only'"), 'Firebase capture should label Playwright as controller-only, not visual truth authority');
assert(captureScript.includes("url.searchParams.set('qaActor', 'meshyCharacter')"), 'Firebase capture should force the hosted actor through qaActor');
assert(captureScript.includes('selected Meshy Character'), 'Firebase capture should wait for the hosted page to actually select Meshy Character');
assert(captureScript.includes('null, { timeout: 120000 }'), 'Firebase capture should pass the wait timeout as Playwright options');
assert(captureScript.includes('if (!evidence.ok) process.exitCode = 1'), 'Firebase capture should fail the workflow while preserving evidence');
assert(captureScript.includes("id: 'landing'"), 'Firebase capture should include a human-review landing page capture');
assert(captureScript.includes('humanRedBuildForCommit'), 'Firebase capture should honor the human red-build veto ledger');
assert(humanRedBuilds.schema === 'pose-lab-human-visual-truth-red-builds-v1', 'human visual truth red-build ledger should use the expected schema');
assert(humanRedBuilds.redBuilds?.some((entry) => String(entry.commit || '').startsWith('3fc1b14')), 'human red-build ledger should preserve the red review for commit 3fc1b14');
assert(!workflow.includes('lfs: true'), 'Firebase workflow must not fetch every LFS object; legacy LFS history has missing objects');
assert(workflow.includes('git lfs pull --include="assets/models/meshy_character_sheet/**,assets/models/meshy_sabre/**"'), 'Firebase workflow must fetch only Meshy runtime LFS assets before staging');
assert(workflow.includes('Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb') && workflow.includes('Meshy_AI_Meshy_Character_Sheet_0628173422_texture.glb') && workflow.includes('-gt 1000000'), 'Firebase workflow must fail if Meshy GLBs are LFS pointer files');
assert(gitignore.includes('/generated/firebase_hosting/'), 'generated Firebase staging output should stay untracked');
assert(gitignore.includes('/generated/firebase_visual_truth/artifacts/'), 'Firebase screenshot artifacts should stay untracked');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['firebase-hosting-config', 'isolated-site', 'staged-release', 'no-cache-headers'] }, null, 2));
