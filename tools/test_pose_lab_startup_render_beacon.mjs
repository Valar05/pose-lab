import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function checkSyntax(relativePath) {
  execFileSync(process.execPath, ['--check', path.join(projectRoot, relativePath)], { stdio: 'pipe' });
}

function checkModuleTextParse(relativePath) {
  const filePath = path.join(projectRoot, relativePath);
  const code = `
    import fs from 'node:fs';
    const source = fs.readFileSync(${JSON.stringify(filePath)}, 'utf8');
    try {
      await import('data:text/javascript;charset=utf-8,' + encodeURIComponent(source));
    } catch (error) {
      if (error?.name === 'SyntaxError') {
        console.error(error.name + ': ' + error.message);
        process.exit(1);
      }
    }
  `;
  execFileSync(process.execPath, ['--input-type=module', '-e', code], { stdio: 'pipe' });
}

for (const file of [
  'src/pose-lab.js',
  'src/godot-rest-poses.js',
  'src/rig-profiles.js',
  'src/startup-policy.mjs',
  'src/clip-search.js',
  'src/lab-mode.mjs',
]) {
  checkSyntax(file);
  checkModuleTextParse(file);
}

assert(html.includes('const bootstrapImports = ['), 'entry page should preflight the runtime import graph');
assert(html.includes("./vendor/three/build/three.module.js"), 'entry page should preflight the Three.js build module');
const runtimeToken = js.match(/const LAB_CACHE_TOKEN = '(pose-editor-[0-9]+)'/)?.[1] || '';
assert(runtimeToken, 'runtime should declare LAB_CACHE_TOKEN');
assert(html.includes(`./src/pose-lab.js?v=${runtimeToken}`), 'entry page should dynamically import the cache-busted runtime');

const tokenMatches = [...html.matchAll(/v=(pose-editor-[0-9]+)/g)].map((match) => match[1]);
assert(tokenMatches.length >= 6, 'entry page should cache-bust every local bootstrap import');
assert(new Set(tokenMatches).size === 1 && tokenMatches[0] === runtimeToken, `entry import cache tokens should match ${runtimeToken}, got ${tokenMatches.join(', ')}`);
for (const stale of ['visual-qa-read-frames', 'visual-qa-step-rail', 'pose-editor-14', 'pose-editor-1"']) {
  assert(!html.includes(stale), `entry page should not reference stale token ${stale}`);
  assert(!js.includes(stale), `runtime should not reference stale token ${stale}`);
}
const runtimeImportTokenPattern = new RegExp("from '\\./(?:[^']+)\\?v=(pose-editor-[0-9]+)'", 'g');
const runtimeImportTokens = [...js.matchAll(runtimeImportTokenPattern)].map((match) => match[1]);
assert(runtimeImportTokens.length >= 6, 'runtime should cache-bust local static imports');
assert(new Set(runtimeImportTokens).size === 1 && runtimeImportTokens[0] === runtimeToken, `runtime static imports should share ${runtimeToken}, got ${runtimeImportTokens.join(', ')}`);
assert(html.includes("fetch('/__visual_qa_smoke?stage=module-failed&spec='"), 'entry page should publish module-failed beacons with spec context');
assert(js.includes('this.updateFirstPersonCamera();'), 'startup should refresh the camera before first render');
assert(js.includes('this.renderer.render(this.scene, this.camera);'), 'startup should render once before saving state');
assert(js.includes('this.handleVisualQaFrame();'), 'startup should publish the visual QA beacon from the first loaded frame');
assert(js.includes('await this.loadActors();'), 'startup should still load actors before the first render');
assert(js.includes('this.startupReady = false;'), 'startup should hold render beacon until ready state is set');
assert(js.includes('if (!this.startupReady) return;'), 'visual QA beacon should wait for startup readiness before rendering');
assert(js.includes('this.startupReady = true;'), 'startup should mark readiness after selecting the startup actor');
assert(js.includes("if (char === '\\\\') {"), 'debug command parser should escape backslashes correctly');
assert(js.includes(String.raw`UI.readout.textContent = 'view=' + this.viewMode + '\n' + actor.readout();`), 'info readout should use an escaped newline, not a literal line break');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['startup-render', 'startup-beacon', 'syntax', 'module-text-parse'] }, null, 2));
