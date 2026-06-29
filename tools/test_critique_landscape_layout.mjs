import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.css'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const marker = 'critique-landscape-1.0';
const index = css.indexOf(marker);
assert(index >= 0, 'CSS should include critique-landscape-1.0 override');
const block = index >= 0 ? css.slice(index) : '';
assert(block.includes('@media (orientation: landscape)'), 'landscape critique rules must be scoped to landscape');
assert(block.includes('body.phone-controls.critique-mode #playerTransport'), 'landscape should resize the critique transport');
assert(block.includes('max-height: min(34vh, 210px);'), 'landscape transport should not consume most of the viewport');
assert(block.includes('body.phone-controls.critique-mode #cleanupTimelineCanvas'), 'landscape should compact the timeline canvas');
assert(block.includes('height: 44px;'), 'landscape timeline should be short enough for the actor viewport');
assert(block.includes('body.phone-controls.critique-mode.sheet-clips #clipPanel.open'), 'landscape clip sheet should have a bounded overlay');
assert(block.includes('bottom: calc(max(6px, env(safe-area-inset-bottom)) + min(34vh, 210px) + 6px);'), 'clip sheet should stay above the compact transport');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['critique-landscape-layout', 'compact-transport', 'bounded-clip-sheet'] }, null, 2));
