// HTML → a Studio document (v1's DocJson), so a template made as HTML (a theme demo, a landing page kit, a page saved
// from a browser) becomes plain Studio elements: containers with their layout, headings, text, buttons, images,
// dividers, videos. The page is laid out in a hidden frame and read back from the browser's computed styles at three
// widths (desktop, tablet, mobile), so the result keeps its layout and its responsive changes without parsing CSS.
// Scripts never run (they are removed before the page is drawn). What has no Studio element (forms, inline SVG,
// canvas) is left out and listed in `skipped`. The core validates and normalizes the result on insert.

export interface HtmlImport {
  json: string
  elements: number
  skipped: string[]
}

type Kind = 'Section' | 'Heading' | 'Text' | 'Button' | 'Image' | 'Divider' | 'Video'
interface Node {
  id: string
  kind: Kind
  text?: string
  level?: number
  tag?: string
  href?: string
  src?: string
  alt?: string
  styles: Record<string, Record<string, Record<string, string>>>
  children?: string[]
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'LINK', 'META', 'HEAD', 'TITLE', 'CANVAS', 'OBJECT', 'EMBED', 'MAP', 'AREA', 'DIALOG'])
const FORM = new Set(['FORM', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION', 'FIELDSET', 'LEGEND', 'DATALIST', 'OUTPUT'])
const INLINE = new Set(['A', 'SPAN', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'SMALL', 'BR', 'CODE', 'MARK', 'SUB', 'SUP', 'ABBR', 'TIME', 'LABEL', 'Q', 'CITE', 'DEL', 'INS', 'KBD', 'WBR'])
const KEEP_INLINE = new Set(['STRONG', 'B', 'EM', 'I', 'U', 'S', 'BR', 'CODE', 'SUB', 'SUP', 'MARK', 'SPAN', 'A'])
const SECTION_TAGS = new Set(['section', 'div', 'header', 'footer', 'main', 'article', 'aside', 'nav'])

/** Properties read from the layout. Inherited ones are kept only where they differ from the parent's. */
const INHERITED = ['color', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform', 'font-family']
const OWN = [
  'display', 'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'row-gap', 'column-gap', 'grid-template-columns',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'max-width', 'min-height', 'width', 'height', 'background-color', 'background-image', 'background-size', 'background-position',
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-top-color',
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'box-shadow', 'opacity', 'object-fit', 'aspect-ratio', 'text-decoration-line', 'flex-grow', 'flex-basis', 'box-sizing',
  'position', 'top', 'left', 'right', 'bottom', 'z-index',
]
/** What may change between desktop and the narrower screens (as written), and what a property gone there falls back to. */
const RESPONSIVE_OUT = ['width', 'min-height', 'display', 'flex-direction', 'flex-wrap', 'grid-template-columns', 'font-size', 'text-align', 'gap', 'line-height',
  'padding-block-start', 'padding-block-end', 'padding-inline-start', 'padding-inline-end', 'margin-block-start', 'margin-block-end', 'max-width']
const RESET: Record<string, string> = {
  width: 'auto', 'min-height': '0',
  display: 'block', gap: '0', 'padding-block-start': '0', 'padding-block-end': '0', 'padding-inline-start': '0', 'padding-inline-end': '0',
  'max-width': 'none', 'grid-template-columns': 'none',
}

type Snap = Map<Element, Record<string, string>>

const px = (v: string) => parseFloat(v) || 0
const rem = (v: string) => {
  const n = px(v)
  return n ? `${+(n / 16).toFixed(3)}rem` : '0'
}

/** "300px 300px 300px" → "repeat(3, minmax(0, 1fr))"; unequal tracks become their ratio in fr. */
function tracks(v: string): string | null {
  const parts = v.split(/\s+/).filter(Boolean)
  if (!parts.length || !parts.every((p) => p.endsWith('px'))) return null
  if (parts.length === 1) return 'minmax(0, 1fr)'
  const n = parts.map(px)
  if (n.every((x) => Math.abs(x - n[0]) < 1)) return `repeat(${n.length}, minmax(0, 1fr))`
  const min = Math.min(...n)
  return n.map((x) => `minmax(0, ${+(x / min).toFixed(2)}fr)`).join(' ')
}

/** The computed values of one element that become its Studio styles. */
function declarations(cs: Record<string, string>, parent: Record<string, string> | null, tag: string): Record<string, string> {
  const d: Record<string, string> = {}
  for (const p of INHERITED) {
    const v = cs[p]
    if (!v || (parent && parent[p] === v)) continue
    if (p === 'font-size') d[p] = rem(v)
    else if (p === 'font-family') d[p] = v.split(',')[0].trim().replace(/^"|"$/g, '') + ', sans-serif'
    else if (p === 'line-height') {
      if (v === 'normal') continue
      // a ratio, so it follows the font size on every screen
      const ratio = px(v) / (px(cs['font-size']) || 16)
      const was = parent && parent['line-height'] !== 'normal' ? px(parent['line-height']) / (px(parent['font-size']) || 16) : NaN
      if (Math.abs(ratio - was) > 0.01) d[p] = String(+ratio.toFixed(2))
    }
    else if (p === 'letter-spacing' && v === 'normal') continue
    else d[p] = v
  }
  const flex = cs.display.includes('flex')
  const grid = cs.display.includes('grid')
  if (flex || grid) {
    d.display = grid ? 'grid' : 'flex'
    if (flex) {
      d['flex-direction'] = cs['flex-direction']
      if (cs['flex-wrap'] !== 'nowrap') d['flex-wrap'] = cs['flex-wrap']
    }
    if (grid) {
      const t = tracks(cs['grid-template-columns'])
      if (t) d['grid-template-columns'] = t
    }
    if (cs['justify-content'] !== 'normal' && cs['justify-content'] !== 'flex-start') d['justify-content'] = cs['justify-content']
    if (cs['align-items'] !== 'normal' && cs['align-items'] !== 'stretch') d['align-items'] = cs['align-items']
    const rg = px(cs['row-gap'])
    const cg = px(cs['column-gap'])
    if (rg || cg) d.gap = rg === cg ? `${rg}px` : `${rg}px ${cg}px`
  } else if (cs.display === 'none') d.display = 'none'
  // a block stays a block (a Studio section is a flex box by default: blocks would line up in a row)
  else if (cs.display === 'block' || cs.display === 'list-item' || cs.display === 'flow-root') d.display = 'block'
  else if (cs.display === 'inline-block') d.display = 'inline-block'
  // a flex row's child keeps its share of the row (Elementor's 50% / 33% columns)
  if (parent && parent.display.includes('flex') && parent['flex-direction'].startsWith('row') && cs.position !== 'absolute' && tag !== 'IMG') {
    const share = px(cs.__w) / (px(parent.__cw) || 1)
    if (share > 0.04 && share < 0.97) {
      d.width = `${+(share * 100).toFixed(2)}%`
      d['flex-shrink'] = '0'
    }
  }
  // a band with a picture or a fill keeps its height (a hero), as a minimum so its words still fit
  const filled = cs['background-image'].includes('url(') || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs['background-color'])
  if (filled && px(cs.__h) > 48 && tag !== 'IMG' && tag !== 'A' && tag !== 'BUTTON') d['min-height'] = `${Math.round(px(cs.__h))}px`
  if (cs.position === 'absolute') {
    d.position = 'absolute'
    for (const side of ['top', 'left', 'right', 'bottom'] as const) if (cs[side] !== 'auto') d[side] = cs[side]
    if (cs['z-index'] !== 'auto') d['z-index'] = cs['z-index']
  } else if (cs.position === 'relative' || cs.position === 'sticky') d.position = 'relative'
  const box = (side: string) => cs[`padding-${side}`]
  const pads = ['top', 'right', 'bottom', 'left'].map(box)
  if (pads.some((v) => px(v))) {
    d['padding-block-start'] = pads[0]
    d['padding-inline-end'] = pads[1]
    d['padding-block-end'] = pads[2]
    d['padding-inline-start'] = pads[3]
  }
  d['margin-block-start'] = cs['margin-top']
  d['margin-block-end'] = cs['margin-bottom']
  if (cs['max-width'] !== 'none') {
    d['max-width'] = cs['max-width']
    // centred by auto margins
    if (px(cs['margin-left']) > 0 && Math.abs(px(cs['margin-left']) - px(cs['margin-right'])) < 1) d['margin-inline'] = 'auto'
  }
  if (px(cs['min-height'])) d['min-height'] = cs['min-height']
  // widths include the padding, as the page had them
  if (cs['box-sizing'] === 'border-box' && (d['max-width'] || d['padding-block-start'])) d['box-sizing'] = 'border-box'
  if (tag === 'IMG') {
    d.width = '100%'
    if (cs['object-fit'] !== 'fill') d['object-fit'] = cs['object-fit']
    if (cs['aspect-ratio'] !== 'auto') d['aspect-ratio'] = cs['aspect-ratio']
  }
  if (px(cs['flex-grow'])) d['flex-grow'] = cs['flex-grow']
  if (cs['flex-basis'] !== 'auto' && cs['flex-basis'] !== '0px' && !cs['flex-basis'].endsWith('px')) d['flex-basis'] = cs['flex-basis']
  if (!/rgba\(0, 0, 0, 0\)|transparent/.test(cs['background-color'])) d['background-color'] = cs['background-color']
  if (cs['background-image'] !== 'none') {
    d['background-image'] = cs['background-image']
    if (cs['background-size'] !== 'auto') d['background-size'] = cs['background-size']
    if (cs['background-position'] !== '0% 0%') d['background-position'] = cs['background-position']
  }
  const bw = ['top', 'right', 'bottom', 'left'].map((s) => px(cs[`border-${s}-width`]))
  if (bw.some(Boolean) && cs['border-top-style'] !== 'none') {
    if (bw.every((w) => w === bw[0])) d.border = `${bw[0]}px ${cs['border-top-style']} ${cs['border-top-color']}`
    else {
      const names = ['border-block-start', 'border-inline-end', 'border-block-end', 'border-inline-start']
      bw.forEach((w, i) => { if (w) d[names[i]] = `${w}px ${cs['border-top-style']} ${cs['border-top-color']}` })
    }
  }
  const radii = ['top-left', 'top-right', 'bottom-right', 'bottom-left'].map((c) => cs[`border-${c}-radius`])
  if (radii.some((r) => px(r))) d['border-radius'] = radii.every((r) => r === radii[0]) ? radii[0] : radii.join(' ')
  if (cs['box-shadow'] !== 'none') d['box-shadow'] = cs['box-shadow']
  if (cs.opacity !== '1') d.opacity = cs.opacity
  if (tag !== 'A' && cs['text-decoration-line'] === 'underline') d['text-decoration'] = 'underline'
  return d
}

/** Inline content as the Studio keeps it: text and simple formatting, links with their address. */
function richText(el: Element, base: string): string {
  let out = ''
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType === 3) out += (n.textContent ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!).replace(/\s+/g, ' ')
    else if (n.nodeType === 1) {
      const e = n as Element
      const inner = richText(e, base)
      if (!KEEP_INLINE.has(e.tagName)) out += inner
      else if (e.tagName === 'BR') out += '<br>'
      else if (e.tagName === 'A') out += `<a href="${(e.getAttribute('href') ?? '#').replace(/"/g, '&quot;')}">${inner}</a>`
      else if (e.tagName === 'SPAN') out += inner
      else out += `<${e.tagName.toLowerCase()}>${inner}</${e.tagName.toLowerCase()}>`
    }
  }
  return out
}

function abs(url: string, base: string): string {
  if (!url || url.startsWith('#') || /^(mailto|tel):/i.test(url)) return url
  try {
    return new URL(url, base).href
  } catch {
    return url
  }
}

const inlineOnly = (el: Element): boolean => Array.from(el.children).every((c) => INLINE.has(c.tagName) && inlineOnly(c))

function videoSrc(el: Element): string | null {
  const src = el.getAttribute('data-auvyx-src') ?? el.getAttribute('src') ?? el.querySelector('source')?.getAttribute('src') ?? ''
  if (el.tagName === 'VIDEO' && src) return src
  const yt = src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]{6,})/)
  if (yt) return `https://www.youtube.com/watch?v=${yt[1]}`
  const vm = src.match(/player\.vimeo\.com\/video\/(\d+)/)
  return vm ? `https://vimeo.com/${vm[1]}` : null
}

/** Draws `html` in a hidden frame (scripts removed) and reads it back. `base` resolves its relative URLs. */
export async function htmlToDoc(html: string, base = location.href): Promise<HtmlImport> {
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  parsed.querySelectorAll('script, noscript').forEach((s) => s.remove())
  parsed.querySelectorAll('*').forEach((e) => {
    for (const a of Array.from(e.attributes)) if (/^on/i.test(a.name)) e.removeAttribute(a.name)
    // frames are read, never loaded
    if (e.tagName === 'IFRAME') {
      e.setAttribute('data-auvyx-src', e.getAttribute('src') ?? '')
      e.removeAttribute('src')
      e.removeAttribute('srcdoc')
    }
  })
  const head = parsed.head
  const b = parsed.createElement('base')
  b.href = base
  head.prepend(b)

  const frame = document.createElement('iframe')
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1280px;height:900px;border:0;visibility:hidden'
  document.body.append(frame)
  try {
    const doc = frame.contentDocument!
    doc.open()
    doc.write('<!doctype html>' + parsed.documentElement.outerHTML)
    doc.close()
    await Promise.race([
      new Promise<void>((r) => (doc.readyState === 'complete' ? r() : frame.contentWindow!.addEventListener('load', () => r(), { once: true }))),
      new Promise<void>((r) => setTimeout(r, 8000)),
    ])
    await Promise.race([doc.fonts?.ready, new Promise((r) => setTimeout(r, 2000))])
    const all = Array.from(doc.body.querySelectorAll('*'))
    const frameWin = frame.contentWindow!
    const read = async (width: number): Promise<Snap> => {
      frame.style.width = `${width}px`
      await new Promise((r) => frameWin.requestAnimationFrame(() => frameWin.requestAnimationFrame(r)))
      const snap: Snap = new Map()
      for (const e of [doc.body, ...all]) {
        const cs = frameWin.getComputedStyle(e)
        const o: Record<string, string> = {}
        for (const p of [...INHERITED, ...OWN]) o[p] = cs.getPropertyValue(p)
        // the box as laid out: a flex child's share of its row, a band's height
        const r = e.getBoundingClientRect()
        o.__w = String(r.width)
        o.__h = String(r.height)
        o.__cw = String(e.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight))
        snap.set(e, o)
      }
      return snap
    }
    const desk = await read(1280)
    const tab = await read(820)
    const mob = await read(390)

    const nodes: Record<string, Node> = {}
    const skipped: string[] = []
    let next = 0
    const id = () => `h${++next}`
    const make = (kind: Kind, el: Element, fields: Partial<Node> = {}): Node => {
      const parent = el.parentElement ? desk.get(el.parentElement) ?? null : null
      const base = declarations(desk.get(el)!, parent, el.tagName)
      const styles: Node['styles'] = { base: { default: base } }
      // tablet over desktop, mobile over both (StyleEngine writes them in that order)
      let effective = { ...base }
      for (const [bp, snap] of [['tablet', tab], ['mobile', mob]] as const) {
        const now = declarations(snap.get(el)!, el.parentElement ? snap.get(el.parentElement) ?? null : null, el.tagName)
        const diff: Record<string, string> = {}
        for (const k of RESPONSIVE_OUT) {
          const was = effective[k]
          const v = now[k] ?? (was === undefined ? undefined : RESET[k])
          if (v !== undefined && v !== was) diff[k] = v
        }
        if (Object.keys(diff).length) {
          styles[bp] = { default: diff }
          effective = { ...effective, ...diff }
        }
      }
      if (kind === 'Button') {
      // a button's look is all its own: the theme's button style must not show through
      const cs = desk.get(el)!
      Object.assign(base, {
        color: cs.color,
        'background-color': /rgba\(0, 0, 0, 0\)/.test(cs['background-color']) ? 'transparent' : cs['background-color'],
        'text-decoration': cs['text-decoration-line'] === 'underline' ? 'underline' : 'none',
        'padding-block-start': cs['padding-top'], 'padding-inline-end': cs['padding-right'],
        'padding-block-end': cs['padding-bottom'], 'padding-inline-start': cs['padding-left'],
        'font-size': rem(cs['font-size']), 'font-weight': cs['font-weight'],
      })
      if (!base['border-radius']) base['border-radius'] = '0'
      if (!base.border) base.border = 'none'
    }
    const n: Node = { id: id(), kind, styles, ...fields }
      nodes[n.id] = n
      return n
    }
    const hidden = (el: Element) => {
      const cs = desk.get(el)
      return !cs || (cs.display === 'none' && mob.get(el)?.display === 'none')
    }

    function walk(el: Element): string[] {
      if (SKIP.has(el.tagName) || hidden(el)) return []
      if (FORM.has(el.tagName)) {
        skipped.push(el.tagName.toLowerCase())
        return []
      }
      const tag = el.tagName
      if (tag === 'SVG' || tag === 'svg') {
        skipped.push('svg')
        return []
      }
      if (tag === 'IMG') {
        const src = abs((el as HTMLImageElement).currentSrc || el.getAttribute('src') || '', base)
        if (!src || src.startsWith('data:')) {
          skipped.push('img (inline data)')
          return []
        }
        const link = el.parentElement?.tagName === 'A' && el.parentElement.children.length === 1 ? el.parentElement.getAttribute('href') ?? '' : undefined
        return [make('Image', el, { src, alt: el.getAttribute('alt') ?? '', href: link }).id]
      }
      if (tag === 'PICTURE') {
        const img = el.querySelector('img')
        return img ? walk(img) : []
      }
      if (tag === 'HR') return [make('Divider', el).id]
      if (tag === 'IFRAME' || tag === 'VIDEO') {
        const src = videoSrc(el)
        if (src) return [make('Video', el, { src }).id]
        skipped.push(tag.toLowerCase())
        return []
      }
      if (/^H[1-6]$/.test(tag)) return [make('Heading', el, { level: +tag[1], text: richText(el, base).trim() }).id]
      if (tag === 'A' || tag === 'BUTTON') {
        const cs = desk.get(el)!
        const looks = cs.display !== 'inline' || !/rgba\(0, 0, 0, 0\)|transparent/.test(cs['background-color']) || px(cs['border-top-width']) > 0
        const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
        // links keep their address as written ("/pricing" stays site-relative)
        if (looks && text && inlineOnly(el)) return [make('Button', el, { text, href: el.getAttribute('href') ?? '#' }).id]
      }
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      // a lone link (a menu item, "Read more"): a button that looks like the link
      const only = el.children.length === 1 ? el.children[0] : null
      if (only?.tagName === 'A' && inlineOnly(only) && (only.textContent ?? '').replace(/\s+/g, ' ').trim() === text && text)
        return [make('Button', only, { text, href: only.getAttribute('href') ?? '#' }).id]
      if (inlineOnly(el)) {
        if (!text) return []
        return [make('Text', el, { text: richText(el, base).trim() }).id]
      }
      // a container: its element children, and any loose text between them as text of its own
      const kids: string[] = []
      for (const c of Array.from(el.childNodes)) {
        if (c.nodeType === 1) kids.push(...walk(c as Element))
        else if (c.nodeType === 3 && (c.textContent ?? '').trim()) {
          const t: Node = { id: id(), kind: 'Text', text: (c.textContent ?? '').trim().replace(/[&<>]/g, (x) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[x]!), styles: { base: { default: {} } } }
          nodes[t.id] = t
          kids.push(t.id)
        }
      }
      if (!kids.length && !desk.get(el)?.['background-image']?.includes('url') && /rgba\(0, 0, 0, 0\)/.test(desk.get(el)?.['background-color'] ?? '')) return []
      const lower = tag.toLowerCase()
      return [make('Section', el, { tag: SECTION_TAGS.has(lower) ? lower : 'div', children: kids }).id]
    }

    const roots = Array.from(doc.body.children).flatMap(walk)
    // the page's own background and type become the outer section's, when the body sets them
    const bodyStyles = declarations(desk.get(doc.body)!, null, 'BODY')
    const page: Node = { id: id(), kind: 'Section', tag: 'div', styles: { base: { default: {
      ...(bodyStyles['background-color'] ? { 'background-color': bodyStyles['background-color'] } : {}),
      ...(bodyStyles.color ? { color: bodyStyles.color } : {}),
      ...(bodyStyles['font-family'] ? { 'font-family': bodyStyles['font-family'] } : {}),
    } } }, children: roots }
    nodes[page.id] = page
    const counts = skipped.reduce<Record<string, number>>((m, s) => ({ ...m, [s]: (m[s] ?? 0) + 1 }), {})
    return {
      json: JSON.stringify({ version: 1, roots: [page.id], nodes }),
      elements: Object.keys(nodes).length,
      skipped: Object.entries(counts).map(([k, n]) => `${k} ×${n}`),
    }
  } finally {
    frame.remove()
  }
}
