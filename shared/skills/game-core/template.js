// Auvyx game starter (skill game-core): a complete little game to replace, in a frame to keep.
export default ({ el, auvyx, reduced }) => {
  const canvas = el.querySelector("canvas.stage");
  const g = canvas.getContext("2d");
  const $ = (s) => el.querySelector(s);
  const overlay = $(".overlay"), title = $(".overlay h1"), info = $(".overlay p"), startBtn = $(".overlay button");
  const hudScore = $(".hud .score"), hudBest = $(".hud .best"), hudLives = $(".hud .lives");

  // ---- screen ----
  let W = 0, H = 0;
  const fit = () => {
    const r = Math.min(devicePixelRatio || 1, 2);
    W = el.clientWidth; H = el.clientHeight;
    canvas.width = Math.round(W * r); canvas.height = Math.round(H * r);
    g.setTransform(r, 0, 0, r, 0, 0);
  };
  const ro = new ResizeObserver(fit); ro.observe(el); fit();

  // ---- input: keys by code, touch buttons by data-k, one set of actions ----
  const down = {}, hit = {};
  const keys = { left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"], a: ["Space", "KeyJ"], b: ["KeyK", "ShiftLeft"] };
  const act = {};
  const readActs = () => { for (const [k, codes] of Object.entries(keys)) act[k] = !!down[k] || codes.some((c) => down[c]); };
  const pressed = (code) => { const h = hit[code]; hit[code] = false; return !!h; };
  const kd = (e) => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    if (!down[e.code]) hit[e.code] = true;
    down[e.code] = true; unlock();
    if ((e.code === "Enter" || e.code === "Space") && state !== "play") start();
  };
  const ku = (e) => { down[e.code] = false; };
  addEventListener("keydown", kd); addEventListener("keyup", ku);
  const touch = $(".touch");
  if (matchMedia("(pointer: coarse)").matches) touch.hidden = false;
  for (const b of el.querySelectorAll("[data-k]")) {
    const k = b.dataset.k;
    const on = (e) => { e.preventDefault(); if (!down[k]) hit[k] = true; down[k] = true; unlock(); if (state !== "play") start(); };
    const off = () => { down[k] = false; };
    b.addEventListener("pointerdown", on); b.addEventListener("pointerup", off); b.addEventListener("pointerleave", off); b.addEventListener("pointercancel", off);
  }
  startBtn.addEventListener("click", () => { unlock(); start(); });

  // ---- sound: tiny synths, no files ----
  let audio = null;
  const unlock = () => { if (!audio) try { audio = new AudioContext(); } catch { audio = null; } };
  const SOUNDS = {
    pickup: [880, 1320, 0.08, "square"],
    hit: [160, 60, 0.25, "sawtooth"],
    start: [440, 880, 0.15, "triangle"],
    over: [300, 90, 0.5, "triangle"],
  };
  const sfx = (name) => {
    const s = SOUNDS[name];
    if (!audio || !s) return;
    const [from, to, dur, type] = s, t = audio.currentTime, o = audio.createOscillator(), v = audio.createGain();
    o.type = type; o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, to), t + dur);
    v.gain.setValueAtTime(0.18, t); v.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(v).connect(audio.destination); o.start(t); o.stop(t + dur);
  };

  // ---- juice ----
  const parts = [];
  const burst = (x, y, color, n = 14) => {
    if (reduced) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 220; parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, color }); }
  };
  let trauma = 0;
  const shake = (p) => { if (!reduced) trauma = Math.min(1, trauma + p); };

  // ---- the game (replace from here) ----
  const PAL = { sky1: "#0f1a3a", sky2: "#2b1d5c", star: "#ffd84d", player: "#4de3ff", rock: "#ff5d73", text: "#ffffff" };
  let state = "start", score = 0, lives = 3, level = 1, best = 0, time = 0;
  const player = { x: 0, y: 0, w: 46, h: 18, vx: 0 };
  let stars = [], rocks = [], spawn = 0;
  auvyx.storage?.get("best").then((v) => { best = Number(v) || 0; hud(); });

  const reset = () => {
    score = 0; lives = 3; level = 1; time = 0; stars = []; rocks = []; spawn = 0;
    player.x = W / 2; player.y = H - 60; player.vx = 0;
  };
  function start() {
    if (state === "play") return;
    reset(); state = "play"; overlay.hidden = true; sfx("start"); el.focus({ preventScroll: true });
  }
  const end = () => {
    state = "over"; sfx("over"); shake(0.6);
    if (score > best) { best = score; auvyx.storage?.set("best", best); }
    title.textContent = "Game over"; info.textContent = `Score ${score} · Best ${best}`; startBtn.textContent = "Play again"; overlay.hidden = false;
  };
  const hud = () => { hudScore.textContent = score; hudBest.textContent = best; hudLives.textContent = "♥".repeat(Math.max(0, lives)); };

  const update = (dt) => {
    readActs();
    time += dt; level = 1 + Math.floor(time / 15);
    const accel = 2600, max = 520, friction = 9;
    if (act.left) player.vx -= accel * dt; else if (act.right) player.vx += accel * dt; else player.vx -= player.vx * Math.min(1, friction * dt);
    player.vx = Math.max(-max, Math.min(max, player.vx));
    player.x = Math.max(player.w / 2, Math.min(W - player.w / 2, player.x + player.vx * dt));
    player.y = H - 60;
    spawn -= dt;
    if (spawn <= 0) {
      spawn = Math.max(0.25, 0.9 - level * 0.08);
      (Math.random() < 0.7 ? stars : rocks).push({ x: 20 + Math.random() * (W - 40), y: -20, vy: 140 + level * 30 + Math.random() * 60, r: 12 });
    }
    for (const s of stars) s.y += s.vy * dt;
    for (const r of rocks) r.y += r.vy * dt * 1.2;
    const touches = (o) => Math.abs(o.x - player.x) < player.w / 2 + o.r && Math.abs(o.y - player.y) < player.h / 2 + o.r;
    stars = stars.filter((s) => { if (touches(s)) { score += 10; sfx("pickup"); burst(s.x, s.y, PAL.star); return false; } return s.y < H + 30; });
    rocks = rocks.filter((r) => { if (touches(r)) { lives--; sfx("hit"); shake(0.5); burst(r.x, r.y, PAL.rock, 24); if (lives <= 0) end(); return false; } return r.y < H + 30; });
    hud();
  };

  const draw = () => {
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, PAL.sky1); sky.addColorStop(1, PAL.sky2);
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.save();
    if (trauma > 0) { const m = trauma * trauma * 14; g.translate((Math.random() * 2 - 1) * m, (Math.random() * 2 - 1) * m); }
    g.fillStyle = PAL.star;
    for (const s of stars) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? s.r * 0.45 : s.r; g.lineTo(s.x + Math.cos(a) * rr, s.y + Math.sin(a) * rr); } g.fill(); }
    g.fillStyle = PAL.rock;
    for (const r of rocks) { g.beginPath(); g.arc(r.x, r.y, r.r, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = PAL.player; g.beginPath(); g.roundRect(player.x - player.w / 2, player.y - player.h / 2, player.w, player.h, 8); g.fill();
    for (const p of parts) { g.globalAlpha = Math.max(0, p.life * 2); g.fillStyle = p.color; g.fillRect(p.x - 2, p.y - 2, 4, 4); }
    g.globalAlpha = 1;
    g.restore();
  };
  // ---- the game (replace to here) ----

  // ---- loop: fixed step, paused when it cannot be seen ----
  let raf = 0, last = performance.now(), acc = 0, visible = true;
  const STEP = 1 / 60;
  const frame = (now) => {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    let n = 0;
    while (acc >= STEP && n++ < 5) {
      if (state === "play" && visible) update(STEP);
      for (const p of parts) { p.x += p.vx * STEP; p.y += p.vy * STEP; p.vy += 400 * STEP; p.life -= STEP; }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      trauma = Math.max(0, trauma - STEP * 1.5);
      acc -= STEP;
    }
    draw();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);
  const stopWatch = auvyx.viewport?.onVisibility((v) => { visible = v; });
  auvyx.expose(() => ({ state, score, lives, level, best, player: { x: Math.round(player.x), y: Math.round(player.y) }, stars: stars.length, rocks: rocks.length }));
  reset(); hud();

  return () => { cancelAnimationFrame(raf); ro.disconnect(); removeEventListener("keydown", kd); removeEventListener("keyup", ku); stopWatch?.(); audio?.close(); };
};
