import { StrictMode, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { coordinatedPalettes } from '../src/theme/coordinatedPalettes';
// @ts-expect-error Review-only JS geometry also powers the editable Canva import.
import { folds, treatments, viewBox, silhouette, lettering } from './design-data.mjs';
import './review.css';

type Fold = {id:string; group:number; d:string};
type Mode = 'launch'|'loading'|'welcome'|'navigation'|'success'|'onboarding';
const concepts: Record<Mode,{label:string;duration:number;copy:string}> = {
  launch:{label:'Application launch',duration:1600,copy:'Panels gather, settle, then reveal the wordmark. Readiness stays independent.'},
  loading:{label:'Loading',duration:1200,copy:'A quiet fold emphasis while work is pending. Stop immediately when ready.'},
  welcome:{label:'Authentication welcome',duration:640,copy:'One reveal per welcome event. Local login, OAuth, registration, and restoration share it.'},
  navigation:{label:'Workspace transition',duration:180,copy:'A small content reveal uses the existing panel timing. Keep the logo still.'},
  success:{label:'Success feedback',duration:450,copy:'A local fold settles beside a persistent confirmation. Suitable for save, create, organize, complete, and share.'},
  onboarding:{label:'Empty workspace',duration:1200,copy:'The panels assemble once as the workspace gains its first item. At rest afterward.'},
};
function Symbol({colors,className='',motion=false}:{colors:string[];className?:string;motion?:boolean}) {
  return <svg className={`symbol ${className}`} viewBox={viewBox} aria-hidden="true" focusable="false">
    <path data-silhouette={motion ? '' : undefined} d={silhouette} fill={colors[0]}/>
    {[0,1,2].map(group=><g data-panel={group} key={group}>{(folds as Fold[]).map((f,i)=>f.group===group?<path key={f.id} d={f.d} fill={colors[i]}/>:null)}</g>)}
  </svg>;
}
function Lettering() {
  return <svg className="custom-lettering" viewBox="0 0 282 64" role="img" aria-label="wukna custom lettering study">
    <g fill="currentColor">{(lettering as string[]).map((d,i)=><path key={i} d={d}/>)}</g>
  </svg>;
}
function MotionStage({mode,colors,play,replay,reduce}:{mode:Mode;colors:string[];play:boolean;replay:number;reduce:boolean}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const root=ref.current;
    if(!root||!play||reduce)return;
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    if(media.matches)return;
    const animations:Animation[]=[];
    const panels=[...root.querySelectorAll<SVGGElement>('[data-panel]')];
    const backing=root.querySelector<SVGPathElement>('[data-silhouette]')!;
    const ease='cubic-bezier(.2,.7,.2,1)';
    const add=(el:Element,frames:Keyframe[],options:KeyframeAnimationOptions)=>animations.push(el.animate(frames,options));
    if(mode==='launch'||mode==='onboarding') {
      add(backing,[{opacity:0},{opacity:1}],{duration:1,delay:1000,fill:'backwards'});
      panels.forEach((el,i)=>add(el,[{transform:`translate(${(i-1)*12}px, 12px) rotate(${(i-1)*3}deg)`,opacity:0},{transform:'none',opacity:1}],{duration:720,delay:i*140,easing:ease,fill:'backwards'}));
      const word=root.querySelector('.stage-word');
      if(word)add(word,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:400,delay:mode==='launch'?1000:800,easing:ease,fill:'backwards'});
    } else if(mode==='loading') {
      backing.style.opacity='0';
      panels.forEach((el,i)=>add(el,[{opacity:1},{opacity:.6,offset:.35},{opacity:1,offset:.7},{opacity:1}],{duration:1200,delay:i*120,iterations:Infinity,easing:'ease-in-out'}));
    } else if(mode==='welcome') {
      add(root.querySelector('.stage-lockup')!,[{opacity:0,transform:'translateY(6px)'},{opacity:1,transform:'none'}],{duration:640,easing:ease});
    } else if(mode==='navigation') {
      add(root.querySelector('.workspace-content')!,[{opacity:0,transform:'translateY(4px)'},{opacity:1,transform:'none'}],{duration:180,easing:'cubic-bezier(0,0,.2,1)'});
    } else {
      add(backing,[{opacity:0},{opacity:1}],{duration:1,delay:450,fill:'backwards'});
      add(panels[2],[{transform:'translateY(0)'},{transform:'translateY(-3px)',offset:.35},{transform:'translateY(0)'}],{duration:450,easing:ease});
    }
    const cancel=()=>{animations.forEach(animation=>animation.cancel());backing.style.opacity='';};
    const onPreference=()=>{if(media.matches)cancel();};
    const onVisibility=()=>{if(document.hidden)cancel();};
    media.addEventListener('change',onPreference);
    document.addEventListener('visibilitychange',onVisibility);
    return ()=>{cancel();media.removeEventListener('change',onPreference);document.removeEventListener('visibilitychange',onVisibility);};
  },[mode,play,replay,reduce]);
  return <div className={`motion-stage mode-${mode}`} ref={ref}>
    <div className="stage-lockup"><Symbol colors={colors} motion/><span className="stage-word">wukna</span></div>
    <div className="workspace-content"><span className="sample-line"/><span className="sample-line short"/><span className="sample-line"/></div>
    <p role={mode==='loading'?'status':undefined} aria-live={mode==='success'?'polite':undefined}>{mode==='loading'?'Opening your workspace…':mode==='success'?'Saved to your workspace':mode==='onboarding'?'A space for your first idea':mode==='navigation'?'Your board is open':'A space that feels like yours.'}</p>
  </div>;
}
function Review(){
  const [dark,setDark]=useState(false),[palette,setPalette]=useState('original'),[variant,setVariant]=useState('primary');
  const [mode,setMode]=useState<Mode>('launch'),[play,setPlay]=useState(false),[replay,setReplay]=useState(0),[reduce,setReduce]=useState(false);
  const [systemReduce,setSystemReduce]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(()=>{const m=matchMedia('(prefers-reduced-motion: reduce)');const sync=()=>setSystemReduce(m.matches);m.addEventListener('change',sync);return()=>m.removeEventListener('change',sync);},[]);
  const custom=coordinatedPalettes.find(p=>p.id===palette);
  const tokens=custom?.[dark?'dark':'light'];
  const primary=tokens?.['--primary']??(dark?'#a5c0aa':'#486653');
  const colors=variant==='tonal'?treatments[dark?'tonalDark':'tonal']:variant==='contrast'?treatments[dark?'contrastDark':'contrastLight']:Array(8).fill(primary);
  return <main className={`review ${dark?'dark':''}`} style={tokens as React.CSSProperties}>
    <header className="review-header"><a href="#intro" className="header-brand"><Symbol colors={colors}/><span>wukna</span></a><span>Brand exploration / 01</span><button onClick={()=>setDark(!dark)} aria-pressed={dark}>{dark?'Light theme':'Dark theme'}</button></header>
    <section id="intro" className="intro"><p className="eyebrow">A personal workspace, folded together</p><h1>A familiar shape.<br/>A quieter identity.</h1><p className="intro-copy">Your approved folded W, reconstructed as editable geometry. Color, lettering, and motion studies for a space that feels like yours.</p><p className="review-note">Exploration for approval. Application branding remains unchanged.</p></section>
    <section className="hero-study"><div className="hero-mark"><Symbol colors={colors}/></div><div className="hero-description"><p className="eyebrow">Recommended / Gathered Moss</p><h2>One recognizable mark.<br/>Room for your own colors.</h2><p>Use the current theme’s primary color for everyday interfaces. Reserve coordinated folds for large brand moments.</p><label>Application palette<select value={palette} onChange={e=>setPalette(e.target.value)}><option value="original">Original moss</option>{coordinatedPalettes.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>Logo treatment<select value={variant} onChange={e=>setVariant(e.target.value)}><option value="primary">Primary monochrome</option><option value="tonal">Tonal folds</option><option value="contrast">High contrast</option></select></label></div></section>
    <section><div className="section-heading"><p className="eyebrow">01 / Source and construction</p><h2>The same W, with independent folds.</h2></div><div className="reference-grid"><figure><img src="./reference/canva-original.png" width="600" height="600" alt="Approved Canva logo with purple left folds, dark right folds and a turquoise foot"/><figcaption>Approved original / unchanged Canva reference</figcaption></figure><figure className="vector-reference"><Symbol colors={treatments.reference}/><figcaption>Editable reconstruction / flat color reference</figcaption></figure></div><p className="caption">Rounded outer tips, shared center, asymmetrical panels, and the lower return preserve the original construction. This is a trace from raster evidence; it needs your visual approval before becoming the master vector.</p></section>
    <section><div className="section-heading"><p className="eyebrow">02 / Color</p><h2>Clear on every surface.</h2></div><div className="color-grid">{[
      ['Current theme',colors,'var(--surface)'],['Light primary',treatments.primary,'#f6f6f3'],['Dark primary',treatments.dark,'#171b18'],['Monochrome black',treatments.black,'#ffffff'],['Monochrome white',treatments.white,'#171b18'],['Tonal folds',treatments.tonal,'#f6f6f3'],['High contrast',treatments.contrastLight,'#f6f6f3'],['Sky accent',Array(8).fill('#406c82'),'#f6f6f3'],['Berry accent',Array(8).fill('#85526b'),'#f6f6f3'],
    ].map(([name,c,bg])=><figure key={name as string}><div className="color-stage" style={{background:bg as string}}><Symbol colors={c as string[]}/></div><figcaption>{name as string}</figcaption></figure>)}</div><p className="caption">Sky and berry use existing collaborator tokens. Accent studies are secondary brand treatments, separate from collaborator identity.</p></section>
    <section><div className="section-heading"><p className="eyebrow">03 / Lettering</p><h2>Three ways to say wukna.</h2></div><div className="type-studies"><article><span className="type-number">A</span><div><p className="geometric word-study">wukna</p><h3>Soft geometric / Instrument Sans</h3><p>Welcoming curves and open counters. Already self-hosted. Recommended at weight 600.</p></div></article><article><span className="type-number">B</span><div><p className="humanist word-study">wukna</p><h3>Contemporary humanist / Source Sans 3</h3><p>A more conversational rhythm. Requires approval for an additional production font.</p></div></article><article><span className="type-number">C</span><div><Lettering/><h3>Fold lettering / custom study</h3><p>Angular w, diagonal k, and a single-storey a. Stronger character with more small-size validation.</p></div></article></div></section>
    <section><div className="section-heading"><p className="eyebrow">04 / Lockups</p><h2>Space around the mark matters.</h2></div><div className="lockup-grid"><figure className="horizontal-lockup"><Symbol colors={colors}/><span>wukna</span><figcaption>Horizontal / 32 px symbol minimum</figcaption></figure><figure className="stacked-lockup"><Symbol colors={colors}/><span>wukna</span><figcaption>Stacked / 48 px symbol minimum</figcaption></figure><figure className="standalone-lockup"><Symbol colors={colors}/><figcaption>Standalone / 16 px monochrome</figcaption></figure><figure className="word-only"><span>wukna</span><figcaption>Wordmark only / 16 px cap box minimum</figcaption></figure></div><div className="compact-header"><Symbol colors={colors}/><strong>wukna</strong><span>Your workspace</span></div><p className="caption">Let H be the visible symbol height. Leave H/4 clear space on every side and H/3 between symbol and wordmark. Compact header: 24 px symbol, 8 px gap, 20 px lettering.</p></section>
    <section><div className="section-heading"><p className="eyebrow">05 / Scale</p><h2>Recognition before detail.</h2></div><div className="size-study">{[16,24,32,48,64,128].map(n=><figure key={n}><div style={{width:n,height:n,display:'grid',placeItems:'center'}}><Symbol colors={colors}/></div><figcaption>{n} px</figcaption></figure>)}</div><p className="caption">Sizes refer to square icon slots. The W keeps its original aspect ratio. Below 32 px, use monochrome. The original folds join at the center and some tonal faces merge at small sizes.</p></section>
    <section><div className="section-heading"><p className="eyebrow">06 / Motion</p><h2>Fold together. Settle. Stay still.</h2></div><div className="motion-review"><div className="motion-controls"><label>Motion concept<select value={mode} onChange={e=>{setMode(e.target.value as Mode);setPlay(false);}}>{Object.entries(concepts).map(([id,c])=><option key={id} value={id}>{c.label}</option>)}</select></label><h3>{concepts[mode].duration} ms</h3><p>{concepts[mode].copy}</p><div className="control-row"><button onClick={()=>{setPlay(true);setReplay(n=>n+1);}}>Replay</button><button onClick={()=>setPlay(false)}>Stop</button></div><label className="check"><input type="checkbox" checked={reduce} onChange={e=>setReduce(e.target.checked)}/>Reduced motion preview</label><p className="caption">{systemReduce?'Your device requests reduced motion. The preview stays static.':'Motion starts only when you press Replay.'}</p><p className="caption">The workspace is ready immediately. This demo makes no authentication or API requests.</p></div><MotionStage mode={mode} colors={colors} play={play} replay={replay} reduce={reduce||systemReduce}/></div><div className="storyboard">{['0 ms / panels appear','280 ms / alignment','1,000 ms / W settles','1,400 ms / wordmark','1,600 ms / complete'].map((text,i)=><figure key={text}><Symbol colors={colors} className={`story-${i}`} motion={i<2}/>{i>2&&<span className="story-word">wukna</span>}<figcaption>{text}</figcaption></figure>)}</div></section>
    <section><div className="section-heading"><p className="eyebrow">07 / Application studies</p><h2>A calm place to work.</h2></div><div className="app-studies">{['light','dark'].map(theme=><div key={theme} className={`app-mock ${theme}`}><aside><div className="mock-brand"><Symbol colors={treatments[theme==='light'?'primary':'dark']}/><strong>wukna</strong></div>{['Home','Boards','Library','Week','Calendar','Quick tasks','Templates','Notifications'].map(name=><span key={name} className={name==='Boards'?'selected':''}>{name}</span>)}<span className="storage">Storage · 1 GB</span><div className="identity">Your personal workspace</div></aside><div className="mock-main"><p className="eyebrow">Your workspace</p><h3>Boards</h3><p>A place to gather what matters.</p><div className="mock-board">Ideas for a new season<span>Notes, tasks, and a little room to think.</span></div></div></div>)}</div><p className="caption">Application mockups use the verified default theme tokens. Library follows Boards. Notifications stays last, with storage directly below as a workspace utility.</p></section>
    <section className="guidelines"><div><p className="eyebrow">08 / Usage</p><h2>Keep it recognizable.</h2></div><div><h3>Use</h3><p>Original proportions. Quiet clear space. Solid color at small sizes. One welcome reveal. Static alternatives for reduced motion.</p><h3>Avoid</h3><p>Stretching the W. Decorative strokes or shadows. Low-contrast pale moss on white. Replaying the launch on every route. Waiting for motion before opening the workspace.</p></div></section>
    <footer>Wukna brand study / October 2026<span>Pending approval of vector geometry, color, wordmark, and motion.</span></footer>
  </main>;
}
export const reviewRoot = createRoot(document.getElementById('review-root')!);
reviewRoot.render(<StrictMode><Review/></StrictMode>);
