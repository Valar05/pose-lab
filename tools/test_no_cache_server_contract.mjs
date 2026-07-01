import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const server = fs.readFileSync(path.join(projectRoot, 'tools', 'no_cache_http_server.py'), 'utf8');
const orientation = fs.readFileSync(path.join(projectRoot, 'PROJECT_ORIENTATION.md'), 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
const cacheToken = js.match(/const LAB_CACHE_TOKEN = '([^']+)'/)?.[1] || '';

assert(server.includes('class NoCacheHandler'), 'Pose Lab dev server should use an explicit no-cache handler');
for (const header of ['Cache-Control', 'no-store', 'no-cache', 'must-revalidate', 'Pragma', 'Expires']) {
  assert(server.includes(header), `no-cache server missing ${header}`);
}
assert(orientation.includes('tools/no_cache_http_server.py --port 8798'), 'durable server docs should use no-cache server on the old URL port');
assert(orientation.includes('no-cache headers'), 'durable server docs should require no-cache header verification');
assert(cacheToken, 'runtime should expose current cache token');
assert(html.includes(`./src/rig-profiles.js?v=${cacheToken}`), 'HTML should cache-bust rig profile module with current token');
assert(html.includes(`./src/pose-lab.js?v=${cacheToken}`), 'HTML should cache-bust Pose Lab runtime module with current token');
assert(js.includes(`./rig-profiles.js?v=${cacheToken}`), 'runtime import should use current rig profile token');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['no-cache-dev-server', 'old-url-server-docs', 'current-cache-token'],
}, null, 2));
