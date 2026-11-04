---
name: game-core
description: Any game (load it first for every game): the starter every Auvyx game is built on, and what makes a game finished and fun.
---
# Game core

Every game starts from the starter below (it runs as it is: a small "catch the stars" game). Keep its frame and replace
the game: the loop, input, touch controls, sound, particles, shake, states, HUD, best score and `auvyx.expose` are already there.
Create the game element with the starter's `title`, `html`, `css` and `js` (adapted), then change it with `patch`.

## The frame (keep it)
- `fit()` sizes the canvas to `el` with devicePixelRatio ≤ 2; draw in CSS pixels (`W`, `H`). A ResizeObserver calls it.
- A fixed time step: `update(1/60)` as many times as real time needs (at most 5 per frame), `draw()` once per frame.
  Game speeds are per second (`x += vx * dt`), never per frame.
- Input: `down[code]` is true while a key is held (`e.code`: ArrowLeft, KeyA, Space…); `pressed(code)` is true once per press.
  Touch buttons in the html (`data-k="left" | "right" | "up" | "down" | "a" | "b"`) set the same names in `down`, so the game reads
  one set of actions: `act.left`, `act.right`, `act.up`, `act.down`, `act.a` (jump, fire), `act.b`.
- States: `"start"` (the overlay: title, how to play, a button; Enter, Space or a tap starts) → `"play"` → `"over"` or `"win"`
  (the overlay again, with the score and "Play again"). Pause when `auvyx.viewport.onVisibility(false)`.
- `sfx(name)`: short sounds made with WebAudio (no files), unlocked by the first input. Add new ones to `SOUNDS`.
- `burst(x, y, color, n)`: particles; `shake(power)`: screen shake; both decay by themselves.
- Best score: `auvyx.storage.get/set("best")`.
- `auvyx.expose(() => ({ state, score, lives, level, player: { x, y } , … }))`: what play-tests read. Keep it up to date with
  whatever matters in your game (enemies left, speed, distance).

## Finished means
- A start screen that says what to do in one line, with the controls for keyboard AND touch.
- The main action feels good: instant response, a little anticipation and overshoot (easing), sound and particles on every hit,
  pickup and death, a short shake on damage.
- Difficulty rises (speed, spawn rate, enemy count) so a run lasts 30 s to 3 min for a new player.
- Losing is fair and clear (a flash, a sound, lives shown); winning or a new best is celebrated.
- One consistent art style drawn in code: a small palette (3–5 colours plus dark and light), simple shapes with outlines or
  soft shadows, a background with depth (gradient sky, parallax layers). No outside images or fonts.
- It fits any screen: the game area scales with `W`/`H` (scale your world by `Math.min(W, H)` or a fixed world height), touch
  buttons show on touch screens only (`matchMedia("(pointer: coarse)")`), nothing important under the buttons.

## Play-test before answering
Call `play` with the game element's id: start it (`Enter`), do the main action (move, jump, fire) and check the state you
exposed changes; take a hit or wait to lose a life; read the console for errors. Fix with `patch`, then play again.
