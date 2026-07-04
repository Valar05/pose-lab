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
assert(html.includes('id="showProxySaber"') && html.includes('bright diagnostic proxy'), 'bench should expose proxy only as an explicit diagnostic toggle');
assert(html.includes('id="truthReadout"'), 'bench should expose active real-mesh truth readout');
assert(html.includes('id="frameRealSabre"') && html.includes('Frame Real Sabre'), 'bench should include a direct real-sabre framing button');
assert(html.includes('id="showProxyNow"') && html.includes('Show Proxy'), 'bench should include an explicitly diagnostic proxy reveal');
assert(js.includes("import * as THREE from 'three'"), 'bench should use Three.js directly');
assert(js.includes("GLTFLoader"), 'bench should load real GLB assets');
assert(!js.includes("src/pose-lab.js") && !html.includes("src/pose-lab.js"), 'bench must not import Pose Lab runtime');
assert(js.includes('Meshy character plus real Meshy sabre mesh'), 'bench must default to real Meshy character plus real sabre mesh');
assert(js.includes('showRealMesh: true'), 'real sabre mesh must be enabled by default');
assert(js.includes('showProxySaber: false'), 'proxy saber must be hidden by default');
assert(js.includes("findNamed(meshyRoot, 'RightHand', 'Bone')"), 'bench must attach to the real RightHand bone');
assert(js.includes("findNamed(sabre.scene, 'Mesh_0')"), 'bench must isolate the real sabre mesh');
assert(js.includes('hideEverythingBut'), 'bench must hide imported junk helper objects');
assert(js.includes('pinHiltToWeaponGrip'), 'bench must expose hilt pinning as an explicit rule');
assert(js.includes('Bright editable saber proxy') && js.includes('proxyBlade'), 'bench may retain proxy geometry as a hidden diagnostic');
assert(js.includes('showRealMesh') && js.includes('showProxySaber'), 'bench must let the user compare the real sabre mesh and visible proxy');
assert(!js.includes('setStatus(\'ready: visible saber editor\')'), 'bench must not report ready before real asset loading');
assert(js.includes('loadMeshyReference().catch'), 'bench must auto-load Meshy and real sabre assets on startup');
assert(js.includes('setStatus(\'ready: real Meshy character and real sabre mesh loaded\')'), 'ready status must mean real character and real sabre mesh are loaded');
assert(js.includes('frameLoadedScene()'), 'bench must frame the loaded real character and sabre mesh');
assert(js.includes('worldBoundsFor') && js.includes('camera framed'), 'truth readout should report real mesh bounds and camera framing');
assert(js.includes('REAL_MESH_NOT_LOADED') && js.includes('REAL_MESH_LOAD_FAILED'), 'truth readout should distinguish not-loaded from load-failed');
assert(js.includes('REAL_MESH_EMPTY') && js.includes('REAL_MESH_OFF_CAMERA') && js.includes('REAL_MESH_HIDDEN'), 'truth readout should diagnose invisible loaded mesh states');
assert(js.includes('materialSummary') && js.includes('world bounds center'), 'truth readout should report material opacity and mesh center');
assert(js.includes('frameObject(sabreMesh)'), 'bench should frame the real sabre mesh directly on demand');
assert(js.includes('diagnostic proxy shown; this is not real-sabre success'), 'proxy reveal must be explicitly non-acceptance');
assert(js.includes('pose-lab-meshy-saber-bench-contract-v1'), 'bench must export a stable contract schema');
assert(css.includes('@media (max-width: 760px)'), 'bench should stay usable on phone screens');
assert(css.includes('#truthReadout'), 'truth readout should be styled for phone review');

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
