"""Import already downloaded official SATCAT CSV and active GP JSON; no network calls.
Usage: python scripts/update-source-snapshots.py SATCAT.csv ACTIVE.json
Source fetch times come from the input file modification times (UTC).
"""
import csv,datetime,gzip,hashlib,json,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
satcat,active=map(Path,sys.argv[1:])
def timestamp(p):return datetime.datetime.fromtimestamp(p.stat().st_mtime,datetime.timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
b=json.loads((root/'public/data/satellite-metadata.json').read_text());gp=json.loads(active.read_text());ids={str(r['NORAD_CAT_ID']) for r in gp}
assert len(ids)==len(gp)>10000 and all(0<int(i)<1000000000 for i in ids),'Invalid/duplicate or unexpectedly small GP catalog'
ids.update(b['satellites']);matched=set()
for row in csv.DictReader(satcat.open()):
    ident=row['NORAD_CAT_ID']
    if ident not in ids:continue
    old=b['satellites'].get(ident,{})
    old.update(owner=row['OWNER'],type=row['OBJECT_TYPE'],launch=row['LAUNCH_DATE'],catalog={k:v or None for k,v in row.items()})
    b['satellites'][ident]=old;matched.add(ident)
assert matched==ids,'Missing SATCAT identities; retain the previous snapshot'
b.update(retrieved=timestamp(satcat)[:10],catalogRetrievedAt=timestamp(satcat),catalogDocumentation='https://celestrak.org/satcat/satcat-format.php')
manifest=json.loads((root/'packed/manifest.json').read_text())
for target,obj in [('public/data/satellite-metadata.json',b),('public/data/active-omm.json',gp),('public/data/source-snapshot.json',{'source':'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json','retrievedAt':timestamp(active),'count':len(gp)})]:
    data=json.dumps(obj,ensure_ascii=False,separators=(',',':')).encode();(root/target).write_bytes(data)
    part='packed/'+Path(target).name+'.gz.part00';(root/part).write_bytes(gzip.compress(data,compresslevel=9,mtime=0))
    entry={'target':target,'parts':[part],'sha256':hashlib.sha256(data).hexdigest()}
    i=next((i for i,x in enumerate(manifest) if x['target']==target),None)
    if i is None:manifest.append(entry)
    else:manifest[i]=entry
(root/'packed/manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print('Imported',len(matched),'SATCAT identities and',len(gp),'active OMM records')
