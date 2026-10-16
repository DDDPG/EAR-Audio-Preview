import {estimateAlignment} from '../operator.mjs';
const x=new Float32Array(48000);let seed=7;
for(let i=1;i<x.length;i+=32){seed=(Math.imul(seed,1664525)+1013904223)>>>0;x[i]=seed/4294967296-.5;}
console.log(JSON.stringify({expected:'Identical nonconstant broadband pulse sequences should align at 0 with high confidence',actual:estimateAlignment([x],[x.slice()],48000)}));
