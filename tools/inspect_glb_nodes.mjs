#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function shim(){globalThis.ProgressEvent ||= class ProgressEvent{constructor(type,init={}){this.type=type;Object.assign(this,init)}};globalThis.window||={innerWidth:1024,innerHeight:768,devicePixelRatio:1};globalThis.self||=globalThis;globalThis.document||={createElementNS(ns,name){const listeners=new Map();return{nodeName:name,style:{},width:1,height:1,addEventListener(t,f){listeners.set(t,f)},removeEventListener(t){listeners.delete(t)},set src(v){this._src=v;setTimeout(()=>listeners.get('load')?.({type:'load'}),0)},get src(){return this._src||''}}}};globalThis.createImageBitmap ||= async()=>({width:1,height:1,close(){}})}
function threeDir(){const sandbox=path.join(os.tmpdir(),'pose-lab-three-node');const dir=path.join(sandbox,'node_modules','three');if(!fs.existsSync(path.join(dir,'build','three.module.js'))){fs.rmSync(sandbox,{recursive:true,force:true});fs.mkdirSync(path.dirname(dir),{recursive:true});execFileSync('cp',['-R',path.join(projectRoot,'vendor','three'),dir]);}return dir;}
function arrayBuffer(file){const b=fs.readFileSync(file);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}
shim();
const file=path.isAbsolute(process.argv[2]||'')?process.argv[2]:path.join(projectRoot,process.argv[2]||'assets/models/FPSPlayer.glb');
const dir=threeDir();
const {GLTFLoader}=await import(pathToFileURL(path.join(dir,'examples/jsm/loaders/GLTFLoader.js')));
const gltf=await new Promise((resolve,reject)=>new GLTFLoader().parse(arrayBuffer(file),path.dirname(file)+path.sep,resolve,reject));
const bones=[]; const meshes=[]; const materials=[];
gltf.scene.traverse((node)=>{ if(node.isBone) bones.push(node.name); if(node.isMesh||node.isSkinnedMesh) meshes.push({name:node.name,isSkinned:!!node.isSkinnedMesh, material:Array.isArray(node.material)?node.material.map(m=>m?.name):node.material?.name}); });
gltf.scene.traverse((node)=>{ if(node.material){ for(const m of (Array.isArray(node.material)?node.material:[node.material])) if(m&&!materials.includes(m.name)) materials.push(m.name); }});
console.log(JSON.stringify({file:path.relative(projectRoot,file), bones, meshes, materials, animations:(gltf.animations||[]).map(a=>a.name)},null,2));
