/* The single-file app being migrated into layers (ARCHITECTURE.md §12). Rules and maths now come from
   @sjakk/domain; display text from core/format. Do not add new features here (manifest R1/R4). */
import { Chess } from "chess.js";
import * as D from "@sjakk/domain";
import * as F from "../core/format.ts";
import { fakeEngine } from "../adapters/fake-engine.ts";
import { EX, PIECES } from "./data.js";
import { accountContext, legacyAccountStore } from "../composition.ts";
let ACC=null; accountContext().then(c=>{ACC=c});
const $=id=>document.getElementById(id);
(()=>{ const stop=e=>e.preventDefault();
  ["gesturestart","gesturechange","gestureend"].forEach(t=>document.addEventListener(t,stop,{passive:false}));
  document.addEventListener("touchmove",e=>{if(e.touches.length>1||(e.scale!==undefined&&e.scale!==1)) e.preventDefault()},{passive:false});
  const vp=document.querySelector('meta[name="viewport"]'); // also ask the browser (Android honours this)
  if(vp&&!/maximum-scale/.test(vp.content)) vp.content+=",maximum-scale=1,user-scalable=no";
})();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const store={get(k){try{return JSON.parse(localStorage.getItem(k)||"null")}catch(e){return null}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const pieceKey=ch=>(ch===ch.toUpperCase()?"w":"b")+({p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"})[ch.toLowerCase()];

/* =====================================================================
   OPENINGS
   ===================================================================== */
let OPENINGS=null;
const OFF=window.OFFLINE||null;
const openingsReady=(OFF?Promise.resolve(OFF.openings):fetch("openings.json").then(r=>r.json())).then(j=>{OPENINGS=j;return j}).catch(()=>null);
const opKey=fen=>fen.split(" ").slice(0,3).join(" ");
function openingInfo(fens){ return D.openingInfo(fens,OPENINGS) }
function showOpening(el,info){ if(!info||!info.name){el.hidden=true;return}
  el.hidden=false; el.children[0].textContent=info.eco; el.children[1].textContent=info.name}

/* =====================================================================
   BOARD COMPONENT
   ===================================================================== */
function Board(el,opts={}){
  const sqs=[]; let st={fen:"8/8/8/8/8/8/8/8 w - - 0 1",flipped:false,last:null,badge:null,arrow:null,movable:null,marks:{}};
  let sel=null, dests=[], drag=null, prevGrid=null, skipAnim=false;
  const reduce=window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;
  for(let i=0;i<64;i++){const d=document.createElement("div");d.className="sq";const p=document.createElement("div");p.className="pc";d.appendChild(p);el.appendChild(d);sqs.push(d)}
  const arrows=document.createElementNS("http://www.w3.org/2000/svg","svg");arrows.setAttribute("viewBox","0 0 8 8");arrows.setAttribute("class","arrows");el.appendChild(arrows);
  const nameOf=i=>{const r=(i/8)|0,c=i%8;return st.flipped?"hgfedcba"[c]+(r+1):"abcdefgh"[c]+(8-r)};
  const xyOf=s=>{const f=s.charCodeAt(0)-97,r=+s[1];return st.flipped?{x:7-f,y:r-1}:{x:f,y:8-r}};
  const idxOf=s=>{const p=xyOf(s);return p.y*8+p.x};
  function grid(){const g={};st.fen.split(" ")[0].split("/").forEach((row,r)=>{let c=0;for(const ch of row){if(/\d/.test(ch))c+= +ch;else{g["abcdefgh"[c]+(8-r)]=ch;c++}}});return g}
  function draw(){
    const g=grid(); const turn=st.fen.split(" ")[1]; let chk=null;
    if(opts.showCheck!==false){try{const c=new Chess(st.fen); if(c.in_check()){for(const k in g)if(g[k]===(turn==="w"?"K":"k"))chk=k}}catch(e){}}
    el.classList.toggle("live",!!st.movable);
    sqs.forEach((d,i)=>{const n=nameOf(i),f=n.charCodeAt(0)-97,rk=+n[1],r=(i/8)|0,c=i%8;
      d.className="sq "+(((f+rk)%2)?"d":"l"); d.dataset.sq=n;
      d.querySelectorAll(".co,.badge,.dot,.ring").forEach(e=>e.remove());
      if(c===0){const s=document.createElement("span");s.className="co r";s.textContent=n[1];d.appendChild(s)}
      if(r===7){const s=document.createElement("span");s.className="co f";s.textContent=n[0];d.appendChild(s)}
      const ch=g[n]; d.querySelector(".pc").style.backgroundImage=ch?`url("${PIECES[pieceKey(ch)]}")`:"none";
      if(ch&&st.movable&&(ch===ch.toUpperCase()?"w":"b")===st.movable) d.classList.add("mine");
      if(st.last&&(n===st.last.from||n===st.last.to)) d.classList.add("hl");
      if(n===chk) d.classList.add("chk");
      if(n===sel) d.classList.add("sel");
      const mk=st.marks[n]; if(mk) d.classList.add(mk);
      if(sel&&dests.includes(n)){const m=document.createElement("div");m.className=g[n]?"ring":"dot";d.appendChild(m)}
      if(st.badge&&n===st.badge.sq){const b=document.createElement("div");b.className="badge";b.innerHTML=icon(st.badge.cls,"100%");d.appendChild(b)}});
    arrows.innerHTML="";
    if(st.arrow){const a=xyOf(st.arrow.slice(0,2)),b=xyOf(st.arrow.slice(2,4));const x1=a.x+.5,y1=a.y+.5,x2=b.x+.5,y2=b.y+.5;
      const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len,hx=x2-ux*.38,hy=y2-uy*.38,px=-uy,py=ux;
      arrows.innerHTML=`<line x1="${x1+ux*.15}" y1="${y1+uy*.15}" x2="${hx}" y2="${hy}" stroke="var(--arrow)" stroke-width=".17" stroke-linecap="round"/><polygon points="${x2},${y2} ${hx+px*.24},${hy+py*.24} ${hx-px*.24},${hy-py*.24}" fill="var(--arrow)"/>`}
  }
  function plan(oldG,newG){ // which pieces slide where: match vanished pieces to newly placed ones of the same kind
    const gone=[],came=[];
    for(const sq in oldG) if(newG[sq]!==oldG[sq]) gone.push([sq,oldG[sq]]);
    for(const sq in newG) if(oldG[sq]!==newG[sq]) came.push([sq,newG[sq]]);
    const out=[],used=new Set();
    for(const [to,pc] of came){let best=null,bd=99;
      for(const [from,op] of gone){ if(used.has(from)) continue;
        const same=op===pc, promo=op.toLowerCase()==="p"&&(op===op.toUpperCase())===(pc===pc.toUpperCase())&&(to[1]==="8"||to[1]==="1");
        if(!same&&!promo) continue;
        const d=Math.abs(from.charCodeAt(0)-to.charCodeAt(0))+Math.abs(+from[1]-+to[1]); if(d<bd){bd=d;best=from}}
      if(best){used.add(best);out.push([best,to])}}
    return out}
  function animate(pairs){ if(reduce||!pairs.length) return; const ms=Math.min(460,300+pairs.length*40);
    for(const [from,to] of pairs){const a=xyOf(from),b=xyOf(to),pc=sqs[idxOf(to)].querySelector(".pc");
      sqs[idxOf(to)].style.zIndex=5; pc.style.transition="none"; pc.style.transform=`translate(${(a.x-b.x)*100}%,${(a.y-b.y)*100}%)`;
      void pc.offsetWidth; pc.style.transition=`transform ${ms}ms cubic-bezier(.35,.1,.25,1)`; pc.style.transform="translate(0,0)";
      setTimeout(()=>{pc.style.transition="";pc.style.transform="";sqs[idxOf(to)].style.zIndex=""},ms+30)}}
  function set(o){const before=prevGrid; const fenChanged=o.fen!==undefined&&o.fen!==st.fen; const flipChanged=o.flipped!==undefined&&o.flipped!==st.flipped;
    Object.assign(st,o); if(o.fen!==undefined||o.movable!==undefined){sel=null;dests=[]}
    draw(); const after=grid(); prevGrid=after;
    if(fenChanged&&before&&!flipChanged&&o.animate!==false&&!skipAnim) animate(plan(before,after));
    skipAnim=false}
  /* Legal targets for a piece. For the king, castling is also offered on the rook's square. */
  function targets(s){ const ms=new Chess(st.fen).moves({square:s,verbose:true}); const out=new Set(ms.map(m=>m.to));
    ms.forEach(m=>{ if(m.flags.includes("k")) out.add("h"+m.from[1]); if(m.flags.includes("q")) out.add("a"+m.from[1]) }); return [...out]}
  function resolve(from,to){ const ms=new Chess(st.fen).moves({square:from,verbose:true}); if(ms.some(m=>m.to===to)) return to;
    const c=ms.find(m=>(m.flags.includes("k")&&to==="h"+m.from[1])||(m.flags.includes("q")&&to==="a"+m.from[1])); return c?c.to:null}
  function select(s){sel=s; dests=targets(s); draw()}
  function canPick(s){const ch=grid()[s]; return st.movable&&ch&&(ch===ch.toUpperCase()?"w":"b")===st.movable&&st.fen.split(" ")[1]===st.movable}
  async function tryMove(from,to){
    to=resolve(from,to); if(!to) return false;
    const c=new Chess(st.fen); const ms=c.moves({square:from,verbose:true}).filter(m=>m.to===to); if(!ms.length) return false;
    let promo; if(ms.some(m=>m.promotion)){promo=await choosePromo(ms[0].color); if(!promo){sel=null;dests=[];draw();return true}}
    sel=null;dests=[]; draw(); opts.onMove&&opts.onMove(from,to,promo); return true}
  function choosePromo(color){return new Promise(res=>{const o=document.createElement("div");o.className="promo";const box=document.createElement("div");
    ["q","r","b","n"].forEach(p=>{const b=document.createElement("button");b.type="button";b.setAttribute("aria-label",{q:"Dronning",r:"Tårn",b:"Løper",n:"Springer"}[p]);
      b.style.backgroundImage=`url("${PIECES[color+{q:"queen",r:"rook",b:"bishop",n:"knight"}[p]]}")`;b.onclick=e=>{e.stopPropagation();o.remove();res(p)};box.appendChild(b)});
    o.appendChild(box); o.addEventListener("pointerdown",e=>{if(e.target===o){o.remove();res(null)}}); el.appendChild(o)})}
  const sqAt=(x,y)=>{const e=document.elementFromPoint(x,y);const s=e&&e.closest&&e.closest(".sq");return s&&el.contains(s)?s.dataset.sq:null};
  const centerOf=sq=>{const r=sqs[idxOf(sq)].getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}};
  let settling=false;
  function settle(g,sq,done){ // glide the lifted piece onto a square, then hand over to the board
    const c=centerOf(sq); if(reduceMotion()){g.remove();done();return}
    g.classList.add("settle"); requestAnimationFrame(()=>{g.style.left=c.x+"px";g.style.top=c.y+"px"});
    let fin=false; const end=()=>{if(fin)return;fin=true;g.remove();done()}; g.addEventListener("transitionend",end,{once:true}); setTimeout(end,220)}
  const reduceMotion=()=>reduce;
  function lift(d,x,y){ const g=document.createElement("div");g.className="ghost";const sz=el.getBoundingClientRect().width/8;g.style.width=g.style.height=sz+"px";
    g.style.backgroundImage=sqs[idxOf(d.from)].querySelector(".pc").style.backgroundImage; g.style.left=x+"px"; g.style.top=y+"px";
    document.body.appendChild(g); d.ghost=g; sqs[idxOf(d.from)].classList.add("dragfrom")}
  function onMoveP(e){ if(!drag||e.pointerId!==drag.id) return; e.preventDefault();
    if(!drag.ghost&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>3) lift(drag,e.clientX,e.clientY);
    if(drag.ghost){drag.ghost.style.left=e.clientX+"px";drag.ghost.style.top=e.clientY+"px"}}
  function stopListening(){window.removeEventListener("pointermove",onMoveP);window.removeEventListener("pointerup",onUpP);window.removeEventListener("pointercancel",onCancelP)}
  function onUpP(e){ if(!drag||e.pointerId!==drag.id) return; const d=drag; drag=null; stopListening();
    if(!d.ghost) return; // a tap: the piece stays selected, tap a target square next
    const raw=sqAt(e.clientX,e.clientY), to=raw&&raw!==d.from&&dests.includes(raw)?resolve(d.from,raw):null;
    settling=true;
    if(to){ settle(d.ghost,to,()=>{ settling=false; sqs.forEach(s=>s.classList.remove("dragfrom")); skipAnim=true; tryMove(d.from,to).then(ok=>{if(!ok){skipAnim=false;draw()}}) }) }
    else settle(d.ghost,d.from,()=>{ settling=false; sqs.forEach(s=>s.classList.remove("dragfrom")); draw() })}
  function onCancelP(e){ if(!drag) return; const d=drag; drag=null; stopListening(); if(d.ghost) d.ghost.remove(); sqs.forEach(s=>s.classList.remove("dragfrom")); draw()}
  el.addEventListener("pointerdown",e=>{ if(!st.movable||e.button>0||settling) return; const s=e.target.closest(".sq"); if(!s) return; const n=s.dataset.sq;
    if(sel&&dests.includes(n)&&!(canPick(n)&&resolve(sel,n)===null)){e.preventDefault();tryMove(sel,n);return}
    if(canPick(n)){e.preventDefault(); select(n); drag={from:n,x:e.clientX,y:e.clientY,ghost:null,id:e.pointerId};
      try{el.releasePointerCapture&&el.hasPointerCapture&&el.hasPointerCapture(e.pointerId)&&el.releasePointerCapture(e.pointerId)}catch(_){}
      window.addEventListener("pointermove",onMoveP,{passive:false}); window.addEventListener("pointerup",onUpP); window.addEventListener("pointercancel",onCancelP)}
    else{sel=null;dests=[];draw()}});
  return {set,get state(){return st},draw,animMs:420};
}

/* =====================================================================
   ENGINE (Stockfish 10, Web Worker)
   ===================================================================== */
function tryWorker(file){return new Promise((res,rej)=>{let w;try{w=new Worker(file)}catch(e){return rej(e)}
  const t=setTimeout(()=>{w.terminate();rej(new Error("tidsavbrudd"))},20000);
  w.onerror=e=>{clearTimeout(t);w.terminate();rej(e)};
  w.onmessage=e=>{if(String(e.data)==="uciok"){clearTimeout(t);w.onerror=null;res(w)}};
  w.postMessage("uci")})}
function Engine(){ if(new URLSearchParams(location.search).get("engine")==="fake") return fakeEngine();
  let w=null, chain=Promise.resolve();
  async function boot(){ if(w) return w; if(OFF){w=await tryWorker(OFF.engineUrl());return w} try{w=await tryWorker("stockfish.js")}catch(e){w=await tryWorker("stockfish.asm.js")} return w}
  function run(fn){const p=chain.then(async()=>{const wk=await boot();return fn(wk)}); chain=p.catch(()=>{}); return p}
  function search(fen,{depth=12,multipv=1,skill=20,movetime=0}={}){return run(wk=>new Promise(res=>{const lines={};
    wk.onmessage=e=>{const l=String(e.data);
      if(l.startsWith("info")&&l.includes(" pv ")){const sc=l.match(/ score (cp|mate) (-?\d+)/); if(!sc) return;
        const d=+(l.match(/ depth (\d+)/)||[0,0])[1], mp=+(l.match(/ multipv (\d+)/)||[0,1])[1];
        if(!lines[mp]||d>=lines[mp].depth) lines[mp]={depth:d,type:sc[1],val:+sc[2],pv:l.split(" pv ")[1].trim().split(" ")}}
      else if(l.startsWith("bestmove")) res({best:l.split(" ")[1],lines:Object.keys(lines).sort((a,b)=>a-b).map(k=>lines[k])})};
    wk.postMessage("setoption name MultiPV value "+multipv); wk.postMessage("setoption name Skill Level value "+skill);
    wk.postMessage("position fen "+fen); wk.postMessage("go depth "+depth+(movetime?" movetime "+Math.max(50,Math.round(movetime)):""))}))}
  function stop(){if(w){w.terminate();w=null} chain=Promise.resolve()}
  return {search,stop,newGame:()=>run(wk=>wk.postMessage("ucinewgame"))};
}

/* =====================================================================
   CLASSIFICATION HELPERS
   ===================================================================== */
const CLS={brilliant:{n:"Brilliant",g:"!!",c:"--c-brilliant"},great:{n:"Great",g:"!",c:"--c-great"},best:{n:"Best",g:"★",c:"--c-best"},
  excellent:{n:"Excellent",g:"✓",c:"--c-excellent"},good:{n:"Good",g:"✓",c:"--c-good"},book:{n:"Book",g:"B",c:"--c-book"},
  forced:{n:"Forced",g:"→",c:"--c-forced"},inaccuracy:{n:"Inaccuracy",g:"?!",c:"--c-inaccuracy"},
  mistake:{n:"Mistake",g:"?",c:"--c-mistake"},blunder:{n:"Blunder",g:"??",c:"--c-blunder"},pending:{n:"Venter",g:"…",c:"--c-pending"}};
const ORDER=D.CLASS_ORDER;
const NOTE={brilliant:"Et sterkt offer som motoren bekrefter.",great:"Det eneste trekket som holder stillingen.",best:"Motorens førstevalg.",
  excellent:"Nesten like godt som det beste trekket.",good:"Et greit trekk, men det fantes noe litt bedre.",inaccuracy:"Litt unøyaktig. Noe av fordelen forsvinner.",
  mistake:"En feil som gir bort en god del av stillingen.",blunder:"En alvorlig feil som endrer partiet.",forced:"Det eneste lovlige trekket.",book:"Kjent åpningsteori."};
const NOBEST=D.NO_BEST_HINT;
function icon(cls,size){const k=CLS[cls];const s=size||18;
  return `<svg class="ico" viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true"><circle cx="10" cy="10" r="9.5" fill="var(${k.c})"/><text x="10" y="10.5" text-anchor="middle" dominant-baseline="middle" font-family="Archivo,Arial,sans-serif" font-weight="800" font-size="${k.g.length>1?9.5:11}" fill="#fff">${k.g}</text></svg>`}
const cpOf=D.cpOf, wpc=D.winPercent, wp=D.whiteWinPercent, evText=F.evalText, terminalEval=D.terminalEval;

/* =====================================================================
   PGN
   ===================================================================== */
function parsePGN(text){ try{ return D.parsePgn(text) }catch(e){ if(e instanceof D.PgnError) throw new Error(F.pgnErrorText(e)); throw e } }

/* =====================================================================
   ANALYSE TAB
   ===================================================================== */
const A={G:null,cur:0,flipped:false,job:0,engine:Engine(),board:null};
const STORE_A="pgn-analyse-siste";
A.board=Board($("a-board"),{onMove:(f,t,p)=>exMove(f,t,p)});
function aWhiteEval(i){const G=A.G,T=G.term[i];if(T)return T;return D.whiteEval(G.fens[i],G.raw[i])}
function aClassify(k){
  const G=A.G,m=G.moves[k-1],Ar=G.raw[k-1],Br=G.raw[k]; if(!Ar) return null;
  const r=D.classifyMove({move:m,before:Ar,after:Br,terminal:G.term[k],isBook:!!G.op.book[k],prevTo:G.moves[k-2]?G.moves[k-2].to:null}); if(!r) return null;
  const cls=r.cls;
  let best=null; if(Ar.best&&Ar.best!=="(none)"){const c=new Chess(m.fenBefore);const mv=c.move({from:Ar.best.slice(0,2),to:Ar.best.slice(2,4),promotion:Ar.best[4]||"q"});best=mv?mv.san:null}
  let note=NOTE[cls]; const ev=G.evals[k]; if(ev&&ev.mate&&ev.mate!==0) note+=` Matt i ${Math.abs(ev.mate)} for ${ev.mate>0?"hvit":"svart"}.`;
  return {cls,best,bu:Ar.best,loss:r.loss,note}}
function aNewGame(parsed,o){ A.ex=null; exUi();
  const N=parsed.moves.length;
  A.G={headers:parsed.headers,startFen:parsed.startFen,moves:parsed.moves,fens:[parsed.startFen,...parsed.moves.map(m=>m.fen)],
    evals:new Array(N+1).fill(null),res:new Array(N).fill(null),raw:new Array(N+1).fill(null),depth:o.depth,example:!!o.example,pgn:o.pgn,op:{book:[]}};
  A.G.term=A.G.fens.map(terminalEval); A.G.term.forEach((t,i)=>{if(t)A.G.evals[i]=t});
  A.G.op=openingInfo(A.G.fens);
  A.cur=0; A.prevCur=null; A.flipped=!!o.flip; aBuildList(); aHeader(); aRender()}
/* Show a stored game: with its saved analysis if it has one, otherwise just the moves. */
function aShow(id){ const g=Games.get(id); if(!g) return false; A.job++; A.engine.stop(); $("a-progress").hidden=true;
  let parsed; try{parsed=parsePGN(g.pgn)}catch(e){return false}
  A.gameId=id; Games.remember(id);
  aNewGame(parsed,{depth:g.analysis?g.analysis.depth:null,pgn:g.pgn,flip:g.color==="b",example:g.source==="example"});
  if(g.analysis&&g.analysis.res&&g.analysis.res.length===A.G.moves.length){A.G.evals=g.analysis.evals.slice();A.G.res=g.analysis.res.slice()}
  aUpdate(); aGames(); return true}
/* Analyse the selected game (or a new PGN) and store the result with the game. */
async function aRun(text,o={}){
  const msg=$("a-msg"); msg.className="msg"; msg.textContent=""; let parsed;
  try{parsed=parsePGN(text)}catch(e){msg.className="msg err";msg.textContent=e.message;aMode("choose");$("a-intake").open=true;return}
  const depth=o.depth||A.depth, my=++A.job; A.engine.stop(); await openingsReady; aMode("view");
  const id=o.gameId||Games.addPgn(text,parsed); A.gameId=id; Games.remember(id);
  aNewGame(parsed,{depth,pgn:text,flip:o.flip!==undefined?o.flip:(Games.get(id)||{}).color==="b"}); $("a-intake").open=false; $("a-pgn").value=""; aGames();
  A.running=true; aActBtn(); const G=A.G,N=G.moves.length,total=N+1,t0=Date.now(); $("a-progress").hidden=false; aProg(0,total,"Laster sjakkmotoren …");
  try{await A.engine.newGame()}catch(e){$("a-ptxt").textContent="Sjakkmotoren kunne ikke starte i denne nettleseren.";return}
  for(let i=0;i<=N;i++){ if(my!==A.job) return; aProg(i,total,`Analyserer stilling ${i+1} av ${total} · dybde ${depth}`);
    if(!G.term[i]){const r=await A.engine.search(G.fens[i],{depth,multipv:3}); if(my!==A.job) return; G.raw[i]=r; G.evals[i]=aWhiteEval(i)}
    if(i>=1) G.res[i-1]=aClassify(i); aUpdate()}
  const s=Math.round((Date.now()-t0)/1000); aProg(total,total,`Ferdig · ${N} trekk analysert på ${s>=60?Math.floor(s/60)+" min "+(s%60)+" s":s+" s"}`); $("a-stop").hidden=true;
  Games.setAnalysis(id,{depth,evals:G.evals,res:G.res,acc:{w:aAcc("w"),b:aAcc("b")}}); A.running=false; aUpdate(); aGames();
  setTimeout(()=>{if(!A.running&&my===A.job) $("a-progress").hidden=true},2500)}
function aProg(i,t,txt){$("a-pfill").style.width=(i/t*100)+"%";$("a-ptxt").textContent=txt;$("a-stop").hidden=false}
function aAnalysed(){return A.G&&A.G.res.length>0&&A.G.res.every(Boolean)}
/* The extra button only offers what makes sense: finish a stopped analysis, or go deeper. */
function aActBtn(){const b=$("a-analyze"); if(!b) return; const done=aAnalysed(), d=(A.G&&A.G.depth)||0, g=Games.get(A.gameId);
  b.hidden=!A.G||!!A.running||(done&&d>=20)||(!!g&&g.source==="example"&&done);
  b.textContent=done?"Analyser grundigere":"Fullfør analysen"; aJumps()}
$("a-analyze").onclick=()=>{const g=Games.get(A.gameId); if(g) aRun(g.pgn,{gameId:g.id,depth:aAnalysed()?20:Math.max(A.depth,(A.G&&A.G.depth)||0)})};
$("a-new").onclick=()=>{exLeave(true);aMode("choose")};
/* Jump between the mistakes (yours when we know your colour, otherwise both sides). */
const ERRS=D.ERROR_CLASSES;
function aErrPlies(){ if(!A.G) return []; const me=(Games.get(A.gameId)||{}).color;
  return A.G.res.map((r,i)=>r&&ERRS.includes(r.cls)&&(!me||A.G.moves[i].c===me)?i+1:0).filter(Boolean)}
function aJumps(){ const L=aErrPlies(), cur=A.cur||0;
  $("a-preverr").disabled=!L.some(p=>p<cur); $("a-nexterr").disabled=!L.some(p=>p>cur);
  const me=(Games.get(A.gameId)||{}).color; $("a-nexterr").textContent=me?"Neste feil du gjorde ›":"Neste feil ›";
  $("a-jumps").title=L.length?`${L.length} unøyaktigheter, feil og blundere${me?" fra deg":""}`:"Ingen feil funnet"}
$("a-preverr").onclick=()=>{const L=aErrPlies().filter(p=>p<A.cur); if(L.length) aGo(L[L.length-1])};
$("a-nexterr").onclick=()=>{const L=aErrPlies().filter(p=>p>A.cur); if(L.length) aGo(L[0])};
/* Two steps: choose a game (or PGN), then the analysis itself. */
A.depth=+(store.get("analyse-dybde")||16);
const DEPTH_HINT={12:"Rask: ferdig på noen sekunder.",16:"Normal: god balanse mellom tid og presisjon.",20:"Grundig: mest presis, tar et par minutter for lange partier."};
function aDepthDraw(){document.querySelectorAll("#a-depthseg [data-depth]").forEach(b=>b.setAttribute("aria-pressed",+b.dataset.depth===A.depth?"true":"false")); $("a-depthhint").textContent=DEPTH_HINT[A.depth]||""}
document.querySelectorAll("#a-depthseg [data-depth]").forEach(b=>b.onclick=()=>{A.depth=+b.dataset.depth; store.set("analyse-dybde",A.depth); aDepthDraw()});
function aMode(m){ A.mode=m; $("a-choose").hidden=m!=="choose"; $("a-view").hidden=m!=="view";
  if(m==="choose"){ aGames(); aDepthDraw(); const g=A.gameId&&Games.get(A.gameId);
    $("a-resume").hidden=!(A.G&&g); if(A.G&&g){const meta=gameMeta(g); $("a-resumetitle").textContent=meta.title;
      $("a-resumesub").textContent=A.running?"Analyseres nå":aAnalysed()?"Analysert":"Ikke ferdig analysert"} }
  else { sizeBar() } window.scrollTo(0,0)}
$("a-resume").onclick=()=>aMode("view");
/* Open a game: show the saved analysis, or start analysing straight away. */
function aOpen(id){ const g=Games.get(id); if(!g) return; A.userPicked=true;
  const has=!!(g.analysis&&g.analysis.res&&g.analysis.res.length&&g.analysis.res.every(Boolean));
  if(A.gameId===id&&A.G&&(A.running||has)){aMode("view");return}
  aMode("view"); aShow(id); if(!has) aRun(g.pgn,{gameId:id})}
function aHeader(){const G=A.G,h=G.headers,W=h.White||"Hvit",B=h.Black||"Svart",elo=x=>x&&x!=="?"?` (${x})`:"";
  $("a-title").textContent=`${W}${elo(h.WhiteElo)} – ${B}${elo(h.BlackElo)}`; $("a-eyebrow").textContent=G.example?"Fra chess.com":"Partianalyse";
  const bits=[]; if(h.Event&&h.Event!=="?")bits.push(h.Event); if(h.Date&&!/^\?/.test(h.Date))bits.push(h.Date.replace(/\.\?\?/g,""));
  if(h.Result&&h.Result!=="*")bits.push(h.Result.replace("1/2-1/2","½–½").replace("-","–")); bits.push(`${Math.ceil(G.moves.length/2)} trekk`); bits.push(aAnalysed()&&G.depth?`Stockfish dybde ${G.depth}`:"Ikke analysert ennå"); aActBtn();
  $("a-sub").textContent=bits.join(" · "); showOpening($("a-opening"),G.op)}
function aAcc(c){const G=A.G;return D.accuracy(G.moves.map((m,i)=>[m,G.res[i]]).filter(([m,r])=>m.c===c&&r).map(([m,r])=>r))}
function aSummary(){const G=A.G,sum=$("a-summary"),h=G.headers; sum.innerHTML="";
  [["w",h.White||"Hvit"],["b",h.Black||"Svart"]].forEach(([c,n])=>{const cnt={};G.moves.forEach((m,i)=>{if(m.c===c&&G.res[i])cnt[G.res[i].cls]=(cnt[G.res[i].cls]||0)+1});
    const a=aAcc(c),el=document.createElement("div");el.className="card";
    el.innerHTML=`<div class="side-head"><b></b><span class="acc">${a==null?"–":a.toFixed(1)}<small>Nøyaktighet</small></span></div><div class="counts">${ORDER.filter(k=>cnt[k]).map(k=>`<span class="chip">${icon(k)}<span class="n">${cnt[k]}</span>${CLS[k].n}</span>`).join("")||'<span class="hint">Venter på analyse …</span>'}</div>`;
    el.querySelector("b").textContent=n+(c==="w"?" · hvit":" · svart"); sum.appendChild(el)})}
function aRender(){ if(!A.G) return; if(A.ex) return exRender();
  const G=A.G,N=G.moves.length,cur=A.cur,mv=cur>0?G.moves[cur-1]:null,rs=cur>0?G.res[cur-1]:null;
  A.board.set({fen:G.fens[cur],flipped:A.flipped,animate:Math.abs(cur-(A.prevCur??cur))===1,last:mv?{from:mv.from,to:mv.to}:null,badge:mv?{sq:mv.to,cls:rs?rs.cls:"pending"}:null,
    arrow:rs&&rs.bu&&!NOBEST.includes(rs.cls)?rs.bu:null, movable:terminalEval(G.fens[cur])?null:G.fens[cur].split(" ")[1]});
  A.prevCur=cur; const ev=G.evals[cur],w=wp(ev); $("a-evalbar").classList.toggle("flip",A.flipped); $("a-evalw").style.height=w+"%";
  const t=ev?evText(ev):"",ws=A.flipped?$("a-lbltop"):$("a-lblbot"),bs=A.flipped?$("a-lblbot"):$("a-lbltop");
  ws.style.color="var(--bar-black)";bs.style.color="var(--bar-white)";ws.textContent=w>=50?t:"";bs.textContent=w<50?t:"";
  const card=$("a-card");
  if(!mv){card.innerHTML=`<div class="top"><span class="mvname">Startstilling</span><span class="ev">${evText(ev)}</span></div><p class="note">${!aAnalysed()&&!A.running?"Dette partiet er ikke analysert ennå. Trykk «Analyser» for å få vurdering av hvert trekk. Du kan bla gjennom trekkene allerede nå.":"Bla gjennom partiet med pilene, klikk på et trekk eller i grafen."}</p>`}
  else{const k=CLS[rs?rs.cls:"pending"],fm=+mv.fenBefore.split(" ")[5],no=fm+(mv.c==="w"?".":"...");
    card.innerHTML=`<div class="top"><span class="mvname"></span><span class="tag" style="background:var(${k.c})">${icon(rs?rs.cls:"pending",20)}${k.n}</span><span class="ev" title="Evaluering etter trekket">${evText(ev)}</span></div><p class="sub who"></p><p class="note"></p>`;
    card.querySelector(".mvname").textContent=`${no} ${mv.san}`; card.querySelector(".who").textContent=mv.c==="w"?(G.headers.White||"Hvit"):(G.headers.Black||"Svart");
    card.querySelector(".note").textContent=rs?rs.note:A.running?"Analysen av dette trekket er ikke ferdig ennå.":"Trykk «Analyser» for å få vurdering av dette trekket.";
    if(rs&&rs.cls==="book"&&G.op.name){const p=document.createElement("p");p.className="sub";p.textContent=`Åpning: ${G.op.name}`;card.appendChild(p)}
    if(rs&&rs.best&&rs.best!==mv.san&&!NOBEST.includes(rs.cls)){const p=document.createElement("p");p.className="sub";p.innerHTML=`Motorens beste trekk var <b></b>.`;p.querySelector("b").textContent=rs.best;card.appendChild(p)}}
  document.querySelectorAll("#a-tbody .mv").forEach(b=>b.classList.toggle("on",+b.dataset.i===cur));
  const on=document.querySelector("#a-tbody .mv.on"); if(on){const L=on.closest(".list"),r=on.getBoundingClientRect(),R=L.getBoundingClientRect(); if(r.top<R.top||r.bottom>R.bottom) L.scrollTop+=r.top-R.top-R.height/2+r.height/2}
  $("a-first").disabled=$("a-prev").disabled=cur===0; $("a-last").disabled=$("a-next").disabled=cur===N; aGraph()}
function aBuildList(){const tb=$("a-tbody");tb.innerHTML="";let tr=null;
  A.G.moves.forEach((m,i)=>{if(m.c==="w"||i===0){tr=document.createElement("tr");tr.innerHTML=`<td class="no">${m.fenBefore.split(" ")[5]}.</td><td></td><td></td>`;tb.appendChild(tr)}
    const td=tr.children[m.c==="w"?1:2];td.innerHTML=`<button class="mv" data-i="${i+1}"><span class="i"></span><span></span></button>`;td.querySelector("span:last-child").textContent=m.san}); aIcons()}
function aIcons(){document.querySelectorAll("#a-tbody .mv").forEach(b=>{const r=A.G.res[+b.dataset.i-1];b.querySelector(".i").innerHTML=icon(r?r.cls:"pending")})}
$("a-tbody").addEventListener("click",e=>{const b=e.target.closest(".mv");if(b){exLeave(true);A.cur=+b.dataset.i;aRender()}});
$("a-legend").innerHTML=ORDER.map(k=>`<span>${icon(k,14)}${CLS[k].n}</span>`).join("");
const GR=$("a-graph"),GW=600,GH=110; GR.setAttribute("viewBox",`0 0 ${GW} ${GH}`); GR.setAttribute("preserveAspectRatio","none");
function aGraph(){const G=A.G,N=G.moves.length,gx=i=>i/N*GW,gy=i=>GH-wp(G.evals[i])/100*GH; let last=-1; for(let i=0;i<=N;i++){if(G.evals[i])last=i;else break}
  let poly=""; if(last>=0){const pts=[];for(let i=0;i<=last;i++)pts.push(`${gx(i).toFixed(1)},${gy(i).toFixed(1)}`);poly=`<polygon points="0,${GH} ${pts.join(" ")} ${gx(last).toFixed(1)},${GH}" fill="var(--bar-white)"/>`}
  const marks=G.moves.map((m,i)=>{const r=G.res[i];return r&&["inaccuracy","mistake","blunder","great","brilliant"].includes(r.cls)&&G.evals[i+1]?`<circle cx="${gx(i+1)}" cy="${gy(i+1)}" r="3.6" fill="var(${CLS[r.cls].c})" stroke="var(--surface)" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`:""}).join("");
  GR.innerHTML=`<rect x="0" y="0" width="${GW}" height="${GH}" fill="var(--bar-black)" opacity=".9"/>${poly}<line x1="0" y1="${GH/2}" x2="${GW}" y2="${GH/2}" stroke="rgba(128,128,128,.7)" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke"/><line x1="${gx(A.cur)}" y1="0" x2="${gx(A.cur)}" y2="${GH}" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/>${marks}`}
function aJump(e){exLeave(true);const r=GR.getBoundingClientRect(),N=A.G.moves.length;A.cur=Math.max(0,Math.min(N,Math.round((e.clientX-r.left)/r.width*N)));aRender()}
let gdrag=false; GR.addEventListener("pointerdown",e=>{gdrag=true;GR.setPointerCapture(e.pointerId);aJump(e)}); GR.addEventListener("pointermove",e=>{if(gdrag)aJump(e)}); GR.addEventListener("pointerup",()=>gdrag=false);
function aUpdate(){aIcons();aSummary();aHeader();aRender()}
const aGo=i=>{A.cur=Math.max(0,Math.min(A.G.moves.length,i));aRender()};
/* The navigation buttons and arrow keys move through whichever line is on screen: the game, or your test line. */
function aNav(k){ if(!A.G) return; if(A.ex){const X=A.ex; exGo(k==="first"?0:k==="prev"?X.cur-1:k==="next"?X.cur+1:X.moves.length); return}
  aGo(k==="first"?0:k==="prev"?A.cur-1:k==="next"?A.cur+1:A.G.moves.length)}
$("a-first").onclick=()=>aNav("first");$("a-prev").onclick=()=>aNav("prev");$("a-next").onclick=()=>aNav("next");$("a-last").onclick=()=>aNav("last");

/* ---------- Try your own moves from any point in the analysis ----------
   A test line starts at the position on the board. You move for both sides; each move is checked by
   the engine. Going back and playing something else replaces the rest of the line. "Tilbake til analysen"
   returns to the exact point you started from. */
A.ex=null; A.exEngine=Engine(); const EXC=new Map();
function exStart(){ if(!A.G||A.ex) return; A.ex={base:A.cur,fens:[A.G.fens[A.cur]],moves:[],cur:0}; exUi(); exRender(); exEval(0)}
function exLeave(quiet){ if(!A.ex) return; const base=A.ex.base; A.ex=null; exUi(); if(!quiet){A.cur=base; aRender()}}
function exUi(){ const on=!!A.ex; $("a-jumps").hidden=on; $("a-exbar").hidden=!on; $("a-card").classList.toggle("explore",on);
  $("a-preverr").disabled=$("a-nexterr").disabled=on||$("a-preverr").disabled}
function exMove(from,to,promo){ if(!A.G) return; if(!A.ex) exStart(); const X=A.ex;
  const c=new Chess(X.fens[X.cur]); const m=c.move({from,to,promotion:promo||undefined}); if(!m) return;
  const uci=m.from+m.to+(m.promotion||"");
  if(X.cur<X.moves.length&&X.moves[X.cur].uci===uci){X.cur++}
  else{X.moves.length=X.cur; X.fens.length=X.cur+1; X.moves.push({san:m.san,uci,from:m.from,to:m.to,c:m.color}); X.fens.push(c.fen()); X.cur++}
  exRender(true); exEval(X.cur); exEval(X.cur-1)}
function exGo(i){ const X=A.ex; const n=Math.max(0,Math.min(X.moves.length,i)); const anim=Math.abs(n-X.cur)===1; X.cur=n; exRender(!anim)}
/* engine look at a test position (cached by position) */
async function exEval(i){ const X=A.ex; if(!X||i<0) return; const fen=X.fens[i]; if(!fen||EXC.has(fen)) {exRender(true);return}
  const T=terminalEval(fen); if(T){EXC.set(fen,{T}); exRender(true); return}
  EXC.set(fen,null);
  try{ const r=await A.exEngine.search(fen,{depth:14,multipv:1}); EXC.set(fen,r); if(A.ex===X) exRender(true) }catch(e){EXC.delete(fen)}}
function exWhite(fen){ const r=EXC.get(fen); if(!r) return null; if(r.T) return r.T; return D.whiteEval(fen,r)}
function exClass(i){ // grade test move i (1-based) the same way as the game's moves
  const X=A.ex, m=X.moves[i-1], A0=EXC.get(X.fens[i-1]), B=EXC.get(X.fens[i]); if(!A0||!A0.lines||!B) return null;
  const pc=new Chess(X.fens[i-1]).get(m.from); const cap=new Chess(X.fens[i-1]).get(m.to);
  const r=D.classifyMove({move:{uci:m.uci,piece:pc?pc.type:"p",captured:cap?cap.type:null,to:m.to,fenBefore:X.fens[i-1]},before:A0,after:B.T?null:B,terminal:B.T||null,prevTo:i>1?X.moves[i-2].to:null});
  if(!r) return null; const cls=r.cls;
  let best=null; if(A0.best&&A0.best!=="(none)"&&cls!=="best"){const t=new Chess(X.fens[i-1]); const b=t.move({from:A0.best.slice(0,2),to:A0.best.slice(2,4),promotion:A0.best[4]||"q"}); best=b?b.san:null}
  return {cls,best,bu:A0.best}}
function exLabel(fen,ply){ const f=fen.split(" "); return `${f[5]}${f[1]==="w"?".":"..."}`}
function exRender(still){ const X=A.ex, G=A.G; if(!X) return;
  const fen=X.fens[X.cur], mv=X.cur?X.moves[X.cur-1]:null, gm=G.moves[X.base-1];
  const cl=mv?exClass(X.cur):null, ev=exWhite(fen);
  A.board.set({fen,flipped:A.flipped,animate:!still,last:mv?{from:mv.from,to:mv.to}:gm?{from:gm.from,to:gm.to}:null,
    badge:mv?{sq:mv.to,cls:cl?cl.cls:"pending"}:null, arrow:cl&&cl.bu&&cl.cls!=="best"?cl.bu:null, movable:terminalEval(fen)?null:fen.split(" ")[1]});
  const w=wp(ev); $("a-evalbar").classList.toggle("flip",A.flipped); $("a-evalw").style.height=w+"%";
  const t=ev?evText(ev):"",ws=A.flipped?$("a-lbltop"):$("a-lblbot"),bs=A.flipped?$("a-lblbot"):$("a-lbltop");
  ws.style.color="var(--bar-black)";bs.style.color="var(--bar-white)";ws.textContent=w>=50?t:"";bs.textContent=w<50?t:"";
  const from=X.base?`${Math.ceil(X.base/2)}${X.base%2?".":"..."} ${G.moves[X.base-1].san}`:"startstillingen";
  $("a-extxt").textContent=`Egne trekk fra ${from}`;
  const card=$("a-card"); const T=terminalEval(fen);
  if(!mv){card.innerHTML=`<div class="top"><span class="mvname">Prøv egne trekk</span><span class="ev">${ev?evText(ev):"…"}</span></div><p class="note">Flytt en brikke for å prøve et trekk. Du flytter for begge sider. Bla tilbake med pilene og spill noe annet for å teste en ny vei.</p>`}
  else{ const k=CLS[cl?cl.cls:"pending"];
    card.innerHTML=`<div class="top"><span class="mvname"></span><span class="tag" style="background:var(${k.c})">${icon(cl?cl.cls:"pending",20)}${k.n}</span><span class="ev">${ev?evText(ev):"…"}</span></div><p class="note"></p>`;
    card.querySelector(".mvname").textContent=`${exLabel(X.fens[X.cur-1])} ${mv.san}`;
    card.querySelector(".note").textContent=T&&T.mate===0?"Sjakkmatt.":T?"Remis.":!cl?"Motoren vurderer trekket …":cl.cls==="best"?"Motorens førstevalg.":`${NOTE[cl.cls]} Motorens beste trekk var ${cl.best||"et annet"}.`}
  const line=document.createElement("p"); line.className="exline";
  X.moves.forEach((m,i)=>{ const f=X.fens[i].split(" "); if(f[1]==="w"||i===0){const n=document.createElement("span");n.className="n";n.textContent=`${f[5]}${f[1]==="w"?".":"..."} `;line.appendChild(n)}
    const b=document.createElement("button");b.type="button";b.textContent=m.san;b.dataset.i=i+1;if(i+1===X.cur)b.className="on";line.appendChild(b);line.appendChild(document.createTextNode(" "))});
  if(X.moves.length) card.appendChild(line);
  line.addEventListener("click",e=>{const b=e.target.closest("button"); if(b) exGo(+b.dataset.i)});
  document.querySelectorAll("#a-tbody .mv").forEach(b=>b.classList.toggle("on",+b.dataset.i===X.base));
  $("a-first").disabled=$("a-prev").disabled=X.cur===0; $("a-last").disabled=$("a-next").disabled=X.cur===X.moves.length}
$("a-try").onclick=exStart;
$("a-exback").onclick=()=>exLeave(false);
$("a-flip").onclick=()=>{A.flipped=!A.flipped;aRender()};
$("a-go").onclick=()=>{A.userPicked=true;aRun($("a-pgn").value)};
$("a-pgn").addEventListener("input",()=>{$("a-msg").textContent=""});
$("a-stop").onclick=()=>{A.job++;A.engine.stop();A.running=false;aActBtn();aGames();$("a-ptxt").textContent="Analysen ble stoppet. Trekkene som er ferdige, vises.";$("a-stop").hidden=true};
$("a-file").addEventListener("change",e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{$("a-pgn").value=r.result;aRun(r.result)};r.readAsText(f);e.target.value=""});
function sizeBar(){$("a-evalbar").style.height=$("a-board").getBoundingClientRect().height+"px"}
new ResizeObserver(sizeBar).observe($("a-board"));

/* =====================================================================
   PUZZLES TAB
   ===================================================================== */
const P={list:null,profile:null,cur:null,board:null,db:null,uid:null,busy:false,lastDelta:null};
const STORE_P="sjakknotter-profil";
P.board=Board($("p-board"),{onMove:pMove}); P.board.set({fen:new Chess().fen()});
const ratingChange=D.puzzleRatingChange, freshProfile=D.freshPuzzleProfile;
/* Account storage: the db capability keeps each person's own documents under data/users/<id>/,
   so ratings follow the account across sessions and devices. Browser storage is a backup. */
const Acct={db:null,uid:null,ready:null};
Acct.ready=(async()=>{ try{ if(OFF) return false;
    const sb=await legacyAccountStore(); if(sb){Acct.db=sb.db; Acct.uid=sb.uid; return true}
    if(!(window.claude&&claude.use)) return false;
    const to=new Promise(r=>setTimeout(()=>r([null,null]),12000));
    const [db,user]=await Promise.race([Promise.all([claude.use("db"),claude.use("user")]),to]);
    if(!db||!user) return false; const id=await user.id(); if(!id) return false; Acct.db=db; Acct.uid=id; return true}catch(e){return false}})();
async function acctGet(name){ if(!await Acct.ready) return undefined;
  for(let i=0;i<3;i++){try{const s=await withTimeout(Acct.db.doc(`data/users/${Acct.uid}/${name}`).get(),8000);return s.exists?JSON.parse(JSON.stringify(s.data())):null}catch(e){if(i===2)return undefined;await sleep(800*(i+1))}}}
const acctQ={}, acctRetry={};
// a write that failed is tried again when the connection returns or the page is hidden
function flushRetries(){for(const k in acctRetry){const d=acctRetry[k];delete acctRetry[k];acctSet(k,d).then(ok=>{if(k==="puzzleprofile")pStoreNote(ok)})}}
window.addEventListener("online",flushRetries); document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")flushRetries()});
setInterval(flushRetries,30000);
function acctSet(name,data){ // one write at a time per document; the latest value wins
  const q=acctQ[name]||(acctQ[name]={busy:false,next:undefined}); q.next=data; if(q.busy) return q.p;
  q.busy=true; q.p=(async()=>{let ok=true; while(q.next!==undefined){const d=q.next;q.next=undefined;
      if(!await Acct.ready){ok=false;break}
      const ref=Acct.db.doc(`data/users/${Acct.uid}/${name}`); let done=false;
      for(let i=0;i<3&&!done;i++){try{await withTimeout(d===null?ref.delete():ref.set(d),8000);done=true}catch(e){Acct.lastErr=(e&&e.code)||String(e&&e.message||e);await sleep(1000*(i+1))}}
      if(!done){ok=false; if(q.next===undefined&&d!==null) acctRetry[name]=d} else delete acctRetry[name]}
    q.busy=false; return ok})(); return q.p}
const newer=D.newerRecord;
const withTimeout=(p,ms)=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),ms))]);
async function pInitStorage(){ const remote=await acctGet("puzzleprofile"); P.db=Acct.db; P.uid=Acct.uid;
  const local=store.get(STORE_P); const best=newer(remote||null,local);
  if(best&&remote!==undefined&&best!==remote) acctSet("puzzleprofile",best).then(pStoreNote); // the account had an older copy: bring it up to date
  P.remoteOk=remote!==undefined; return best}
async function pSave(){P.profile.updated=Date.now(); const p=JSON.parse(JSON.stringify(P.profile)); store.set(STORE_P,p);
  const ok=await acctSet("puzzleprofile",p); pStoreNote(ok)}
function pStoreNote(ok){$("p-store").textContent=OFF?"Offline-versjon: ratingen lagres i denne nettleseren på denne maskinen.":ok?"Ratingen er lagret på kontoen din og huskes neste gang du åpner appen, også på andre enheter."
  :"Ratingen er lagret i denne nettleseren, men kom ikke fram til kontoen din. Appen prøver igjen automatisk."}
let pInitDone=false;
async function pInit(){ if(pInitDone) return; pInitDone=true;
  $("p-status").textContent="Laster nøtter …";
  const [list,remote]=await Promise.all([(OFF?Promise.resolve(OFF.puzzles):fetch("puzzles.json").then(r=>r.json())).catch(()=>null),pInitStorage()]);
  if(!list){$("p-status").textContent="Nøttene kunne ikke lastes. Last siden på nytt.";return}
  P.list=list; P.profile=remote; pStoreNote(!!P.db&&P.remoteOk);
  if(!P.profile){$("p-start").hidden=false;$("p-status").textContent="Velg startnivå for å begynne";pStats();return}
  pStats(); pNext()}
document.querySelectorAll("#p-start [data-level]").forEach(b=>b.onclick=async()=>{P.profile=freshProfile(+b.dataset.level);$("p-start").hidden=true;pSave();pStats();pNext()});
function pPick(){const L=P.list,pr=P.profile,target=pr.rating+Math.min(pr.streak,5)*20,seen=new Set(pr.seen);
  let lo=0,hi=L.length; while(lo<hi){const m=(lo+hi)>>1; if(L[m][3]<target) lo=m+1; else hi=m}
  for(const win of [50,100,200,400,3000]){const c=[]; for(let i=lo;i<L.length&&L[i][3]<=target+win;i++) if(!seen.has(L[i][0])) c.push(L[i]);
    for(let i=lo-1;i>=0&&L[i][3]>=target-win;i--) if(!seen.has(L[i][0])) c.push(L[i]);
    if(c.length) return c[Math.floor(Math.random()*c.length)]}
  return L[Math.floor(Math.random()*L.length)]}
async function pNext(){ if(!P.list||!P.profile||P.busy) return;
  const [id,fen,moves,rating]=pPick(); const mv=moves.split(" ");
  const c=new Chess(fen); const color=c.turn()==="w"?"b":"w";
  P.cur={id,fen,moves:mv,rating,step:0,failed:false,done:false,color,chess:c};
  $("p-msg").textContent=""; $("p-msg").className="msg"; $("p-delta").textContent=""; $("p-prating").textContent=rating;
  $("p-turn").className="turnchip "+color; $("p-status").textContent="Se på stillingen …";
  P.board.set({fen,flipped:color==="b",last:null,movable:null,marks:{},arrow:null,badge:null,animate:false});
  $("p-hint").disabled=$("p-solution").disabled=true; $("p-next").disabled=true; P.cur.mine=Math.ceil((mv.length-1)/2);
  P.busy=true; await sleep(900); P.busy=false; if(P.cur.id!==id) return;
  pPlay(mv[0]); P.cur.step=1; pYourTurn()}
function pPlay(uci){const c=P.cur.chess;const m=c.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||undefined});
  P.board.set({fen:c.fen(),last:{from:m.from,to:m.to},marks:{},movable:null});return m}
function pYourTurn(){const cur=P.cur; P.board.set({movable:cur.color}); const n=Math.ceil(cur.step/2);
  $("p-status").textContent=(cur.color==="w"?"Hvit":"Svart")+" i trekket – "+(cur.mine>1?`trekk ${n} av ${cur.mine}`:"finn det beste trekket");
  $("p-hint").disabled=$("p-solution").disabled=false; $("p-next").disabled=true}
async function pMove(from,to,promo){
  const cur=P.cur; if(!cur||cur.done) return; const exp=cur.moves[cur.step];
  const uci=from+to+(promo||""); const test=new Chess(cur.chess.fen()); test.move({from,to,promotion:promo||undefined});
  const ok=uci===exp||(exp&&uci===exp.slice(0,4)&&!exp[4])||test.in_checkmate();
  if(!ok){ if(!cur.failed){cur.failed=true;cur.why="feil trekk";await pFinish(false,true)}
    $("p-msg").className="msg err";$("p-msg").textContent="Ikke riktig. Prøv igjen, eller trykk «Vis løsning».";
    P.board.set({marks:{[to]:"wrong"}}); setTimeout(()=>{if(P.cur===cur&&!cur.done)P.board.set({marks:{}})},700); return}
  (cur.played||(cur.played=[])).push(uci); pPlay(uci); cur.step++; $("p-msg").className="msg ok"; $("p-msg").textContent=cur.step>=cur.moves.length||test.in_checkmate()?"Riktig!":"Riktig! Nøtta er ikke ferdig – se motstanderens svar og finn neste trekk.";
  if(cur.step>=cur.moves.length||test.in_checkmate()){await pFinish(!cur.failed,false);return}
  P.board.set({movable:null}); await sleep(650); if(P.cur!==cur) return;
  pPlay(cur.moves[cur.step]); cur.step++;
  if(cur.step>=cur.moves.length){await pFinish(!cur.failed,false);return}
  pYourTurn()}
async function pFinish(win,stillPlaying){ try{ return await pFinishInner(win,stillPlaying) }catch(e){ console.warn(e); if(!stillPlaying&&P.cur&&!P.cur.done) pDone(win) } }
async function pFinishInner(win,stillPlaying){
  const cur=P.cur,pr=P.profile; if(cur.rated) {if(!stillPlaying) pDone(win);return}
  cur.rated=true;
  const d=ratingChange(pr,cur.rating,win);
  pr.rating=Math.max(100,pr.rating+d); pr.games++; if(win){pr.solved++;pr.streak++}else{pr.failed++;pr.streak=0}
  pr.best=Math.max(pr.best,pr.rating); pr.hist.push(pr.rating); if(pr.hist.length>100)pr.hist=pr.hist.slice(-100);
  pr.seen.push(cur.id); if(pr.seen.length>600)pr.seen=pr.seen.slice(-600);
  const del=$("p-delta"); del.textContent=(d>=0?"+":"−")+Math.abs(d); del.className="delta "+(d>=0?"up":"down");
  pr.log=(pr.log||[]).concat([{r:cur.rating,d,win,why:win?"løst":cur.why||"ikke løst"}]).slice(-12);
  try{pStats()}catch(e){console.warn(e)}
  if(!stillPlaying) pDone(win);
  pSave().catch(e=>console.warn(e));
  // Signed in: the server checks the result and owns the rating (manifest S5); show its numbers.
  if(ACC&&ACC.account&&ACC.account.session) ACC.account.puzzleResult({puzzleId:cur.id,solved:win,moves:cur.played||[],reason:win?"løst":(cur.why||"ikke løst")})
    .then(r=>{ if(P.profile!==pr) return; Object.assign(pr,r.profile); store.set(STORE_P,pr);
      if(r.rated){del.textContent=(r.delta>=0?"+":"−")+Math.abs(Math.round(r.delta)); del.className="delta "+(r.delta>=0?"up":"down")} try{pStats()}catch(e){} })
    .catch(e=>console.warn("puzzle result not saved",e))}
function pDone(win){const cur=P.cur;cur.done=true;P.board.set({movable:null});
  $("p-status").textContent=win?"Løst!":"Nøtta er ferdig"; $("p-msg").className="msg "+(win?"ok":"");
  $("p-msg").textContent=win?"Godt funnet. Neste nøtt blir litt vanskeligere.":"Den telles som ikke løst. Neste nøtt blir litt enklere.";
  $("p-hint").disabled=$("p-solution").disabled=true;$("p-next").disabled=false;$("p-next").focus()}
$("p-next").onclick=()=>{ if(P.cur&&!P.cur.done) return; pNext()};
$("p-hint").onclick=async()=>{const cur=P.cur;if(!cur||cur.done)return; const exp=cur.moves[cur.step];
  P.board.set({marks:{[exp.slice(0,2)]:"hint"}}); $("p-msg").className="msg";$("p-msg").textContent="Hintet viser brikken som skal flyttes. Nøtta teller da som ikke løst.";
  if(!cur.failed){cur.failed=true;cur.why="hint";await pFinish(false,true)}};
$("p-solution").onclick=async()=>{const cur=P.cur;if(!cur||cur.done)return;P.board.set({movable:null});
  if(!cur.failed){cur.failed=true;cur.why="viste løsning";await pFinish(false,true)}
  while(cur.step<cur.moves.length&&P.cur===cur){pPlay(cur.moves[cur.step]);cur.step++;await sleep(900)}
  if(P.cur===cur) pDone(false)};
function pLog(){const el=$("p-log"),L=(P.profile&&P.profile.log)||[]; el.innerHTML="";
  if(!L.length) return; const h=document.createElement("p");h.className="eyebrow";h.textContent="Siste nøtter";el.appendChild(h);
  L.slice().reverse().forEach(x=>{const r=document.createElement("div");r.className="plrow";
    r.innerHTML=`<span class="mono"></span><span></span><span class="mono delta ${x.d>=0?"up":"down"}"></span>`;
    r.children[0].textContent=x.r; r.children[1].textContent=x.why; r.children[2].textContent=(x.d>=0?"+":"−")+Math.abs(x.d); el.appendChild(r)})}
function pStats(){const pr=P.profile; $("p-ratingcard").hidden=$("p-puzzle").hidden=!pr; $("tab-notter").classList.toggle("pickmode",!pr); if(!pr){$("p-rating").textContent="–";["p-solved","p-failed","p-streak"].forEach(i=>$(i).textContent="0");$("p-best").textContent="–";$("p-prating").textContent="–";$("p-log").innerHTML="";$("p-msg").textContent="";$("p-turn").className="turnchip";
  P.board.set({fen:new Chess().fen(),flipped:false,last:null,movable:null,marks:{}});$("p-spark").innerHTML=`<text x="4" y="40" fill="var(--muted)" font-size="12">Utviklingen vises når du har løst noen nøtter</text>`;return}
  $("p-rating").innerHTML=`${pr.rating}${pr.games<10?"<small>?</small>":""}`; $("p-rating").title=pr.games<10?"Foreløpig rating (under 10 nøtter)":"";
  pLog(); $("p-solved").textContent=pr.solved;$("p-failed").textContent=pr.failed;$("p-streak").textContent=pr.streak;$("p-best").textContent=pr.best;
  const h=pr.hist,S=$("p-spark"),W=300,H=70; S.setAttribute("viewBox",`0 0 ${W} ${H}`); S.setAttribute("preserveAspectRatio","none");
  if(h.length<2){S.innerHTML=`<text x="4" y="40" fill="var(--muted)" font-size="12">Utviklingen vises når du har løst noen nøtter</text>`;return}
  const mn=Math.min(...h)-20,mx=Math.max(...h)+20,x=i=>i/(h.length-1)*W,y=v=>H-6-(v-mn)/(mx-mn)*(H-12);
  const pts=h.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  S.innerHTML=`<polygon points="0,${H} ${pts} ${W},${H}" fill="var(--accent)" opacity=".12"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${x(h.length-1)}" cy="${y(h[h.length-1])}" r="3.5" fill="var(--accent)"/>`}
$("p-statsbtn").onclick=()=>{const c=$("p-ratingcard"),o=!c.classList.contains("open"); c.classList.toggle("open",o); $("p-statsbtn").setAttribute("aria-expanded",String(o)); $("p-statsbtn").textContent=o?"Skjul":"Statistikk"};
$("p-reset").onclick=()=>{const row=$("p-resetrow");row.innerHTML=`<span>Starte på nytt med ny rating?</span><button class="btn small" id="p-reset-yes" type="button">Ja, nullstill</button><button class="btn small" id="p-reset-no" type="button">Avbryt</button>`;
  $("p-reset-no").onclick=()=>{row.innerHTML="";row.appendChild(resetBtn)}; $("p-reset-yes").onclick=async()=>{P.profile=null;store.set(STORE_P,null); acctSet("puzzleprofile",null); row.innerHTML="";row.appendChild(resetBtn);
    $("p-start").hidden=false;$("p-status").textContent="Velg startnivå for å begynne";$("p-delta").textContent="";P.cur=null;P.board.set({movable:null});pStats()}};
const resetBtn=$("p-reset");

/* =====================================================================
   PLAY TAB
   ===================================================================== */
const Gm={record:{w:0,d:0,l:0},counted:false,chess:null,color:"w",rating:1500,over:false,thinking:false,engine:Engine(),board:null,flipped:false,token:0,choice:"w"};
const STORE_G="spill-mot-bot";
Gm.board=Board($("g-board"),{onMove:gMove});
function levelFor(r){return{skill:Math.max(0,Math.min(20,Math.round((r-1000)/90))),depth:Math.max(1,Math.min(16,Math.round((r-600)/150)+1)),rand:r<1100?(1100-r)/1000*0.6:0}}
function ratingDesc(r){return r<900?"Nybegynner: gjør mange feil og overser enkle trusler.":r<1300?"Hobbyspiller: kjenner reglene og grunnleggende taktikk.":r<1700?"Klubbspiller: solid, men kan feile i kompliserte stillinger.":r<2100?"Sterk klubbspiller: straffer de fleste feil.":r<2500?"Mesternivå: svært vanskelig å slå.":"Toppnivå: nesten feilfri."}
function gSlider(){const r=+$("g-rating").value;$("g-ratingval").textContent="ca. "+r;$("g-ratingdesc").textContent=ratingDesc(r)}
$("g-rating").addEventListener("input",gSlider); $("g-rating").addEventListener("change",()=>gSave()); gSlider();
document.querySelectorAll(".seg [data-color]").forEach(b=>b.onclick=()=>{document.querySelectorAll(".seg [data-color]").forEach(x=>x.setAttribute("aria-pressed",x===b?"true":"false"));Gm.choice=b.dataset.color;gSave()});
/* ---- time controls ---- */
const fmtMin=F.formatMinutes;
const TC_PRESETS=D.TIME_CONTROL_PRESETS, tcKey=D.timeControlKey, tcLabel=F.timeControlLabel, tcLong=F.timeControlLong;
Gm.tc=null; Gm.myTcs=[]; Gm.clock=null;
function tcRender(){ const g=$("g-tcs"); g.innerHTML=""; const sel=tcKey(Gm.tc);
  const mk=(t,cls)=>{const b=document.createElement("button");b.type="button";b.className="tcchip"+(cls?" "+cls:"");b.textContent=tcLabel(t);b.title=tcLong(t);
    b.setAttribute("aria-pressed",tcKey(t)===sel?"true":"false"); b.onclick=e=>{if(e.target.classList.contains("x"))return; Gm.tc=t; tcRender(); gSave()}; return b};
  g.appendChild(mk(null,"none"));
  TC_PRESETS.forEach(([m,i])=>g.appendChild(mk({m,i})));
  Gm.myTcs.forEach((t,ix)=>{ if(TC_PRESETS.some(([m,i])=>m===t.m&&i===t.i)) return; const b=mk(t,"mine");
    const x=document.createElement("span");x.className="x";x.textContent="×";x.setAttribute("role","button");x.setAttribute("aria-label",`Fjern ${tcLabel(t)}`);
    x.onclick=e=>{e.stopPropagation();Gm.myTcs.splice(ix,1);if(tcKey(Gm.tc)===tcKey(t))Gm.tc=null;tcRender();gSave()}; b.appendChild(x); g.appendChild(b)});
  $("g-tcval").textContent=tcLong(Gm.tc)+(Gm.chess&&!Gm.over&&tcKey(Gm.tc)!==tcKey(Gm.clock&&Gm.clock.tc)?" (fra neste parti)":"")}
function tcFromInputs(){ const msg=$("g-tcmsg"); msg.className="msg"; msg.textContent="";
  const r=D.parseTimeControl($("g-tcmin").value,$("g-tcinc").value);
  if("error" in r){msg.className="msg err";msg.textContent=F.timeControlErrorText(r.error);return null}
  return r.tc}
$("g-tcuse").onclick=()=>{const t=tcFromInputs(); if(!t)return; Gm.tc=t; tcRender(); gSave(); $("g-tcmsg").className="msg ok"; $("g-tcmsg").textContent=`Valgt: ${tcLong(t)}.`};
$("g-tcsave").onclick=()=>{const t=tcFromInputs(); if(!t)return; Gm.tc=t;
  if(!Gm.myTcs.some(x=>x.m===t.m&&x.i===t.i)&&!TC_PRESETS.some(([m,i])=>m===t.m&&i===t.i)) Gm.myTcs.push(t);
  tcRender(); gSave(); $("g-tcmsg").className="msg ok"; $("g-tcmsg").textContent=`Lagret ${tcLabel(t)} blant valgene dine.`};

/* ---- the clock ----
   Times are kept in ms. The clock starts once both sides have made their first move;
   the mover gets the increment after each timed move. */
const now=()=>performance.now();
const clockNew=D.newClock;
function clockLeft(side){return D.timeLeft(Gm.clock,side,now())}
function clockPos(){return {ply:Gm.chess.history().length,turn:Gm.chess.turn(),over:!!Gm.over}}
function clockSync(){ if(!Gm.clock||!Gm.chess) return; Gm.clock=D.syncClock(Gm.clock,clockPos(),now())}
function clockMoved(mover){ if(!Gm.clock) return; Gm.clock=D.clockAfterMove(Gm.clock,mover,clockPos(),now())}
const clockFmt=F.clockText;
function clockDraw(){ const c=Gm.clock, show=!!(c&&Gm.chess); $("g-clock-top").hidden=$("g-clock-bot").hidden=!show; if(!show) return;
  const me=Gm.color, bot=me==="w"?"b":"w"; const top=Gm.flipped===(me==="b")?bot:me; // the side shown at the top of the board
  const bottom=top===me?bot:me;
  [[$("g-clock-top"),top],[$("g-clock-bot"),bottom]].forEach(([el,side])=>{ const left=clockLeft(side);
    el.querySelector(".cname").textContent=side===me?`Du (${me==="w"?"hvit":"svart"})`:`Stockfish, ca. ${Gm.rating}`;
    el.querySelector(".ctime").textContent=clockFmt(left);
    el.classList.toggle("on",c.running===side); el.classList.toggle("out",Gm.flag===side);
    el.classList.toggle("low",Gm.flag!==side&&left<Math.min(20000,c.tc.m*60000*0.1+1000))})}
let clockTimer=null;
function clockTick(){ const c=Gm.clock; if(c&&c.running&&!Gm.over){ const side=c.running; if(clockLeft(side)<=0){ c[side]=0; c.running=null; gFlag(side); return } }
  clockDraw()}
function clockLoop(){ if(clockTimer) return; clockTimer=setInterval(clockTick,100)}
function gFlag(side){ // `side` ran out of time
  Gm.token++; Gm.engine.stop(); Gm.thinking=false; Gm.flag=side;
  const other=side==="w"?"b":"w"; const pcs=Gm.chess.board().flat().filter(x=>x&&x.color===other&&x.type!=="k");
  Gm.flagDraw=pcs.length===0||(pcs.length===1&&["n","b"].includes(pcs[0].type)); // the other side cannot mate: draw
  gSave(); gRender()}
/* ---- help during the game: 0 none, 1 evaluation bar, 2 bar + hint ---- */
const ASSIST_DESC=["Du spiller uten hjelp.","En bar ved siden av brettet viser hvem som ligger best an.","Baren, pluss en Hint-knapp som viser det beste trekket ditt."];
Gm.assistPick=0; Gm.assist=0; Gm.evalEngine=Engine(); Gm.evalFen=null; Gm.ev=null; Gm.hintArrow=null; Gm.hints=0;
function assistDraw(){ document.querySelectorAll("#g-assist [data-assist]").forEach(b=>b.setAttribute("aria-pressed",+b.dataset.assist===Gm.assistPick?"true":"false"));
  $("g-assistdesc").textContent=ASSIST_DESC[Gm.assistPick]+(Gm.chess&&!Gm.over&&Gm.assistPick!==Gm.assist?" Gjelder fra neste parti.":"")}
document.querySelectorAll("#g-assist [data-assist]").forEach(b=>b.onclick=()=>{Gm.assistPick=+b.dataset.assist; assistDraw(); gSave()});
/* Evaluate the live position in the background (separate engine, so the bot is never slowed down). */
async function gEval(){ const c=Gm.chess; if(!c||Gm.assist<1) return; const fen=c.fen(); if(fen===Gm.evalFen) return; Gm.evalFen=fen;
  const t=terminalEval(fen); if(t){Gm.ev=t; gBar(); return}
  try{ const r=await Gm.evalEngine.search(fen,{depth:12,multipv:1}); if(!Gm.chess||Gm.chess.fen()!==fen||!r.lines.length) return;
    const l=r.lines[0], sgn=fen.split(" ")[1]==="w"?1:-1; Gm.ev=l.type==="mate"?{cp:null,mate:l.val*sgn}:{cp:l.val*sgn,mate:null}; gBar() }catch(e){}}
function gBar(){ const on=Gm.assist>=1&&!!Gm.chess; $("g-evalbar").hidden=!on; $("g-boardrow").classList.toggle("withbar",on); if(!on) return;
  const ev=Gm.ev, w=wp(ev); $("g-evalbar").classList.toggle("flip",Gm.flipped); $("g-evalw").style.height=w+"%";
  const t=ev?evText(ev):"", ws=Gm.flipped?$("g-lbltop"):$("g-lblbot"), bs=Gm.flipped?$("g-lblbot"):$("g-lbltop");
  ws.style.color="var(--bar-black)"; bs.style.color="var(--bar-white)"; ws.textContent=w>=50?t:""; bs.textContent=w<50?t:"";
  const mine=Gm.color==="w"?w:100-w; $("g-evalbar").title=!ev?"Vurderer …":mine>60?"Du ligger best an":mine<40?"Boten ligger best an":"Omtrent likt";
  $("g-evalbar").setAttribute("aria-label",$("g-evalbar").title+(t?` (${t})`:""))}
/* Hint: the engine's best move for you, shown as an arrow. */
async function gHint(){ const c=Gm.chess; if(!c||Gm.over||Gm.assist<2||c.turn()!==Gm.color||Gm.view!==null) return;
  if(Gm.hintArrow){Gm.hintArrow=null; gRender(true); return}
  const fen=c.fen(); $("g-hint").disabled=true; $("g-hint").textContent="Tenker …";
  try{ const r=await Gm.evalEngine.search(fen,{depth:14,multipv:1}); if(!Gm.chess||Gm.chess.fen()!==fen) return;
    const u=r.best; if(!u||u==="(none)") return; const t=new Chess(fen); const m=t.move({from:u.slice(0,2),to:u.slice(2,4),promotion:u[4]||"q"});
    Gm.hintArrow=u; Gm.hints++; $("g-msg").className="msg"; $("g-msg").textContent=`Hint: ${m?m.san:u}${Gm.hints>1?` · ${Gm.hints} hint brukt i partiet`:""}`; gRender(true)
  }catch(e){} finally{ $("g-hint").disabled=false; gHintBtn() }}
function gHintBtn(){ const c=Gm.chess, b=$("g-hint"); b.hidden=Gm.assist<2; if(b.hidden) return;
  b.disabled=!c||Gm.over||Gm.thinking||c.turn()!==Gm.color||Gm.view!==null; b.textContent=Gm.hintArrow?"Skjul hint":"Hint"; b.setAttribute("aria-pressed",Gm.hintArrow?"true":"false")}
$("g-hint").onclick=gHint;
function gClearEnd(){const e=$("g-board").querySelector(".endcard"); if(e) e.remove(); Gm.board.set({marks:{}})}
function gNew(){gClearEnd(); Gm.token++; Gm.engine.stop(); Gm.rating=+$("g-rating").value;
  Gm.assist=Gm.assistPick; Gm.ev=null; Gm.evalFen=null; Gm.hintArrow=null; Gm.hints=0;
  Gm.counted=false; Gm.endedAt=null; Gm.flag=null; Gm.flagDraw=false; Gm.clock=clockNew(Gm.tc); Gm.gameId="b_"+Date.now(); Gm.color=Gm.choice==="r"?(Math.random()<.5?"w":"b"):Gm.choice; Gm.chess=new Chess(); Gm.over=false; Gm.flipped=Gm.color==="b";
  $("g-after").hidden=true;$("g-confirm").hidden=true;$("g-msg").textContent="";$("g-msg").className="msg"; gSave(); gRender(true); gMaybeBot()}
function gPgn(){const h=[`[Event "Parti mot Stockfish"]`,`[Date "${new Date(Gm.endedAt||Date.now()).toISOString().slice(0,10).replace(/-/g,".")}"]`,
  `[White "${Gm.color==="w"?"Du":"Stockfish (ca. "+Gm.rating+")"}"]`,`[Black "${Gm.color==="b"?"Du":"Stockfish (ca. "+Gm.rating+")"}"]`,`[Result "${gResult()||"*"}"]`];
  if(Gm.clock) h.push(`[TimeControl "${Math.round(Gm.clock.tc.m*60)}+${Gm.clock.tc.i}"]`);
  if(Gm.flag) h.push(`[Termination "Time forfeit"]`);
  if(Gm.assist) h.push(`[Annotator "Hjelp: ${["ingen","stilling","stilling + hint"][Gm.assist]}${Gm.hints?`, ${Gm.hints} hint`:""}"]`);
  const c=new Chess(); const hist=Gm.chess.history(); let s=""; hist.forEach((m,i)=>{if(i%2===0)s+=(i/2+1)+". ";s+=m+" "}); return h.join("\n")+"\n\n"+s+(gResult()||"*")}
function gResult(){const c=Gm.chess;if(!c)return null;if(Gm.resigned)return Gm.color==="w"?"0-1":"1-0";
  if(Gm.flag) return Gm.flagDraw?"1/2-1/2":Gm.flag==="w"?"0-1":"1-0";if(c.in_checkmate())return c.turn()==="w"?"0-1":"1-0";if(c.in_draw()||c.in_stalemate()||c.in_threefold_repetition())return"1/2-1/2";return null}
function gStatus(){const c=Gm.chess; if(!c){$("g-status").textContent="Ingen parti i gang";$("g-turn").className="turnchip";return}
  const t=c.turn(); $("g-turn").className="turnchip "+t; const res=gResult();
  if(res){Gm.over=true; let s;
    if(Gm.resigned) s="Du ga opp";
    else if(Gm.flag) s=Gm.flagDraw?"Tiden gikk ut – remis":Gm.flag===Gm.color?"Tiden din gikk ut – boten vant":"Botens tid gikk ut – du vant!";
    else if(c.in_checkmate()) s=(t===Gm.color)?"Sjakkmatt – boten vant":"Sjakkmatt – du vant!";
    else if(c.in_stalemate()) s="Patt – remis"; else if(c.in_threefold_repetition()) s="Tre gangers gjentakelse – remis"; else if(c.insufficient_material()) s="For lite materiale – remis"; else s="Remis";
    $("g-status").textContent=s; $("g-after").hidden=false; gCount(); gEndCard(s); return}
  $("g-status").textContent=Gm.thinking?"Boten tenker …":t===Gm.color?(c.in_check()?"Sjakk! Din tur":"Din tur"):"Botens tur"}
/* Reviewing: Gm.view is the ply being looked at, or null for the live position.
   Looking back never changes the game, and the clocks keep running. */
Gm.view=null;
function gViewFen(ply){const t=new Chess(); const h=Gm.chess.history(); for(let i=0;i<ply;i++) t.move(h[i]); return {fen:t.fen(),last:ply?t.history({verbose:true})[ply-1]:null}}
function gView(ply){ const c=Gm.chess; if(!c) return; const n=c.history().length; ply=Math.max(0,Math.min(n,ply));
  const prev=Gm.view===null?n:Gm.view; Gm.view=ply>=n?null:ply; gRender(Math.abs(prev-ply)!==1)}
function gRender(noAnim){const c=Gm.chess; Gm.over=!!(c&&gResult()); const hist=c?c.history({verbose:true}):[]; const n=hist.length;
  if(Gm.view!==null&&(!c||Gm.view>=n)) Gm.view=null;
  const live=Gm.view===null; const shown=live?{fen:c?c.fen():new Chess().fen(),last:hist[n-1]}:gViewFen(Gm.view);
  Gm.board.set({fen:shown.fen,flipped:Gm.flipped,animate:!noAnim,last:shown.last?{from:shown.last.from,to:shown.last.to}:null,
    movable:live&&c&&!Gm.over&&!Gm.thinking&&c.turn()===Gm.color?Gm.color:null, arrow:live&&Gm.hintArrow?Gm.hintArrow:null});
  const mt=$("g-moves"); mt.innerHTML=""; mt.hidden=!n; const at=live?n:Gm.view;
  (c?c.history():[]).forEach((m,i)=>{if(i%2===0){const k=document.createElement("span");k.className="n";k.textContent=(i/2+1)+". ";mt.appendChild(k)}
    const b=document.createElement("button");b.type="button";b.className="gm"+(i+1===at?" on":"");b.dataset.ply=i+1;b.textContent=m;mt.appendChild(b);mt.appendChild(document.createTextNode(" "))});
  if(live) mt.scrollTop=mt.scrollHeight; else {const on=mt.querySelector(".gm.on"); if(on){const top=on.offsetTop-mt.offsetTop; if(top<mt.scrollTop||top+on.offsetHeight>mt.scrollTop+mt.clientHeight) mt.scrollTop=top-mt.clientHeight/2}}
  $("g-viewbar").classList.toggle("idle",live); $("g-live").tabIndex=live?-1:0; if(!live){const mv=Gm.view?`${Math.ceil(Gm.view/2)}${Gm.view%2?".":"..."} ${c.history()[Gm.view-1]}`:"startstillingen";
    $("g-viewtxt").textContent=`Viser ${mv}${!Gm.over&&c.turn()===Gm.color?" · din tur":""}`}
  $("g-first").disabled=$("g-prev").disabled=!c||at===0; $("g-last").disabled=$("g-next").disabled=!c||live;
  $("g-title").textContent=c?`Du (${Gm.color==="w"?"hvit":"svart"}) mot Stockfish, ca. ${Gm.rating}`:"Stockfish";
  $("g-sub").textContent=!c?"Velg styrke, farge og tid, og start et parti.":Gm.over?"Partiet er slutt.":(Gm.clock?tcLong(Gm.clock.tc)+" · ":"")+"Klikk eller dra en brikke for å flytte.";
  if(c){const fens=[new Chess().fen()];const t=new Chess();c.history().forEach(m=>{t.move(m);fens.push(t.fen())});showOpening($("g-opening"),openingInfo(fens))} else $("g-opening").hidden=true;
  $("g-undo").disabled=!c||Gm.resigned||c.history().length<1; $("g-resign").disabled=!c||Gm.over; gStatus(); clockSync(); clockDraw(); tcRender(); gPanels(); gBar(); gEval(); gHintBtn(); assistDraw()}
/* Show the setup card only when it is needed: no game, a finished game, or when asked for. */
Gm.setupOpen=false;
function gPanels(){ const c=Gm.chess, live=!!(c&&!Gm.over), setup=!c||Gm.setupOpen;
  $("g-setup").hidden=!setup; $("g-game").hidden=!c||setup; $("g-actions").hidden=!live;
  $("g-setupclose").hidden=!(c&&Gm.setupOpen); $("g-setupclose").textContent=live?"Tilbake til partiet":"Tilbake";
  $("g-setupwarn").hidden=!(live&&Gm.setupOpen&&c.history().length>0);
  $("tab-spill").classList.toggle("setupmode",setup)}
/* Every "Nytt parti" opens the setup, so strength, colour and time are chosen each time. */
function gOpenSetup(){ const e=$("g-board").querySelector(".endcard"); if(e) e.remove();
  Gm.setupOpen=true; gPanels(); $("g-sub").textContent="Velg styrke, farge og tid, og start et parti."; window.scrollTo(0,0); $("g-new").focus({preventScroll:true})}
function gMove(from,to,promo){const c=Gm.chess;if(!c||Gm.over||c.turn()!==Gm.color)return;
  if(Gm.clock&&clockLeft(Gm.color)<=0){clockTick();return}
  const m=c.move({from,to,promotion:promo||undefined}); if(!m)return; clockMoved(Gm.color); Gm.hintArrow=null;
  if(Gm.assist>=2&&/^Hint:/.test($("g-msg").textContent)) $("g-msg").textContent="";
  gSave(); gRender(); gMaybeBot()}
async function gMaybeBot(){const c=Gm.chess; if(!c||Gm.over||gResult()||c.turn()===Gm.color) return;
  const tok=Gm.token; Gm.thinking=true; gRender(); const L=levelFor(Gm.rating), t0=Date.now(); let uci=null;
  const bot=c.turn(); let budget=0; if(Gm.clock){const left=clockLeft(bot), inc=Gm.clock.inc; // spend a slice of the remaining time
    budget=Math.max(80,Math.min(left/25+inc*0.8,left/3)); if(c.history().length<2) budget=Math.min(budget,1500)}
  try{ if(Math.random()<L.rand){const ms=c.moves({verbose:true});const m=ms[Math.floor(Math.random()*ms.length)];uci=m.from+m.to+(m.promotion||"")}
    else{const r=await Gm.engine.search(c.fen(),{depth:L.depth,skill:L.skill,multipv:1,movetime:budget});uci=r.best}}
  catch(e){Gm.thinking=false;$("g-msg").className="msg err";$("g-msg").textContent="Sjakkmotoren kunne ikke starte i denne nettleseren.";gRender();return}
  if(tok!==Gm.token) return; const wait=(Gm.clock?Math.min(700,budget*0.5):700)-(Date.now()-t0); if(wait>0) await sleep(wait); if(tok!==Gm.token) return;
  if(Gm.clock&&clockLeft(bot)<=0){clockTick();return}
  Gm.thinking=false; if(uci&&uci!=="(none)"){c.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||undefined}); clockMoved(bot)} gSave(); gRender()}
function gEndReason(){const c=Gm.chess,t=c.turn(),side=t==="w"?"Hvit":"Svart";
  if(Gm.resigned) return "Partiet er registrert som tap.";
  if(Gm.flag) return (Gm.flag===Gm.color?"Klokken din nådde null.":"Botens klokke nådde null.")+(Gm.flagDraw?" Motstanderen har ikke nok brikker til å sette matt, så partiet blir remis.":"");
  if(c.in_checkmate()) return `${side} står i sjakk og har ingen lovlige trekk.`;
  if(c.in_stalemate()) return `${side} står ikke i sjakk, men har ingen lovlige trekk. Det kalles patt, og partiet blir remis. Pass på at motstanderen alltid har et trekk når du leder stort.`;
  if(c.in_threefold_repetition()) return "Samme stilling har oppstått tre ganger.";
  if(c.insufficient_material()) return "Ingen av sidene har nok brikker igjen til å sette matt.";
  return "Partiet ble remis etter 50-trekksregelen."}
function gEndCard(title){ const el=$("g-board"); if(el.querySelector(".endcard")) return;
  const c=Gm.chess; if(c.in_stalemate()||c.in_checkmate()){const g=c.board();let k=null;g.forEach((row,r)=>row.forEach((x,f)=>{if(x&&x.type==="k"&&x.color===c.turn())k="abcdefgh"[f]+(8-r)}));
    if(k) Gm.board.set({marks:{[k]:"mated"}})}
  const d=document.createElement("div"); d.className="endcard"; d.setAttribute("role","status");
  d.innerHTML=`<b></b><p></p><div class="row"><button class="btn primary small" type="button" data-a="new">Nytt parti</button><button class="btn small" type="button" data-a="an">Analyser partiet</button><button class="btn small" type="button" data-a="x">Lukk</button></div>`;
  d.querySelector("b").textContent=title; d.querySelector("p").textContent=gEndReason();
  d.addEventListener("click",e=>{const a=e.target.dataset&&e.target.dataset.a; if(!a) return; d.remove();
    if(a==="new") gOpenSetup(); if(a==="an") $("g-analyse").click()});
  d.addEventListener("pointerdown",e=>e.stopPropagation()); el.appendChild(d)}
function gUncount(){const r=Gm.lastCounted; if(r&&Gm.record[r]>0) Gm.record[r]--; Gm.lastCounted=null; gRecord(); if(Gm.gameId) Games.remove(Gm.gameId)}
function gArchive(){ if(!Gm.chess||!gResult()) return; if(!Gm.gameId) Gm.gameId="b_"+Date.now(); Gm.endedAt=Gm.endedAt||Date.now();
  const old=Games.get(Gm.gameId); const pgn=gPgn(); if(old&&old.pgn===pgn) return;
  Games.put({id:Gm.gameId,source:"bot",pgn,color:Gm.color,botRating:Gm.rating,result:gResult(),ended:Gm.endedAt});
  aGames(); gReport(pgn)}
/* Signed in: send the finished game to the server once; it checks it and updates the bot rating. */
function gReport(pgn){ if(!(ACC&&ACC.account&&ACC.account.session)||Gm.reported===Gm.gameId) return; Gm.reported=Gm.gameId;
  const c=Gm.chess, reason=Gm.resigned?"resign":Gm.flag?"timeout":c.in_checkmate()?"checkmate":c.in_stalemate()?"stalemate":"draw";
  ACC.account.finishBotGame({clientId:Gm.gameId,pgn,color:Gm.color,botRating:Math.max(400,Math.min(3200,Math.round(Gm.rating))),
    timeControl:Gm.clock?Gm.clock.tc:null,reason,...(Gm.flag?{flagged:Gm.flag}:{})})
    .then(r=>{ if(r&&r.rating){$("g-msg").className="msg ok"; $("g-msg").textContent=`Bot-rating: ${r.rating.before} → ${r.rating.after}`} })
    .catch(e=>console.warn("game not saved",e))}
function gCount(){ if(Gm.counted) return; Gm.counted=true; const r=gResult(); const mine=Gm.color==="w"?"1-0":"0-1";
  const k=r==="1/2-1/2"?"d":r===mine?"w":"l"; Gm.record[k]++; Gm.lastCounted=k; Gm.endedAt=Date.now(); gRecord(); gSave(); gArchive()}
function gRecord(){const r=Gm.record||{w:0,d:0,l:0}; $("g-record").textContent=(r.w+r.d+r.l)?`Dine resultater mot boten: ${r.w} seire, ${r.d} remis, ${r.l} tap`:""}
function clockState(){const c=Gm.clock; if(!c) return null; return {tc:c.tc,w:Math.round(clockLeft("w")),b:Math.round(clockLeft("b")),inc:c.inc,hist:c.hist}}
function gSave(){const d={assistPick:Gm.assistPick,assist:Gm.assist,hints:Gm.hints,clock:clockState(),flag:Gm.flag||null,flagDraw:!!Gm.flagDraw,tc:Gm.tc,myTcs:Gm.myTcs,gameId:Gm.gameId||null,endedAt:Gm.endedAt||null,pgn:Gm.chess?Gm.chess.pgn():"",color:Gm.color,rating:Gm.rating,resigned:!!Gm.resigned,active:!!Gm.chess,
    pick:+$("g-rating").value,choice:Gm.choice,record:Gm.record,updated:Date.now()};
  store.set(STORE_G,d); acctSet("botgame",d)}
async function gLoad(){ gRender(true); const remote=await acctGet("botgame"); const s=newer(remote||null,store.get(STORE_G)); if(!s) return;
  if(Gm.chess&&Gm.chess.history().length) return; // user already started playing while we loaded
  try{ Gm.record=Object.assign({w:0,d:0,l:0},s.record||{}); if(s.choice){Gm.choice=s.choice;document.querySelectorAll(".seg [data-color]").forEach(x=>x.setAttribute("aria-pressed",x.dataset.color===s.choice?"true":"false"))}
    $("g-rating").value=s.pick||s.rating||1500; gSlider();
    if(s.tc!==undefined) Gm.tc=s.tc; if(Array.isArray(s.myTcs)) Gm.myTcs=s.myTcs.slice();
    if(s.assistPick!==undefined) Gm.assistPick=+s.assistPick||0; Gm.assist=+s.assist||0; Gm.hints=+s.hints||0;
    if(s.active!==false&&s.pgn!==undefined){const c=new Chess(); if(s.pgn) c.load_pgn(s.pgn); Gm.chess=c; Gm.color=s.color; Gm.rating=s.rating; Gm.resigned=!!s.resigned; Gm.flipped=s.color==="b";
      Gm.gameId=s.gameId||("b_"+(s.updated||Date.now())); Gm.endedAt=s.endedAt||s.updated||null;
      Gm.flag=s.flag||null; Gm.flagDraw=!!s.flagDraw;
      Gm.clock=s.clock?{tc:s.clock.tc,w:s.clock.w,b:s.clock.b,inc:s.clock.inc,running:null,since:0,hist:(s.clock.hist||[]).slice()}:null}
    Gm.counted=!!(Gm.chess&&gResult()); if(Gm.counted){await gamesReady; if(!Games.get(Gm.gameId)) gArchive()}
    if(Gm.chess&&!gResult()) Gm.setupOpen=false; /* a game in progress comes back on the board, not the setup */ gRender(true); gRecord(); gMaybeBot()}catch(e){gRender(true)}}
$("g-new").onclick=()=>{Gm.resigned=false;Gm.view=null;Gm.setupOpen=false;gNew()};
$("g-showsetup").onclick=gOpenSetup;
$("g-setupclose").onclick=()=>{Gm.setupOpen=false;gRender(true)};
$("g-again").onclick=gOpenSetup;
$("g-first").onclick=()=>gView(0); $("g-prev").onclick=()=>gView((Gm.view??Gm.chess.history().length)-1);
$("g-next").onclick=()=>gView((Gm.view??Gm.chess.history().length)+1); $("g-last").onclick=()=>gView(Infinity); $("g-live").onclick=()=>gView(Infinity);
$("g-moves").addEventListener("click",e=>{const b=e.target.closest(".gm"); if(b) gView(+b.dataset.ply)});
$("g-board").addEventListener("pointerdown",e=>{ if(Gm.view!==null&&!e.target.closest(".endcard")){e.stopPropagation();gView(Infinity)} },true);
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden"&&Gm.chess&&!Gm.over&&Gm.clock) gSave()});
tcRender(); clockLoop();
$("g-flip").onclick=()=>{Gm.flipped=!Gm.flipped;gRender()};
$("g-undo").onclick=()=>{const c=Gm.chess;if(!c||Gm.resigned)return; Gm.view=null; Gm.hintArrow=null; if(Gm.flag){Gm.over=true} if(Gm.over&&Gm.counted){Gm.counted=false;gUncount()} gClearEnd(); Gm.token++; Gm.engine.stop(); Gm.thinking=false;
  c.undo(); if(c.turn()!==Gm.color) c.undo();
  if(Gm.clock){const k=c.history().length, h=Gm.clock.hist[k]||Gm.clock.hist[0]; Gm.clock.running=null; Gm.clock.w=h.w; Gm.clock.b=h.b; Gm.clock.hist.length=k+1}
  Gm.flag=null; Gm.flagDraw=false; gSave(); gRender(); gMaybeBot()};
$("g-resign").onclick=()=>{$("g-confirm").hidden=false};
$("g-no").onclick=()=>{$("g-confirm").hidden=true};
$("g-yes").onclick=()=>{$("g-confirm").hidden=true;Gm.token++;Gm.engine.stop();Gm.thinking=false;Gm.resigned=true;gSave();gRender()};
$("g-analyse").onclick=async()=>{await gamesReady; gArchive(); const g=Games.get(Gm.gameId); A.next=g?g.id:null; location.hash="#analyse"};

/* =====================================================================
   MY GAMES — finished games vs the bot and PGNs you add, with saved analysis.
   Each game is its own document under data/users/<id>/ (kind "game"); browser storage is a backup.
   ===================================================================== */
const STORE_GL="mine-partier", STORE_SEL="valgt-parti";
const EXGAME={kind:"game",id:"ex_maria",source:"example",color:"w",ended:Date.parse("2026-10-27T19:50:00+01:00"),pgn:EX.pgn,result:"1-0",
  analysis:{depth:EX.depth,evals:[EX.start].concat(EX.res.map(r=>r.ev)),res:EX.res.map(r=>Object.assign({},r)),acc:{w:92.9,b:89.6}}};
const clean=g=>JSON.parse(JSON.stringify(g,(k,v)=>k[0]==="_"?undefined:v));
const Games={list:[],
  all(){return this.list.slice().sort((a,b)=>(b.ended||0)-(a.ended||0)).concat([EXGAME])},
  get(id){return id===EXGAME.id?EXGAME:this.list.find(g=>g.id===id)},
  persist(){ const L=this.list.slice().sort((a,b)=>(b.ended||0)-(a.ended||0)).slice(0,150).map(clean); store.set(STORE_GL,L)},
  put(g){ g.kind="game"; g.updated=Date.now(); const i=this.list.findIndex(x=>x.id===g.id); if(i>=0)this.list[i]=g; else this.list.push(g);
    this.persist(); acctSet(g.id,clean(g)); aGames()},
  remove(id){ this.list=this.list.filter(g=>g.id!==id); this.persist(); acctSet(id,null); aGames()},
  setAnalysis(id,an){ const g=this.get(id); if(!g||g.source==="example") return; g.analysis=JSON.parse(JSON.stringify(an)); this.put(g)},
  addPgn(text,parsed){ const key=parsed.moves.map(m=>m.san).join(" "); let h=0; for(const ch of key){h=(h*31+ch.charCodeAt(0))|0}
    const id="p_"+(h>>>0).toString(36)+"_"+parsed.moves.length; if(!this.get(id)){
      const H=parsed.headers; const mine=/^(du|bentarne|bent arne)$/i;
      this.put({id,source:"pgn",pgn:text,ended:Date.now(),result:H.Result||"*",color:mine.test(H.Black||"")?"b":mine.test(H.White||"")?"w":null})} return id},
  remember(id){store.set(STORE_SEL,id)},
  async load(){ const local=store.get(STORE_GL)||[]; const remote=await acctList(); const byId={};
    for(const g of local) byId[g.id]=g;
    if(remote) for(const g of remote){const l=byId[g.id]; if(!l||(g.updated||0)>=(l.updated||0)) byId[g.id]=g}
    this.list=Object.values(byId);
    if(remote){const rid=new Set(remote.map(g=>g.id)); for(const g of local) if(!rid.has(g.id)) acctSet(g.id,clean(g))} // push games only this browser had
    this.persist()}};
async function acctList(){ if(!await Acct.ready) return undefined;
  try{const snap=await withTimeout(Acct.db.collection(`data/users/${Acct.uid}`).where("kind","==","game").limit(500).get(),10000);
    return snap.docs.map(d=>JSON.parse(JSON.stringify(d.data())))}catch(e){return undefined}}
function gameMeta(g){ let parsed=null; try{parsed=g._p||(g._p=parsePGN(g.pgn))}catch(e){}
  const H=parsed?parsed.headers:{}; const plies=parsed?parsed.moves.length:0;
  let op=g._op; if(!op&&parsed&&OPENINGS){op=g._op=openingInfo([parsed.startFen,...parsed.moves.map(m=>m.fen)])}
  const r=g.result||H.Result||"*"; let cls="n",txt=r.replace("1/2-1/2","½–½").replace("-","–");
  if(g.color&&r!=="*"){const mine=g.color==="w"?"1-0":"0-1"; cls=r==="1/2-1/2"?"d":r===mine?"w":"l"; txt=cls==="w"?"Seier":cls==="d"?"Remis":"Tap"}
  if(r==="*"){txt="Uferdig"}
  const W=H.White||"Hvit",B=H.Black||"Svart";
  const tcH=H.TimeControl&&/^(\d+)\+(\d+)$/.exec(H.TimeControl); const tcTxt=tcH?`${fmtMin(+tcH[1]/60)}+${tcH[2]}`:null;
  return {title:`${W} – ${B}`,sub:[tcTxt,op&&op.name,`${Math.ceil(plies/2)} trekk`].filter(Boolean).join(" · "),cls,txt}}
function fmtDate(t){ if(!t) return ""; const d=new Date(t),now=new Date(); const same=d.toDateString()===now.toDateString();
  const y=new Date(now); y.setDate(now.getDate()-1);
  const hm=d.toLocaleTimeString("no-NO",{hour:"2-digit",minute:"2-digit"});
  return same?`I dag<br>${hm}`:d.toDateString()===y.toDateString()?`I går<br>${hm}`:d.toLocaleDateString("no-NO",{day:"numeric",month:"short"})+(d.getFullYear()!==now.getFullYear()?" "+d.getFullYear():"")}
function aGames(scroll){ const el=$("a-games"); if(!el) return; const L=Games.all(); el.innerHTML="";
  const n=L.length-1; $("a-gcount").textContent=`${L.length} ${L.length===1?"parti":"partier"}`;
  if(!n){const e=document.createElement("div");e.className="gempty";e.textContent="Når du har spilt ferdig et parti mot boten, havner det her. Du kan også legge til partier med PGN.";el.appendChild(e)}
  for(const g of L){ const m=gameMeta(g), sel=g.id===A.gameId, an=!!(g.analysis&&g.analysis.res);
    const row=document.createElement("div"); row.className="grow"; row.setAttribute("role","button"); row.setAttribute("aria-selected","false"); row.tabIndex=0; row.dataset.id=g.id;
    row.innerHTML=`<span class="gd">${g.source==="example"?"chess.com":fmtDate(g.ended)}</span><span class="gt"><b></b><span></span></span><span class="res ${m.cls}"></span><span class="gs"></span>`;
    row.querySelector(".gt b").textContent=m.title; row.querySelector(".gt span").textContent=m.sub; row.querySelector(".res").textContent=m.txt;
    const gs=row.querySelector(".gs"); const myAcc=an&&g.analysis.acc&&g.color?g.analysis.acc[g.color]:null;
    if(sel&&A.running){gs.textContent="Analyseres nå"}
    else if(an){gs.innerHTML=myAcc!=null?`Nøyaktighet <span class="acc1">${myAcc.toFixed(1)}</span>`:"Analysert"}
    else gs.textContent="Ikke analysert ennå";
    el.appendChild(row);
    if(sel&&scroll){const L=$("a-games"), top=row.offsetTop-L.offsetTop; if(top<L.scrollTop||top+row.offsetHeight>L.scrollTop+L.clientHeight) L.scrollTop=top}}}
$("a-games").addEventListener("click",e=>{const r=e.target.closest(".grow"); if(r) aOpen(r.dataset.id)});
$("a-games").addEventListener("keydown",e=>{const r=e.target.closest(".grow"); if(!r) return;
  if(e.key==="Enter"||e.key===" "){e.preventDefault(); aOpen(r.dataset.id)}
  else if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault(); const n=e.key==="ArrowDown"?r.nextElementSibling:r.previousElementSibling; if(n&&n.classList.contains("grow")) n.focus()}
  e.stopPropagation()});

/* =====================================================================
   ROUTER + KEYS
   ===================================================================== */
const TABS=["hjem","analyse","notter","spill"];
function route(){const t=TABS.includes(location.hash.slice(1))?location.hash.slice(1):"hjem";
  TABS.forEach(x=>{$("tab-"+x).hidden=x!==t}); document.body.dataset.tab=t;
  $("modname").textContent={analyse:"Analyse",notter:"Sjakknøtter",spill:"Spill mot bot"}[t]||"";
  document.querySelectorAll("#footer [data-for]").forEach(p=>p.hidden=p.dataset.for!==t);
  if(t==="notter") pInit();
  if(t==="spill"&&(!Gm.chess||Gm.over)) gOpenSetup();
  if(t==="analyse"){ if(A.next){const id=A.next; A.next=null; aOpen(id)} else aMode(A.running&&A.mode==="view"?"view":"choose") } if(t==="hjem") homeRender(); window.scrollTo(0,0)}
/* Home: one card per module, each with a line about where you left off. */
$("h-ic-pl").src=PIECES.wking; $("h-ic-pz").src=PIECES.wknight; $("h-ic-an").src=PIECES.wqueen;
async function homeRender(){
  const c=Gm.chess, r=Gm.record||{w:0,d:0,l:0};
  $("h-st-pl").textContent=c&&!Gm.over&&c.history().length?`Parti i gang · ${Math.ceil(c.history().length/2)} trekk${Gm.clock?" · "+tcLabel(Gm.clock.tc):""}. Fortsett der du slapp.`
    :(r.w+r.d+r.l)?`Dine resultater: ${r.w} seire, ${r.d} remis, ${r.l} tap`:"Velg styrke og tid, og sett i gang.";
  const L=Games.all(), last=L[0]; if(last){const m=gameMeta(last); $("h-st-an").textContent=`Siste parti: ${m.title} · ${m.txt}`}
  if(A.running) $("h-st-an").textContent="Analyse pågår – trykk for å se den";
  let pr=P.profile; if(!pr){ pr=store.get(STORE_P); if(!pr){ const remote=await acctGet("puzzleprofile"); if(remote) pr=remote } }
  $("h-st-pz").textContent=pr?`Din nøtterating: ${pr.rating}${pr.games<10?" (foreløpig)":""} · ${pr.solved} løst`:"Velg startnivå og løs din første nøtt."}
window.addEventListener("hashchange",route);
document.addEventListener("keydown",e=>{if(/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName))return;
  if(!$("tab-analyse").hidden&&A.G&&!$("a-view").hidden){
    if(e.key==="ArrowRight"){aNav("next");e.preventDefault()}else if(e.key==="ArrowLeft"){aNav("prev");e.preventDefault()}else if(e.key==="Home")aNav("first");else if(e.key==="End")aNav("last");else if(e.key==="Escape"&&A.ex)exLeave(false)}
  else if(!$("tab-spill").hidden&&Gm.chess){ const n=Gm.chess.history().length, at=Gm.view??n;
    if(e.key==="ArrowRight"){gView(at+1);e.preventDefault()}else if(e.key==="ArrowLeft"){gView(at-1);e.preventDefault()}else if(e.key==="Home"){gView(0);e.preventDefault()}else if(e.key==="End"){gView(Infinity);e.preventDefault()}}});

openingsReady.then(()=>{ if(A.G){A.G.op=openingInfo(A.G.fens);aHeader()} if(Gm.chess) gRender(true); aGames()});
// show the browser's copy at once, then refresh from the account
Games.list=(store.get(STORE_GL)||[]);
function aStart(){ aGames() }
aStart();
const gamesReady=Games.load().then(()=>{ if(!A.running){ const before=A.gameId; aStart(); if(A.gameId===before) aGames() } if(!$("tab-hjem").hidden) homeRender() });
gLoad().then(()=>{ if(!$("tab-hjem").hidden) homeRender() }); route(); sizeBar();
/* Read-only view of the state for end-to-end tests (?test). */
if(new URLSearchParams(location.search).has("test")) window.__sjakk={A,P,Gm,Games};
