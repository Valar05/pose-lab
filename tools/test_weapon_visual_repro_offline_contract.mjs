import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(projectRoot, 'tools', 'pose_lab_weapon_visual_repro_offline.mjs'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(source.includes('pose-lab-offline-weapon-visual-repro-v1'), 'offline reproducer should write a stable visual repro schema');
assert(source.includes('productionBehaviorModified: false') && source.includes('diagnosticOnly: true'), 'offline reproducer must be diagnostic-only');
assert(source.includes('assertFixed: false') && source.includes("--assert-fixed"), 'offline reproducer should support an explicit fixed-mode assertion');
assert(source.includes('defaultClip =') && source.includes('OneHandReady -> meshyCharacter [FPS-VISUAL-IK R-120 L-90]'), 'offline reproducer must default to the screenshot ready clip');
assert(source.includes('defaultScreenshot') && source.includes('Screenshot_20260630-203420.png'), 'offline reproducer must default to the newest screenshot target');
assert(source.includes('rendered Meshy sabre handle and blade still sit visibly wrong'), 'offline reproducer should describe the newest mesh-placement failure, not the older overlay-only failure');
assert(source.includes('fitToHeight(THREE, meshy.scene, config.actor.targetHeight)'), 'offline reproducer should apply the same Meshy target-height fitting rule');
assert(source.includes('attachRuntimeWeapon(THREE, meshy.scene, sabre.scene, config)'), 'offline reproducer should recreate the runtime weapon hierarchy');
assert(source.includes("displayRoot.scale.set(") && source.includes('socketWorldScale'), 'offline reproducer should include display-root scale compensation');
assert(source.includes('fallbackStart') && source.includes('fallbackEnd') && source.includes('hideFallbackOnAttachment=false'), 'offline reproducer should include the visible cyan fallback blade rule');
assert(source.includes('fallbackEnd.position.copy(tip.position)') && source.includes('fallbackAlignedToTip'), 'offline reproducer fixed mode should require cyan fallback endpoint to follow configured WeaponGrip_end');
assert(source.includes('materialSource') && source.includes('Meshy static full-PBR GLB'), 'offline reproducer should record the Meshy material/visual-layer rule');
assert(source.includes('visual_repro.png') && source.includes('visual_repro.json') && source.includes('visual_repro_summary.md'), 'offline reproducer should write PNG, JSON, and summary artifacts');
assert(source.includes('screenshotCyanMetrics') && source.includes('cyan_metrics'), 'offline reproducer should inspect the screenshot cyan fallback/debug blade');
assert(source.includes('reproducesProblem') && source.includes('expectedVisibleState') && source.includes('actualVisibleRead'), 'offline reproducer should assert the visual problem, not just write telemetry');
assert(source.includes('fixedPass') && source.includes('if (args.assertFixed)'), 'offline reproducer should fail fixed-mode runs until the fixed visible geometry is present');
assert(!source.includes('weapon visual-follow probe'), 'offline reproducer must not use the rejected probe command');
assert(!source.includes('src/rig-profiles.js\', \'w') && !source.includes('writeFileSync(path.join(projectRoot, \'src\''), 'offline reproducer must not write production profile/runtime files');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: [
    'offline-visual-repro-schema',
    'diagnostic-only',
    'newest-screenshot-default',
    'ready-clip-default',
    'runtime-weapon-hierarchy',
    'fallback-blade-visible',
    'fallback-end-follows-tip-fixed-assertion',
    'screenshot-side-by-side-artifacts',
  ],
}, null, 2));
