---
name: runner
description: An endless runner or dodger: the world scrolls, obstacles come faster, the score is the distance. Load game-core too.
---
# Endless runner

Build it on game-core's starter. The player stays near the left (or bottom); the world moves past it.

## Core loop
- Speed starts at 6 units/s and rises smoothly (`speed = 6 + time * 0.12`, capped at 18). Distance (score) = ∫ speed dt.
- Obstacles come from a spawner with a gap that shrinks with speed (`gap = clamp(2.4 - speed * 0.08, 0.9, 2.4)` seconds),
  from 3–5 patterns (low block: jump; high bar: duck; double; moving), chosen so each is always passable.
- Jump: velocity 14, gravity 50 (heavier when falling); duck halves the height while held. Or lanes: 3 lanes, swipe or ←/→
  moves one lane with a 0.12 s ease.
- Pickups (coins, shield, magnet) on the arc of a jump reward risk.
- A hit ends the run (or costs the shield): a freeze frame of 0.1 s, a shake, a slow-motion fade to the overlay.

## Look
- Three parallax layers (sky, far, near) and the ground tiles scroll at their own rates; speed lines or wind at high speed.
- The runner has a run cycle (two or three poses changing with distance), a jump pose and a duck pose.

## Expose
`{ state, score, best, speed, distance, player: { y, onGround, ducking, lane }, nextObstacle: { kind, distance } }`.

## Play-test
start → wait 1500 ms (distance rises) → Space just before an obstacle → check the run continues; wait until a hit ends it,
then Enter starts again with score 0.
