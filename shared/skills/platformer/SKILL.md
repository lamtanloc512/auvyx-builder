---
name: platformer
description: A side-scrolling platformer (Mario-like): run, jump on platforms, stomp enemies, collect coins, reach the goal. Load game-core too.
---
# Platformer

Build it on game-core's starter (keep its frame). The world is a tile map, the camera follows the player.

## World
- Levels are arrays of strings, one character per tile (32 px world units): `#` ground, `B` brick, `?` coin block, `-` one-way
  platform, `o` coin, `g` walker enemy, `F` flag (goal), `P` player start, `.` empty. 14–16 rows high, 120–200 columns long.
  Design each level as a short story: a safe start, a first enemy on flat ground, a gap to jump, coins that show the path,
  platforms that climb, a harder stretch, then the flag. 2–3 levels, each a little harder.
- Scale: draw the world so 14 tiles fill the screen's height (`TILE = H / 14`); the camera's x follows the player with a
  lead in the direction of travel (lerp 0.12 per frame), clamped to the level.
- Parallax: a sky gradient, far hills or clouds at 0.2× the camera, near bushes at 0.5×.

## Movement (these numbers feel good; in tiles per second)
- Run: acceleration 30, top speed 7 (9.5 with `act.b` held), ground friction 25, air control 60%.
- Jump: velocity 15.5, gravity 48 while rising with the button held, 90 when falling or released (a short tap = a small jump),
  terminal fall speed 22.
- Coyote time 0.1 s (jump just after leaving a ledge) and a jump buffer 0.12 s (a press just before landing still jumps).
- Collisions: move on x, resolve against solid tiles, then on y; landing sets `onGround`. Hitting a `?` block from below gives
  a coin with a little bounce of the block. One-way platforms only stop you when falling onto them from above.

## Enemies and items
- Walkers move at 2 tiles/s, turn at walls and ledges. Landing on one from above (falling, feet above its middle) squashes it:
  +100, a bounce (velocity 10), a puff of particles. Touching it otherwise costs a life (0.8 s blinking invulnerability).
- Coins +10 with a sparkle; 100 coins = an extra life. Falling below the map costs a life.
- The flag: a slide-down, a fanfare, a score bonus by height, then the next level.

## Look
- Characters from rectangles and circles in 3–4 colours with a dark outline: the hero (cap, face, overalls), walkers
  (round, angry eyebrows), blocks with bevels, a green pipe or two. Squash and stretch on jump and landing, a dust puff on landing.
- HUD: score, coins, lives, level and time left (optional).

## Expose
`{ state, level, score, coins, lives, player: { x, y, vx, vy, onGround }, enemies: alive, camera: x, goalX }` (in tiles).

## Play-test
start (Enter) → hold ArrowRight 800 ms (x rises) → Space 150 ms (y changes, then onGround again) → hold ArrowRight 2000 ms
and Space to jump the first gap → check score/coins rise and lives drop when you walk into an enemy.
