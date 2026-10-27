
const fmt = (v, kind='woba') => kind==='woba' ? Number(v).toFixed(3).replace(/^0/,'') : `${(v*100).toFixed(1)}%`;
function gridIndex(e,l,s,shape){return (e*shape[1]+l)*shape[2]+s;}
function interpolate(g,coords,metric='woba',minSupport=30){
  const cells=[];
  for(let k=0;k<3;k++){
    const a=g.axes[k],v=coords[k];
    if(!Number.isFinite(v)||v<a[0]||v>a.at(-1))return null;
    const x=(v-a[0])/(a[1]-a[0]);const lo=Math.min(a.length-2,Math.floor(x));cells.push([lo,x-lo]);
  }
  let value=0,minN=Infinity;
  for(let i=0;i<2;i++)for(let j=0;j<2;j++)for(let k=0;k<2;k++){
    const choices=[i,j,k];const w=choices.reduce((w,b,a)=>w*(b?cells[a][1]:1-cells[a][1]),1);
    if(w<1e-12)continue;
    const index=gridIndex(cells[0][0]+i,cells[1][0]+j,cells[2][0]+k,g.shape);
    if(g.support[index]<minSupport)return null;
    value+=w*g[metric][index];minN=Math.min(minN,g.support[index]);
  }
  return {value,support:minN};
}
function scenario(g,balls,delta,minSupport=30){
  let original=0,adjusted=0,n=0;
  for(const ball of balls){
    const base=interpolate(g,ball.slice(0,3),'woba',minSupport);
    const changed=interpolate(g,[ball[0]+delta,ball[1],ball[2]],'woba',minSupport);
    if(base&&changed){original+=base.value;adjusted+=changed.value;n++;}
  }
  return {n,total:balls.length,original:n?original/n:null,adjusted:n?adjusted/n:null,delta:n?(adjusted-original)/n:null};
}

const $=id=>document.getElementById(id), num=x=>Number(x).toLocaleString('en-US');
const state={metric:'hit',threshold:.5,minSupport:30,ev:100,player:null,yaw:0,pitch:.40,zoom:1,rotate:false,tab:'explore'};
let grid,players,report,cloud=[],projected=[],sliceBounds,drag=null,dirty=true;
const cv=$('space'),ctx=cv.getContext('2d'),sc=$('slice'),sx=sc.getContext('2d'),tip=$('tooltip');
const outcomes=['Out / No Hit','Single','Double','Triple','Home Run'];
const maxes={woba:2,hit:1,hr:1};
const stops=[[227,232,228],[145,183,168],[22,91,72]];
function color(v){const z=Math.max(0,Math.min(1,v/maxes[state.metric]))*2;const i=Math.min(1,Math.floor(z)),t=z-i;return `rgb(${stops[i].map((c,k)=>Math.round(c+(stops[i+1][k]-c)*t)).join(',')})`;}
function canvasSize(canvas){const r=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);if(canvas.width!==Math.round(r.width*dpr)||canvas.height!==Math.round(r.height*dpr)){canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);return [r.width,r.height];}
function point(ev,la,sp){const a=la*Math.PI/180,s=sp*Math.PI/180;return [ev*Math.cos(a)*Math.sin(s),ev*Math.sin(a),ev*Math.cos(a)*Math.cos(s)];}
let projectionFrame=null;
const selectedPoint={la:26,sp:-24};
function rotated(p){const [x,y,z]=p;const xx=x*Math.cos(state.yaw)+z*Math.sin(state.yaw),zz=z*Math.cos(state.yaw)-x*Math.sin(state.yaw);return [xx,y*Math.cos(state.pitch)+zz*Math.sin(state.pitch),zz*Math.cos(state.pitch)-y*Math.sin(state.pitch)];}
function prepareProjection(w,h){let envelope=[[0,0,0]];for(const la of [-40,0,40,70])for(const sp of [-50,0,50])envelope.push(point(136,la,sp));if(state.player)envelope.push(...state.player.balls.map(b=>point(...b)));const q=envelope.map(rotated),xs=q.map(p=>p[0]),ys=q.map(p=>p[1]);const loX=Math.min(...xs),hiX=Math.max(...xs),loY=Math.min(...ys),hiY=Math.max(...ys);projectionFrame={scale:Math.min((w-100)/Math.max(hiX-loX,1),(h-70)/Math.max(hiY-loY,1))*state.zoom,cx:w/2,cy:h/2,mx:(loX+hiX)/2,my:(loY+hiY)/2};}
function project(p,w,h){const q=rotated(p),f=projectionFrame;return [f.cx+(q[0]-f.mx)*f.scale,f.cy-(q[1]-f.my)*f.scale,q[2]];}
function line(points,w,h,stroke='#cdd7cf',dash=[]){ctx.beginPath();for(let i=0;i<points.length;i++){const p=project(points[i],w,h);i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]);}ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.setLineDash(dash);ctx.stroke();ctx.setLineDash([]);}
function label(text,p,w,h,fill='#52685c'){const q=project(p,w,h);ctx.font=(w<460?'10':'11')+'px Arial,sans-serif';ctx.textAlign='center';const width=ctx.measureText(text).width;ctx.fillStyle='#ffffffdf';ctx.fillRect(q[0]-width/2-4,q[1]-11,width+8,16);ctx.fillStyle=fill;ctx.fillText(text,q[0],q[1]);}
function makeCloud(){cloud=[];const [ne,nl,ns]=grid.shape;for(let e=0;e<ne;e+=2)for(let l=0;l<nl;l++)for(let s=0;s<ns;s++){const i=gridIndex(e,l,s,grid.shape);if(grid.support[i]<state.minSupport)continue;cloud.push({p:point(grid.axes[0][e],grid.axes[1][l],grid.axes[2][s]),ev:grid.axes[0][e],la:grid.axes[1][l],sp:grid.axes[2][s],i,value:grid[state.metric][i]});}dirty=true;}
function selectionIndex(){const e=Math.round((state.ev-grid.axes[0][0])/2),l=Math.round((selectedPoint.la-grid.axes[1][0])/2),s=Math.round((selectedPoint.sp-grid.axes[2][0])/4);return gridIndex(e,l,s,grid.shape);}
function updateReadout(){if(!grid)return;const i=selectionIndex(),supported=grid.support[i]>=state.minSupport;const direction=selectedPoint.sp===0?'Center Field':`${Math.abs(selectedPoint.sp)}° ${selectedPoint.sp<0?'pull side':'opposite field'}`;const metricName={hit:'Hit Probability',woba:'Modeled wOBAcon',hr:'Home Run Probability'}[state.metric];$('pointReadout').innerHTML=`<div><span>Exit Velocity · Distance from Home</span><strong>${state.ev} mph</strong></div><div><span>Launch Angle · Height on the Map</span><strong>${Math.abs(selectedPoint.la)}° ${selectedPoint.la>=0?'upward':'downward'}</strong></div><div><span>Direction · Left or Right</span><strong>${direction}</strong></div><div><span>${metricName}</span><strong>${supported?fmt(grid[state.metric][i],state.metric):'Limited nearby data'}</strong></div>`;$('legendMetric').textContent=metricName;$('legendMin').textContent=state.metric==='woba'?'0.000':'0%';$('legendMax').textContent=state.metric==='woba'?'2.000':'100%';}
function drawSpace(){if(!grid||!cv.clientWidth)return;const [w,h]=canvasSize(cv);prepareProjection(w,h);ctx.clearRect(0,0,w,h);const home=project([0,0,0],w,h);ctx.beginPath();ctx.moveTo(home[0],home[1]);for(let a=-45;a<=45;a+=2){const p=project(point(128,0,a),w,h);ctx.lineTo(p[0],p[1]);}ctx.closePath();ctx.fillStyle='#f0f4ed';ctx.fill();
 for(const r of [60,80,100,120])line(Array.from({length:46},(_,i)=>point(r,0,-45+i*2)),w,h,'#d0dcd2');
 for(const sp of [-45,0,45])line([[0,0,0],point(128,0,sp)],w,h,sp===0?'#a3b9a9':'#a6b4a7',sp===0?[4,4]:[]);
 line(Array.from({length:46},(_,i)=>point(state.ev,0,-45+i*2)),w,h,'#bd8c46',[4,3]);
 const pts=cloud.map(p=>({...p,q:project(p.p,w,h)})).sort((a,b)=>b.q[2]-a.q[2]);projected=[];
 for(const p of pts){const bright=p.value>=state.threshold,band=Math.abs(p.ev-state.ev)<=2;ctx.fillStyle=bright?color(p.value):'#9bac9f';ctx.globalAlpha=bright?(band?.85:.34):.035;const size=bright?(band?2:1.4):1;ctx.fillRect(p.q[0]-size/2,p.q[1]-size/2,size,size);if(bright)projected.push({...p,type:'grid'});}ctx.globalAlpha=1;
 if(state.player){for(const b of state.player.balls){const q=project(point(...b),w,h);ctx.fillStyle='#243f52';ctx.strokeStyle='#fff';ctx.lineWidth=.6;ctx.globalAlpha=.85;ctx.beginPath();ctx.arc(q[0],q[1],2.6,0,Math.PI*2);ctx.fill();ctx.stroke();projected.push({q,ball:b,type:'ball'});}}ctx.globalAlpha=1;
 const selected=point(state.ev,selectedPoint.la,selectedPoint.sp),q=project(selected,w,h);line([[0,0,0],selected],w,h,'#b67b2f',[5,4]);line([point(state.ev*Math.cos(selectedPoint.la*Math.PI/180),0,selectedPoint.sp),selected],w,h,'#cda874',[3,4]);
 ctx.beginPath();ctx.arc(q[0],q[1],6,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.lineWidth=2.5;ctx.strokeStyle='#b67b2f';ctx.stroke();ctx.beginPath();ctx.arc(q[0],q[1],2.6,0,Math.PI*2);ctx.fillStyle='#b67b2f';ctx.fill();
 ctx.beginPath();ctx.moveTo(home[0]-6,home[1]-4);ctx.lineTo(home[0]+6,home[1]-4);ctx.lineTo(home[0]+6,home[1]+2);ctx.lineTo(home[0],home[1]+7);ctx.lineTo(home[0]-6,home[1]+2);ctx.closePath();ctx.fillStyle='#fff';ctx.fill();ctx.strokeStyle='#697e6d';ctx.lineWidth=1.5;ctx.stroke();
 if(Math.abs(Math.sin(state.yaw))>.8){label('Ground Level · 0°',point(96,0,0),w,h);label('Upward Launch',point(112,65,0),w,h);label('Downward Launch',point(110,-32,0),w,h);}else{label('Pull Side',point(139,0,-45),w,h);label('Center Field',point(141,0,0),w,h);label('Opposite Field',point(139,0,45),w,h);}label('Home Plate',[0,-10,0],w,h,'#344f40');
 if(w>=460&&Math.abs(state.yaw)<.9){label('60 mph',point(60,0,48),w,h,'#7b8d7f');label('120 mph',point(120,0,48),w,h,'#7b8d7f');}
 updateReadout();dirty=false;
}
function drawSlice(){if(!grid||!sc.clientWidth)return;const [w,h]=canvasSize(sc);sx.clearRect(0,0,w,h);const pad={l:45,r:14,t:18,b:43},pw=w-pad.l-pad.r,ph=h-pad.t-pad.b;const [ne,nl,ns]=grid.shape,e=Math.round((state.ev-grid.axes[0][0])/2),cw=pw/ns,ch=ph/nl;sliceBounds={...pad,pw,ph,cw,ch,nl,ns,e};let supported=0,above=0;
 sx.fillStyle='#eef0ea';sx.fillRect(pad.l,pad.t,pw,ph);
 for(let l=0;l<nl;l++)for(let s=0;s<ns;s++){const i=gridIndex(e,l,s,grid.shape);if(grid.support[i]<state.minSupport)continue;supported++;const v=grid[state.metric][i];if(v>=state.threshold)above++;sx.globalAlpha=v>=state.threshold?1:.28;sx.fillStyle=color(v);sx.fillRect(pad.l+s*cw,pad.t+(nl-1-l)*ch,Math.ceil(cw),Math.ceil(ch));}sx.globalAlpha=1;
 sx.font='11px Arial,sans-serif';sx.strokeStyle='#3d604024';sx.fillStyle='#65776b';sx.textAlign='right';sx.textBaseline='middle';
 for(const la of [-40,-20,0,20,40,60]){const y=pad.t+(70-la)/112*ph+ch/2;sx.beginPath();sx.moveTo(pad.l,y);sx.lineTo(w-pad.r,y);sx.stroke();sx.fillText(`${la}°`,pad.l-7,y);}
 sx.textAlign='center';sx.textBaseline='top';for(const [sp,text]of [[-40,'Pull'],[0,'Center'],[40,'Opposite']]){const x=pad.l+(sp+46)/92*pw;sx.beginPath();sx.moveTo(x,pad.t);sx.lineTo(x,pad.t+ph);sx.stroke();sx.fillText(text,x,pad.t+ph+10);}
 sx.save();sx.translate(9,pad.t+ph/2);sx.rotate(-Math.PI/2);sx.textBaseline='top';sx.fillText('Launch Angle',0,0);sx.restore();
 if(state.player){sx.fillStyle='#243f52';sx.strokeStyle='#fff';sx.lineWidth=.8;for(const b of state.player.balls){if(Math.abs(b[0]-state.ev)>3||b[1]<-41||b[1]>71||b[2]<-46||b[2]>46)continue;const x=pad.l+(b[2]+46)/92*pw,y=pad.t+(71-b[1])/112*ph;sx.beginPath();sx.arc(x,y,2.8,0,Math.PI*2);sx.fill();sx.stroke();}}
 const px=pad.l+(selectedPoint.sp+46)/92*pw,py=pad.t+(71-selectedPoint.la)/112*ph;sx.strokeStyle='#b67b2f';sx.lineWidth=2;sx.strokeRect(px-cw/2-1,py-ch/2-1,cw+2,ch+2);sx.beginPath();sx.moveTo(px-8,py);sx.lineTo(px+8,py);sx.moveTo(px,py-8);sx.lineTo(px,py+8);sx.stroke();
 $('windowShare').textContent=supported?`${Math.round(above/supported*100)}%`:'—';$('supportedShare').textContent=`${Math.round(supported/(nl*ns)*100)}%`;$('evValue').textContent=state.ev;updateReadout();
}
sc.addEventListener('click',e=>{if(!sliceBounds)return;const rect=sc.getBoundingClientRect(),b=sliceBounds,s=Math.floor((e.clientX-rect.left-b.l)/b.cw),l=b.nl-1-Math.floor((e.clientY-rect.top-b.t)/b.ch);if(s<0||s>=b.ns||l<0||l>=b.nl)return;selectedPoint.la=grid.axes[1][l];selectedPoint.sp=grid.axes[2][s];drawSlice();dirty=true;});
function presetView(view){const views={catcher:[0,.40],side:[-Math.PI/2,.07],top:[0,1.40]};[state.yaw,state.pitch]=views[view];state.zoom=1;state.rotate=false;$('rotate').setAttribute('aria-pressed','false');for(const button of document.querySelectorAll('[data-view]'))button.classList.toggle('active',button.dataset.view===view);$('viewHint').textContent={catcher:'Behind the hitter · pull left, opposite field right',side:'Side view · launch angle rises above the ground line',top:'Above the hitter · direction spreads across the field'}[view];dirty=true;}
for(const button of document.querySelectorAll('[data-view]'))button.onclick=()=>presetView(button.dataset.view);

function showTip(event,html){tip.innerHTML=html;tip.style.display='block';const r=tip.getBoundingClientRect();tip.style.left=`${Math.max(5,Math.min(event.clientX+14,innerWidth-r.width-10))}px`;tip.style.top=`${Math.max(5,Math.min(event.clientY+14,innerHeight-r.height-10))}px`;}
function gridTip(e,i,ev,la,sp){showTip(e,`<b>${ev} mph · ${la}° LA · ${sp}° spray</b><br>Hit Probability <b>${fmt(grid.hit[i],'hit')}</b><br>Modeled wOBAcon <b>${fmt(grid.woba[i])}</b><br>Home Run Probability <b>${fmt(grid.hr[i],'hr')}</b><br><small>${num(grid.support[i])} local training contacts<br>Model estimate; chart-derived direction</small>`);}
sc.addEventListener('pointermove',e=>{if(!sliceBounds)return;const r=sc.getBoundingClientRect(),b=sliceBounds,s=Math.floor((e.clientX-r.left-b.l)/b.cw),l=b.nl-1-Math.floor((e.clientY-r.top-b.t)/b.ch);if(s<0||s>=b.ns||l<0||l>=b.nl){tip.style.display='none';return;}const i=gridIndex(b.e,l,s,grid.shape);if(grid.support[i]<state.minSupport){showTip(e,'Insufficient local training support.<br><small>No value displayed for this region.</small>');return;}gridTip(e,i,state.ev,grid.axes[1][l],grid.axes[2][s]);});
cv.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};cv.setPointerCapture(e.pointerId);state.rotate=false;$('rotate').setAttribute('aria-pressed','false');tip.style.display='none';});
cv.addEventListener('pointermove',e=>{if(drag){state.yaw+=(e.clientX-drag.x)*.007;state.pitch=Math.max(-.15,Math.min(1.45,state.pitch+(e.clientY-drag.y)*.006));drag={x:e.clientX,y:e.clientY};$('viewHint').textContent='Custom view · use Reset to return behind the hitter';for(const b of document.querySelectorAll('[data-view]'))b.classList.remove('active');dirty=true;return;}const r=cv.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;let nearest=null,dist=8;for(const p of projected){const d=Math.hypot(x-p.q[0],y-p.q[1]);if(d<dist){dist=d;nearest=p;}}if(!nearest){tip.style.display='none';return;}if(nearest.type==='ball'){const b=nearest.ball;showTip(e,`<b>${state.player.name}</b><br>${b[0].toFixed(1)} mph · ${b[1]}° LA · ${b[2].toFixed(1)}° spray<br>Actual: <b>${outcomes[b[3]]}</b><br>Modeled wOBAcon: <b>${fmt(b[5])}</b><br><small>${num(b[6])} local training contacts</small>`);}else gridTip(e,nearest.i,nearest.ev,nearest.la,nearest.sp);});
cv.addEventListener('pointerup',()=>{drag=null;});cv.addEventListener('pointercancel',()=>{drag=null;});for(const c of [cv,sc])c.addEventListener('pointerleave',()=>{tip.style.display='none';});
cv.addEventListener('wheel',e=>{e.preventDefault();state.zoom=Math.max(.6,Math.min(2,state.zoom-e.deltaY*.001));dirty=true;},{passive:false});
cv.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-','='].includes(e.key)){e.preventDefault();if(e.key==='ArrowLeft')state.yaw-=.08;if(e.key==='ArrowRight')state.yaw+=.08;if(e.key==='ArrowUp')state.pitch=Math.min(1.45,state.pitch+.08);if(e.key==='ArrowDown')state.pitch=Math.max(-.15,state.pitch-.08);if(e.key==='+'||e.key==='=')state.zoom=Math.min(2,state.zoom+.1);if(e.key==='-')state.zoom=Math.max(.6,state.zoom-.1);dirty=true;}});
$('resetView').onclick=()=>presetView('catcher');$('rotate').onclick=()=>{state.rotate=!state.rotate;$('rotate').setAttribute('aria-pressed',String(state.rotate));if(state.rotate)$('viewHint').textContent='Rotating view · use Reset to return behind the hitter';};
function drawProfile(){if($('exampleReading'))$('exampleReading').hidden=true;const p=state.player;$('scenario').hidden=!p;$('playerStats').innerHTML='';if(!p){$('profileTitle').textContent='Player Contact';$('profileCount').textContent=`${state.overlayYear} regular season`;$('profileDescription').textContent='Select a player above to compare his contact distribution with the league’s productive regions.';return;}
  $('profileTitle').textContent=p.name;$('profileCount').textContent=`${num(p.n)} usable batted balls · ${state.overlayYear}`;
  const air=p.balls.filter(b=>b[1]>=10&&b[1]<=50),hard=p.balls.filter(b=>b[0]>=95),hardAir=hard.filter(b=>b[1]>=10&&b[1]<=50).length;
  $('profileDescription').textContent=`${(p.coverage*100).toFixed(1)}% of usable batted balls have at least 30 nearby training contacts. Observed and modeled values below describe the same retained ${state.overlayYear} contacts; they exclude missing or filtered contact.`;
  const stats=[[`${p.ev.toFixed(1)} mph`,'Average Exit Velocity'],[fmt(p.actual_value),'Observed Fixed-Weight wOBAcon'],[fmt(p.model_value),'Modeled wOBAcon'],[hard.length?`${Math.round(hardAir/hard.length*100)}%`:'—','Hard Contact at 10–50° LA'],[air.length?`${Math.round(air.filter(b=>b[2]<-15).length/air.length*100)}%`:'—','10–50° Air Contact Pulled < −15°']];
  for(const [v,label]of stats){const card=document.createElement('div');card.className='stat';const strong=document.createElement('strong');strong.textContent=v;const s=document.createElement('span');s.textContent=label;card.append(strong,s);$('playerStats').append(card);}drawScenario();
}
function drawScenario(){if(!state.player)return;const d=Number($('evChange').value);$('evChangeValue').textContent=`${d>=0?'+':''}${d} mph`;const s=scenario(grid,state.player.balls,d,state.minSupport);if(!s.n){$('scenarioResult').textContent='No comparable contacts meet the current support threshold.';return;}
  $('scenarioResult').innerHTML=`<strong>${s.delta>=0?'+':''}${fmt(s.delta)}</strong> modeled wOBAcon change<br>${fmt(s.original)} → ${fmt(s.adjusted)} on the same contacts<small>${num(s.n)} of ${num(s.total)} contacts retained (${Math.round(s.n/s.total*100)}%). Both positions must be supported and inside the display grid. This compares contact combinations; it does not predict the result of changing a swing.</small>`;
}
$('evChange').oninput=drawScenario;
async function readCompressedJSON(path) {
  const encoded = await readJSON(path);
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
const contactCache = new Map();
let playerRequest = 0;
async function readJSON(path) {
  const response = await fetch(new URL(path, import.meta.url));
  if (!response.ok) throw new Error('Could not load the saved contact data. Please refresh and try again.');
  return response.json();
}
async function selectPlayer() {
  const request = ++playerRequest;
  const value = $('player').value.trim();
  const found = players.find(p => `${p.name} (${p.n} BBE; ID ${p.id})` === value || p.name.toLowerCase() === value.toLowerCase());
  state.player = null;
  drawProfile(); drawSlice(); dirty = true;
  if (!found) {
    $('status').textContent = '';
    if (value) $('profileDescription').textContent = 'Choose a matching name from the suggestions. At least 50 usable batted balls in the selected season are required.';
    return;
  }
  const key = found.chunk;
  const variant = state.variant;
  $('status').textContent = `Loading ${found.name}’s contact…`;
  try {
    if (!contactCache.has(key)) contactCache.set(key, readCompressedJSON(`../data/${key}`).catch(error => { contactCache.delete(key); throw error; }));
    const contacts = await contactCache.get(key);
    const balls = contacts[String(found.id)];
    if (request !== playerRequest) return;
    state.player = {...found, balls: balls.map(b => variant === 'raw' ? b.slice(0,7) : [...b.slice(0,4), b[7], b[8], b[6]])};
    $('status').textContent = '';
    drawProfile(); drawSlice(); dirty = true;
  } catch (error) {
    if (request === playerRequest) $('status').textContent = error.message;
  }
}
$('player').oninput=selectPlayer;$('player').onchange=selectPlayer;$('clearPlayer').onclick=()=>{$('player').value='';selectPlayer();};
$('metric').onchange=()=>{state.metric=$('metric').value;const t=$('threshold');t.max=maxes[state.metric];t.step=state.metric==='woba'?.025:.01;state.threshold=state.metric==='woba'?.4:state.metric==='hit'?.5:.1;t.value=state.threshold;$('thresholdValue').textContent=fmt(state.threshold,state.metric);makeCloud();drawSlice();};
$('threshold').oninput=()=>{state.threshold=Number($('threshold').value);$('thresholdValue').textContent=fmt(state.threshold,state.metric);dirty=true;drawSlice();};
$('minSupport').onchange=()=>{state.minSupport=Number($('minSupport').value);makeCloud();drawSlice();drawScenario();};$('ev').oninput=()=>{state.ev=Number($('ev').value);dirty=true;drawSlice();};
let playerRecords=[], gridVariants={};
state.variant='raw'; state.overlayYear=2026;
function activateComparison(){
 const inputValue=$('player').value.trim();
 const previous=state.player?.id || players?.find(p=>p.name.toLowerCase()===inputValue.toLowerCase() || `${p.name} (${p.n} BBE; ID ${p.id})`===inputValue)?.id;
 ++playerRequest;
 $('status').textContent='';
 state.variant=$('variant').value;state.overlayYear=Number($('overlayYear').value);
 grid=gridVariants[state.variant];
 players=playerRecords.filter(p=>p.year===state.overlayYear).map(p=>({...p, model_hit:state.variant==='raw'?p.raw_model_hit:p.cal_model_hit,model_value:state.variant==='raw'?p.raw_model_value:p.cal_model_value,balls:(p.balls||[]).map(b=>state.variant==='raw'?b.slice(0,7):[...b.slice(0,4),b[7],b[8],b[6]])}));
 $('playerList').replaceChildren(...players.map(p=>{const o=document.createElement('option');o.value=`${p.name} (${p.n} BBE; ID ${p.id})`;return o;}));
 state.player=players.find(p=>p.id===previous)||null;
 $('player').value=state.player?`${state.player.name} (${state.player.n} BBE; ID ${state.player.id})`:'';
 $('overlayLabel').textContent=state.overlayYear;
 $('overlayContext').textContent=`${state.overlayYear===2026&&!report.test_coverage.complete?'PARTIAL 2026 CACHE — ':''}${state.overlayYear===2026?'2026 held-out contacts.':'2025 calibration-fit contacts: calibrated values are in-sample.'} ${state.variant==='raw'?'Raw 3D model.':'Sigmoid-calibrated 3D comparison.'} Base models fitted on 2023–2024; sigmoid fitted on 2025. Support comes from base model training data.`;
 drawProfile();makeCloud();drawSlice();dirty=true;
 if(state.player) selectPlayer();
}
$('variant').onchange=activateComparison;$('overlayYear').onchange=activateComparison;


$('tryExample').onclick = async () => {
  state.player = null;
  $('overlayYear').value = '2026';
  $('variant').value = 'raw';
  activateComparison();
  $('metric').value = 'woba'; $('metric').onchange();
  $('minSupport').value = '30'; state.minSupport = 30;
  $('ev').value = '100'; state.ev = 100;
  $('evChange').value = '2'; selectedPoint.la = 26; selectedPoint.sp = -24;
  presetView('catcher'); makeCloud(); drawSlice();
  $('player').value = 'Aaron Judge';
  await selectPlayer();
  if (state.player?.id === 592450 && state.overlayYear === 2026) $('exampleReading').hidden = false;
};

window.addEventListener('resize',()=>{dirty=true;drawSlice();});
let last=0;function loop(time){if(state.tab==='explore'&&grid){if(state.rotate&&time-last>30){state.yaw+=.003;dirty=true;last=time;}if(dirty)drawSpace();}requestAnimationFrame(loop);}requestAnimationFrame(loop);
const dataControls = [...document.querySelectorAll('select,input,button')];
dataControls.forEach(control => control.disabled = true);
try {
  [gridVariants, playerRecords, report] = await Promise.all([
    readCompressedJSON('../data/grid.json'), readJSON('../data/players.json'), readJSON('../data/summary.json')
  ]);
  $('dataSummary').textContent = `${num(report.audit.usable_rows)} usable batted balls · 2025 + 2026 overlays`;
  $('status').textContent = '';
  activateComparison();
  dataControls.forEach(control => control.disabled = false);
} catch (error) {
  $('status').textContent = error.message;
}
