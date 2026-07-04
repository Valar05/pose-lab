import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
function read(relativePath) { return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8'); }

const html = read('authoring/meshy_saber/saber_bench/index.html');
const js = read('authoring/meshy_saber/saber_bench/saber-bench.js');
const css = read('authoring/meshy_saber/saber_bench/saber-bench.css');
const builder = read('tools/build_saber_bench_cloud_review.mjs');

assert(html.includes('Meshy Saber Bench'), 'bench should have its own entrypoint');
assert(html.includes('id="benchCanvas"') && html.includes('id="jsonBox"'), 'bench should expose canvas and JSON contract box');
assert(html.includes('id="showProxySaber"') && html.includes('bright editable saber'), 'bench should expose an always-visible editable saber toggle');
assert(js.includes("import * as THREE from 'three'"), 'bench should use Three.js directly');
assert(js.includes("GLTFLoader"), 'bench should load real GLB assets');
assert(!js.includes("src/pose-lab.js") && !html.includes("src/pose-lab.js"), 'bench must not import Pose Lab runtime');
assert(js.includes('RightHand -> WeaponGrip -> SabreRoot -> sabre mesh'), 'bench must declare the simple FK hierarchy');
assert(js.includes("findNamed(meshyRoot, 'RightHand', 'Bone')"), 'bench must attach to the real RightHand bone');
assert(js.includes("findNamed(sabre.scene, 'Mesh_0')"), 'bench must isolate the real sabre mesh');
assert(js.includes('hideEverythingBut'), 'bench must hide imported junk helper objects');
assert(js.includes('pinHiltToWeaponGrip'), 'bench must expose hilt pinning as an explicit rule');
assert(js.includes('Bright editable saber proxy') && js.includes('proxyBlade'), 'bench must include a visible saber-shaped proxy to position even if the GLB is unreadable');
assert(js.includes('showRealMesh') && js.includes('showProxySaber'), 'bench must let the user compare the real sabre mesh and visible proxy');
assert(js.includes('pose-lab-meshy-saber-bench-contract-v1'), 'bench must export a stable contract schema');
assert(css.includes('@media (max-width: 760px)'), 'bench should stay usable on phone screens');

for (const asset of [
  'assets/models/meshy_character_sheet/animated/Meshy_AI_Meshy_Character_Sheet_biped_Animation_Walking_withSkin.glb',
  'assets/models/meshy_character_sheet/static/Meshy_AI_Meshy_Character_Sheet_0628173422_texture.glb',
  'assets/models/meshy_sabre/Meshy_AI_A_French_revolution_c_0628223518_texture.glb',
]) {
  assert(fs.existsSync(path.join(projectRoot, asset)), `required asset missing: ${asset}`);
  assert(builder.includes(asset), `cloud builder must stage ${asset}`);
}

assert(builder.includes('saber_bench'), 'cloud builder should stage the bench app');
assert(builder.includes('notPoseLabRuntime: true'), 'cloud builder should mark the bench as not Pose Lab runtime');
assert(!builder.includes("copyDir('src'") && !builder.includes("pose-lab.html"), 'cloud builder must not stage Pose Lab app source');
execFileSync('node', ['--check', 'authoring/meshy_saber/saber_bench/saber-bench.js'], { cwd: projectRoot, stdio: 'pipe' });
execFileSync('node', ['--check', 'tools/build_saber_bench_cloud_review.mjs'], { cwd: projectRoot, stdio: 'pipe' });

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['minimal-saber-bench', 'no-pose-lab-runtime', 'cloud-live-editor-staging'] }, null, 2));
