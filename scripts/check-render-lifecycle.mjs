import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const code=fs.readFileSync('public/render-lifecycle.js','utf8');
function setup(withObserver=true){const events=new Map(),tasks=[],calls=[];let observer;
 const doc={hidden:false,addEventListener:(n,f)=>events.set('doc:'+n,f),removeEventListener:n=>events.delete('doc:'+n)};
 const root={document:doc,innerWidth:1000,innerHeight:800,queueMicrotask:f=>tasks.push(f),addEventListener:(n,f)=>events.set(n,f),removeEventListener:n=>events.delete(n)};
 if(withObserver)root.IntersectionObserver=class{constructor(f){this.callback=f;observer=this}observe(el){this.el=el}disconnect(){this.disconnected=true}};
 vm.createContext(root);vm.runInContext(code,root);let rect={top:10,bottom:500,left:10,right:500,width:490,height:490};const el={getBoundingClientRect:()=>rect};
 const renderer={pauseAnimation:()=>calls.push('pause'),resumeAnimation:()=>calls.push('resume')};let resumes=0;
 const dispose=root.RenderLifecycle.attach(renderer,el,()=>resumes++),flush=()=>{while(tasks.length)tasks.shift()()};
 return{root,doc,calls,el,dispose,events,flush,get resumes(){return resumes},get observer(){return observer},rect:r=>{rect={...rect,...r}},emit:()=>observer.callback([{target:el,isIntersecting:false,intersectionRatio:0}])};
}
const s=setup();assert(s.root.RenderLifecycle.sceneActive());s.flush();assert.equal(s.resumes,1);s.emit();assert(!s.root.RenderLifecycle.sceneActive());assert.equal(s.calls.at(-1),'pause');
s.doc.hidden=true;s.events.get('doc:visibilitychange')();assert(!s.root.RenderLifecycle.pageActive());assert(!s.root.RenderLifecycle.sceneActive());s.doc.hidden=false;s.rect({top:900,bottom:1390});s.events.get('doc:visibilitychange')();s.flush();assert.equal(s.resumes,2,'returning to a page refreshes UI even if the scene remains offscreen');assert(!s.root.RenderLifecycle.sceneActive());
s.rect({top:10,bottom:500});s.events.get('resize')();assert(s.root.RenderLifecycle.sceneActive());s.flush();assert.equal(s.resumes,3);
s.emit();s.rect({top:10,bottom:500});s.events.get('resize')();s.dispose();s.flush();assert.equal(s.resumes,3,'disposed queued resume must not update the old renderer');assert(s.observer.disconnected);assert.equal(s.events.size,0);
const fallback=setup(false);fallback.flush();fallback.rect({top:-600,bottom:-110});fallback.events.get('scroll')();assert(!fallback.root.RenderLifecycle.sceneActive());fallback.rect({top:10,bottom:500});fallback.events.get('scroll')();fallback.flush();assert(fallback.root.RenderLifecycle.sceneActive());assert.equal(fallback.resumes,2);fallback.dispose();
console.log('PASS: visibility and intersection pause/resume, UI refresh offscreen, scroll fallback, cleanup and no stale resume callback');
