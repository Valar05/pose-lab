#!/usr/bin/env node
import fs from 'fs';

const required=[
'pack_manifest.json',
'clip_inventory.json',
'rig_report.json',
'phase_candidates.json',
'timing_defaults.json'
];

const root=process.argv[2]||'generated/ingestion/sample_pack';
const missing=required.filter(f=>!fs.existsSync(`${root}/${f}`));

if(missing.length){
 console.error('INGESTION TEST RED');
 console.error('Missing:',missing.join(', '));
 process.exit(1);
}

console.log('INGESTION TEST GREEN');
