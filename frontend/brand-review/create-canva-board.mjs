import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const runtimeModules=process.env.RUNTIME_NODE_MODULES || '/home/_zaha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {Presentation,PresentationFile}=await import(`${runtimeModules}/@oai/artifact-tool/dist/artifact_tool.mjs`);
import {folds,treatments,silhouette,lettering} from './design-data.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dir=process.env.WUKNA_BRAND_BUILD_DIR || `/tmp/wukna-brand-build-${Date.now()}`;
await fs.mkdir(dir,{recursive:true});
const p=Presentation.create({slideSize:{width:1280,height:720}});
const light={bg:'#f6f6f3',surface:'#ffffff',ink:'#171815',muted:'#63665f',primary:'#486653',border:'#dedfd9'};
const dark={bg:'#171b18',surface:'#202620',ink:'#f5f6f2',muted:'#b2bbb1',primary:'#a5c0aa',border:'#3e4b40'};
function rect(s,x,y,w,h,fill,line='none'){return s.shapes.add({geometry:'rect',position:{left:x,top:y,width:w,height:h},fill,line:{fill:line,width:line==='none'?0:1}})}
function text(s,str,x,y,w,h,size=22,color=light.ink,font='Inter',bold=false){const t=s.shapes.add({geometry:'textbox',position:{left:x,top:y,width:w,height:h},fill:'none',line:{fill:'none',width:0}});t.text=str;t.text.style={typeface:font,fontSize:size,color,bold,verticalAlignment:'middle',insets:0};t.text.insets=0;return t;}
function base(title,note='',theme=light){const s=p.slides.add();s.background.fill=theme.bg;text(s,title,64,46,1152,58,42,theme.ink,'Inter');if(note)text(s,note,64,110,1140,42,20,theme.muted);return s;}
function parsePath(d,ox=90,oy=150){const a=d.match(/[MLCQHVZ]|-?\d+(?:\.\d+)?(?:e-?\d+)?/g);let i=0,c='',x=0,y=0,out=[];const n=()=>Number(a[i++]);while(i<a.length){if(/[A-Z]/.test(a[i]))c=a[i++];if(c==='M'||c==='L'){x=n();y=n();const pt={x:x-ox,y:y-oy};out.push(c==='M'?{moveTo:pt}:{lineTo:pt});if(c==='M')c='L';}else if(c==='H'){x=n();out.push({lineTo:{x:x-ox,y:y-oy}});}else if(c==='V'){y=n();out.push({lineTo:{x:x-ox,y:y-oy}});}else if(c==='Q'){const x1=n()-ox,y1=n()-oy;x=n();y=n();out.push({quadBezTo:{x1,y1,x:x-ox,y:y-oy}});}else if(c==='C'){const x1=n()-ox,y1=n()-oy,x2=n()-ox,y2=n()-oy;x=n();y=n();out.push({cubicBezTo:{x1,y1,x2,y2,x:x-ox,y:y-oy}});}else if(c==='Z'){out.push({close:{}});c='';}else throw Error(c)}return out;}
function mark(s,x,y,w,colors=treatments.primary,{offsets={},opacity=1}={}){if(!Object.keys(offsets).length)s.shapes.add({geometry:"custom",name:"Canonical W silhouette",position:{left:x,top:y,width:w,height:w*300/425},fill:colors[0],line:{fill:"none",width:0},customPaths:[{width:425,height:300,commands:parsePath(silhouette)}]});folds.forEach((f,i)=>{const off=offsets[f.group]??[0,0];s.shapes.add({geometry:'custom',name:`Wukna ${f.id}`,position:{left:x+off[0],top:y+off[1],width:w,height:w*300/425},fill:colors[i],line:{fill:'none',width:0},customPaths:[{width:425,height:300,commands:parsePath(f.d)}]});});}
function labelMark(s,name,x,y,w,colors,bg=light.surface){rect(s,x,y,w,170,bg);mark(s,x+(w-155)/2,y+28,155,colors);text(s,name,x,y+185,w,40,20);}
const outlines=JSON.parse(await fs.readFile(`${root}/frontend/brand-review/assets/wordmark-outlines.json`,'utf8'));
function word(s,x,y,size=64,color=light.ink,font='Instrument Sans'){const rec=outlines[font==='Source Sans 3'?'humanist':'instrument'];const [ox,oy,w,h]=rec.viewBox;rec.glyphs.forEach((d,i)=>s.shapes.add({geometry:'custom',name:`wukna wordmark glyph ${i+1}`,position:{left:x,top:y+size*.2,width:w*size/rec.fontSize,height:h*size/rec.fontSize},fill:color,line:{fill:'none',width:0},customPaths:[{width:w,height:h,commands:parsePath(d,ox,oy)}]}));}
function customWord(s,x,y,w,color=light.ink){for(const d of lettering)s.shapes.add({geometry:'custom',name:'Custom wordmark editable letter',position:{left:x,top:y,width:w,height:w*64/282},fill:color,line:{fill:'none',width:0},customPaths:[{width:282,height:64,commands:parsePath(d,0,0)}]});}
// 1 Reference and source geometry.
let s=base('Wukna brand exploration','Approved reference and editable fold reconstruction. All treatments await visual approval.');
const bytes=await fs.readFile(`${root}/frontend/brand-review/reference/canva-original.png`);
s.images.add({blob:bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),contentType:'image/png',alt:'Unchanged approved Canva logo reference',position:{left:64,top:180,width:390,height:390},fit:'contain'});
mark(s,645,235,450,treatments.reference);text(s,'Approved original',64,594,390,38,22);text(s,'Editable geometry / flat color study',610,594,570,38,22);text(s,'Reconstruction from Canva raster evidence. Rounded tips and eight faces remain independently editable.',610,637,570,46,18,light.muted);
// 2 directions.
s=base('Three design directions','Recommended: Gathered Moss for everyday interfaces, with restrained assembly motion.');
const directions=[['Gathered Moss',treatments.primary,'Instrument Sans','Simple theme-aware color. Quiet, familiar, and strongest at small sizes.'],['Tonal Folds',treatments.tonal,'Instrument Sans','Coordinated shades expose the folds. Use at 48 px and larger.'],['Fold Lettering',treatments.primary,null,'Angular letter details add character. More small-size refinement before adoption.']];
directions.forEach(([name,colors,font,copy],i)=>{const x=64+i*390;mark(s,x+50,205,230,colors);if(font)word(s,x+58,390,52,light.ink,font);else customWord(s,x+40,397,290);text(s,name,x,490,340,38,27);text(s,copy,x,543,340,95,21,light.muted);});
// 3 palette.
s=base('Actual application colors','Source: frontend/src/styles/tokens.css. Fixed brand exports use the baseline palette.');
const tokens=[['Light primary','#486653'],['Dark primary','#a5c0aa'],['Light canvas','#f6f6f3'],['Dark canvas','#171b18'],['Light ink','#171815'],['Dark ink','#f5f6f2'],['Canopy pigment','#152019'],['Moss pigment','#95a582'],['Sky identity','#406c82'],['Berry identity','#85526b'],['Light surface','#ffffff'],['Dark surface','#202620']];
tokens.forEach(([name,color],i)=>{const x=64+(i%4)*294,y=180+Math.floor(i/4)*151;rect(s,x,y,256,72,color,light.border);text(s,name,x,y+80,256,28,20);text(s,color.toUpperCase(),x,y+112,256,24,18,light.muted);});text(s,'User-selected palettes override semantic tokens. Primary in the application should follow the resolved --primary.',64,654,1152,34,19,light.muted);
// 4 light comparisons.
s=base('Light theme comparison','A single color preserves the W at small sizes. High contrast uses the existing foreground token.');
[['Primary',treatments.primary],['Monochrome black',treatments.black],['High contrast',treatments.contrastLight],['Tonal folds',treatments.tonal],['Sky accent',Array(8).fill('#406c82')],['Berry accent',Array(8).fill('#85526b')]].forEach(([name,c],i)=>labelMark(s,name,64+(i%3)*390,180+Math.floor(i/3)*245,350,c));
// 5 dark comparisons.
s=base('Dark theme comparison','Use --primary or --foreground on the actual dark canvas and surface.',dark);
[['Primary',treatments.dark],['Monochrome white',treatments.white],['High contrast',treatments.contrastDark],['Tonal folds',treatments.tonalDark]].forEach(([name,c],i)=>{const x=64+(i%2)*600,y=175+Math.floor(i/2)*250;rect(s,x,y,552,180,dark.surface);mark(s,x+180,y+28,185,c);text(s,name,x,y+185,552,38,22,dark.ink)});
// 6 typography.
s=base('Wordmark typography','Lowercase wukna. Optical spacing and open counters carry the wordmark.');
word(s,90,185,88);text(s,'A / Soft geometric',615,205,580,40,27);text(s,'Instrument Sans 600. Already self-hosted in Wukna. Recommended.',615,257,570,70,22,light.muted);
word(s,90,350,88,light.ink,'Source Sans 3');text(s,'B / Contemporary humanist',615,367,580,40,27);text(s,'Source Sans 3. More conversational letter rhythm. Additional font approval required.',615,420,570,76,22,light.muted);
customWord(s,90,536,400);text(s,'C / Custom fold lettering',615,535,580,40,27);text(s,'Angular w and k. Single-storey a. A lettering study that needs refinement at small sizes.',615,588,570,76,22,light.muted);
// 7 lockups.
s=base('Logo lockups','Clear space H/4. Symbol-to-wordmark gap H/3. H is the visible symbol height.');
mark(s,80,202,185);word(s,305,235,58);text(s,'Horizontal / 32 px minimum symbol height',80,375,490,40,21,light.muted);
mark(s,810,180,150);word(s,822,302,32);text(s,'Stacked / 48 px minimum symbol height',665,375,550,40,21,light.muted);
mark(s,80,475,120);text(s,'Standalone symbol / 16 px square slot',80,594,290,76,21,light.muted);word(s,470,500,50);text(s,'Wordmark only / 16 px visible glyph height',425,594,425,76,21,light.muted);
rect(s,920,475,290,78,light.surface,light.border);mark(s,935,499,34);word(s,981,495,24);text(s,'Compact header / 24 px symbol height',905,579,315,74,21,light.muted);
// 8 sizes.
s=base('Icon sizes and optical alignment','Square icon slots preserve the original aspect ratio. Use monochrome below 32 px.');
[16,24,32,48,64,128].forEach((n,i)=>{const x=90+i*185;rect(s,x,255,n,n,light.surface);mark(s,x,255+(n-n*300/425)/2,n);text(s,`${n} px`,x-10,426,150,40,24)});
text(s,'Minimums',64,535,450,42,28);text(s,'16 px standalone monochrome slot. 24 px compact header height. 32 px horizontal lockup height. 48 px tonal or stacked height.',64,590,700,75,22,light.muted);
text(s,'Shared fold center',900,530,300,42,28);text(s,'Align the visible silhouette optically. Do not stretch it to fill the square.',900,587,300,88,22,light.muted);
// 9 application mockups.
s=base('Application studies','Verified theme surfaces. Navigation order follows Wukna’s standing product rule.');
function mock(x,y,t){rect(s,x,y,552,423,t.bg,t.border);rect(s,x,y,165,423,t.surface);mark(s,x+18,y+22,40,t===dark?treatments.dark:treatments.primary);word(s,x+70,y+21,23,t.ink);['Home','Boards','Library','Week','Calendar','Quick tasks','Templates','Notifications'].forEach((name,i)=>{if(name==='Boards')rect(s,x+10,y+90+i*29,145,26,t===dark?'#324739':'#e3ece5');text(s,name,x+20,y+92+i*29,142,24,16,t.ink)});text(s,'Storage / 1 GB',x+20,y+334,142,30,14,t.muted);text(s,'Your workspace',x+188,y+31,320,28,16,t.muted);text(s,'Boards',x+188,y+76,320,48,34,t.ink);text(s,'A place to gather what matters.',x+188,y+132,340,50,18,t.muted);rect(s,x+188,y+213,332,124,t.surface,t.border);text(s,'Ideas for a new season',x+204,y+230,305,35,20,t.ink);text(s,'Notes, tasks, and a little room to think.',x+204,y+275,290,50,16,t.muted);}
mock(64,194,light);mock(664,194,dark);text(s,'Library follows Boards. Notifications stays last. Storage appears directly below as a separate workspace utility.',64,650,1152,39,19,light.muted);
// 10 launch storyboard.
s=base('Application launch storyboard','1,600 ms signature. App readiness never waits for the animation.');
const frames=[['0 ms','Separate panels'],['280 ms','Panels align'],['1,000 ms','W settles'],['1,400 ms','Wordmark reveal'],['1,600 ms','Complete']];frames.forEach(([time,title],i)=>{const x=64+i*237;mark(s,x+27,232,175,treatments.primary,{offsets:i===0?{0:[-9,8],1:[9,8],2:[0,8]}:i===1?{0:[-4,4],1:[4,4]}:{}});if(i>=3)word(s,x+47,370,29);text(s,time,x,465,215,40,26);text(s,title,x,517,215,54,21,light.muted)});text(s,'Panels assemble over 720 ms with 140 ms offsets. Wordmark reveals at 1,000 ms over 400 ms. Ease: cubic-bezier(.2,.7,.2,1).',64,626,1152,61,20,light.muted);
// 11 loading/welcome/onboarding.
s=base('Loading, welcome, and onboarding','Calm transitions stop when the relevant state finishes. Reduced motion always shows the final static state.');
mark(s,115,225,175);text(s,'Loading / 1,200 ms',64,390,350,40,28);text(s,'Sequential panel emphasis. Keep opacity between .6 and 1. Stop on readiness. Retain a stable status label.',64,451,350,140,22,light.muted);
mark(s,505,225,175);text(s,'Welcome / 640 ms',454,390,350,40,28);text(s,'Reveal once for login, Google OAuth, registration, or session restoration. Never gate authentication or routing.',454,451,350,140,22,light.muted);
mark(s,895,225,175);text(s,'Onboarding / 1,200 ms',844,390,350,40,28);text(s,'Assemble once when adding the first workspace item. Keep empty states still until the user acts.',844,451,350,140,22,light.muted);
// 12 transitions/feedback.
s=base('Workspace transitions and feedback','The fold metaphor belongs to the action. Routine navigation keeps the logo still.');
mark(s,95,205,105);word(s,225,210,34);rect(s,95,310,460,16,'#e3ece5');rect(s,95,352,320,16,'#e3ece5');rect(s,95,394,460,16,'#e3ece5');text(s,'Navigation / 180 ms',64,493,520,40,28);text(s,'Opening boards, major sections, Library, Journal, and returning Home use one small content reveal. No full-logo replay.',64,550,520,95,22,light.muted);
mark(s,765,226,150);text(s,'Saved to your workspace',697,387,490,55,29);text(s,'Success / 450 ms',665,493,550,40,28);text(s,'A 3 px lower-fold settle beside a clear label. Apply to save, board creation, organization, task completion, invitations, and sharing.',665,550,550,95,22,light.muted);
// 13 guidelines.
s=base('Usage guidelines','Keep the silhouette stable and the experience ready.');
text(s,'Use',64,196,500,42,32);text(s,'Original aspect ratio\nClear space around the mark\nOne-color icons below 32 px\nA static reduced-motion alternative\nA persistent accessible loading label\nTransform and opacity for motion',64,260,525,309,25,light.ink);
text(s,'Avoid',665,196,500,42,32);text(s,'Stretched or clipped geometry\nDecorative outlines and shadows\nPale moss on a light surface\nRepeated launch motion on routes\nMinimum loading or auth delays\nBrand animation for every action',665,260,525,309,25,light.ink);
text(s,'Production candidates: native SVG and React + CSS or Web Animations API. Canva storyboards are design evidence. GIF and MP4 are preview formats.',64,628,1152,63,20,light.muted);
// 14 approval.
s=base('Review decisions','Approve geometry first, then choose color, lettering, and motion.');
mark(s,90,228,310);word(s,460,247,86);text(s,'Recommended',64,495,300,42,28);text(s,'Gathered Moss. Instrument Sans 600. One-color small icons. Tonal folds for larger brand moments. A 1,600 ms launch and 1,200 ms loading study.',64,552,1150,89,25,light.muted);
for(const [i,slide] of p.slides.items.entries()){
 slide.speakerNotes.text='Source logo: https://www.canva.com/design/DAHXurKIW_A/BS53ujNLW1SkX3ZlK56Xug/edit. Repository color source: frontend/src/styles/tokens.css. Typography reference: https://github.com/adobe-fonts/source-sans. Motion implementation research: https://react.dev/reference/react/useEffect, https://developer.mozilla.org/en-US/docs/Web/API/Element/animate, https://web.dev/articles/animations-guide, https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html. All work is an exploration pending approval.';
 await fs.writeFile(`${dir}/slide-${String(i+1).padStart(2,'0')}.png`,new Uint8Array(await (await p.export({slide,format:'png',scale:1})).arrayBuffer()));
}
const candidate=`${dir}/candidate.pptx`;await(await PresentationFile.exportPptx(p)).save(candidate);
process.env.RUNTIME_NODE_MODULES=runtimeModules;
const skill='/home/_zaha/.codex/plugins/cache/openai-primary-runtime/presentations/26.1011.11113/skills/presentations';
const {finalizePresentation}=await import(`${skill}/container_tools/artifact_tool_utils.mjs`);
await fs.mkdir(`${dir}/output`,{recursive:true});
await finalizePresentation({workspaceDir:dir,candidatePath:candidate,finalPath:`${dir}/output/wukna-brand-exploration-v3.pptx`,pythonExecutable:'/home/_zaha/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3',integrityValidatorPath:`${skill}/container_tools/inspect_presentation_package_integrity.py`,layoutValidatorPath:`${skill}/container_tools/inspect_presentation_layout_geometry.py`,layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-heading-fit'],fontPolicy:{basis:'design',families:['Inter','Instrument Sans','Source Sans 3']},verifyArtifactToolImport:true,receiptPath:`${dir}/validation-v3.json`});
console.log(JSON.stringify({pages:p.slides.items.length,path:`${dir}/output/wukna-brand-exploration-v3.pptx`}));
