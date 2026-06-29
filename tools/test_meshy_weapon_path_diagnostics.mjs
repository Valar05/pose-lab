import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('weaponPathMetrics: metrics'), 'SABRE clips should carry weaponPathMetrics');
assert(js.includes('sourceGripTravel') && js.includes('sourceTipTravel'), 'diagnostics should record source grip and tip travel');
assert(js.includes('targetGripTravel') && js.includes('targetTipTravel'), 'diagnostics should record target grip and tip travel');
assert(js.includes('targetSourceGripTravelRatio') && js.includes('targetSourceTipTravelRatio'), 'diagnostics should record normalized target/source travel ratios');
assert(js.includes('targetGripZTravel') && js.includes('targetTipZTravel'), 'diagnostics should record target Z-depth travel so planar hand motion cannot pass');
assert(js.includes('targetBladeLeverLength'), 'diagnostics should record target blade lever length so hand-scale collapsed tips cannot pass');
assert(js.includes('authoredSabrePoint') && js.includes('makeBodyCutFrame'), 'diagnostics should include authored up-right/depth/down-left cut geometry');
assert(js.includes('maxReachClampRatio') && js.includes('reachClampSamples'), 'diagnostics should report IK reach clamping');
assert(js.includes("schema: 'pose-lab-weapon-path-debug-v1'"), 'debug arc schema should be explicit');
assert(js.includes('debugTargetTipLocalPoints.push(compactPoint(targetTipLocal))'), 'debug arc should sample target blade-tip local points');
assert(js.includes('debugTargetGripLocalPoints.push(compactPoint(targetGripLocal))'), 'debug arc should sample target hand local points');
assert(js.includes('vectorTravel(sourceGripPoints)') && js.includes('vectorTravel(targetTipPoints)'), 'travel metrics should be computed from sampled runtime points');
assert(!profiles.includes("clipTag: 'SABRE'"), 'Meshy active profile should not generate the rejected SABRE diagnostic clip');
assert(profiles.includes('debugArcColor: 0x42e9ff'), 'Meshy proxy should configure a visible cyan debug arc');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['weapon-path-metrics-helper-retained', 'active-meshy-sabre-diagnostic-removed', 'reach-clamp-diagnostics'] }, null, 2));
