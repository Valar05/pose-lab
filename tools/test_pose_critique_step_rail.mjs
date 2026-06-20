import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src/pose-lab.js'), 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(html.includes('pose-editor-22'), 'pose-lab HTML should bump the cache token after critique-rail changes');
assert(js.includes("const fps = 30;"), 'critique frame sampling should lock to 30 fps');
assert(js.includes('Math.ceil(duration * fps) + 1'), 'critique frame slots should be derived from clip duration when spriteFrames are absent');
assert(js.includes('if (!clip) {'), 'critique frame slots should only fall back to phase tags when no clip is loaded');
assert(js.includes("frameKey: 'f' + String(spriteFrame).padStart(3, '0')"), 'critique frame slots should label stepped frames individually');
assert(js.includes('const sampleCount = Math.max(2, Math.ceil(duration * 30) + 1);'), 'visual QA frame sampling should also step through the clip duration');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['html-cache-token', 'critique-step-rail', 'visual-qa-step-fallback'] }, null, 2));
