// CATCC Kit, a Figma development plugin: builds a "CATCC Kit" page of colour Variables, text styles and
// Components / Component Sets from the CATCC UI kit (/catcc/kit). This is the plugin's source; code.js is
// this file with the kit's data (kit.json) in front of it, written by `node scripts/catcc/figma-kit.gen.ts`.
// Plain JS (no build step, no typings installed): the pure helpers at the top are unit-tested
// (scripts/catcc/figma-kit/figma-kit.test.ts); run() is the part that talks to Figma.
/* eslint-disable */

var PAGE_NAME = 'CATCC Kit';
var COLLECTION = 'CATCC';
var STYLE_PREFIX = 'CATCC/';

// ---------------------------------------------------------------- pure helpers

var WEIGHT_STYLE = { 100: 'Thin', 200: 'ExtraLight', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'SemiBold', 700: 'Bold', 800: 'ExtraBold', 900: 'Black' };
/** generic CSS families the kit's fonts fall back to, as Figma fonts */
var FAMILY_MAP = { 'system-ui': 'Inter', 'sans-serif': 'Inter', 'ui-sans-serif': 'Inter', 'ui-monospace': 'IBM Plex Mono', monospace: 'IBM Plex Mono', serif: 'Inter' };

/** CSS family + weight (+ italic) → Figma FontName */
function fontName(family, weight, italic) {
  var fam = FAMILY_MAP[family] || family;
  var w = Math.round((Number(weight) || 400) / 100) * 100;
  var style = WEIGHT_STYLE[Math.min(900, Math.max(100, w))];
  if (italic) style = style === 'Regular' ? 'Italic' : style + ' Italic';
  return { family: fam, style: style };
}
var fontKey = function (f) {
  return f.family + '|' + f.style;
};

/** '#rgb', '#rrggbb', '#rrggbbaa', 'rgb(…)', 'rgba(…)' → { r, g, b, a } (0..1) */
function cssColor(v) {
  var s = String(v).trim();
  var m;
  if ((m = /^#([0-9a-f]{3,8})$/i.exec(s))) {
    var h = m[1];
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = function (i) {
      return parseInt(h.slice(i, i + 2), 16) / 255;
    };
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 };
  }
  if ((m = /^rgba?\(([^)]+)\)$/i.exec(s))) {
    var p = m[1].split(/[\s,/]+/).filter(Boolean);
    return { r: parseFloat(p[0]) / 255, g: parseFloat(p[1]) / 255, b: parseFloat(p[2]) / 255, a: p.length > 3 ? parseFloat(p[3]) : 1 };
  }
  throw new Error('not a colour: ' + v);
}
var r3 = function (n) {
  return Math.round(n * 1000) / 1000;
};
var hex2 = function (x) {
  return Math.round(x * 255).toString(16).padStart(2, '0');
};
/** the key a colour is matched to a token by: '#RRGGBB|alpha' */
function colorKey(c, a) {
  return c.toUpperCase() + '|' + r3(a);
}
function tokenColorKey(value) {
  var c = cssColor(value);
  return colorKey('#' + hex2(c.r) + hex2(c.g) + hex2(c.b), c.a);
}

/** 'a=b, c=d' → [['a','b'],['c','d']] */
function variantPairs(v) {
  return String(v || '')
    .split(',')
    .map(function (s) {
      return s.trim();
    })
    .filter(Boolean)
    .map(function (s) {
      var i = s.indexOf('=');
      return i < 0 ? ['variant', s] : [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    });
}

/**
 * Variant names for one component set: every variant carries every property of the set (missing ones are
 * 'default'), in the order the properties first appear, and no two variants are the same.
 */
function normalizeVariants(variants) {
  var keys = [];
  var pairs = variants.map(variantPairs);
  pairs.forEach(function (ps) {
    ps.forEach(function (p) {
      if (keys.indexOf(p[0]) < 0) keys.push(p[0]);
    });
  });
  if (!keys.length) keys = ['variant'];
  var seen = {};
  return pairs.map(function (ps, i) {
    var name = keys
      .map(function (k) {
        var hit = ps.find(function (p) {
          return p[0] === k;
        });
        return k + '=' + (hit ? hit[1] : keys.length === 1 && !ps.length ? 'v' + (i + 1) : 'default');
      })
      .join(', ');
    if (seen[name]) name += ', copy=' + i;
    seen[name] = true;
    return name;
  });
}

/** specimens → sections → component groups (by name), in the kit's order */
function groupSpecimens(kit) {
  var out = [];
  var bySec = {};
  (kit.sections || []).forEach(function (s) {
    bySec[s.id] = { id: s.id, title: s.title, groups: [], byName: {} };
    out.push(bySec[s.id]);
  });
  kit.specimens.forEach(function (sp) {
    var sec = bySec[sp.section];
    if (!sec) {
      sec = bySec[sp.section] = { id: sp.section, title: sp.sectionTitle || sp.section, groups: [], byName: {} };
      out.push(sec);
    }
    var g = sec.byName[sp.name];
    if (!g) {
      g = sec.byName[sp.name] = { name: sp.name, items: [] };
      sec.groups.push(g);
    }
    g.items.push(sp);
  });
  out.forEach(function (s) {
    delete s.byName;
  });
  return out.filter(function (s) {
    return s.groups.length;
  });
}

/** every font a node tree (and the text styles) uses */
function collectFonts(kit) {
  var set = {};
  var add = function (f) {
    set[fontKey(f)] = f;
  };
  var walk = function (n) {
    if (n.t === 'text') add(fontName(n.f, n.wt, n.it));
    (n.kids || []).forEach(walk);
  };
  kit.specimens.forEach(function (s) {
    walk(s.node);
  });
  (kit.tokens.text || []).forEach(function (t) {
    add(fontName(t.family, t.weight, false));
  });
  add({ family: 'IBM Plex Mono', style: 'Regular' });
  add({ family: 'Saira', style: 'Bold' });
  add({ family: 'Inter', style: 'Regular' });
  return Object.keys(set).map(function (k) {
    return set[k];
  });
}

/** text style key: family, weight, size, letter spacing (px), upper case */
function textKey(family, weight, size, lsPx, upper) {
  return [FAMILY_MAP[family] || family, Math.round(weight), Math.round(size * 100) / 100, Math.round(lsPx * 100) / 100, upper ? 'U' : ''].join('|');
}
function styleTextKey(t) {
  return textKey(t.family, t.weight, t.size, (t.tracking || 0) * t.size, !!t.upper);
}

/** a node spec's auto layout as Figma frame properties (null: absolute positions) */
function layoutProps(lay) {
  if (!lay) return null;
  var p = {
    layoutMode: lay.dir === 'H' ? 'HORIZONTAL' : 'VERTICAL',
    itemSpacing: lay.main === 'SPACE_BETWEEN' ? 0 : lay.gap || 0,
    paddingTop: lay.pad[0],
    paddingRight: lay.pad[1],
    paddingBottom: lay.pad[2],
    paddingLeft: lay.pad[3],
    primaryAxisAlignItems: lay.main,
    counterAxisAlignItems: lay.cross === 'BASELINE' ? 'BASELINE' : lay.cross,
    primaryAxisSizingMode: (lay.dir === 'H' ? lay.hugW : lay.hugH) ? 'AUTO' : 'FIXED',
    counterAxisSizingMode: (lay.dir === 'H' ? lay.hugH : lay.hugW) ? 'AUTO' : 'FIXED',
    strokesIncludedInLayout: true,
  };
  if (lay.wrap) {
    p.layoutWrap = 'WRAP';
    p.counterAxisSpacing = lay.cgap || 0;
  }
  return p;
}

/** box-shadow specs → Figma effects */
function effectsOf(fx) {
  return (fx || []).map(function (s) {
    var c = cssColor(s.c);
    return { type: s.inset ? 'INNER_SHADOW' : 'DROP_SHADOW', color: { r: c.r, g: c.g, b: c.b, a: s.a }, offset: { x: s.x, y: s.y }, radius: s.blur, spread: s.spread, visible: true, blendMode: 'NORMAL' };
  });
}

/** a component's root must be a frame: a specimen that is a lone text or SVG goes in a frame of its size */
function componentSpec(node) {
  if (node.t === 'frame') return node;
  return { t: 'frame', n: node.n, x: 0, y: 0, w: node.w, h: node.h, kids: [node] };
}

/** where a text layer of width w / height h goes (x, y) from its spec: centred on the browser's line box */
function textPosition(spec, w, h) {
  var x = spec.x;
  if (spec.anchor === 'center') x = spec.ax - w / 2;
  else if (spec.anchor === 'right') x = spec.ax - w;
  var y = spec.cy !== undefined ? spec.cy - h / 2 : spec.y;
  return { x: x, y: y };
}

// ---------------------------------------------------------------- Figma

function run(KIT) {
  var fontMap = {};
  var vars = {};
  var styles = {};
  var count = 0;

  function paint(c, a) {
    var v = vars[colorKey(c, a)];
    var col = cssColor(c);
    var p = { type: 'SOLID', color: { r: col.r, g: col.g, b: col.b }, opacity: a };
    if (v) {
      try {
        return figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: col.r, g: col.g, b: col.b }, opacity: 1 }, 'color', v);
      } catch (e) {
        return p;
      }
    }
    return p;
  }

  async function loadFonts() {
    var list = collectFonts(KIT);
    for (var i = 0; i < list.length; i++) {
      var f = list[i];
      var tries = [f, { family: f.family, style: 'Regular' }, { family: 'Inter', style: f.style }, { family: 'Inter', style: 'Regular' }];
      for (var j = 0; j < tries.length; j++) {
        try {
          await figma.loadFontAsync(tries[j]);
          fontMap[fontKey(f)] = tries[j];
          break;
        } catch (e) {
          /* next */
        }
      }
    }
  }
  var font = function (family, weight, italic) {
    var f = fontName(family, weight, italic);
    return fontMap[fontKey(f)] || { family: 'Inter', style: 'Regular' };
  };

  async function makeVariables() {
    var cols = await figma.variables.getLocalVariableCollectionsAsync();
    var coll = cols.find(function (c) {
      return c.name === COLLECTION;
    });
    if (!coll) coll = figma.variables.createVariableCollection(COLLECTION);
    var mode = coll.modes[0].modeId;
    try {
      coll.renameMode(mode, 'Dark');
    } catch (e) {
      /* keep */
    }
    var existing = (await figma.variables.getLocalVariablesAsync('COLOR')).filter(function (v) {
      return v.variableCollectionId === coll.id;
    });
    KIT.tokens.colors.forEach(function (t) {
      var v =
        existing.find(function (x) {
          return x.name === t.name;
        }) || figma.variables.createVariable(t.name, coll, 'COLOR');
      var c = cssColor(t.value);
      v.setValueForMode(mode, { r: c.r, g: c.g, b: c.b, a: c.a });
      v.description = t.use;
      var k = tokenColorKey(t.value);
      if (!vars[k]) vars[k] = v;
    });
  }

  async function makeTextStyles() {
    var local = await figma.getLocalTextStylesAsync();
    KIT.tokens.text.forEach(function (t) {
      var name = STYLE_PREFIX + t.name;
      var st =
        local.find(function (s) {
          return s.name === name;
        }) || figma.createTextStyle();
      st.name = name;
      st.fontName = font(t.family, t.weight, false);
      st.fontSize = t.size;
      st.letterSpacing = { unit: 'PIXELS', value: (t.tracking || 0) * t.size };
      st.lineHeight = { unit: 'AUTO' };
      st.textCase = t.upper ? 'UPPER' : 'ORIGINAL';
      st.description = t.use;
      styles[styleTextKey(t)] = st;
    });
  }

  async function text(spec) {
    var n = figma.createText();
    n.fontName = font(spec.f, spec.wt, spec.it);
    n.characters = spec.s;
    n.fontSize = Math.max(1, spec.sz);
    n.letterSpacing = { unit: 'PIXELS', value: spec.ls || 0 };
    n.lineHeight = spec.lh ? { unit: 'PIXELS', value: spec.lh } : { unit: 'AUTO' };
    if (spec.up) n.textCase = 'UPPER';
    if (spec.ul) n.textDecoration = 'UNDERLINE';
    if (spec.col) n.fills = [paint(spec.col.c, spec.col.a)];
    var st = styles[textKey(spec.f, spec.wt, spec.sz, spec.ls || 0, !!spec.up)];
    if (st) {
      try {
        await n.setTextStyleIdAsync(st.id);
        if (spec.col) n.fills = [paint(spec.col.c, spec.col.a)];
      } catch (e) {
        /* keep local properties */
      }
    }
    if (spec.trunc) {
      n.textAutoResize = 'HEIGHT';
      n.resize(Math.max(1, spec.w), n.height);
      try {
        n.textTruncation = 'ENDING';
        n.maxLines = 1;
      } catch (e) {
        /* older Figma */
      }
    } else if (spec.wrap) {
      n.textAutoResize = 'HEIGHT';
      n.resize(Math.max(1, spec.w), n.height);
    } else n.textAutoResize = 'WIDTH_AND_HEIGHT';
    return n;
  }

  function box(n, spec) {
    n.fills = spec.fill ? [paint(spec.fill.c, spec.fill.a)] : [];
    if (spec.stroke) {
      n.strokes = [paint(spec.stroke.c, spec.stroke.a)];
      n.strokeAlign = 'INSIDE';
      if (Array.isArray(spec.stroke.w)) {
        n.strokeTopWeight = spec.stroke.w[0];
        n.strokeRightWeight = spec.stroke.w[1];
        n.strokeBottomWeight = spec.stroke.w[2];
        n.strokeLeftWeight = spec.stroke.w[3];
      } else n.strokeWeight = spec.stroke.w;
      if (spec.stroke.dash) n.dashPattern = spec.stroke.dash;
    } else n.strokes = [];
    if (Array.isArray(spec.r)) {
      n.topLeftRadius = spec.r[0];
      n.topRightRadius = spec.r[1];
      n.bottomRightRadius = spec.r[2];
      n.bottomLeftRadius = spec.r[3];
    } else if (spec.r) n.cornerRadius = spec.r;
    if (spec.op !== undefined) n.opacity = spec.op;
    if (spec.fx) n.effects = effectsOf(spec.fx);
    n.clipsContent = !!spec.clip;
  }

  /** builds a spec under `parent`; `lay` is the parent's auto layout (or null) */
  async function build(spec, parent, lay, asComponent) {
    var n;
    if (spec.t === 'svg') {
      try {
        n = figma.createNodeFromSvg(spec.svg);
      } catch (e) {
        n = figma.createFrame();
        n.resize(Math.max(1, spec.w), Math.max(1, spec.h));
        n.fills = [];
      }
      n.name = spec.n;
      parent.appendChild(n);
    } else if (spec.t === 'text') {
      n = await text(spec);
      n.name = spec.n;
      parent.appendChild(n);
    } else {
      n = asComponent ? figma.createComponent() : figma.createFrame();
      n.name = spec.n;
      parent.appendChild(n);
      box(n, spec);
      var lp = layoutProps(spec.lay);
      if (lp) for (var k in lp) n[k] = lp[k];
      n.resize(Math.max(0.01, spec.w), Math.max(0.01, spec.h));
      var kids = spec.kids || [];
      for (var i = 0; i < kids.length; i++) await build(kids[i], n, spec.lay || null, false);
      if (lp) {
        // fixed axes keep the browser's size; hugging axes follow the children. resize() fixes both axes,
        // so the sizing modes go on after it
        n.resize(Math.max(0.01, spec.w), Math.max(0.01, spec.h));
        n.primaryAxisSizingMode = lp.primaryAxisSizingMode;
        n.counterAxisSizingMode = lp.counterAxisSizingMode;
      }
    }
    if (lay && spec.abs) n.layoutPositioning = 'ABSOLUTE';
    if (!lay || spec.abs) {
      if (spec.t === 'text') {
        var at = textPosition(spec, n.width, n.height);
        n.x = at.x;
        n.y = at.y;
      } else {
        n.x = spec.x;
        n.y = spec.y;
      }
    } else {
      if (spec.grow) n.layoutGrow = 1;
      if (spec.stretch) n.layoutAlign = 'STRETCH';
    }
    count++;
    return n;
  }

  function autoFrame(name, dir, gap, pad, parent) {
    var f = figma.createFrame();
    f.name = name;
    f.layoutMode = dir;
    f.itemSpacing = gap;
    f.paddingTop = f.paddingRight = f.paddingBottom = f.paddingLeft = pad;
    f.primaryAxisSizingMode = 'AUTO';
    f.counterAxisSizingMode = 'AUTO';
    f.fills = [];
    if (parent) parent.appendChild(f);
    return f;
  }
  async function label(s, parent, size, weight, color, family) {
    var spec = { t: 'text', n: s, s: s, f: family || 'Saira', wt: weight || 700, sz: size || 18, ls: 0, lh: null, col: { c: color || '#E6EDF3', a: 1 } };
    var n = await text(spec);
    parent.appendChild(n);
    return n;
  }

  async function tokensSection(root) {
    var sec = autoFrame('Tokens', 'VERTICAL', 16, 0, root);
    await label('TOKENS', sec, 18, 700);
    var wrap = autoFrame('colours', 'HORIZONTAL', 16, 0, sec);
    wrap.layoutWrap = 'WRAP';
    wrap.counterAxisSpacing = 16;
    wrap.resize(1600, 10);
    wrap.primaryAxisSizingMode = 'FIXED';
    wrap.counterAxisSizingMode = 'AUTO';
    for (var i = 0; i < KIT.tokens.colors.length; i++) {
      var t = KIT.tokens.colors[i];
      var card = autoFrame(t.name, 'VERTICAL', 6, 0, wrap);
      var sw = figma.createRectangle();
      sw.name = 'swatch';
      sw.resize(140, 44);
      sw.cornerRadius = 4;
      var k = tokenColorKey(t.value);
      var c = cssColor(t.value);
      sw.fills = [vars[k] ? figma.variables.setBoundVariableForPaint({ type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: 1 }, 'color', vars[k]) : { type: 'SOLID', color: { r: c.r, g: c.g, b: c.b }, opacity: c.a }];
      sw.strokes = [{ type: 'SOLID', color: cssColor('#374250') }];
      sw.strokeWeight = 1;
      card.appendChild(sw);
      await label(t.name, card, 11, 600, '#E6EDF3', 'IBM Plex Mono');
      await label(t.value, card, 10.5, 400, '#93A1B0', 'IBM Plex Mono');
    }
    var type = autoFrame('Typography', 'VERTICAL', 10, 0, sec);
    await label('TYPOGRAPHY', type, 18, 700);
    for (var j = 0; j < KIT.tokens.text.length; j++) {
      var ts = KIT.tokens.text[j];
      var row = autoFrame(ts.name, 'HORIZONTAL', 24, 0, type);
      row.counterAxisAlignItems = 'BASELINE';
      await label(ts.name, row, 11.5, 400, '#93A1B0', 'IBM Plex Mono');
      var n = await text({ t: 'text', n: ts.sample, s: ts.sample, f: ts.family, wt: ts.weight, sz: ts.size, ls: (ts.tracking || 0) * ts.size, lh: null, up: ts.upper, col: { c: ts.color, a: 1 } });
      row.appendChild(n);
    }
  }

  async function main() {
    await loadFonts();
    var page = figma.root.children.find(function (p) {
      return p.name === PAGE_NAME;
    });
    if (!page) {
      page = figma.createPage();
      page.name = PAGE_NAME;
    }
    await figma.setCurrentPageAsync(page);
    page.children.slice().forEach(function (c) {
      c.remove();
    });
    await makeVariables();
    await makeTextStyles();

    var root = autoFrame('CATCC Kit', 'VERTICAL', 64, 64, page);
    root.fills = [paint('#0E1116', 1)];
    await label('CATCC UI KIT', root, 28, 700);
    await tokensSection(root);
    var comps = 0;
    var secs = groupSpecimens(KIT);
    for (var s = 0; s < secs.length; s++) {
      var sec = secs[s];
      var sf = autoFrame(sec.title, 'VERTICAL', 20, 0, root);
      await label(sec.title.toUpperCase(), sf, 18, 700);
      var wrap = autoFrame(sec.title + ' components', 'HORIZONTAL', 32, 0, sf);
      wrap.layoutWrap = 'WRAP';
      wrap.counterAxisSpacing = 32;
      wrap.resize(1600, 10);
      wrap.primaryAxisSizingMode = 'FIXED';
      wrap.counterAxisSizingMode = 'AUTO';
      for (var g = 0; g < sec.groups.length; g++) {
        var grp = sec.groups[g];
        var names = normalizeVariants(
          grp.items.map(function (x) {
            return x.variant;
          }),
        );
        var made = [];
        for (var i = 0; i < grp.items.length; i++) {
          var c = await build(componentSpec(grp.items[i].node), wrap, null, true);
          c.name = grp.items.length > 1 || grp.items[i].variant ? names[i] : grp.name;
          made.push(c);
          comps++;
        }
        if (made.length > 1 || grp.items[0].variant) {
          var set = figma.combineAsVariants(made, wrap);
          set.name = grp.name;
          set.layoutMode = 'HORIZONTAL';
          set.layoutWrap = 'WRAP';
          set.itemSpacing = 24;
          set.counterAxisSpacing = 24;
          set.paddingTop = set.paddingRight = set.paddingBottom = set.paddingLeft = 20;
          set.counterAxisAlignItems = 'MIN';
          var w = made.reduce(function (a, m) {
            return a + m.width;
          }, 0);
          set.resize(Math.min(1560, w + 24 * (made.length - 1) + 40), set.height);
          set.primaryAxisSizingMode = 'FIXED';
          set.counterAxisSizingMode = 'AUTO';
        } else made[0].name = grp.name;
      }
    }
    figma.viewport.scrollAndZoomIntoView([root]);
    return { components: comps, nodes: count };
  }

  return main();
}

if (typeof figma !== 'undefined' && typeof KIT !== 'undefined') {
  run(KIT).then(
    function (r) {
      figma.closePlugin('CATCC Kit: ' + r.components + ' components on the "' + PAGE_NAME + '" page');
    },
    function (e) {
      figma.closePlugin('CATCC Kit failed: ' + (e && e.message ? e.message : e));
    },
  );
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { componentSpec: componentSpec, fontName: fontName, cssColor: cssColor, colorKey: colorKey, tokenColorKey: tokenColorKey, variantPairs: variantPairs, normalizeVariants: normalizeVariants, groupSpecimens: groupSpecimens, collectFonts: collectFonts, textKey: textKey, styleTextKey: styleTextKey, layoutProps: layoutProps, effectsOf: effectsOf, textPosition: textPosition, run: run };
}
