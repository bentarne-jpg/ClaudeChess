/*
 * Small SVG charts for the profile (built with DOM APIs, manifest S7). Lines share one time scale;
 * bars show counts per week. Colours come from CSS variables so both themes work.
 */
const NS = "http://www.w3.org/2000/svg";
const svgEl = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
};

export interface Series { name: string; colour: string; points: { t: number; r: number }[] }

/** Rating over time, one line per series, with min/max labels and the last value. */
export function lineChart(series: Series[], opts: { width?: number; height?: number; label: string }): SVGSVGElement {
  const W = opts.width ?? 640, H = opts.height ?? 200, padL = 44, padR = 12, padT = 12, padB = 24;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label, class: "chart" });
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) return svg;
  let t0 = Math.min(...pts.map((p) => p.t)), t1 = Math.max(...pts.map((p) => p.t));
  let r0 = Math.min(...pts.map((p) => p.r)), r1 = Math.max(...pts.map((p) => p.r));
  if (t1 === t0) { t0 -= 86400000; t1 += 86400000; }
  const pad = Math.max(20, (r1 - r0) * 0.1); r0 = Math.floor((r0 - pad) / 10) * 10; r1 = Math.ceil((r1 + pad) / 10) * 10;
  const x = (t: number) => padL + ((t - t0) / (t1 - t0)) * (W - padL - padR);
  const y = (r: number) => padT + (1 - (r - r0) / (r1 - r0)) * (H - padT - padB);
  for (const r of [r0, Math.round((r0 + r1) / 2), r1]) {
    svg.append(svgEl("line", { x1: padL, x2: W - padR, y1: y(r), y2: y(r), class: "grid" }));
    const lab = svgEl("text", { x: padL - 6, y: y(r) + 4, "text-anchor": "end", class: "axis" }); lab.textContent = String(r); svg.append(lab);
  }
  const fmt = (t: number) => new Date(t).toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
  for (const [t, anchor] of [[t0, "start"], [t1, "end"]] as const) {
    const lab = svgEl("text", { x: x(t), y: H - 6, "text-anchor": anchor, class: "axis" }); lab.textContent = fmt(t); svg.append(lab);
  }
  for (const s of series) {
    if (!s.points.length) continue;
    const d = s.points.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.r).toFixed(1)}`).join(" ");
    svg.append(svgEl("path", { d, fill: "none", stroke: s.colour, "stroke-width": 2, "vector-effect": "non-scaling-stroke", "stroke-linejoin": "round" }));
    const last = s.points.at(-1)!;
    svg.append(svgEl("circle", { cx: x(last.t), cy: y(last.r), r: 3.5, fill: s.colour }));
  }
  return svg;
}

/** Two counts per week side by side (e.g. puzzles and games). */
export function weekBars(weeks: { week: string; a: number; b: number }[], opts: { a: string; b: string; colourA: string; colourB: string; label: string }): SVGSVGElement {
  const W = 640, H = 160, padL = 28, padB = 22, padT = 10, n = Math.max(1, weeks.length);
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label, class: "chart" });
  const max = Math.max(1, ...weeks.flatMap((w) => [w.a, w.b]));
  const slot = (W - padL) / n, bw = Math.max(3, slot * 0.32);
  const y = (v: number) => padT + (1 - v / max) * (H - padT - padB);
  svg.append(svgEl("line", { x1: padL, x2: W, y1: y(0), y2: y(0), class: "grid" }));
  const top = svgEl("text", { x: padL - 4, y: y(max) + 4, "text-anchor": "end", class: "axis" }); top.textContent = String(max); svg.append(top);
  weeks.forEach((w, i) => {
    const cx = padL + slot * i + slot / 2;
    for (const [v, dx, c] of [[w.a, -bw / 2 - 1, opts.colourA], [w.b, bw / 2 + 1, opts.colourB]] as const) {
      if (v > 0) svg.append(svgEl("rect", { x: cx + dx - bw / 2, y: y(v), width: bw, height: y(0) - y(v), rx: 2, fill: c }));
    }
    if (i % Math.ceil(n / 6) === 0 || i === n - 1) {
      const lab = svgEl("text", { x: cx, y: H - 6, "text-anchor": "middle", class: "axis" }); lab.textContent = `uke ${w.week.split("-W")[1]}`; svg.append(lab);
    }
  });
  return svg;
}
