import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8');
}

const manifest = JSON.parse(read('authoring/meshy_saber/manifest.json'));
const script = read('authoring/meshy_saber/blender_build_meshy_ready_authoring.py');
const readme = read('authoring/meshy_saber/README.md');
const workflow = read('docs/BLENDER_FIRST_MESHY_SABER_WORKFLOW.md');
const orientation = read('PROJECT_ORIENTATION.md');
const assetManifest = read('assets/asset_manifest.json');
const gitignore = read('.gitignore');
const workbench = read('tools/meshy_saber_blender_workbench.mjs');

assert(manifest.schema === 'pose-lab-blender-authoring-lane-v1', 'Blender authoring manifest schema drifted');
assert(manifest.authority === 'local headless Blender review artifacts plus human approval', 'Blender manifest must make local headless review plus approval authoritative');
assert(manifest.status === 'scaffolded-no-approved-export', 'Blender lane must not pretend an approved export exists yet');
assert(manifest.blender?.preferredHost === 'local-terminal', 'Blender lane should prefer the local terminal runner');
assert(manifest.blender?.runner === 'tools/meshy_saber_blender_workbench.mjs', 'Blender lane should name the terminal workbench runner');
assert(manifest.sourceAssets?.meshyAnimatedRig?.endsWith('Animation_Walking_withSkin.glb'), 'manifest should point at the animated Meshy rig');
assert(manifest.sourceAssets?.fpsReference === 'assets/models/FPSPlayer.glb', 'manifest should point at FPSPlayer reference');
assert(manifest.sourceAssets?.meshySabre?.includes('meshy_sabre'), 'manifest should point at Meshy sabre');
assert(JSON.stringify(manifest.requiredHierarchy) === JSON.stringify(['RightHand', 'WeaponGrip', 'Meshy French Revolution Sabre']), 'manifest hierarchy must stay boring FK');

assert(script.includes('ensure_weapon_grip'), 'Blender script must create a WeaponGrip');
assert(script.includes('grip.parent_type = "BONE"') && script.includes('grip.parent_bone = "RightHand"'), 'WeaponGrip must parent to RightHand bone in Blender');
assert(script.includes('parent_sabre_to_grip') && script.includes('sabre.parent = grip'), 'Blender script must parent sabre below WeaponGrip');
assert(script.includes('pose-lab-blender-meshy-saber-contract-v1'), 'Blender script must export a stable contract schema');
assert(script.includes('requires-human-visual-approval'), 'Blender export must remain candidate until human approval');
assert(script.includes('--render-dir'), 'Blender script must support headless render artifact generation');
assert(script.includes('meshy_saber_tpose.png') && script.includes('meshy_saber_ready.png'), 'Blender script must render T-pose and Ready review images');
assert(script.includes('meshy_saber_contact_sheet.html'), 'Blender script must write a contact sheet artifact');

assert(workbench.includes('LOCAL_BLENDER_UNAVAILABLE'), 'workbench must report missing local Blender explicitly');
assert(workbench.includes('HEADLESS_BLENDER_ARTIFACTS_WRITTEN'), 'workbench must report successful headless artifact generation');
assert(workbench.includes('authoring/meshy_saber/exports/headless_review'), 'workbench must default to the ignored headless review output directory');

assert(readme.includes('Blender is the local terminal visual authoring/render surface'), 'README must state local terminal Blender authority');
assert(workflow.includes('Pose Lab is no longer the authoring surface for Meshy saber placement'), 'workflow doc must demote Pose Lab authoring');
assert(workflow.includes('Use terminal-runnable local Blender first'), 'workflow doc must forbid remote-first Blender assumptions');
assert(workflow.includes('It must not retarget, solve, run `WeaponR` parity, or tune offsets'), 'workflow doc must forbid old solver/tuning loop on import');
assert(orientation.includes('Blender-First Meshy Saber Recovery'), 'orientation must advertise the Blender-first recovery lane');
assert(orientation.includes('tools/meshy_saber_blender_workbench.mjs --probe --json'), 'orientation must document the local Blender probe');
assert(assetManifest.includes('meshy_saber_blender_authoring_lane'), 'asset manifest must register the Blender authoring lane');
assert(assetManifest.includes('Local terminal Blender is the preferred authoring/render surface'), 'asset manifest must not point the Meshy saber lane at Cauldron as preferred host');
assert(gitignore.includes('/authoring/meshy_saber/exports/'), 'generated Blender exports must be ignored until promoted');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['blender-authoring-lane', 'local-headless-runner', 'boring-fk-hierarchy', 'human-approval-required', 'generated-exports-ignored'],
  authority: manifest.authority,
  status: manifest.status,
}, null, 2));
