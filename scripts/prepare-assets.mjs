import fs from 'node:fs';import path from 'node:path';const data=fs.readFileSync(new URL('../public/assets/flags.bundle.zip',import.meta.url));const root=new URL('../public/assets/flags/',import.meta.url);let at=0,count=0;while(at+30<data.length&&data.readUInt32LE(at)===0x04034b50){const method=data.readUInt16LE(at+8),size=data.readUInt32LE(at+18),nameLength=data.readUInt16LE(at+26),extra=data.readUInt16LE(at+28),name=data.subarray(at+30,at+30+nameLength).toString();if(method!==0||!/^[a-z]{2}\.png$/.test(name))throw Error('Invalid flag bundle entry');const start=at+30+nameLength+extra;fs.mkdirSync(root,{recursive:true});fs.writeFileSync(new URL(name,root),data.subarray(start,start+size));at=start+size;count++;}if(count!==235)throw Error('Incomplete flags');console.log('Prepared',count,'country flags');

const stars=Buffer.concat(["stars.part00", "stars.part01", "stars.part02", "stars.part03", "stars.part04"].map(name=>fs.readFileSync(new URL('../public/assets/'+name,import.meta.url))));fs.writeFileSync(new URL('../public/assets/stars.png',import.meta.url),stars);console.log('Prepared star texture');

const {gunzipSync}=await import('node:zlib');const {createHash}=await import('node:crypto');for(const entry of JSON.parse(fs.readFileSync(new URL('../packed/manifest.json',import.meta.url)))){const zipped=Buffer.concat(entry.parts.map(name=>fs.readFileSync(new URL('../'+name,import.meta.url))));const restored=gunzipSync(zipped);if(createHash('sha256').update(restored).digest('hex')!==entry.sha256)throw Error('Packed asset checksum mismatch');const target=new URL('../'+entry.target,import.meta.url);fs.mkdirSync(new URL('.',target),{recursive:true});fs.writeFileSync(target,restored);}console.log('Prepared orbital data and vendor libraries');

// Keep full source fields available on demand, without parsing them on startup.
const metadataPath=new URL('../public/data/satellite-metadata.json',import.meta.url);
const metadataBytes=fs.readFileSync(metadataPath),metadata=JSON.parse(metadataBytes);
const summary={...metadata,sourceDetailsDeferred:true,sourceSha256:createHash('sha256').update(metadataBytes).digest('hex'),satellites:Object.fromEntries(Object.entries(metadata.satellites).map(([id,{catalog,...identity}])=>[id,identity]))};
fs.writeFileSync(new URL('../public/data/satellite-metadata-summary.json',import.meta.url),JSON.stringify(summary));
console.log('Prepared compact identity catalog; full source fields load on demand');

// A fixed list of public resources; user input is never an allowed URL parameter.
const {ORBIT_GROUPS}=await import('../worker/orbit-groups.js');
function publicFiles(dir,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?publicFiles(path.join(dir,e.name),prefix+e.name+'/'):[prefix+e.name])}
const {fileURLToPath}=await import('node:url');
const files=[...new Set([...publicFiles(fileURLToPath(new URL('../public',import.meta.url))), 'data/mission-profiles.json','network-resources.js'])].sort();
fs.writeFileSync(new URL('../public/network-resources.js',import.meta.url),'globalThis.MadarNetworkResources='+JSON.stringify({files,groups:[...ORBIT_GROUPS]})+';\n');
