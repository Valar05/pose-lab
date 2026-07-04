import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
function read(relativePath) { return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'); }

const source = read('tools/build_meshy_saber_blender_cloud_review.mjs');

assert(source.includes('pose-lab-meshy-saber-blender-cloud-review-v1'), 'cloud review manifest schema must be stable');
assert(source.includes('meshy_saber_tpose.png') && source.includes('meshy_saber_ready.png'), 'cloud review must publish T-pose and Ready renders');
assert(source.includes('notPoseLabRuntime: true'), 'cloud review must mark itself as not Pose Lab runtime');
assert(!source.includes("copyDir('src'") && !source.includes('assets/models'), 'cloud review must not stage Pose Lab runtime source/assets');
assert(source.includes('no-store, no-cache'), 'cloud review must avoid stale HTML/JSON/PNG review artifacts');

const dry = execFileSync('node', ['--check', 'tools/build_meshy_saber_blender_cloud_review.mjs'], { cwd: projectRoot, encoding: 'utf8' });
assert(dry === '', 'builder should pass node --check');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['thin-meshy-saber-blender-cloud-review', 'no-pose-lab-runtime-staging'] }, null, 2));
