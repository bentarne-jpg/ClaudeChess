/*
 * The shared chessboard component (manifest A10, U4): tap-to-move and drag with animation, castling by
 * moving the king onto the rook, promotion choice, badges, arrows and marks. Used by every feature.
 */
import { Chess } from "chess.js";
import { PIECES } from "./pieces.js";
import { icon } from "./icons.js";

const pieceKey=ch=>(ch===ch.toUpperCase()?"w":"b")+({p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen",k:"king"})[ch.toLowerCase()];

export function Board(el,opts={}){
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
