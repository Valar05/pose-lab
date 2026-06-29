import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const indexHtml = fs.readFileSync(path.join(projectRoot, 'index.html'), 'utf8');
const poseLabHtml = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const critiqueHtml = fs.readFileSync(path.join(projectRoot, 'pose-critique.html'), 'utf8');
const poseLabJs = fs.readFileSync(path.join(projectRoot, 'src/pose-lab.js'), 'utf8');

assert(indexHtml.includes('url=pose-lab.html'), 'index redirect should point at pose-lab entry');
assert(indexHtml.includes('href="pose-lab.html"'), 'index link should point at pose-lab entry');
assert(poseLabHtml.includes('<title>Pose Critique</title>'), 'pose-lab title should read critique-first by default');
assert(poseLabHtml.includes('<strong>Pose Critique</strong>'), 'pose-lab header should read critique-first by default');
assert(poseLabHtml.includes('id="playerTransport"'), 'pose-lab should expose a persistent player transport');
assert(poseLabHtml.includes('id="cleanupTimelineCanvas"'), 'pose-lab should expose the bare player timeline');
assert(poseLabHtml.includes('id="critiqueDock"'), 'critique drawer should exist');
assert(poseLabHtml.includes('class="critique-dock exclusive-accordion"'), 'critique controls should live in an exclusive accordion');
assert(poseLabHtml.includes('Correct Pose'), 'critique drawer should expose the pose correction action');
assert(poseLabHtml.includes('New Key'), 'critique drawer should expose the key promotion action');
assert(poseLabHtml.includes('Critique</button>'), 'critique drawer should expose the critique save action');
assert(critiqueHtml.includes('pose-lab.html?mode=critique&actor=ares'), 'critique redirect should open Ares critique mode');
assert(critiqueHtml.includes('cacheBust=pose-editor-99'), 'critique redirect should bypass stale browser cache');
assert(poseLabHtml.includes('http-equiv="Cache-Control"'), 'pose-lab entry should discourage stale browser HTML cache');
assert(critiqueHtml.includes('http-equiv="Cache-Control"'), 'critique alias should discourage stale browser HTML cache');
assert(poseLabJs.includes("const STATUS_PREFIX = LAB_MODE === 'critique' ? 'critique' : 'lab';"), 'status prefix should distinguish critique mode');
assert(poseLabJs.includes("document.title = this.labMode === 'critique' ? 'Pose Critique' : 'Pose Lab';"), 'critique mode title should be set in JS');
assert(poseLabJs.includes("document.body.classList.toggle('critique-mode'"), 'critique body class should be present');
assert(poseLabJs.includes("cleanupTimelineCanvas: document.getElementById('cleanupTimelineCanvas')"), 'transport timeline canvas should be wired');
assert(poseLabJs.includes("critiqueDock: document.getElementById('critiqueDock')"), 'critique dock should be wired');
assert(poseLabJs.includes('CRITIQUE_STEP_FPS'), 'step FPS constant should exist');
assert(poseLabJs.includes('CRITIQUE_LIVE_FPS'), 'live FPS constant should exist');
assert(poseLabJs.includes("UI.readout.textContent = 'view=' + this.viewMode +"), 'info panel readout should stay parseable');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['index', 'pose-lab', 'pose-critique', 'js'] }, null, 2));
