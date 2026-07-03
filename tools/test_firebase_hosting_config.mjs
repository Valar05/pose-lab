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
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const cleanupScript = fs.readFileSync(path.join(projectRoot, 'tools', 'clean_pose_lab_cache.mjs'), 'utf8');
const firebaseDoc = fs.readFileSync(path.join(projectRoot, 'docs', 'FIREBASE_VISUAL_TRUTH.md'), 'utf8');

assert(firebaseJson.hosting?.site === 'pose-lab-visual-truth', 'Firebase Hosting must use the isolated Pose Lab site');
assert(firebaseJson.hosting?.public === 'generated/firebase_hosting/pose_lab_release', 'Firebase Hosting must deploy the staged release directory');
assert(firebaserc.projects?.default === 'home-center-dclar', 'Firebase default project should use current gcloud default home-center-dclar');
assert(Array.isArray(firebaserc.targets?.['home-center-dclar']?.hosting?.['pose-lab-visual-truth']), 'Firebase target should map pose-lab-visual-truth hosting site');

const headers = JSON.stringify(firebaseJson.hosting?.headers || []);
assert(headers.includes('no-store, no-cache'), 'Firebase headers should disable stale HTML/module caching');
assert(headers.includes('**/*.{js,mjs,css,json}'), 'Firebase headers should cover JS module assets');

assert(buildScript.includes("for (const file of ['index.html', 'pose-lab.html', 'pose-critique.html'])"), 'release build should stage Pose Lab entrypoints');
assert(buildScript.includes('const stagedAssetFiles = ['), 'release build should use an explicit runtime asset allowlist');
assert(buildScript.includes('assets/models/FPSPlayer.glb'), 'release build should stage FPSPlayer for Meshy retarget source clips');
assert(buildScript.includes('assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb'), 'release build should stage Meshy animated runtime GLB');
assert(buildScript.includes('assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb'), 'release build should stage Meshy sabre GLB');
assert(!buildScript.includes("copyDir('assets/models')"), 'release build must not stage the entire assets/models tree');
assert(!buildScript.includes("copyDir('generated'"), 'release build must not stage generated scratch output');
assert(buildScript.includes('stagedBytes') && buildScript.includes('stagedFileList'), 'release manifest should record staged bytes and files');
const captureScript = fs.readFileSync(path.join(projectRoot, 'tools', 'capture_firebase_visual_truth.mjs'), 'utf8');
assert(captureScript.includes('function assertCloudHostedUrl'), 'Firebase capture should reject localhost/offline/staged URLs before Playwright control');
assert(captureScript.includes("role: 'controller-only'"), 'Firebase capture should label Playwright as controller-only, not visual truth authority');
assert(captureScript.includes('await page.goto(initialUrl') && captureScript.includes('clipSwitch = await debugExec'), 'Firebase capture should load the hosted page once and switch clips through the debug API');
assert(captureScript.includes("url.searchParams.set('qaClip', clip)") && captureScript.includes('const url = capture.clip ? poseUrl(hostedUrl, capture.clip) : page.url()'), 'Firebase capture artifacts must preserve exact clip route URLs for human review wakeup');
assert(captureScript.includes('relationshipCloseup') && captureScript.includes('`${capture.id}_relationship_closeup.png`'), 'Firebase capture should preserve id-scoped relationship close-up PNGs for T-pose and Ready');
assert(captureScript.includes("url.searchParams.set('qaActor', 'meshyCharacter')"), 'Firebase capture should force the hosted actor through qaActor');
assert(captureScript.includes('selected Meshy Character'), 'Firebase capture should wait for the hosted page to actually select Meshy Character');
assert(captureScript.includes('{ timeout: 120000 }'), 'Firebase capture should pass the wait timeout as Playwright options');
assert(captureScript.includes('if (!evidence.ok) process.exitCode = 1'), 'Firebase capture should fail the workflow while preserving evidence');
assert(captureScript.includes("id: 'landing'"), 'Firebase capture should include a human-review landing page capture');
assert(captureScript.includes('humanRedBuildForCommit'), 'Firebase capture should honor the human red-build veto ledger');
assert(humanRedBuilds.schema === 'pose-lab-human-visual-truth-red-builds-v1', 'human visual truth red-build ledger should use the expected schema');
assert(humanRedBuilds.redBuilds?.some((entry) => String(entry.commit || '').startsWith('3fc1b14')), 'human red-build ledger should preserve the red review for commit 3fc1b14');
assert(!workflow.includes('lfs: true'), 'Firebase workflow must not fetch every LFS object; legacy LFS history has missing objects');
assert(workflow.includes('cache: npm'), 'Firebase workflow should cache npm dependencies');
assert(workflow.includes('actions/cache@v4') && workflow.includes('~/.cache/ms-playwright'), 'Firebase workflow should cache Playwright browser binaries');
assert(workflow.includes('npm ci') && !workflow.includes('npm init -y'), 'Firebase workflow should use package-lock-driven npm ci instead of ad hoc npm init/install');
assert(workflow.includes('git lfs pull --include="assets/models/meshy_character_sheet/**,assets/models/meshy_sabre/**"'), 'Firebase workflow must fetch only Meshy runtime LFS assets before staging');
assert(workflow.includes('Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb') && workflow.includes('Meshy_AI_Meshy_Character_Sheet_0628173422_texture.glb') && workflow.includes('-gt 1000000'), 'Firebase workflow must fail if Meshy GLBs are LFS pointer files');
assert(workflow.includes('Clear stale Firebase visual artifacts') && workflow.includes('rm -rf generated/firebase_visual_truth/latest'), 'Firebase workflow must clear stale checked-in visual artifacts before capture');
assert(workflow.includes('set -o pipefail') && workflow.includes('tee "$RUNNER_TEMP/firebase-deploy.json"'), 'Firebase workflow must preserve Firebase deploy output when deploy fails');
assert(workflow.includes('PREVIEW_CHANNEL_ID: visual-truth-pr-') && workflow.includes('hosting:channel:deploy "$PREVIEW_CHANNEL_ID"'), 'Firebase workflow must use a stable PR-scoped preview channel instead of one channel per run');
assert(workflow.includes('hosting:channel:list') && workflow.includes('hosting:channel:delete') && workflow.includes('firebase-stale-channels.txt'), 'Firebase workflow must prune old visual-truth preview channels before deploy');
const configStep = workflow.slice(workflow.indexOf('- name: Validate Firebase config'), workflow.indexOf('- name: Install Firebase CLI and Playwright'));
assert(configStep && !configStep.includes('test_firebase_visual_truth_contract.mjs'), 'Firebase workflow must not validate stale visual-truth artifacts before capture refresh');
const captureStep = workflow.slice(workflow.indexOf('- name: Capture hosted Pose Lab truth'), workflow.indexOf('- uses: actions/upload-artifact@v4'));
assert(captureStep.includes('capture_firebase_visual_truth.mjs') && captureStep.includes('test_firebase_visual_truth_contract.mjs'), 'Firebase workflow must validate visual truth after the fresh cloud capture is written');
assert(packageJson.devDependencies?.['@playwright/test'] && packageJson.devDependencies?.['firebase-tools'], 'package.json should declare Firebase/Playwright tool dependencies');
assert(cleanupScript.includes("schema: 'pose-lab-cache-cleanup-v1'") && cleanupScript.includes('refusing non-generated cleanup path'), 'cleanup script should be allowlisted and refuse non-generated paths');
assert(cleanupScript.includes('/data/data/com.termux/files/usr/tmp') && cleanupScript.includes('tmp-glob'), 'cleanup script should own Termux tmp cleanup through allowlisted targets');
assert(firebaseDoc.includes('Cleanup Doctrine') && firebaseDoc.includes('tools/clean_pose_lab_cache.mjs'), 'Firebase docs should route cache cleanup through the cleanup script');
assert(gitignore.includes('/generated/firebase_hosting/'), 'generated Firebase staging output should stay untracked');
assert(gitignore.includes('/generated/firebase_visual_truth/artifacts/'), 'Firebase screenshot artifacts should stay untracked');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['firebase-hosting-config', 'isolated-site', 'staged-release', 'no-cache-headers'] }, null, 2));
