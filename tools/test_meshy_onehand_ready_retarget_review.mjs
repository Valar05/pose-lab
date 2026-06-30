import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const outDir = path.join(projectRoot, 'generated', 'test_runs', `retarget-review-${process.pid}`);
const output = execFileSync('node', [
  path.join(projectRoot, 'tools', 'meshy_onehand_ready_retarget_review.mjs'),
  '--out', outDir,
  '--max-render-frames', '3',
], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const dataPath = path.join(projectRoot, result.data);
const pngPath = path.join(projectRoot, result.png);
const summaryPath = path.join(projectRoot, result.summary);
const candidatePath = path.join(projectRoot, result.candidateClip);
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'retarget review workspace should complete');
assert(fs.existsSync(dataPath), `missing retarget review JSON ${dataPath}`);
assert(fs.existsSync(pngPath), `missing retarget review PNG ${pngPath}`);
assert(fs.existsSync(summaryPath), `missing retarget review summary ${summaryPath}`);
assert(fs.existsSync(candidatePath), `missing candidate poseclip artifact ${candidatePath}`);
assert(fs.statSync(pngPath).size > 1000, 'retarget review contact sheet should not be empty');
assert(data.schema === 'pose-lab-meshy-onehandready-retarget-review-v1', `unexpected schema ${data.schema}`);
assert(data.reviewOnly === true && data.productionBehaviorModified === false, 'review must not modify production behavior');
assert(data.acceptedBaseline === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', 'review must use accepted Meshy/FPS baseline');
assert(data.sourceKeyCount === 31, `review should preserve all 31 authored OneHandReady keys, got ${data.sourceKeyCount}`);
assert(data.targetClip === 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]', 'target clip should be Meshy FPS sword upper candidate');
assert(candidate.status === 'candidate-only', 'candidate poseclip must remain candidate-only');
assert(candidate.userData?.keyConvert?.preservesSourceTimes === true, 'candidate should preserve source key times');
assert(candidate.userData?.keyConvert?.noUniformSampling === true, 'candidate should not claim uniform resampling');
assert(candidate.userData?.keyConvert?.ikPreservesSourceTracks === true, 'IK correction must preserve source tracks');
assert(candidate.userData?.keyConvert?.weaponFrameSolve === true, 'candidate should include weapon frame solve metadata');
assert(candidate.userData?.keyConvert?.rollCorrectionQuarantined === true, 'roll must remain quarantined');
assert(data.constraints?.manualWeaponPlacementAuthorityRespected === true, 'manual weapon placement authority should be documented');
assert(data.metrics?.arm && Number.isFinite(data.metrics.arm.rightHandPositionError), 'review should include arm metrics');
assert(data.metrics?.weapon?.productionSocket && Number.isFinite(data.metrics.weapon.productionSocket.averagePickedGripError), 'review should include production weapon metrics');
assert(data.metrics?.weapon?.socketCandidate && Number.isFinite(data.metrics.weapon.socketCandidate.averagePickedGripError), 'review should include socket candidate metrics');
assert(data.evidence?.projectionWorkspace?.data && data.evidence?.bladeVectorWorkspace?.data && data.evidence?.socketSolver?.data, 'review should link generated evidence workspaces');
assert(['ready_for_promotion', 'needs_arm_projection_fix', 'needs_weapon_socket_promotion', 'needs_landmark_fix', 'needs_roll_research_later'].includes(data.decision?.classification), `unexpected decision ${data.decision?.classification}`);
assert(data.promotion?.applied === false && data.promotion?.gateRun === false, 'review should not promote without a ready decision');

assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'review must not modify Meshy startup baseline');
assert(profiles.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'review must preserve Meshy manual grip landmark');
assert(profiles.includes('gripLocalPosition: [0.67888, -0.07803, -0.06249]'), 'review must preserve FPS manual grip landmark');
assert(!profiles.includes('pose-lab-meshy-onehandready-retarget-review-v1'), 'review schema should not be wired into production profiles');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['candidate-only-retarget-review', 'source-key-preservation', 'weapon-before-after-metrics', 'manual-placement-guardrails', 'visible-contact-sheet'],
  data: result.data,
  png: result.png,
  summary: result.summary,
  candidateClip: result.candidateClip,
  decision: data.decision,
  metrics: data.metrics,
}, null, 2));
