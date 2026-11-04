---
name: craft-audit
description: Read and answer the value audit at the end of a request (every rendered value against the site's tokens), and report what was verified.
pass: finish
listed: false
---
# The value audit (ui-craft's `audit`, on the canvas)

When you finish, every element this request built is measured as the site renders it: text size, weight, face,
letter-spacing and colour; surface, border and gradient colours; corners; shadows; and the spacing you wrote yourself.
Each value must equal one of the theme's tokens (or the theme's own heading, body and button styles), or be written with
the theme's variables (color-mix and calc on tokens count). The result is a percentage on-system and a line per value off.

`b12 "Our crossings": craft off-system text-size 19px → var(--wp--preset--font-size--auvyx-lg) (20px)`

- Fix a line by using the token it names, in one edit for all of them (set_style with the variable).
- If the design needs a value the system lacks (a bigger display size, a corner the brief does not have), change the
  design brief (design or tokens), never the section.
- Art is exempt and counted: vectors, code and game elements, pictures, video. It is for where the picture is the
  content, never to silence a line on UI.
- The audit runs once at the end and once more after your fix; it never holds the request back. Contrast, overflow,
  pure black text on a theme with tokens and emoji used as icons are defects: those are fixed at once.

## Report

Your answer to the user stays one or two sentences. The run's notes (shown with the steps) carry ui-craft's report:
verified (the audit's percentage and art count, the reviewer's verdict, the measured check), guessed values (anything not
from the system: ideally none) and what was not verified. Claim what was measured: never "pixel-perfect" or "fully
accessible".
