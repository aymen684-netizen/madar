(function(root){'use strict';
let binding=null;
function pageActive(){return root.document.hidden!==true}
function sceneActive(){return pageActive()&&(!binding||binding.active===true)}
function attach(renderer,element,onResume){
 binding?.dispose();const item={renderer,element,active:null,page:pageActive(),intersect:true,disposed:false};binding=item;
 function bounds(){const r=element.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<root.innerHeight&&r.left<root.innerWidth}
 function sync(){if(item.disposed)return;const page=pageActive(),pageReturned=page&&!item.page,next=page&&item.intersect,changed=next!==item.active;item.page=page;if(changed){item.active=next;if(next)renderer.resumeAnimation?.();else renderer.pauseAnimation?.()}
  if(next&&changed||pageReturned)root.queueMicrotask(()=>{if(binding===item&&!item.disposed&&pageActive())onResume()});
 }
 function refresh(){item.intersect=bounds();sync()}
 const observer=typeof root.IntersectionObserver==='function'?new root.IntersectionObserver(entries=>{for(const entry of entries)if(entry.target===element){item.intersect=entry.isIntersecting;sync()}},{threshold:0}):null;
 root.document.addEventListener('visibilitychange',refresh);root.addEventListener('resize',refresh,{passive:true});root.addEventListener('pageshow',refresh);if(!observer)root.addEventListener('scroll',refresh,{passive:true});
 item.dispose=()=>{if(item.disposed)return;item.disposed=true;observer?.disconnect();root.document.removeEventListener('visibilitychange',refresh);root.removeEventListener('resize',refresh);root.removeEventListener('pageshow',refresh);if(!observer)root.removeEventListener('scroll',refresh);renderer.pauseAnimation?.();if(binding===item)binding=null};
 refresh();observer?.observe(element);return item.dispose;
}
root.RenderLifecycle={attach,pageActive,sceneActive,state:()=>({pageVisible:pageActive(),sceneVisible:binding?.intersect??true,rendering:sceneActive()})};
})(typeof window!=='undefined'?window:globalThis);
