import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const toolPath = path.join(projectRoot, 'tools', 'meshy_ready_pose_workbench.mjs');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(fs.existsSync(toolPath), 'ready workbench script should exist');
assert(profiles.includes("startupClip: { name: '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]' }"), 'Meshy startup should stay on accepted T-pose calibration');
assert(!profiles.includes("startupClip: { name: 'OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]' }"), 'failed ready retarget must not be startup');
assert(!profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]'"), 'failed ready retarget must not be SwordReady alias');

const output = JSON.parse(execFileSync('node', [toolPath], { cwd: projectRoot, encoding: 'utf8' }));
const artifactPath = path.join(projectRoot, output.artifact);
const candidatePath = path.join(projectRoot, output.candidate);
const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
const candidate = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));

assert(artifact.schema === 'pose-lab-meshy-ready-workbench-v1', 'artifact schema should identify the ready workbench');
assert(artifact.status === 'candidate-only' && artifact.promotable === false, 'workbench output should not be promotable without visual evidence');
assert(artifact.sourceClip === 'OneHandReady', 'artifact should use FPS OneHandReady as source reference');
assert(artifact.targetRestClip === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', 'artifact should start from accepted T-pose calibration');
assert(artifact.targetRestPose?.rightHand && artifact.targetRestPose?.leftHand, 'artifact should keep target rest coordinates separately from the accepted clip label');
assert(artifact.acceptance?.requiresFreshVisualEvidence === true, 'artifact should require fresh visual evidence');
assert(artifact.acceptance?.swordIgnored === true, 'artifact should explicitly ignore sword orientation in this phase');
assert(artifact.sourceKeyCount === 31, `FPS OneHandReady should keep 31 authored keys, got ${artifact.sourceKeyCount}`);
assert(Array.isArray(artifact.samples) && artifact.samples.length >= 5, 'artifact should include sampled FPS reference frames');
assert(candidate.name === 'OneHandReady -> meshyCharacter [READY-AUTHORED-FPSREF]', 'candidate plan should use the authored FPS reference label');
assert(candidate.upperBodyOnly === true, 'candidate plan should be upper-body only');
for (const forbidden of ['hips', 'root', 'legs', 'feet', 'head', 'weapon orientation']) {
  assert(candidate.excluded.includes(forbidden), `candidate should exclude ${forbidden}`);
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-ready-workbench-candidate-only', 'tpose-startup-protected'], artifact: output.artifact }, null, 2));
