---
name: arcade-3d
description: A 3D arcade game with Three.js (driving, flying, rolling ball, shooter, low-poly worlds). Load game-core too.
---
# 3D arcade game (Three.js)

Use game-core's frame (input, states, overlay, HUD, sound, storage, expose) and replace its canvas drawing with Three.js:
`"libs": ["three"]`, `const THREE = lib.three`.

## Setup
- `const renderer = new THREE.WebGLRenderer({ canvas, antialias: devicePixelRatio < 2, powerPreference: "high-performance" })`,
  `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`, `renderer.setSize(W, H, false)` in `fit()`;
  `renderer.outputColorSpace = THREE.SRGBColorSpace`, `renderer.toneMapping = THREE.ACESFilmicToneMapping`.
- A PerspectiveCamera (fov 60–70) that follows the player with a damped spring (lerp position 0.08, lookAt slightly ahead).
- Light: a HemisphereLight (sky/ground colours) plus one DirectionalLight; shadows only from that light, a 1024 map, on the
  player and big objects. Fog (`scene.fog = new THREE.Fog(skyColour, near, far)`) hides the far edge and sells depth.

## Models from primitives (no files)
- Low-poly, flat-shaded (`flatShading: true`, MeshStandardMaterial, roughness 0.8): a car is a box body + a smaller cabin
  + four cylinders; a tree is a cone or icosahedron on a cylinder; a coin a thin cylinder that spins; terrain a PlaneGeometry
  with vertices pushed by sin/cos noise. Group parts in a THREE.Group to move them together.
- Reuse geometries and materials; spawn obstacles from a pool instead of creating them every time.

## Game logic
- Keep positions in plain numbers; collisions with spheres or axis-aligned boxes (`Box3.intersectsBox`), not the meshes.
- A world that moves toward the player (runner style) or a player that moves through a bounded arena.
- Juice: camera shake (offset the camera, not the world), a FOV kick when boosting, particles as small boxes that fade.

## Performance and cleanup
- Under 150 draw calls; merge static scenery; at most a few hundred moving objects.
- The cleanup disposes geometries, materials and the renderer (`renderer.dispose()`), and stops the loop.

## Expose
`{ state, score, lives, speed, player: { x, y, z }, objects: count }`.

## Play-test
start → hold the main control 1000 ms (the player's position changes) → check score/speed rise, a collision costs a life.
