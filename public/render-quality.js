(function(root){'use strict';
const preference='madar-render-quality',modes=new Set(['auto','economy','detail']);let mode='auto',renderer=null;
try{const saved=root.localStorage.getItem(preference);if(modes.has(saved))mode=saved}catch{}
function ratio(){const density=Number(root.devicePixelRatio)||1,cap=mode==='economy'?1:mode==='auto'&&root.innerWidth<=700?1.5:2;return Math.min(Math.max(1,density),cap)}
function apply(){const value=ratio();if(renderer&&renderer.getPixelRatio()!==value)renderer.setPixelRatio(value);const select=root.document.getElementById('render-quality'),status=root.document.getElementById('render-quality-status');if(select)select.value=mode;if(status){const text=mode==='economy'?'الوضع الحالي: توفير الطاقة.':mode==='detail'?'الوضع الحالي: تفاصيل أعلى.':root.innerWidth<=700?'الوضع الحالي: تلقائي للجوال.':'الوضع الحالي: تلقائي للشاشات الواسعة.';if(status.dataset.message!==text){status.dataset.message=text;status.textContent=text}}}
function setMode(value){if(!modes.has(value))return;mode=value;try{root.localStorage.setItem(preference,mode)}catch{}apply()}
function init(){const select=root.document.getElementById('render-quality');if(select)select.onchange=()=>setMode(select.value);apply()}
root.addEventListener('resize',apply,{passive:true});
root.addEventListener('storage',event=>{if(event.key===preference){mode=modes.has(event.newValue)?event.newValue:'auto';apply()}});
root.RenderQuality={attach(world){renderer=world.renderer();apply()},setMode,get mode(){return mode}};
if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})(window);
