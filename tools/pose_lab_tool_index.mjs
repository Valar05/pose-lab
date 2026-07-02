#!/usr/bin/env node
const groups = [
  {
    id: 'case-evidence',
    title: 'Case And Evidence Front Doors',
    tools: [
      {
        command: 'node tools/pose_lab_case.mjs list',
        proves: 'Lists active named cases and their ownership families.',
        doesNotProve: 'Does not run any visual verifier.',
        status: 'current',
      },
      {
        command: 'node tools/pose_lab_case.mjs verify --case <id>',
        proves: 'Writes route, artifact status, checks, and verdict for one named case.',
        doesNotProve: 'Does not run heavy render/capture checks unless the case marks them default or --run-checks is used.',
        status: 'current',
      },
      {
        command: 'node tools/pose_lab_doctor.mjs --json',
        proves: 'Summarizes workflow health, case verdicts, stale visual evidence, manifest status, and server status.',
        doesNotProve: 'Does not fix red cases.',
        status: 'current',
      },
    ],
  },
  {
    id: 'weapon-fk',
    title: 'Weapon FK And Meshy Sword',
    tools: [
      {
        command: 'node tools/pose_lab_offline_render.mjs --assert-fixed',
        proves: 'Offline Meshy pose/weapon render can satisfy hilt pinning, hilt displacement, and blade-basis checks.',
        doesNotProve: 'Does not prove live browser capture is fresh.',
        status: 'current',
      },
      {
        command: 'node tools/test_weapon_fk_attachment_contract.mjs',
        proves: 'Weapon FK attachment contract wiring is protected.',
        doesNotProve: 'Does not inspect a live browser screenshot.',
        status: 'current',
      },
      {
        command: 'node tools/test_manual_weapon_placement_lock.mjs',
        proves: 'Manual weapon placement cannot be overwritten by diagnostics or promotion logic.',
        doesNotProve: 'Does not determine whether the current visual evidence is fresh.',
        status: 'current',
      },
    ],
  },
  {
    id: 'meshy-fps-retarget',
    title: 'Meshy/FPS Retarget And Roll Contracts',
    tools: [
      {
        command: 'node tools/pose_lab_workflow_status.mjs',
        proves: 'Accepted baseline and promotion gate status.',
        doesNotProve: 'Does not visually accept a candidate.',
        status: 'current',
      },
      {
        command: 'node tools/test_meshy_fps_ready_relation_audit.mjs',
        proves: 'Ready relation audit logic is valid.',
        doesNotProve: 'Does not replace promotion evidence.',
        status: 'current',
      },
      {
        command: 'node tools/meshy_ready_pose_workbench.mjs',
        proves: 'Can generate candidate-only FPS reference artifacts.',
        doesNotProve: 'Does not promote those candidates.',
        status: 'current',
      },
    ],
  },
  {
    id: 'visual-truth',
    title: 'Visual Truth, Red Builds, And Cache',
    tools: [
      {
        command: 'node tools/test_pose_lab_visual_red_build_contract.mjs',
        proves: 'Current offline pose-render evidence matches served cache token and required accepted Meshy saber evidence.',
        doesNotProve: 'Does not create fresh evidence by itself.',
        status: 'current',
      },
      {
        command: 'node tools/test_no_cache_server_contract.mjs',
        proves: 'No-cache server contract is wired.',
        doesNotProve: 'Does not prove a browser tab is on the intended actor and clip.',
        status: 'current',
      },
      {
        command: 'node tools/refresh_pose_lab_offline_visual_evidence.mjs',
        proves: 'Rebuilds the canonical Meshy saber offline visual evidence artifact.',
        doesNotProve: 'Does not prove source correctness without the contract checks.',
        status: 'current',
      },
      {
        command: 'node tools/pose_lab_weapon_visual_follow.mjs',
        proves: 'Diagnostic debug-bridge weapon follow evidence when the bridge and browser are healthy.',
        doesNotProve: 'Accepted Meshy saber visual truth.',
        status: 'deprecated for Meshy saber acceptance',
      },
      {
        command: 'node tools/refresh_meshy_saber_visual_parity.mjs --skip-visual-follow',
        proves: 'Legacy offline/live divergence classification.',
        doesNotProve: 'Accepted Meshy saber visual truth.',
        status: 'deprecated for Meshy saber acceptance',
      },
    ],
  },
  {
    id: 'generated-hygiene',
    title: 'Generated Artifact Hygiene',
    tools: [
      {
        command: 'node tools/catalog_generated_artifacts.mjs --out generated/artifact_manifest.json',
        proves: 'Current generated tree classification into keep/review/delete.',
        doesNotProve: 'Does not inspect image content.',
        status: 'current',
      },
      {
        command: 'node tools/review_generated_artifact_manifest.mjs',
        proves: 'Mining summary, recurring problem families, and no-delete review log.',
        doesNotProve: 'Does not delete unless --delete-marked is supplied.',
        status: 'current',
      },
    ],
  },
  {
    id: 'pose-critique',
    title: 'Pose Critique And Attack Iteration',
    tools: [
      {
        command: 'python3 tools/render_poseclip_stickframes.py',
        proves: 'Stickframe visual packet can be rendered for pose critique.',
        doesNotProve: 'Does not judge live Three.js runtime correctness.',
        status: 'current',
      },
      {
        command: 'python3 tools/measure_poseclip_world_metrics.py',
        proves: 'World-metric pose analysis can run for poseclip data.',
        doesNotProve: 'Does not replace visual appeal review.',
        status: 'current',
      },
    ],
  },
  {
    id: 'legacy-or-specialized',
    title: 'Legacy Or Specialized Diagnostics',
    tools: [
      {
        command: 'tools/*workspace*.mjs, tools/*audit*.mjs, tools/*debug*.mjs',
        proves: 'Specific historical diagnostic surfaces remain available.',
        doesNotProve: 'Should not be used as first-line evidence unless routed by a case.',
        status: 'legacy-use-through-case',
      },
    ],
  },
];

function parseArgs(argv) {
  return { json: argv.includes('--json') };
}

function renderMarkdown() {
  const lines = ['# Pose Lab Tool Index', ''];
  for (const group of groups) {
    lines.push(`## ${group.title}`);
    lines.push('');
    for (const tool of group.tools) {
      lines.push(`### \`${tool.command}\``);
      lines.push('');
      lines.push(`- Status: ${tool.status}`);
      lines.push(`- Proves: ${tool.proves}`);
      lines.push(`- Does not prove: ${tool.doesNotProve}`);
      lines.push('');
    }
  }
  return `${lines.join('\n')}\n`;
}

const args = parseArgs(process.argv);
if (args.json) {
  console.log(JSON.stringify({ schema: 'pose-lab-tool-index-v1', groups }, null, 2));
} else {
  console.log(renderMarkdown());
}
