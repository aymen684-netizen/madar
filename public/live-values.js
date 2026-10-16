(function(root){'use strict';
const previous=new WeakMap(),metrics=new WeakMap();
function text(node,value){if(!node)return;value=String(value??'');if(previous.get(node)===value)return;previous.set(node,value);node.textContent=value}
function render(host,values,description){let rows=metrics.get(host);if(!rows||rows[0]?.row.parentNode!==host||rows.length!==values.length||values.some(([label],i)=>rows[i].label!==label)){rows=values.map(([label])=>{const row=document.createElement('div'),name=document.createElement('span'),value=document.createElement('b');row.className='metric';name.textContent=label;const note=description?.(label);if(note)name.title=note;row.append(name,value);return{label,row,value}});host.replaceChildren(...rows.map(r=>r.row));metrics.set(host,rows)}for(let i=0;i<values.length;i++)text(rows[i].value,values[i][1])}
root.LiveValues={text,render};
})(window);
