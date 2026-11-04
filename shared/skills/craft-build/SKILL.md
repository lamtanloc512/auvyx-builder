---
name: craft-build
description: Build a new page or a big new part of one at a designer's level: concept, signature first and alone, values from the site's system (ui-craft's build mode).
pass: build
listed: false
---
# Build a page (ui-craft's build mode, in Auvyx)

**You decide intent; the site's system decides values.** You never type a font size, weight, line-height, letter-spacing,
colour, corner, spacing or shadow that the theme's tokens (catalog theme) or the design brief did not give you. If you need
a value the system lacks, change the system (design or tokens), or say in your answer that it is a guess.

**Close the values, open the shapes.** Build any shape the idea needs: boxes, grids, overlaps, clip-paths, vectors, code
elements. Every value it renders traces to the tokens, and the audit at the end checks that on what the canvas rendered.

**Passing the audit is the floor, not the goal.** The page earns its place with the one thing only this subject could have.
A clean page that reads like any other page has failed the request.

Work in this order and do each step once.

1. **Concept.** Before the first edit, state to yourself: the idea (one sentence on what is specific to this subject), the
   signature (the one element a visitor will remember, which you will build), the palette (the real thing in this subject
   the ground and primary come from) and the voice (why the display face speaks for it). Look at the subject, not at the
   usual web page: silt, tarpaulin, night water, ash glaze, a fare board. If the site's look does not fit the concept and
   the user asked for a new look, change it first with the design tool (load craft-system).
2. **Signature, first and alone.** The first edit of a new page builds only the signature section. Illustration is
   first-class: vectors, a code element (canvas, SVG, motion) or layered boxes are expected, and any value is allowed inside
   art. Look at its picture and the verdict. Redraw until it is worth remembering. Everything after this serves it.
3. **Rest of the page.** Open on the signature. A ready kit section, pattern or library item may not open the page unless
   you say why you would have drawn the same thing. Ready *behaviour* (navigation, forms, accordions, store loops, the
   header and footer builders) is mechanics: reuse it. Ready *layouts* are generic: use one only when it is what you would
   have drawn anyway, and restyle it from the tokens.
4. **Check once, at the end.** Each edit gets the light check and a picture; the value audit runs once when you finish.
   Fix what it names with the token it names, in one edit. Never silence it by moving UI into art.

## What the system gives you (use these, never raw values)

| Need | Use |
|---|---|
| Text sizes | `var(--wp--preset--font-size--auvyx-sm)` `auvyx-md` `auvyx-lg` `auvyx-xl` `auvyx-xxl`, or the theme's heading levels (h1–h6 take theirs) |
| Text faces | none: body and headings take the brief's fonts. Change faces only through the design brief |
| Colour | `var(--wp--preset--color--auvyx-text)` `auvyx-muted` `auvyx-base` (page) `auvyx-surface` `auvyx-border` `auvyx-primary` `auvyx-on-primary` `auvyx-secondary` (dark band) `auvyx-inverse` (text on it) `auvyx-accent` |
| Derived colour | `color-mix(in oklab, var(--wp--preset--color--auvyx-primary) 12%, transparent)`: a mix of tokens stays on the system |
| Space | `var(--wp--preset--spacing--auvyx-xs)` … `auvyx-xl`; page sections pad with `var(--auvyx-band)` |
| Corners | `var(--wp--custom--radius--sm)` `md` `lg` `full` |

## Shapes worth drawing

Layered backgrounds and gradients from the tokens (color-mix, transparent), glass (backdrop-filter), shapes (clip-path,
mask-image), depth (shadows, perspective, transforms), type contrast (very large display headings against small labels),
and motion through an element's "css": keyframes, hover choreography, staggered children, scroll-driven reveals
(animation-timeline: view()). Motion goes inside @media (prefers-reduced-motion: no-preference). It must stay readable,
responsive and in the theme's tokens; the site's parts (header, footer, menus, forms, components) and links still come first.

## Rules that save a loop

- A dark-first idea uses the dark band (`auvyx-secondary` behind `auvyx-inverse` text) for whole sections, or a new look whose
  ground is dark.
- Fix an audit line with the token it names. If the design needs a value the system lacks, change the brief; never fake
  it per section.
- Art is for where the picture is the content, never to escape the audit on UI (buttons, text, cards stay elements).
- Interactive behaviour that elements cannot give is a code element; check it with look frames and the console.
