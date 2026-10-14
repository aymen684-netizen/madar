import fs from 'node:fs';import {CSP,SECURITY_HEADERS} from '../security/headers.js';
const path=new URL('../public/index.html',import.meta.url),html=fs.readFileSync(path,'utf8');
if(!html.includes('http-equiv="Content-Security-Policy"'))throw Error('CSP meta missing');
fs.writeFileSync(path,html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]*(">)/,'$1'+CSP+'$2'));
fs.writeFileSync(new URL('../public/_headers',import.meta.url),'/*\n'+Object.entries(SECURITY_HEADERS).map(([k,v])=>'  '+k+': '+v).join('\n')+'\n');
