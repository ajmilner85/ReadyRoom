// Runs IN THE BROWSER on the CATCC kit page (scripts/catcc/figma-kit.gen.ts injects it): walks every
// [data-figma] specimen and serialises what the browser laid out (boxes, fills, borders, radii, shadows,
// flex layout, text runs with their fonts, inline SVG with its computed styles) into node specs the Figma
// plugin (figma/catcc-kit/plugin.cjs) turns into Figma nodes. Plain JS on purpose: it is injected as is.
(() => {
  const R = (n) => Math.round(n * 100) / 100;
  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };

  /** css colour → { c: '#RRGGBB', a } (null when fully transparent or not a colour) */
  function color(v, mul = 1) {
    if (!v || v === 'none' || v === 'transparent') return null;
    const m = /rgba?\(([^)]+)\)/.exec(v);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean);
    const [r, g, b] = p.slice(0, 3).map((x) => Math.round(parseFloat(x)));
    let a = p.length > 3 ? (p[3].endsWith('%') ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
    a *= mul;
    if (a <= 0.001) return null;
    const h = (n) => n.toString(16).padStart(2, '0');
    return { c: `#${h(r)}${h(g)}${h(b)}`.toUpperCase(), a: Math.round(a * 1000) / 1000 };
  }

  const fontFamily = (ff) => ff.split(',')[0].trim().replace(/^['"]|['"]$/g, '');

  /** a readable layer name for an element */
  function nameOf(el) {
    const al = el.getAttribute('aria-label') || el.getAttribute('title');
    if (al) return al.slice(0, 40);
    const cls = typeof el.className === 'string' ? el.className.split(' ').filter(Boolean)[0] : '';
    const tag = el.tagName.toLowerCase();
    return cls ? `${tag}.${cls}` : tag;
  }

  function radius(cs, w, h) {
    const one = (v) => (String(v).includes('%') ? (Math.min(w, h) * parseFloat(v)) / 100 : px(v));
    const r = [one(cs.borderTopLeftRadius), one(cs.borderTopRightRadius), one(cs.borderBottomRightRadius), one(cs.borderBottomLeftRadius)].map((x) => R(Math.min(x, Math.min(w, h) / 2)));
    return r.every((x) => x === r[0]) ? r[0] : r;
  }

  function border(cs) {
    const sides = ['Top', 'Right', 'Bottom', 'Left'].map((s) => ({ w: cs[`border${s}Style`] === 'none' || cs[`border${s}Style`] === 'hidden' ? 0 : px(cs[`border${s}Width`]), c: color(cs[`border${s}Color`]), st: cs[`border${s}Style`] }));
    const on = sides.filter((s) => s.w > 0 && s.c);
    if (!on.length) return null;
    const main = on.reduce((a, b) => (b.w > a.w ? b : a));
    const ws = sides.map((s) => (s.w > 0 && s.c ? R(s.w) : 0));
    return { c: main.c.c, a: main.c.a, w: ws.every((x) => x === ws[0]) ? ws[0] : ws, dash: main.st === 'dashed' ? [Math.max(2, main.w * 3), Math.max(2, main.w * 3)] : main.st === 'dotted' ? [main.w, main.w] : undefined };
  }

  function shadows(v) {
    if (!v || v === 'none') return undefined;
    const out = [];
    // "rgba(0, 0, 0, 0.45) 0px 6px 20px 0px, inset ..."
    for (const part of v.split(/,(?![^(]*\))/)) {
      const c = /rgba?\([^)]+\)/.exec(part);
      const nums = part.replace(/rgba?\([^)]+\)/, '').replace('inset', '').trim().split(/\s+/).map(px);
      const col = c ? color(c[0]) : null;
      if (!col) continue;
      out.push({ inset: part.includes('inset'), x: nums[0] || 0, y: nums[1] || 0, blur: nums[2] || 0, spread: nums[3] || 0, c: col.c, a: col.a });
    }
    return out.length ? out : undefined;
  }

  function textStyle(cs, opacity) {
    const lh = cs.lineHeight === 'normal' ? null : px(cs.lineHeight);
    const ls = cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing);
    return {
      f: fontFamily(cs.fontFamily),
      wt: Number(cs.fontWeight) || 400,
      sz: R(px(cs.fontSize)),
      ls: R(ls),
      lh: lh === null ? null : R(lh),
      col: color(cs.color, opacity),
      up: cs.textTransform === 'uppercase' || undefined,
      it: cs.fontStyle === 'italic' || undefined,
      ul: cs.textDecorationLine.includes('underline') || undefined,
    };
  }

  /** a text run of `node` (a DOM Text) inside element `el`, positioned against `origin` */
  function textSpec(node, el, origin, opacity) {
    const raw = node.textContent || '';
    const cs = getComputedStyle(el);
    const s = cs.whiteSpace.startsWith('pre') ? raw : raw.replace(/\s+/g, ' ').trim();
    if (!s) return null;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0);
    if (!rects.length) return null;
    const box = range.getBoundingClientRect();
    const tops = new Set(rects.map((r) => Math.round(r.top)));
    const trunc = cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible';
    const er = el.getBoundingClientRect();
    return {
      t: 'text',
      n: s.slice(0, 32),
      s,
      x: R((trunc ? er.left + px(cs.paddingLeft) : box.left) - origin.left),
      y: R(box.top - origin.top),
      cy: R(box.top + box.height / 2 - origin.top),
      w: R(trunc ? er.width - px(cs.paddingLeft) - px(cs.paddingRight) : box.width),
      h: R(box.height),
      wrap: tops.size > 1 || undefined,
      trunc: trunc || undefined,
      ...textStyle(cs, opacity),
    };
  }

  const isFlex = (cs) => cs.display === 'flex' || cs.display === 'inline-flex';
  const blockish = (d) => d === 'block' || d === 'flex' || d === 'grid' || d === 'table' || d === 'list-item' || d === 'flow-root';

  // ---------------------------------------------------------------- SVG

  const PAINT = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-miterlimit', 'opacity'];
  const camel = (s) => s.replace(/-(.)/g, (_, c) => c.toUpperCase());
  const scaleOf = (m) => (m ? Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) : 1);

  function svgNode(svg, origin) {
    const r = svg.getBoundingClientRect();
    const clone = svg.cloneNode(true);
    const src = [svg, ...svg.querySelectorAll('*')];
    const dst = [clone, ...clone.querySelectorAll('*')];
    const texts = [];
    const drop = [];
    src.forEach((el, i) => {
      const d = dst[i];
      const cs = getComputedStyle(el);
      if (cs.display === 'none') {
        drop.push(d);
        return;
      }
      const tag = el.tagName.toLowerCase();
      if (tag === 'text') {
        if (!el.closest('defs, clipPath, mask')) {
          let op = 1;
          for (let p = el; p && p !== svg.parentElement; p = p.parentElement) op *= Number(getComputedStyle(p).opacity);
          const k = scaleOf(el.getScreenCTM());
          const b = el.getBoundingClientRect();
          const s = (el.textContent || '').replace(/\s+/g, ' ').trim();
          const anchor = cs.textAnchor;
          if (s && b.width > 0)
            texts.push({
              t: 'text',
              n: s.slice(0, 32),
              s,
              x: R(b.left - origin.left),
              y: R(b.top - origin.top),
              cy: R(b.top + b.height / 2 - origin.top),
              w: R(b.width),
              h: R(b.height),
              anchor: anchor === 'middle' ? 'center' : anchor === 'end' ? 'right' : 'left',
              ax: R((anchor === 'middle' ? b.left + b.width / 2 : anchor === 'end' ? b.right : b.left) - origin.left),
              f: fontFamily(cs.fontFamily),
              wt: Number(cs.fontWeight) || 400,
              sz: R(px(cs.fontSize) * k),
              ls: R(cs.letterSpacing === 'normal' ? 0 : px(cs.letterSpacing) * k),
              lh: null,
              col: color(cs.fill, op * Number(cs.fillOpacity || 1)),
              it: cs.fontStyle === 'italic' || undefined,
            });
        }
        drop.push(d);
        return;
      }
      d.removeAttribute('class');
      d.removeAttribute('style');
      if (tag === 'svg' && i === 0) {
        d.setAttribute('width', String(R(r.width)));
        d.setAttribute('height', String(R(r.height)));
        d.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        if (!d.getAttribute('viewBox')) d.setAttribute('viewBox', `0 0 ${R(r.width)} ${R(r.height)}`);
        return;
      }
      if (['g', 'defs', 'clippath', 'mask', 'title', 'desc'].includes(tag)) {
        if (tag === 'g' && cs.opacity !== '1') d.setAttribute('opacity', cs.opacity);
        if (tag === 'title' || tag === 'desc') drop.push(d);
        return;
      }
      for (const p of PAINT) {
        const v = cs[camel(p)];
        if (v !== undefined && v !== '') d.setAttribute(p, v);
      }
      const nonScaling = cs.vectorEffect === 'non-scaling-stroke';
      const k = nonScaling ? scaleOf(el.getScreenCTM()) || 1 : 1;
      const sw = px(cs.strokeWidth) / k;
      d.setAttribute('stroke-width', String(Math.round(sw * 10000) / 10000));
      if (cs.strokeDasharray && cs.strokeDasharray !== 'none') d.setAttribute('stroke-dasharray', cs.strokeDasharray.split(/[\s,]+/).map((x) => Math.round((px(x) / k) * 10000) / 10000).join(' '));
      d.removeAttribute('vector-effect');
      // a trail dot: a near-zero segment with a square cap, which Figma's SVG import drops; drawn as a square instead
      const dm = tag === 'path' && /^M\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*[hl]\s*-?0\.00\d+(\s+-?0\.00\d+)?$/.exec(el.getAttribute('d') || '');
      if (dm && cs.strokeLinecap === 'square') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        const x = parseFloat(dm[1]);
        const y = parseFloat(dm[2]);
        rect.setAttribute('x', String(x - sw / 2));
        rect.setAttribute('y', String(y - sw / 2));
        rect.setAttribute('width', String(sw));
        rect.setAttribute('height', String(sw));
        rect.setAttribute('fill', cs.stroke);
        rect.setAttribute('opacity', cs.opacity);
        if (cs.strokeOpacity !== '1') rect.setAttribute('fill-opacity', cs.strokeOpacity);
        d.replaceWith(rect);
      }
    });
    drop.forEach((d) => d.remove());
    // SVG paint is rgb() / #hex with a separate opacity (rgba() is CSS, not SVG 1.1): split the alpha out
    for (const d of [clone, ...clone.querySelectorAll('*')]) {
      for (const p of ['fill', 'stroke']) {
        const v = d.getAttribute(p);
        const m = v && /^rgba\(([^)]+)\)$/.exec(v);
        if (!m) continue;
        const q = m[1].split(/[\s,/]+/).filter(Boolean);
        const a = parseFloat(q[3]);
        d.setAttribute(p, `rgb(${q[0]}, ${q[1]}, ${q[2]})`);
        d.setAttribute(`${p}-opacity`, String(Math.round(a * parseFloat(d.getAttribute(`${p}-opacity`) || '1') * 1000) / 1000));
        if (a === 0) d.setAttribute(p, 'none');
      }
    }
    const node = { t: 'svg', n: nameOf(svg), x: R(r.left - origin.left), y: R(r.top - origin.top), w: R(r.width), h: R(r.height), svg: new XMLSerializer().serializeToString(clone) };
    if (!texts.length) return node;
    // the SVG and its lettering as real text layers, in one frame
    return { t: 'frame', n: node.n, x: node.x, y: node.y, w: node.w, h: node.h, clip: false, kids: [{ ...node, x: 0, y: 0 }, ...texts.map((t) => ({ ...t, x: R(t.x - node.x), y: R(t.y - node.y), cy: R(t.cy - node.y), ax: R(t.ax - node.x) }))] };
  }

  // ---------------------------------------------------------------- elements

  function walk(el, origin, inheritedOpacity = 1) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    if (el instanceof SVGSVGElement) return svgNode(el, origin);
    if (el instanceof SVGElement) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0 && !el.childNodes.length) return null;
    const opacity = Number(cs.opacity);
    const fill = color(cs.backgroundColor);
    const stroke = border(cs);
    const sh = shadows(cs.boxShadow);
    const node = {
      t: 'frame',
      n: nameOf(el),
      x: R(r.left - origin.left),
      y: R(r.top - origin.top),
      w: R(r.width),
      h: R(r.height),
    };
    if (fill) node.fill = fill;
    if (stroke) node.stroke = stroke;
    const rad = radius(cs, r.width, r.height);
    if (rad && (Array.isArray(rad) ? rad.some(Boolean) : rad)) node.r = rad;
    if (opacity < 1) node.op = opacity;
    if (sh) node.fx = sh;
    if (cs.overflow !== 'visible' || cs.overflowX !== 'visible') node.clip = true;
    if (cs.position === 'absolute' || cs.position === 'fixed') node.abs = true;
    const grow = px(cs.flexGrow);
    if (grow > 0) node.grow = 1;

    // a <select>: its chosen option's text (the native arrow is not drawn)
    if (el.tagName === 'SELECT') {
      const opt = el.options[el.selectedIndex];
      node.kids = [{ t: 'text', n: 'value', s: opt ? opt.text : '', x: R(px(cs.paddingLeft) + px(cs.borderLeftWidth)), cy: R(r.height / 2), y: 0, w: R(r.width), h: R(r.height), ...textStyle(cs, 1) }];
      return node;
    }

    const kids = [];
    const kidEls = [];
    for (const c of el.childNodes) {
      if (c.nodeType === 3) {
        const t = textSpec(c, el, r, 1);
        if (t) {
          kids.push(t);
          kidEls.push(null);
        }
      } else if (c.nodeType === 1) {
        const k = walk(c, r, 1);
        if (k) {
          kids.push(k);
          kidEls.push(c);
        }
      }
    }
    // an element that is only a run of text with no box of its own: the text itself, named for the element
    if (kids.length === 1 && kids[0].t === 'text' && !fill && !stroke && !sh && !node.abs && !(cs.textOverflow === 'ellipsis')) {
      const t = kids[0];
      return { ...t, n: nameOf(el) === el.tagName.toLowerCase() ? t.n : nameOf(el), x: R(t.x + node.x), y: R(t.y + node.y), cy: R(t.cy + node.y), grow: node.grow, abs: node.abs, op: node.op };
    }
    node.kids = kids;
    layout(el, cs, node, kidEls);
    return node;
  }

  /** flex boxes (and plain block stacks) as Figma auto layout, where the browser's positions can be reproduced */
  function layout(el, cs, node, kidEls) {
    const flex = isFlex(cs);
    const inflow = node.kids.filter((k) => !k.abs);
    if (!inflow.length) return;
    let dir;
    if (flex) dir = cs.flexDirection.startsWith('column') ? 'V' : 'H';
    else {
      // a block whose children are all block boxes stacked top to bottom
      const allBlock = kidEls.every((c, i) => node.kids[i].abs || (c && blockish(getComputedStyle(c).display)));
      if (!allBlock || inflow.length < 1) return;
      dir = 'V';
    }
    if (cs.flexDirection.endsWith('reverse')) return;
    const bl = px(cs.borderLeftWidth), bt = px(cs.borderTopWidth), br = px(cs.borderRightWidth), bb = px(cs.borderBottomWidth);
    const pad = [px(cs.paddingTop) + bt, px(cs.paddingRight) + br, px(cs.paddingBottom) + bb, px(cs.paddingLeft) + bl].map(R);
    const gapMain = flex ? px(dir === 'H' ? cs.columnGap : cs.rowGap) : 0;
    const wrap = flex && cs.flexWrap === 'wrap' && dir === 'H';
    if (wrap) {
      // a wrapping row: auto layout WRAP with the same gaps
      node.lay = { dir, gap: R(gapMain), cgap: R(px(cs.rowGap)), pad, main: 'MIN', cross: 'MIN', wrap: true, hugW: false, hugH: true };
      return;
    }
    const jc = cs.justifyContent;
    const main = jc === 'center' ? 'CENTER' : jc === 'flex-end' || jc === 'end' ? 'MAX' : jc === 'space-between' ? 'SPACE_BETWEEN' : 'MIN';
    const ai = flex ? cs.alignItems : 'stretch';
    const cross = ai === 'center' ? 'CENTER' : ai === 'flex-end' || ai === 'end' ? 'MAX' : ai === 'baseline' && dir === 'H' ? 'BASELINE' : 'MIN';
    const W = node.w, H = node.h;
    const cw = W - pad[1] - pad[3], ch = H - pad[0] - pad[2];
    // main-axis positions the auto layout would give; any difference (margins) goes into a padded wrapper
    const pos = (k) => (dir === 'H' ? k.x : k.y);
    const size = (k) => (dir === 'H' ? k.w : k.h);
    const out = [];
    let cursor = dir === 'H' ? pad[3] : pad[0];
    const sum = inflow.reduce((a, k) => a + size(k), 0) + gapMain * (inflow.length - 1);
    if (main === 'CENTER') cursor += ((dir === 'H' ? cw : ch) - sum) / 2;
    if (main === 'MAX') cursor += (dir === 'H' ? cw : ch) - sum;
    for (const k of node.kids) {
      if (k.abs) {
        out.push(k);
        continue;
      }
      let d = main === 'SPACE_BETWEEN' ? 0 : pos(k) - cursor;
      if (d < -0.75) return; // overlap: keep absolute positions
      // cross axis offset for MIN alignment
      let dc = cross === 'MIN' ? (dir === 'H' ? k.y - pad[0] : k.x - pad[3]) : 0;
      if (dc < -0.75) return;
      if (k.t === 'text' && cross === 'MIN' && dir === 'H') dc = 0;
      const stretch = !flex || ai === 'stretch' || ai === 'normal' ? Math.abs((dir === 'H' ? k.h : k.w) - (dir === 'H' ? ch : cw)) < 0.75 : false;
      if (d > 0.75 || dc > 0.75) {
        out.push({ t: 'frame', n: 'margin', x: k.x - (dir === 'H' ? d : dc), y: k.y - (dir === 'H' ? dc : d), w: k.w + (dir === 'H' ? d : dc), h: k.h + (dir === 'H' ? dc : d), kids: [{ ...k, x: dir === 'H' ? d : dc, y: dir === 'H' ? dc : d }], lay: { dir, gap: 0, pad: dir === 'H' ? [R(dc), 0, 0, R(d)] : [R(d), 0, 0, R(dc)], main: 'MIN', cross: 'MIN', hugW: true, hugH: true }, grow: k.grow, stretch: stretch || undefined });
        k.grow = undefined;
      } else out.push(stretch ? { ...k, stretch: true } : k);
      cursor = pos(k) + size(k) + gapMain;
    }
    // what the auto layout will hold: the children, margin wrappers included
    const held = out.filter((k) => !k.abs);
    const childMain = held.reduce((a, k) => a + size(k), 0) + gapMain * (held.length - 1);
    const childCross = Math.max(...held.map((k) => (dir === 'H' ? k.h : k.w)));
    const hugMain = main !== 'SPACE_BETWEEN' && !inflow.some((k) => k.grow) && Math.abs((dir === 'H' ? cw : ch) - childMain) < 1;
    const hugCross = Math.abs((dir === 'H' ? ch : cw) - childCross) < 1;
    node.kids = out;
    node.lay = { dir, gap: R(gapMain), pad, main, cross, hugW: dir === 'H' ? hugMain : hugCross, hugH: dir === 'H' ? hugCross : hugMain };
  }

  // ---------------------------------------------------------------- specimens

  window.__catccFigmaKit = () => {
    const out = [];
    for (const host of document.querySelectorAll('[data-figma]')) {
      const el = host.children.length === 1 ? host.children[0] : host;
      const r = el.getBoundingClientRect();
      const origin = { left: r.left, top: r.top };
      const node = walk(el, origin);
      if (!node) continue;
      node.x = 0;
      node.y = 0;
      const sec = host.closest('[data-kit-section]');
      out.push({ section: sec ? sec.getAttribute('data-kit-section') : '', sectionTitle: sec ? sec.getAttribute('data-kit-title') : '', name: host.getAttribute('data-figma'), variant: host.getAttribute('data-variant') || '', node });
    }
    return out;
  };
})();
