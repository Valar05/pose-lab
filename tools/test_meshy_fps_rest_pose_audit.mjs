import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const output = execFileSync('node', [path.join(projectRoot, 'tools', 'meshy_fps_rest_pose_audit.mjs')], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const audit = JSON.parse(fs.readFileSync(path.join(projectRoot, result.path), 'utf8'));
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
assert(result.ok === true, 'rest pose audit should complete');
assert(audit.schema === 'pose-lab-meshy-fps-rest-pose-audit-v1', `unexpected schema ${audit.schema}`);
assert(audit.sourceRestProvider === '0T-Pose', 'audit should use FPS 0T-Pose as source rest candidate');
assert(audit.targetRestProvider === 'skin-bind', 'audit should use Meshy skin bind as target rest candidate');
assert(audit.metrics.fpsRightModelRestToReady > 0.25, `FPS right hand should visibly leave model rest, got ${audit.metrics.fpsRightModelRestToReady}`);
assert(audit.metrics.fpsLeftModelRestToReady > 0.25, `FPS left hand should visibly leave model rest, got ${audit.metrics.fpsLeftModelRestToReady}`);
assert(audit.target.bindRestBoneCount >= 20, `Meshy bind rest should cover most bones, got ${audit.target.bindRestBoneCount}`);
assert(js.includes('clipRestQuaternionMap(sourceRestClip)') && js.includes('skinnedBindLocalQuaternionMap(targetRoot)'), 'runtime should expose explicit rest providers');
assert(profiles.includes("sourceRestClip: '0T-Pose'") && profiles.includes("targetRestProvider: 'skin-bind'"), 'Meshy profile should enable explicit rest translation');
if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-fps-rest-pose-audit', 'source-ready-leaves-rest', 'target-skin-bind-provider'], metrics: audit.metrics }, null, 2));
