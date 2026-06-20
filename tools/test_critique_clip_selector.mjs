import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.css'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(html.includes('id="clipPanel"'), 'clip panel should still exist');
assert(html.includes('id="clipSearch"'), 'clip search should still exist');
assert(html.includes('id="clipButtons"'), 'clip buttons should still exist');
assert(html.includes('id="playerClipPanel"'), 'critique transport should expose a clip selector toggle');
assert(js.includes('playerClipPanel'), 'runtime should wire the clip selector toggle');
assert(js.includes("this.setPanel(this.activePanel === 'clips' ? 'none' : 'clips')"), 'runtime should be able to open the clip panel');
assert(!css.includes('body.phone-controls.critique-mode #clipPanel { display: none !important; }'), 'clip panel should not be permanently hidden in critique mode');
assert(css.includes('body.phone-controls.critique-mode #clipPanel.open'), 'clip panel should have an open-state rule in critique mode');
assert(css.includes('body.phone-controls.critique-mode #clipPanel'), 'clip panel should remain styled for critique mode');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['clip-selector-visibility', 'critique-toggle', 'css-open-state'] }, null, 2));
