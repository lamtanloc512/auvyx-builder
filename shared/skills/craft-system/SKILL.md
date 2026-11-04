---
name: craft-system
description: Give the whole site a new look from a concept: the design tool's system JSON (ground, primary, type scale, density, corners, depth), values derived with contrast by construction.
pass: look
listed: false
---
# A new look from a concept (ui-craft's `system`, in Auvyx)

Send the design tool a JSON object instead of a DESIGN.md: it derives every value (surfaces, borders, muted text, the
dark band, the type scale, spacing, corners), with all text at 4.5:1 or more on every surface, in light and dark.

```json
{
  "name": "tide-zine",
  "concept": {
    "idea": "One sentence, at least 8 different words, naming what is specific to this subject.",
    "signature": "The one element a visitor remembers; you will build it.",
    "palette": "The real thing in this subject the ground and primary are taken from.",
    "voice": "Why this display face speaks for this subject.",
    "habit": "Optional: why a default habit is still right here, when the tool refuses one."
  },
  "color": { "ground": "#e6f0ee", "primary": "#0b6e4f", "accent": "#d3481b", "groundDark": "#0d2226" },
  "type": {
    "display": { "family": "Bricolage Grotesque, sans-serif", "weight": 700, "tracking": -0.02 },
    "body": { "family": "Inter, system-ui, sans-serif" },
    "base": 16,
    "ratio": 1.25
  },
  "space": { "density": "normal" },
  "shape": { "radius": "0.5rem" },
  "depth": "soft"
}
```

- Required: `name`, the four concept lines, `color.ground` and `color.primary`. The tool refuses a thin concept.
- `color.ground` is the page: any hex, saturated, mid or dark. White is a choice you make, not a default.
- `accent` (optional) drives small accents and sale; it is made readable as text. `groundDark` is the dark band (default:
  the ground's hue, dark).
- `type.ratio` is the modular scale: h3 = base·r, h2 = base·r³, h1 = base·r⁴, display = base·r⁵. Faces are Google fonts
  or system stacks; the site installs the families you name.
- `space.density`: compact | normal | airy. `shape.radius`: a length, 0 for square. `depth`: none | soft | hard.
- Cream or near-white with a soft serif (Fraunces, Georgia, Literata, Iowan, Palatino) is refused unless `concept.habit`
  argues for it: it is the look most generated sites share. Take the ground and the face from the palette and the voice.

A DESIGN.md of your own still works (the design tool's description shows its front matter), but it must carry the same
`concept:` block, and the same habit rule applies. For a few values on an existing look, use the tokens tool.
