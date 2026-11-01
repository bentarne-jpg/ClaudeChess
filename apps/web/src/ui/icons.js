/* Move-class badges shared by every board and list. */
export const CLS={brilliant:{n:"Brilliant",g:"!!",c:"--c-brilliant"},great:{n:"Great",g:"!",c:"--c-great"},best:{n:"Best",g:"★",c:"--c-best"},
  excellent:{n:"Excellent",g:"✓",c:"--c-excellent"},good:{n:"Good",g:"✓",c:"--c-good"},book:{n:"Book",g:"B",c:"--c-book"},
  forced:{n:"Forced",g:"→",c:"--c-forced"},inaccuracy:{n:"Inaccuracy",g:"?!",c:"--c-inaccuracy"},
  mistake:{n:"Mistake",g:"?",c:"--c-mistake"},blunder:{n:"Blunder",g:"??",c:"--c-blunder"},pending:{n:"Venter",g:"…",c:"--c-pending"}};
export function icon(cls,size){const k=CLS[cls];const s=size||18;
  return `<svg class="ico" viewBox="0 0 20 20" width="${s}" height="${s}" aria-hidden="true"><circle cx="10" cy="10" r="9.5" fill="var(${k.c})"/><text x="10" y="10.5" text-anchor="middle" dominant-baseline="middle" font-family="Archivo,Arial,sans-serif" font-weight="800" font-size="${k.g.length>1?9.5:11}" fill="#fff">${k.g}</text></svg>`}
