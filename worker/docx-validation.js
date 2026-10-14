// Validate ZIP metadata without extracting or executing any uploaded content.
export function validDocx(bytes){
 try{const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),n=bytes.length;if(n<100||n>8388608)return false;
 let end=-1;for(let i=n-22;i>=Math.max(0,n-65557);i--)if(v.getUint32(i,true)===0x06054b50&&i+22+v.getUint16(i+20,true)===n){end=i;break}
 if(end<0||v.getUint16(end+4,true)||v.getUint16(end+6,true))return false;
 const count=v.getUint16(end+10,true),length=v.getUint32(end+12,true),start=v.getUint32(end+16,true);
 if(count<3||count>4096||count!==v.getUint16(end+8,true)||start+length!==end)return false;
 const names=new Set(),ranges=[];let at=start,total=0;
 for(let i=0;i<count;i++){
  if(at+46>end||v.getUint32(at,true)!==0x02014b50)return false;
  const flags=v.getUint16(at+8,true),method=v.getUint16(at+10,true),compressed=v.getUint32(at+20,true),size=v.getUint32(at+24,true),nameLength=v.getUint16(at+28,true),extra=v.getUint16(at+30,true),comment=v.getUint16(at+32,true),offset=v.getUint32(at+42,true);
  if(flags&1||![0,8].includes(method)||v.getUint16(at+34,true)||!nameLength||at+46+nameLength+extra+comment>end)return false;
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at+46,at+46+nameLength));
  if(names.has(name)||name.startsWith('/')||name.includes('\\')||name.split('/').some(p=>p==='..'||p==='.')||/[\u0000-\u001f:]/.test(name)||/vba|activex|embeddings/i.test(name)||/\.(?:bin|exe|js|html|docm)$/i.test(name))return false;
  names.add(name);total+=size;if(total>67108864||offset+30>start||v.getUint32(offset,true)!==0x04034b50)return false;
  const localNameLength=v.getUint16(offset+26,true),localExtra=v.getUint16(offset+28,true),dataStart=offset+30+localNameLength+localExtra;
  if(v.getUint16(offset+6,true)!==flags||v.getUint16(offset+8,true)!==method||dataStart+compressed>start||localNameLength!==nameLength)return false;
  if(!bytes.subarray(offset+30,offset+30+localNameLength).every((b,j)=>b===bytes[at+46+j]))return false;
  if(!(flags&8)&&(v.getUint32(offset+18,true)!==compressed||v.getUint32(offset+22,true)!==size))return false;
  ranges.push([offset,dataStart+compressed]);at+=46+nameLength+extra+comment;
 }
 ranges.sort((a,b)=>a[0]-b[0]);if(ranges.some((r,i)=>i&&r[0]<ranges[i-1][1]))return false;
 return at===end&&names.has('[Content_Types].xml')&&names.has('_rels/.rels')&&names.has('word/document.xml');
 }catch{return false}
}
