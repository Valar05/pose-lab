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
const cacheToken = js.match(/const LAB_CACHE_TOKEN = '([^']+)'/)?.[1];

assert(cacheToken, 'runtime weapon diagnostics should expose a cache token');
assert(html.includes(`pose-lab.js?v=${cacheToken}`), 'entry page should use the runtime cache token expected by live weapon diagnostics');
assert(js.includes('weaponRoot.visible = true') && js.includes('node.visible = true'), 'weapon attachment should force imported GLB nodes visible');
assert(js.includes('this.weaponProxy.root.visible = true') && js.includes('this.weaponProxy.model.visible = true'), 'weapon proxy update should keep both socket and attached model visible');
assert(js.includes('weaponDebugForceVisible: weaponDebugForceVisible()'), 'live weapon payload should report whether the override is active');
assert(js.includes('cacheToken: LAB_CACHE_TOKEN'), 'live weapon payload should report the loaded cache token');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['saber-hierarchy-force-visible', 'cache-token-live-diagnostics'] }, null, 2));
