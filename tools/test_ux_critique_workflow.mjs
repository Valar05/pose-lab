import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(projectRoot, 'pose-lab.html'), 'utf8');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const css = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.css'), 'utf8');
const workflow = fs.readFileSync(path.join(projectRoot, 'docs', 'ANIMATION_WORKFLOW_TOOLING.md'), 'utf8');
const skill = fs.readFileSync(path.join('/storage/emulated/0/Documents/GodotProjects/.codex/skills/ux-critique-workflow/SKILL.md'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(skill.includes('single-open accordions'), 'skill should require single-open accordions');
assert(skill.includes('Keep the primary transport visible without scrolling.'), 'skill should require visible transport');
assert(skill.includes('Use bottom sheets for secondary controls on phones'), 'skill should require phone bottom sheets');
assert(workflow.includes('## Phone-First Control Layout'), 'workflow doc should describe phone-first controls');
assert(workflow.includes('bare player timeline'), 'workflow doc should describe the bare player timeline contract');
assert(html.includes('id="playerTransport"'), 'pose-lab should expose a persistent player transport');
assert(html.includes('id="cleanupTimelineCanvas"'), 'transport should expose the visible timeline');
assert(html.includes('id="critiqueDock"'), 'critique drawer should exist');
assert(html.includes('class="critique-dock exclusive-accordion"'), 'critique drawer should be a compact exclusive accordion');
assert(html.includes('Correct Pose'), 'critique drawer should expose the pose correction action');
assert(html.includes('New Key'), 'critique drawer should expose the key-promotion action');
assert(html.includes('Compare'), 'critique drawer should expose compare');
assert(html.includes('Critique</button>'), 'critique drawer should expose the critique-save action');
assert(html.includes('class="tool-dock"'), 'phone layout should expose a compact tool dock');
for (const panel of ['clips', 'pose', 'edit', 'bones', 'advanced', 'view', 'none']) {
  assert(html.includes(`data-panel="${panel}"`), `tool dock should include ${panel}`);
}
assert(js.includes("document.body.classList.toggle('phone-controls', true)"), 'critique UI should opt into phone controls');
assert(js.includes("const fallbackPanel = this.labMode === 'critique' ? 'none'"), 'critique startup should not force cleanup open');
assert(js.includes('activeSheet:'), 'state persistence should include the active sheet');
assert(js.includes('openCorrectPose()'), 'critique drawer should open the pose correction panel');
assert(js.includes('critiquePromoteCurrentFrame()'), 'critique drawer should promote a frame to key status');
assert(js.includes('critiqueToggleCompare()'), 'critique drawer should support compare mode');
assert(js.includes('critiqueCompareState = null'), 'compare state should be tracked and cleared');
assert(js.includes('panelElementName(panel)'), 'sheet state should map to underlying panels');
assert(css.includes('phone-controls-1.0'), 'phone-control CSS block should be present');
assert(css.includes('mobile-readout-recovery-1.0'), 'mobile readout recovery CSS block should be present');
assert(css.includes('body.phone-controls.critique-mode #playerTransport'), 'transport rail should be positioned by phone CSS');
assert(css.includes('body.phone-controls.critique-mode #cleanupTimelineCanvas'), 'critique timeline should remain visible');
assert(css.includes('body.phone-controls.critique-mode #critiqueDock'), 'critique drawer should be styled as a collapse window');
assert(css.includes('body.phone-controls.critique-mode .player-transport-row') && css.includes('grid-template-columns: repeat(4, minmax(0, 1fr));'), 'critique transport should keep Clips on the main rail instead of wrapping to a second line');
assert(css.includes(`body.phone-controls.critique-mode #poseEditDock:not([open]) {
  display: none !important;
}`), 'pose editor should stay hidden until explicitly opened');
assert(css.includes('body.phone-controls.critique-mode #cleanupPanel.open') && css.includes('body.phone-controls.critique-mode:not(.has-open-panel) #cleanupPanel'), 'cleanup/readout sheets should open on demand and close fully when no panel is active');
assert(css.includes('body.phone-controls.critique-mode #actorTabs') && css.includes('display: flex !important;'), 'actor tabs should remain visible in critique mode');
assert(!css.includes('body.phone-controls.critique-mode #actorTabs,\nbody.phone-controls.critique-mode #viewTabs,\nbody.phone-controls.critique-mode #panelTabs'), 'old bare-player hide selector should not remain');
assert(css.includes('body.phone-controls.critique-mode #viewTabs') && css.includes('display: flex !important;'), 'Orbit/FPV controls should remain visible in critique mode');
assert(css.includes('body.phone-controls.critique-mode #panelTabs') && css.includes('display: grid !important;'), 'tool dock with Hide should remain visible in critique mode');
assert(css.includes('button[data-panel="none"]'), 'Hide button should have an explicit mobile close affordance');
assert(!css.includes('body.critique-mode #cleanupPanel { display: block !important; max-height: calc(100vh - 132px); }'), 'old full-screen cleanup force-open rule should not remain');
assert(js.includes('primeExclusiveAccordionState()'), 'startup should prime the accordion state');
assert(js.includes('details.open = false;'), 'critique startup should close stale accordion state');
assert(js.includes("document.querySelectorAll('details.exclusive-accordion')"), 'exclusive accordion behavior should be wired');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['ux-skill', 'transport', 'accordion-startup'] }, null, 2));
