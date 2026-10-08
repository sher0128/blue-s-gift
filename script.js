'use strict';

/* ============================================================
   BLUE'S GIFT — THE FINAL TRIAL
   A dark-fantasy mini-RPG that is secretly a birthday gift.

   Pure static site: no backend, no API, no external assets.
   State is persisted in localStorage.
   ============================================================ */

/* ============================================================
   1. STATE & PERSISTENCE
   ============================================================ */
const STORAGE_KEY = 'blues-gift-final-trial-v1';

const DEFAULT_STATE = {
  trial1: false,   // Reaction Test cleared
  trial2: false,   // Fate Draw cleared (first card recorded)
  trial3: false,   // Boss Battle cleared
  fate: null,      // first drawn card { name, desc, rarity, symbol }
  sound: false
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch (err) {
    return { ...DEFAULT_STATE };
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    /* private mode / quota — fail silently; game still works in-session */
  }
}

const FRAGMENTS = { 1: 'EYE OF TIME', 2: 'FATE', 3: 'VICTORY' };

function collectedFragments() {
  const list = [];
  if (state.trial1) list.push({ n: 1, name: FRAGMENTS[1] });
  if (state.trial2) list.push({ n: 2, name: FRAGMENTS[2] });
  if (state.trial3) list.push({ n: 3, name: FRAGMENTS[3] });
  return list;
}
function fragCount() { return collectedFragments().length; }

/* ============================================================
   2. DOM & NAVIGATION
   ============================================================ */
const screens = Array.from(document.querySelectorAll('.screen'));
const veil = document.getElementById('veil');
let transitioning = false;

function switchScreen(id) {
  screens.forEach((s) => s.classList.remove('active'));
  const next = document.getElementById(id);
  if (next) next.classList.add('active');
  window.scrollTo(0, 0);
  afterEnter(id);
}

/** Fade the whole page through a black veil, then swap screens. */
function showScreen(id) {
  if (transitioning || !document.getElementById(id)) return;
  transitioning = true;
  veil.classList.add('on');
  setTimeout(() => {
    switchScreen(id);
    setTimeout(() => {
      veil.classList.remove('on');
      transitioning = false;
    }, 40);
  }, 300);
}

/** Per-screen setup that runs whenever a screen becomes active. */
function afterEnter(id) {
  switch (id) {
    case 'screen-intro': runIntro(); break;
    case 'screen-interlude': runInterlude(); break;
    case 'screen-reaction': initReactionScreen(); refreshUI(); BGM.playTrial(); break;
    case 'screen-fate': initFateScreen(); refreshUI(); BGM.playTrial(); break;
    case 'screen-boss': initBossScreen(); refreshUI(); BGM.playBoss(); break;
    case 'screen-ending': runEnding(); break;
  }
}

/** Refresh all progress UI: fragments, statuses, final gate. */
function refreshUI() {
  const count = fragCount();

  ['reaction', 'fate', 'boss'].forEach((id) => {
    const el = document.getElementById(id + '-frag');
    if (el) el.textContent = count + '/3';
  });

  const topbarMap = { reaction: 'trial1', fate: 'trial2', boss: 'trial3' };
  Object.keys(topbarMap).forEach((id) => {
    const el = document.getElementById(id + '-status');
    if (el) {
      const cleared = state[topbarMap[id]];
      el.textContent = cleared ? 'CLEARED' : 'NOT CLEARED';
      el.classList.toggle('cleared', cleared);
    }
  });
}

/* ============================================================
   3. AUDIO (Web Audio API — synthesized, opt-in only)
   ============================================================ */
const AudioFX = (() => {
  let ctx = null;

  function ensure() {
    if (!state.sound) return null;
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, delay = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(vol, 0.001), t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  return {
    click() { tone(700, 0.06, 'square', 0.035); },
    hit() { tone(160, 0.12, 'sawtooth', 0.05); },
    success() {
      tone(520, 0.1, 'square', 0.045);
      setTimeout(() => tone(780, 0.18, 'square', 0.045), 90);
    },
    flip() {
      tone(300, 0.06, 'triangle', 0.05);
      setTimeout(() => tone(520, 0.08, 'triangle', 0.04), 60);
    },
    falseStart() { tone(130, 0.22, 'sawtooth', 0.055); },
    special() {
      tone(85, 0.3, 'sawtooth', 0.06);
      setTimeout(() => tone(660, 0.18, 'square', 0.045), 120);
    },
    victory() {
      [440, 554, 659, 880].forEach((f, i) => tone(f, 0.24, 'square', 0.045, i * 0.14));
    }
  };
})();

/* ============================================================
   3.5 BGM (background music)
   Uses HTMLAudioElement + smooth crossfade + master mute.
   ============================================================ */
const BGM = (() => {
  const MUSIC_KEY = 'birthdayQuest_musicEnabled';
  const FADE = 1000; // crossfade duration in ms
  const TRACKS = {
    opening: { src: 'music/opening.mp3', loop: false },
    trial: { src: 'music/trial.mp3', loop: true },
    boss: { src: 'music/boss.mp3', loop: true },
    ending: { src: 'music/ending.mp3', loop: true }
  };

  let enabled = true;
  let current = null;
  const players = {};

  function loadEnabled() {
    try {
      const v = localStorage.getItem(MUSIC_KEY);
      if (v === null) return true; // default ON
      return v !== '0';
    } catch (e) { return true; }
  }
  enabled = loadEnabled();

  function ensurePlayer(name) {
    if (!players[name]) {
      const cfg = TRACKS[name];
      const a = new Audio(cfg.src);
      a.loop = cfg.loop;
      a.preload = 'auto';
      a.volume = 0;
      a._target = 0;   // intended volume (0..1), independent of mute
      a._raf = null;
      a.addEventListener('error', () => {
        console.warn('[BGM] load/decode error:', name, a.error ? (a.error.code || a.error.message) : '');
      });
      a.addEventListener('loadedmetadata', () => {
        console.log('[BGM] loaded:', name, 'duration=', a.duration.toFixed(2) + 's');
      });
      players[name] = a;
    }
    return players[name];
  }

  function preloadAll() {
    Object.keys(TRACKS).forEach((name) => ensurePlayer(name));
  }

  function applyVolume(p) {
    p.volume = enabled ? p._target : 0;
  }

  function fade(p, target, duration, onDone) {
    const start = p._target;
    const t0 = performance.now();
    if (p._raf) cancelAnimationFrame(p._raf);
    function tick(now) {
      const t = Math.min(1, (now - t0) / duration);
      p._target = start + (target - start) * t;
      applyVolume(p);
      if (t < 1) {
        p._raf = requestAnimationFrame(tick);
      } else {
        p._raf = null;
        if (onDone) onDone();
      }
    }
    p._raf = requestAnimationFrame(tick);
  }

  function stopPlayer(p) {
    if (p._raf) cancelAnimationFrame(p._raf);
    p.pause();
    p.currentTime = 0;
    p._target = 0;
    applyVolume(p);
  }

  function crossfade(name) {
    if (current === name) return;
    const prev = current;
    if (prev && players[prev]) {
      const pp = players[prev];
      fade(pp, 0, FADE, () => stopPlayer(pp));
    }
    current = name;
    const p = ensurePlayer(name);
    p.play().then(() => {
      console.log('[BGM] now playing:', name);
    }).catch((err) => {
      console.warn('[BGM] play blocked/failed:', name, err ? err.message : '');
    });
    fade(p, 1, FADE);
  }

  return {
    startOpening() {
      if (current) return; // only the very first interaction unlocks BGM
      preloadAll();        // start loading every track in the background
      crossfade('opening');
    },
    playTrial() { crossfade('trial'); },
    playBoss() { crossfade('boss'); },
    playEnding() { crossfade('ending'); },
    stopCurrent() {
      const prev = current;
      current = null;
      if (prev && players[prev]) {
        const pp = players[prev];
        fade(pp, 0, FADE, () => stopPlayer(pp));
      }
    },
    isEnabled() { return enabled; },
    setEnabled(val) {
      enabled = val;
      Object.keys(players).forEach((n) => applyVolume(players[n]));
      try { localStorage.setItem(MUSIC_KEY, enabled ? '1' : '0'); } catch (e) {}
    },
    toggle() { this.setEnabled(!enabled); }
  };
})();

/* ============================================================
   4. INTRO SEQUENCE (click-to-advance dialogue)
   ============================================================ */
const introLines = [
  '勇士，你终于来了。',
  '漫长的旅途正在等待着你。',
  '命运已经为你准备好了试炼。'
];

let introStep = 0;
let introLocked = false;

function runIntro() {
  const startBtn = document.getElementById('btn-intro-start');
  startBtn.classList.add('hidden');
  introStep = 0;
  introLocked = false;
  setIntroLine(introLines[0]);
}

function setIntroLine(text) {
  const lineEl = document.getElementById('intro-line');
  lineEl.textContent = text;
  lineEl.classList.remove('visible');
  void lineEl.offsetWidth; // force reflow so the fade-in replays
  lineEl.classList.add('visible');
}

function advanceIntro() {
  const startBtn = document.getElementById('btn-intro-start');
  // Once the button is showing, further clicks do nothing (the button is clicked on its own).
  if (introLocked || introStep >= introLines.length) return;

  if (introStep < introLines.length - 1) {
    // fade out the current line, then fade in the next one
    introLocked = true;
    const lineEl = document.getElementById('intro-line');
    lineEl.classList.remove('visible');
    setTimeout(() => {
      introStep++;
      setIntroLine(introLines[introStep]);
      introLocked = false;
    }, 220);
  } else {
    // last line is showing → reveal the start button (no auto-skip)
    introStep++;
    startBtn.classList.remove('hidden');
  }
}

function introClickFeedback(x, y) {
  const ripple = document.createElement('span');
  ripple.className = 'intro-ripple';
  ripple.style.left = x + 'px';
  ripple.style.top = y + 'px';
  document.getElementById('screen-intro').appendChild(ripple);
  setTimeout(() => ripple.remove(), 520);
}

function nextTrialScreen() {
  if (!state.trial1) return 'screen-reaction';
  if (!state.trial2) return 'screen-fate';
  if (!state.trial3) return 'screen-boss';
  return 'screen-ending';
}

/* ============================================================
   5. TRIAL I — REACTION TEST
   ============================================================ */
const REACTION_ROUNDS = 7;

const reaction = {
  round: 0,
  times: [],
  waiting: false,
  targetVisible: false,
  startTime: 0,
  waitTimer: null,
  stepTimer: null
};

const reactionEls = {
  idle: document.getElementById('reaction-idle'),
  play: document.getElementById('reaction-play'),
  result: document.getElementById('reaction-result'),
  round: document.getElementById('reaction-round'),
  msg: document.getElementById('reaction-msg'),
  arena: document.getElementById('reaction-arena'),
  wait: document.getElementById('reaction-wait'),
  target: document.getElementById('reaction-target'),
  avg: document.getElementById('reaction-avg'),
  rank: document.getElementById('reaction-rank'),
  rankLine: document.getElementById('reaction-rank-line')
};

function initReactionScreen() {
  // clear any timers from an abandoned run so nothing fires into the idle view
  clearTimeout(reaction.waitTimer);
  clearTimeout(reaction.stepTimer);
  reactionEls.idle.classList.remove('hidden');
  reactionEls.play.classList.add('hidden');
  reactionEls.result.classList.add('hidden');
}

function startReaction() {
  reaction.round = 0;
  reaction.times = [];
  reactionEls.idle.classList.add('hidden');
  reactionEls.result.classList.add('hidden');
  reactionEls.play.classList.remove('hidden');
  reactionEls.msg.textContent = '';
  nextReactionRound();
}

function nextReactionRound() {
  reaction.round++;
  reactionEls.round.textContent = 'ROUND ' + reaction.round + ' / ' + REACTION_ROUNDS;
  reactionEls.msg.textContent = '';
  hideTarget();
  beginReactionWait();
}

function beginReactionWait() {
  reaction.waiting = true;
  reaction.targetVisible = false;
  reactionEls.wait.classList.remove('hidden');
  reactionEls.arena.classList.remove('armed');
  // random delay between 1.2s and 3.8s
  const delay = 1200 + Math.random() * 2600;
  reaction.waitTimer = setTimeout(showReactionTarget, delay);
}

function showReactionTarget() {
  reaction.waiting = false;
  reaction.targetVisible = true;
  reactionEls.wait.classList.add('hidden');
  reactionEls.arena.classList.add('armed');
  placeTarget();
  reaction.startTime = performance.now();
}

function hideTarget() {
  reactionEls.target.classList.remove('visible');
}

function placeTarget() {
  const w = reactionEls.arena.clientWidth;
  const h = reactionEls.arena.clientHeight;
  const size = Math.max(72, Math.min(110, Math.round(Math.min(w, h) * 0.22)));
  const target = reactionEls.target;
  target.style.width = size + 'px';
  target.style.height = size + 'px';

  const pad = 12;
  const maxX = Math.max(pad, w - size - pad);
  const maxY = Math.max(pad, h - size - pad);
  target.style.left = (pad + Math.random() * (maxX - pad)) + 'px';
  target.style.top = (pad + Math.random() * (maxY - pad)) + 'px';
  target.classList.add('visible');
}

function falseStart() {
  clearTimeout(reaction.waitTimer);
  AudioFX.falseStart();
  reactionEls.msg.textContent = 'FALSE START — 保持冷静。';
  flashMsg();
  // wait again for the same round, no penalty to round count
  reaction.stepTimer = setTimeout(beginReactionWait, 750);
}

function flashMsg() {
  reactionEls.msg.classList.remove('pulse');
  void reactionEls.msg.offsetWidth;
  reactionEls.msg.classList.add('pulse');
}

function finishReaction() {
  const sum = reaction.times.reduce((a, b) => a + b, 0);
  const avg = Math.round(sum / reaction.times.length);
  const rank = rankFor(avg);
  reactionEls.avg.textContent = avg + ' ms';
  reactionEls.rank.textContent = rank.title;
  reactionEls.rankLine.textContent = rank.line;
  reactionEls.result.classList.remove('hidden');
  reactionEls.play.classList.add('hidden');

  if (!state.trial1) {
    state.trial1 = true;
    saveState();
    AudioFX.success();
  }
  refreshUI();
}

function rankFor(avg) {
  if (avg <= 200) return { title: '「神速」', line: '你已经快过了时间的呼吸。' };
  if (avg <= 260) return { title: '「时间的敌人」', line: '时间在追你，而你从不回头。' };
  if (avg <= 320) return { title: '「超越时间之人」', line: '你的眼睛比闪电更早抵达。' };
  if (avg <= 400) return { title: '「沉睡的鹰眼」', line: '你半闭着眼，却看穿了一切。' };
  if (avg <= 520) return { title: '「凡人的极限」', line: '你是凡人，但已到极限。' };
  return { title: '「被时间遗忘之人」', line: '时间把你忘了。这未必是坏事。' };
}

/* ============================================================
   6. TRIAL II — FATE DRAW
   ============================================================ */
const CARDS = [
  { name: 'THE FOOL', desc: '你并不知道自己在做什么。\n但你已经走了很远。', rarity: 'COMMON', symbol: '◯' },
  { name: 'THE KING', desc: '你获得了支配混乱的权利。\n可惜混乱没有同意。', rarity: 'RARE', symbol: '♛' },
  { name: 'THE WANDERER', desc: '没有地图。\n没有目的地。\n很好，你自由了。', rarity: 'COMMON', symbol: '✶' },
  { name: 'THE CURSED ONE', desc: '命运给你施加了诅咒。\n具体是什么，命运也不知道。', rarity: 'RARE', symbol: '☠' },
  { name: 'THE LAST HERO', desc: '世界只剩下最后一个英雄。\n遗憾的是，是你。', rarity: 'EPIC', symbol: '⚔' },
  { name: 'THE NPC', desc: '你意识到自己可能只是这个世界的背景人物。', rarity: 'COMMON', symbol: '♟' },
  { name: 'THE SURVIVOR', desc: '你什么都没有得到。\n但你还活着。', rarity: 'RARE', symbol: '✦' },
  { name: 'THE CHOSEN ONE', desc: '你被选中了。\n至于为什么，没有人知道。', rarity: 'LEGENDARY', symbol: '☀' },
  { name: 'THE TRAVELER', desc: '你已经走了很远。\n但地图上，你仍在原地。', rarity: 'COMMON', symbol: '✧' },
  { name: 'THE MIRROR', desc: '你凝视着深渊。\n深渊说：看我干嘛。', rarity: 'RARE', symbol: '◈' },
  { name: 'THE PROPHET', desc: '你看到了未来。\n未来也看到了你，然后转身走了。', rarity: 'EPIC', symbol: '☽' },
  { name: 'THE SLAYER', desc: '你战胜了一千个敌人。\n第一千零一个，是你自己。', rarity: 'RARE', symbol: '⚡' },
  { name: 'THE HERMIT', desc: '你独自行走。\n世界很吵，但你听不见。', rarity: 'COMMON', symbol: '☾' },
  { name: 'THE DRAGON', desc: '你遇见了龙。\n龙说：借过。', rarity: 'EPIC', symbol: '♆' },
  { name: 'THE TOWER', desc: '你爬到了塔顶。\n塔说：谢谢，你走吧。', rarity: 'EPIC', symbol: '♜' },
  { name: 'THE UNKNOWN', desc: '这张牌是空白的。\n不，等等，现在有字了。', rarity: 'LEGENDARY', symbol: '✠' }
];

const fateEls = {
  card: document.getElementById('fate-card'),
  symbol: document.getElementById('fate-symbol'),
  name: document.getElementById('fate-name'),
  rarity: document.getElementById('fate-rarity'),
  desc: document.getElementById('fate-desc'),
  recorded: document.getElementById('fate-recorded'),
  recordedText: document.getElementById('fate-recorded-text'),
  result: document.getElementById('fate-result')
};

function initFateScreen() {
  fateEls.card.classList.remove('flipped');
  fateEls.result.classList.toggle('hidden', !state.trial2);
  updateFateRecorded();
}

function updateFateRecorded() {
  if (state.fate) {
    fateEls.recorded.classList.remove('hidden');
    fateEls.recordedText.textContent = state.fate.name + ' — ' + state.fate.rarity + '（已被记录）';
  } else {
    fateEls.recorded.classList.add('hidden');
  }
}

function performDraw() {
  const card = CARDS[Math.floor(Math.random() * CARDS.length)];

  // set the new face content while the card is still showing its back
  fateEls.symbol.textContent = card.symbol;
  fateEls.name.textContent = card.name;
  fateEls.rarity.textContent = card.rarity;
  fateEls.rarity.className = 'card-front__rarity rarity-' + card.rarity.toLowerCase();
  fateEls.desc.innerHTML = escapeHtml(card.desc).replace(/\n/g, '<br>');

  // reset to back instantly (no animation), then flip forward with animation
  fateEls.card.classList.add('no-transition');
  fateEls.card.classList.remove('flipped');
  void fateEls.card.offsetWidth;
  fateEls.card.classList.remove('no-transition');
  void fateEls.card.offsetWidth;
  fateEls.card.classList.add('flipped');

  // first draw is permanent and unlocks the fragment
  if (!state.fate) {
    state.fate = card;
    state.trial2 = true;
    saveState();
    setTimeout(() => {
      updateFateRecorded();
      fateEls.result.classList.remove('hidden');
      refreshUI();
      AudioFX.success();
    }, 900);
  }
}

/* ============================================================
   7. TRIAL III — BOSS BATTLE
   ============================================================ */
const BOSS = {
  maxHP: 100,
  hp: 100,
  maxPlayerHP: 50,
  playerHP: 50,
  specialCooldown: 0,
  defending: false,
  over: false
};

// Incremented on every reset; lets running victory timers detect an abandoned run.
let bossSession = 0;

// Tracks whether the boss just landed a strong hit (used to avoid high-damage streaks).
let bossLastStrong = false;

const bossEls = {
  stage: document.getElementById('boss-stage'),
  name: document.getElementById('boss-name'),
  bossArea: document.getElementById('boss-area'),
  playerArea: document.getElementById('player-area'),
  bossHPFill: document.getElementById('boss-hp-fill'),
  bossHPText: document.getElementById('boss-hp-text'),
  playerHPFill: document.getElementById('player-hp-fill'),
  playerHPText: document.getElementById('player-hp-text'),
  log: document.getElementById('boss-log'),
  attackBtn: document.getElementById('btn-attack'),
  defendBtn: document.getElementById('btn-defend'),
  specialBtn: document.getElementById('btn-special'),
  overlay: document.getElementById('boss-overlay'),
  overlayLine: document.getElementById('boss-overlay-line'),
  overlayFrag: document.getElementById('boss-overlay-frag'),
  overlayReturn: document.getElementById('boss-overlay-return')
};

function initBossScreen() {
  resetBattle();
}

function resetBattle() {
  bossSession++;
  BOSS.hp = BOSS.maxHP;
  BOSS.playerHP = BOSS.maxPlayerHP;
  BOSS.specialCooldown = 0;
  BOSS.defending = false;
  BOSS.over = false;
  bossLastStrong = false;

  setBossActionsEnabled(true);
  updateBossHUD();
  clearBossLog();

  bossEls.name.textContent = 'THE FINAL BOSS';
  bossEls.name.classList.remove('revealed');
  bossEls.overlay.classList.add('hidden');
  bossEls.overlayFrag.classList.add('hidden');
  bossEls.overlayReturn.classList.add('hidden');
  bossEls.overlayLine.textContent = '';
  bossEls.overlayLine.classList.remove('visible');
  bossEls.stage.classList.remove('shaking');
  bossEls.bossArea.classList.remove('hit');
  bossEls.playerArea.classList.remove('hit');
}

function setBossActionsEnabled(enabled) {
  bossEls.attackBtn.disabled = !enabled;
  bossEls.defendBtn.disabled = !enabled;
  bossEls.specialBtn.disabled = !enabled || BOSS.specialCooldown > 0;
  if (enabled) updateSpecialButton();
}

function updateBossHUD() {
  bossEls.bossHPText.textContent = BOSS.hp + ' / ' + BOSS.maxHP;
  bossEls.bossHPFill.style.width = (BOSS.hp / BOSS.maxHP * 100) + '%';
  bossEls.playerHPText.textContent = BOSS.playerHP + ' / ' + BOSS.maxPlayerHP;
  bossEls.playerHPFill.style.width = (BOSS.playerHP / BOSS.maxPlayerHP * 100) + '%';
  updateSpecialButton();
}

function updateSpecialButton() {
  if (BOSS.specialCooldown > 0) {
    bossEls.specialBtn.disabled = true;
    bossEls.specialBtn.textContent = '[ SPECIAL — ' + BOSS.specialCooldown + ' ]';
  } else {
    bossEls.specialBtn.disabled = false;
    bossEls.specialBtn.textContent = '[ SPECIAL ]';
  }
}

function doAttack() {
  if (!bossActionAllowed()) return;
  AudioFX.hit();
  const dmg = randInt(10, 20);
  damageBoss(dmg);
  if (!bossJustDefeated()) bossTurn();
}

function doDefend() {
  if (!bossActionAllowed()) return;
  AudioFX.click();
  BOSS.defending = true;
  addBossLog('你摆出防御姿态，准备承受攻击。');
  bossTurn();
}

function doSpecial() {
  if (!bossActionAllowed()) return;
  if (BOSS.specialCooldown > 0) return;
  AudioFX.special();
  const dmg = randInt(25, 35);
  BOSS.specialCooldown = 2;
  damageBoss(dmg);
  if (!bossJustDefeated()) bossTurn();
}

function bossActionAllowed() {
  return !BOSS.over && BOSS.playerHP > 0 && BOSS.hp > 0;
}

function bossJustDefeated() {
  return BOSS.hp <= 0 || BOSS.over;
}

function damageBoss(dmg) {
  BOSS.hp = Math.max(0, BOSS.hp - dmg);
  updateBossHUD();
  addBossLog('你对 Boss 造成 ' + dmg + ' 点伤害。');
  spawnDamageNumber(bossEls.bossArea, dmg, 'player');
  shakeStage();
  bossHitFlash();
  if (BOSS.hp <= 0) onBossDefeated();
}

function bossTurn() {
  if (BOSS.over || BOSS.playerHP <= 0) return;

  // Forgiving boss AI: low damage, and never two strong hits in a row.
  let action;
  if (bossLastStrong) {
    action = Math.random() < 0.6 ? 'weak' : 'defend';
  } else {
    const r = Math.random();
    action = r < 0.6 ? 'normal' : (r < 0.85 ? 'weak' : 'defend');
  }

  if (action === 'normal') {
    damagePlayer(applyPlayerDamage(randInt(5, 8)), '普通攻击');
    bossLastStrong = true;
  } else if (action === 'weak') {
    damagePlayer(applyPlayerDamage(randInt(2, 4)), '弱攻击');
    bossLastStrong = false;
  } else {
    addBossLog('Boss 采取了防御姿态，没有进攻。');
    bossLastStrong = false;
  }

  if (BOSS.specialCooldown > 0) BOSS.specialCooldown--;
  BOSS.defending = false;
  updateSpecialButton();
}

/** Combine the player's DEFEND reduction with the hidden fate protection. */
function applyPlayerDamage(dmg) {
  let result = dmg;
  if (BOSS.defending) result = Math.max(1, Math.round(result * 0.3)); // ~70% reduction
  return applyFateProtection(result);
}

/** Hidden mechanic: near death, fate quietly dulls incoming blows. */
function applyFateProtection(dmg) {
  if (BOSS.playerHP <= 10) return Math.max(1, Math.round(dmg * 0.5));
  return dmg;
}

function damagePlayer(dmg, label) {
  BOSS.playerHP = Math.max(0, BOSS.playerHP - dmg);
  updateBossHUD();
  const verb = label ? 'Boss 发动' + label + '，' : 'Boss 反击，';
  addBossLog(verb + '你受到 ' + dmg + ' 点伤害。');
  spawnDamageNumber(bossEls.playerArea, dmg, 'boss');
  playerHitFlash();
  if (BOSS.playerHP <= 0) onPlayerDefeated();
}

function onBossDefeated() {
  BOSS.over = true;
  setBossActionsEnabled(false);
  AudioFX.victory();
  BGM.stopCurrent(); // boss music fades out once the boss is defeated
  addBossLog('Boss 倒下了……');

  const session = bossSession;
  bossEls.overlay.classList.remove('hidden');

  const sequence = [
    { text: '……你竟然赢了。', hold: 1800 },
    { text: '最终试炼通过。', hold: 1500 }
  ];
  let idx = 0;

  function step() {
    if (session !== bossSession) return; // a reset happened mid-sequence
    if (idx < sequence.length) {
      setBossLine(sequence[idx++].text);
      setTimeout(step, sequence[idx - 1].hold);
      return;
    }
    // Grant the fragment and reveal the continue button after a short pause.
    setTimeout(() => {
      if (!state.trial3) {
        state.trial3 = true;
        saveState();
        refreshUI();
      }
      setBossLine('');
      bossEls.overlayFrag.classList.remove('hidden');
      bossEls.overlayReturn.classList.remove('hidden');
    }, 1200);
  }
  step();
}

function onPlayerDefeated() {
  BOSS.over = true;
  setBossActionsEnabled(false);
  AudioFX.falseStart();
  addBossLog('你倒下了……');
  bossEls.overlay.classList.remove('hidden');
  setBossLine('你倒下了…… 但命运不允许你在此止步。');
  setTimeout(() => {
    bossEls.overlay.classList.add('hidden');
    resetBattle();
  }, 2200);
}

function setBossLine(text) {
  const line = bossEls.overlayLine;
  line.textContent = text;
  line.classList.remove('visible');
  void line.offsetWidth;
  if (text) line.classList.add('visible');
}

/* --- battle juice helpers --- */
function spawnDamageNumber(container, dmg, kind) {
  const el = document.createElement('span');
  el.className = 'dmg-num dmg-num--' + kind;
  el.textContent = '-' + dmg;
  el.style.left = (30 + Math.random() * 40) + '%';
  el.style.top = (15 + Math.random() * 45) + '%';
  container.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function shakeStage() {
  bossEls.stage.classList.remove('shaking');
  void bossEls.stage.offsetWidth;
  bossEls.stage.classList.add('shaking');
}

function bossHitFlash() {
  bossEls.bossArea.classList.remove('hit');
  void bossEls.bossArea.offsetWidth;
  bossEls.bossArea.classList.add('hit');
}

function playerHitFlash() {
  bossEls.playerArea.classList.remove('hit');
  void bossEls.playerArea.offsetWidth;
  bossEls.playerArea.classList.add('hit');
}

function addBossLog(text) {
  const el = document.createElement('p');
  el.textContent = text;
  bossEls.log.prepend(el);
  while (bossEls.log.children.length > 5) bossEls.log.removeChild(bossEls.log.lastChild);
}

function clearBossLog() {
  bossEls.log.innerHTML = '';
}

/* ============================================================
   7.5 INTERLUDE TRANSITIONS (chuunibyou connective text)
   ============================================================ */
const interludeToFate = [
  '疾速之眼，已经承认了你。',
  '然而真正的试炼，从不只有速度。',
  '命运在黑暗中等你翻牌。'
];

const interludeToBoss = [
  '命运之牌已经翻开，无法回头。',
  '你听见了吗？终点传来的低吼。',
  '最后的敌人，正在等你。'
];

const finalGateLines = [
  '三枚碎片，在掌心轻轻合拢，发出微弱的光。',
  '门开了。门后没有敌人，也没有王座。',
  '只有一件，被世界悄悄藏了很久的小事。'
];

let interludeConfig = { lines: [], nextScreen: '', buttonLabel: '[ 继续 ]' };
let interludeStep = 0;
let interludeLocked = false;

function startInterlude(lines, nextScreen, buttonLabel) {
  interludeConfig = { lines: lines, nextScreen: nextScreen, buttonLabel: buttonLabel };
  showScreen('screen-interlude');
}

function runInterlude() {
  const btn = document.getElementById('btn-interlude-next');
  btn.classList.add('hidden');
  btn.textContent = interludeConfig.buttonLabel || '[ 继续 ]';
  interludeStep = 0;
  interludeLocked = false;
  setInterludeLine(interludeConfig.lines[0]);
}

function setInterludeLine(text) {
  const lineEl = document.getElementById('interlude-line');
  lineEl.textContent = text;
  lineEl.classList.remove('visible');
  void lineEl.offsetWidth;
  lineEl.classList.add('visible');
}

function advanceInterlude() {
  const btn = document.getElementById('btn-interlude-next');
  // Once the button is showing, further clicks do nothing (the button navigates on its own).
  if (interludeLocked || interludeStep >= interludeConfig.lines.length) return;

  if (interludeStep < interludeConfig.lines.length - 1) {
    // fade out the current line, then fade in the next one
    interludeLocked = true;
    const lineEl = document.getElementById('interlude-line');
    lineEl.classList.remove('visible');
    setTimeout(() => {
      interludeStep++;
      setInterludeLine(interludeConfig.lines[interludeStep]);
      interludeLocked = false;
    }, 220);
  } else {
    // last line is showing → reveal the continue button
    interludeStep++;
    btn.classList.remove('hidden');
  }
}

/* ============================================================
   8. FINAL ENDING (hidden RPG ending)
   ============================================================ */
const ritualLines = ['三个碎片已经集齐。', '试炼结束。', '冒险结束。'];

const endingEls = {
  screen: document.getElementById('screen-ending'),
  ritual: document.getElementById('ending-ritual'),
  line: document.getElementById('ending-line'),
  reveal: document.getElementById('ending-reveal'),
  birthday: document.getElementById('ending-birthday'),
  poem: document.getElementById('ending-poem'),
  wish: document.getElementById('ending-wish'),
  blessing: document.getElementById('ending-blessing'),
  closing: document.getElementById('ending-closing'),
  retBtn: document.getElementById('btn-ending-return')
};

function runEnding() {
  const e = endingEls;
  e.screen.classList.remove('revealed');
  e.reveal.classList.add('hidden');
  e.ritual.classList.remove('hidden');
  e.retBtn.classList.add('hidden');
  [e.line, e.birthday, e.poem, e.wish, e.blessing, e.closing].forEach((el) => el.classList.remove('visible'));
  e.line.textContent = '';

  // Phase 1: ritual lines over black, then reveal the hidden ending.
  playRitualLines(() => {
    e.ritual.classList.add('hidden');
    e.reveal.classList.remove('hidden');
    e.screen.classList.add('revealed'); // background gradually brightens
    playReveal();
  });
}

function playRitualLines(done) {
  const e = endingEls;
  let i = 0;
  function next() {
    if (i >= ritualLines.length) { done(); return; }
    e.line.textContent = ritualLines[i];
    e.line.classList.remove('visible');
    void e.line.offsetWidth;
    e.line.classList.add('visible');
    i++;
    setTimeout(() => {
      e.line.classList.remove('visible');
      setTimeout(next, 450);
    }, 1500);
  }
  next();
}

function playReveal() {
  const e = endingEls;
  setTimeout(() => {
    e.birthday.classList.add('visible');
    BGM.playEnding(); // ending music fades in with HAPPY BIRTHDAY.
  }, 600);
  setTimeout(() => e.poem.classList.add('visible'), 2000);
  setTimeout(() => e.wish.classList.add('visible'), 3800);
  setTimeout(() => e.blessing.classList.add('visible'), 5600);
  setTimeout(() => e.closing.classList.add('visible'), 7200);
  setTimeout(() => e.retBtn.classList.remove('hidden'), 8600);
}

/* ============================================================
   9. HELPERS
   ============================================================ */
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* ============================================================
   10. EVENT WIRING & INIT
   ============================================================ */
// Generic navigation for any [data-goto] element.
document.addEventListener('click', (e) => {
  const goto = e.target.closest('[data-goto]');
  if (goto) {
    AudioFX.click();
    showScreen(goto.dataset.goto);
  }
});

// Intro: click-to-advance dialogue (anywhere on the intro screen).
document.getElementById('screen-intro').addEventListener('click', (e) => {
  if (e.target.closest('#btn-intro-start')) return; // the start button navigates on its own
  BGM.startOpening(); // first user interaction unlocks the opening BGM
  introClickFeedback(e.clientX, e.clientY);
  advanceIntro();
});

// Intro start: resume the linear progression (next uncleared trial).
document.getElementById('btn-intro-start').addEventListener('click', () => {
  AudioFX.click();
  showScreen(nextTrialScreen());
});

// Interlude: click-to-advance dialogue (anywhere on the interlude screen).
document.getElementById('screen-interlude').addEventListener('click', (e) => {
  if (e.target.closest('#btn-interlude-next')) return; // the continue button navigates on its own
  const ripple = document.createElement('span');
  ripple.className = 'intro-ripple';
  ripple.style.left = e.clientX + 'px';
  ripple.style.top = e.clientY + 'px';
  document.getElementById('screen-interlude').appendChild(ripple);
  setTimeout(() => ripple.remove(), 520);
  advanceInterlude();
});

// Sound toggle (global, top-right).
const btnSound = document.getElementById('btn-sound');
function updateSoundButton() {
  btnSound.textContent = state.sound ? '[ SOUND ON ]' : '[ SOUND OFF ]';
  btnSound.setAttribute('aria-pressed', String(state.sound));
}
btnSound.addEventListener('click', () => {
  state.sound = !state.sound;
  saveState();
  updateSoundButton();
  AudioFX.click();
});

// Music toggle (global, top-right).
const btnMusic = document.getElementById('btn-music');
function updateMusicButton() {
  btnMusic.textContent = BGM.isEnabled() ? '[ MUSIC ON ]' : '[ MUSIC OFF ]';
  btnMusic.setAttribute('aria-pressed', String(BGM.isEnabled()));
}
btnMusic.addEventListener('click', () => {
  BGM.toggle();
  updateMusicButton();
});

// Reset progress (deliberately subtle, for testing).
document.getElementById('btn-reset').addEventListener('click', () => {
  if (window.confirm('确定要重置全部进度吗？')) {
    try { localStorage.removeItem(STORAGE_KEY); } catch (err) { /* ignore */ }
    location.reload();
  }
});

// Reaction Test controls.
document.getElementById('btn-reaction-start').addEventListener('click', () => {
  AudioFX.click();
  startReaction();
});
reactionEls.target.addEventListener('click', (e) => {
  e.stopPropagation();
  if (!reaction.targetVisible) return;
  const t = Math.round(performance.now() - reaction.startTime);
  reaction.times.push(t);
  AudioFX.hit();
  reactionEls.msg.textContent = t + ' ms';
  reaction.targetVisible = false;
  hideTarget();
  if (reaction.round >= REACTION_ROUNDS) {
    finishReaction();
  } else {
    reaction.stepTimer = setTimeout(nextReactionRound, 650);
  }
});
reactionEls.arena.addEventListener('click', () => {
  // Only count a click on the empty arena while waiting as a false start.
  if (reaction.waiting) falseStart();
});

// Fate Draw control.
document.getElementById('btn-draw').addEventListener('click', () => {
  AudioFX.flip();
  performDraw();
});

// Boss Battle controls.
bossEls.attackBtn.addEventListener('click', doAttack);
bossEls.defendBtn.addEventListener('click', doDefend);
bossEls.specialBtn.addEventListener('click', doSpecial);

// Linear progression: trial results → interlude → next trial.
document.getElementById('btn-reaction-next').addEventListener('click', () => {
  AudioFX.click();
  startInterlude(interludeToFate, 'screen-fate', '[ 进入试炼二 ]');
});
document.getElementById('btn-fate-next').addEventListener('click', () => {
  AudioFX.click();
  startInterlude(interludeToBoss, 'screen-boss', '[ 进入终焉之战 ]');
});
bossEls.overlayReturn.addEventListener('click', () => {
  AudioFX.click();
  startInterlude(finalGateLines, 'screen-ending', '[ 进入最终之门 ]');
});
document.getElementById('btn-interlude-next').addEventListener('click', () => {
  AudioFX.click();
  showScreen(interludeConfig.nextScreen);
});

// Return to the beginning: reset all progress and go back to the intro.
document.getElementById('btn-ending-return').addEventListener('click', () => {
  AudioFX.click();
  BGM.stopCurrent(); // stop ending music before returning
  state = { ...DEFAULT_STATE, sound: state.sound };
  saveState();
  refreshUI();
  showScreen('screen-intro');
});

// Boot.
function init() {
  updateSoundButton();
  updateMusicButton();
  refreshUI();
  runIntro();
}
init();
