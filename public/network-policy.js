(function(root){'use strict';
const config=root.MadarNetworkResources,files=new Set(config.files),groups=new Set(config.groups),base=new URL('.',root.location.href),nativeFetch=root.fetch.bind(root),preference='madar-public-updates';let updates=true;
try{updates=root.localStorage.getItem(preference)!=='false'}catch{}
delete root.MadarNetworkResources;
function allowed(input,method='GET'){
 let u;try{u=new URL(input,base)}catch{return false}if(!['GET','HEAD'].includes(method.toUpperCase())||u.username||u.password||u.hash)return false;
 const entries=[...u.searchParams];
 if(u.origin===base.origin&&u.pathname.startsWith(base.pathname)){
  const path=u.pathname.slice(base.pathname.length);
  if(files.has(path))return entries.length===0||entries.length===1&&entries[0][0]==='v'&&/^\d{1,3}$/.test(entries[0][1]);
  if(u.pathname==='/api/orbits')return updates&&method.toUpperCase()==='GET'&&entries.length===1&&entries[0][0]==='group'&&groups.has(entries[0][1]);
 }
 return updates&&method.toUpperCase()==='GET'&&u.origin==='https://celestrak.org'&&u.pathname==='/NORAD/elements/gp.php'&&entries.length===2&&u.searchParams.getAll('GROUP').length===1&&groups.has(u.searchParams.get('GROUP'))&&u.searchParams.getAll('FORMAT').length===1&&u.searchParams.get('FORMAT')==='json';
}
root.fetch=function(input,options={}){const request=typeof input==='object'&&input!==null?input:null,url=request?.url||String(input),method=String(options.method||request?.method||'GET').toUpperCase();if(!allowed(url,method))return Promise.reject(new Error('منع وضع الخصوصية هذا الاتصال؛ تبقى بيانات العمل على الجهاز.'));return nativeFetch(new URL(url,base).href,{method,signal:options.signal||request?.signal,cache:options.cache||'default',redirect:'manual',credentials:'omit',referrerPolicy:'no-referrer'})};
function blocked(){throw new Error('هذا الاتصال غير متاح في وضع الخصوصية')}
if(root.XMLHttpRequest){const NativeXHR=root.XMLHttpRequest;root.XMLHttpRequest=function(){const xhr=new NativeXHR(),open=xhr.open.bind(xhr),send=xhr.send.bind(xhr),header=xhr.setRequestHeader.bind(xhr);let target='',verb='';xhr.open=(method,url,...rest)=>{verb=String(method).toUpperCase();target=new URL(url,base).href;if(!allowed(target,verb)||rest[1]!=null||rest[2]!=null)blocked();return open(verb,target,rest[0]!==false)};xhr.send=body=>{if(body!=null||!allowed(target,verb))blocked();xhr.withCredentials=false;return send(null)};xhr.setRequestHeader=(name,value)=>{if(String(name).toLowerCase()!=='accept'||!['*/*','application/json','text/plain','application/octet-stream'].includes(value))blocked();return header(name,value)};return xhr}}
for(const key of ['WebSocket','EventSource'])if(key in root)root[key]=blocked;
if(root.navigator?.sendBeacon)try{Object.defineProperty(root.navigator,'sendBeacon',{value:()=>false,configurable:false})}catch{}
root.addEventListener?.('storage',event=>{if(event.key===preference){updates=event.newValue!=='false';root.document?.dispatchEvent(new Event('madar-network-policy'))}});
root.NetworkPolicy={allowed,updatesEnabled:()=>updates,setUpdatesEnabled(value){updates=!!value;try{root.localStorage.setItem(preference,String(updates))}catch{}root.document?.dispatchEvent(new Event('madar-network-policy'))}};
})(typeof window!=='undefined'?window:globalThis);
