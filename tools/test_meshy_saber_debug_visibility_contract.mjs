import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const meshyStart = profiles.indexOf('meshyCharacter:');
const meshyEnd = profiles.indexOf('\n  meshyStatic:', meshyStart);
const meshy = profiles.slice(meshyStart, meshyEnd > meshyStart ? meshyEnd : undefined);
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(html.includes('pose-editor-120'), 'entry page should use the cache token expected by live weapon diagnostics');
assert(js.includes("const LAB_CACHE_TOKEN = 'pose-editor-120'"), 'runtime weapon diagnostics should expose the current cache token');
assert(js.includes('function weaponDebugForceVisible()'), 'runtime should define an explicit saber visibility debug override');
assert(js.includes("params.get('weaponDebug') === '1'") && js.includes("params.get('weaponDebug') === 'true'"), 'weaponDebug URL param should accept 1/true');
assert(js.includes('weaponDebugForceVisible() || clip?.userData?.weaponPathIk'), 'debug override should force the weapon visible before clip-pattern gating');
assert(js.includes('weaponDebugForceVisible: weaponDebugForceVisible()'), 'live weapon payload should report whether the override is active');
assert(js.includes('cacheToken: LAB_CACHE_TOKEN'), 'live weapon payload should report the loaded cache token');
assert(meshy.includes("visibleClipPatterns: ['\\\\[FPS-REST-ARMS']"), 'protected Meshy default visibility should remain accepted-baseline only');
assert(!meshy.includes("visibleClipPatterns: ['OneHand']"), 'Meshy default visibility must not be widened to the rejected OneHand candidate');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['saber-debug-force-visible', 'cache-token-live-diagnostics', 'protected-default-visibility'] }, null, 2));
