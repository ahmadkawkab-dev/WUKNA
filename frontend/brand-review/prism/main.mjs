import '../../src/styles/fonts.css';
import '../../src/styles/tokens.css';
import '../../src/styles/brand.css';
import './preview.css';
import { brandFaces } from '../../src/assets/brand/geometry.ts';
import { curatedPalettes } from '../../src/theme/curatedPalettes.ts';
import { duration, faceIds, backFaces, frameAt, pathsAt, phaseAt } from './motion.mjs';

const svg = document.getElementById('prism-mark');
svg.classList.add('wk-brand-mark');
const paths = faceIds.map(id => {
  const p=document.createElementNS('http://www.w3.org/2000/svg','path');
  p.dataset.brandFace=id; svg.append(p); return p;
});
const backs = backFaces.map(({id}) => {
  const p=document.createElementNS('http://www.w3.org/2000/svg','path');
  p.dataset.brandBack=id; p.setAttribute('visibility','hidden'); svg.append(p); return p;
});
const theme=document.getElementById('theme'), palette=document.getElementById('palette');
for(const item of curatedPalettes) { const option=document.createElement('option'); option.value=item.id; option.textContent=item.name; palette.append(option); }
function applyTheme() {
  document.documentElement.dataset.theme=theme.value;
  document.documentElement.removeAttribute('style');
  const selected=curatedPalettes.find(item=>item.id===palette.value);
  if(selected) for(const [name,value] of Object.entries(selected[theme.value])) document.documentElement.style.setProperty(name,value);
}
theme.addEventListener('change',applyTheme); palette.addEventListener('change',applyTheme); applyTheme();
const play=document.getElementById('play'), replay=document.getElementById('replay'), timeline=document.getElementById('timeline'), reduce=document.getElementById('reduce'), phase=document.getElementById('phase');
timeline.max=String(duration);
const media=matchMedia('(prefers-reduced-motion: reduce)');
let playing=true, time=0, last=null, request=0;
const reduced=()=>reduce.checked||media.matches;
function render(value) {
  time=value;
  const geometry=frameAt(reduced()?0:time);
  paths.forEach((path,i)=>{
    path.setAttribute('d',reduced()?brandFaces[i].path:geometry.paths[i]);
    path.setAttribute('visibility',geometry.visible[i]?'visible':'hidden');
  });
  backs.forEach((path,i)=>{
    path.setAttribute('d',geometry.back[i].path);
    path.setAttribute('visibility',geometry.back[i].visible?'visible':'hidden');
  });
  timeline.value=String(reduced()?0:time%duration);
  phase.textContent=reduced()?'Static W':phaseAt(time);
}
function controls() {
  play.disabled=reduced(); replay.disabled=reduced(); timeline.disabled=reduced();
  play.textContent=reduced()?'Static':playing?'Pause':'Play';
  play.setAttribute('aria-pressed',String(playing&&!reduced()));
}
function tick(now) { request=0; if(!playing||reduced()||document.hidden)return; if(last!==null)time=(time+Math.min(now-last,100))%duration; last=now; render(time); request=requestAnimationFrame(tick); }
function sync() { if(request)cancelAnimationFrame(request); request=0; last=null; controls(); render(time); if(playing&&!reduced()&&!document.hidden)request=requestAnimationFrame(tick); }
play.addEventListener('click',()=>{playing=!playing;sync();});
replay.addEventListener('click',()=>{time=0;playing=true;sync();});
timeline.addEventListener('input',()=>{playing=false;time=Number(timeline.value);sync();});
reduce.addEventListener('change',sync); media.addEventListener('change',sync); document.addEventListener('visibilitychange',sync);
// Deterministic seeking for exported previews and visual verification only.
globalThis.prismPreview={duration,seek(value){playing=false;time=value;sync();},play(){playing=true;sync();},pathsAt};
sync();
if(import.meta.hot)import.meta.hot.dispose(()=>{if(request)cancelAnimationFrame(request);media.removeEventListener('change',sync);document.removeEventListener('visibilitychange',sync);delete globalThis.prismPreview;});
