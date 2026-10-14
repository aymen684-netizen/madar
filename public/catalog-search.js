(function(root){'use strict';
function normalize(value){return String(value??'').normalize('NFKC').toLowerCase().replace(/[٠-٩]/g,c=>String(c.charCodeAt(0)-1632)).replace(/[۰-۹]/g,c=>String(c.charCodeAt(0)-1776)).replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/[\s_‐‑‒–—−-]+/g,' ').trim()}
function compile(query){const tokens=normalize(query).split(' ').filter(t=>t&&!['norad','id'].includes(t));return (o,metadata={})=>{const text=normalize([o.name,o.id,o.omm?.OBJECT_ID,metadata.catalogName,metadata.program].filter(Boolean).join(' '));return tokens.every(t=>text.includes(t))}}
const api={normalize,compile};if(typeof module!=='undefined')module.exports=api;else root.CatalogSearch=api;
})(typeof window!=='undefined'?window:globalThis);
