/* ═══════════════════════════════════════════════════════════
   🦇 펫 서바이벌 v2 - 진짜 게임 같이!
   ═══════════════════════════════════════════════════════════ */

// ───── 데이터 로딩 ─────
let PET_DATA = [];
let PET_IMAGES = {};
let selectedPetName = null;

const ATTR_STRONG = { '지': '풍', '풍': '수', '수': '화', '화': '지' };

// ───── 무기 정의 (이미지 + 동작) ─────
const WEAPON_DEFS = {
  axe: {
    name: '테라죠의 도끼', icon: 'https://wind01.net/info/item/52058.png',
    desc: '회전하며 주변 적 베기',
    cooldown: 1500, damage: 1.5, range: 90,
    style: 'orbit', // 주변 회전 공격
    orbitCount: 1, orbitRadius: 90, orbitSpeed: 3,
  },
  spear: {
    name: '헤티아의 창', icon: 'https://wind01.net/info/item/36281.png',
    desc: '직선 길게 찌르기',
    cooldown: 1200, damage: 2.0, range: 350,
    style: 'thrust', // 직선 찌르기
    thrustLen: 350, thrustWidth: 50,
  },
  claw: {
    name: '흑룡의 발톱', icon: 'https://wind01.net/info/item/36283.png',
    desc: '빠른 연속 할퀴기',
    cooldown: 400, damage: 0.8, range: 130,
    style: 'slash',
    slashCount: 3,
  },
  bow: {
    name: '정령왕의 활', icon: 'https://wind01.net/info/item/20325.png',
    desc: '적을 자동 추적하는 화살',
    cooldown: 700, damage: 1.0, range: 600,
    style: 'arrow',
    projSpeed: 500,
  },
  hammer: {
    name: '의식의 곤봉', icon: 'https://wind01.net/info/item/36476.png',
    desc: '하늘에서 망치 떨어트리기',
    cooldown: 2000, damage: 2.5, range: 200,
    style: 'meteor',
  },
  ice: {
    name: '얼음 손톱', icon: 'https://wind01.net/info/item/36289.png',
    desc: '적을 얼리고 느리게',
    cooldown: 1800, damage: 1.2, range: 200,
    style: 'freeze',
  },
  stone: {
    name: '합성 돌9', icon: 'https://wind01.net/info/item/36186.png',
    desc: '주변을 도는 보호 오브',
    cooldown: 0, damage: 0.5,
    style: 'orb',
    orbCount: 3, orbRadius: 70, orbSpeed: 2.5,
  },
};

async function loadGameData() {
  try {
    const r = await fetch('../pet_info_data.json?t=' + Date.now());
    const pets = await r.json();
    PET_DATA = pets;
    pets.forEach(p => { if (p.image) PET_IMAGES[p.name] = p.image; });
    console.log(`✅ ${pets.length} 마리 펫 로드`);
  } catch(e) {
    console.error('펫 데이터 로드 실패:', e);
  }
}

// ───── 메뉴 ─────
function renderPetGrid(filter = '') {
  const grid = document.getElementById('pet-grid');
  if (!grid) return;
  const q = filter.toLowerCase().trim();
  const validPets = PET_DATA.filter(p => p.attr && (
    (p.attr['지']||0) + (p.attr['수']||0) + (p.attr['화']||0) + (p.attr['풍']||0)
  ) > 0);
  const filtered = q ? validPets.filter(p => p.name.toLowerCase().includes(q)) : validPets;
  filtered.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  grid.innerHTML = filtered.slice(0, 100).map(p => {
    const img = PET_IMAGES[p.name];
    const imgHTML = img ? `<img src="${img}" alt="${p.name}">` : '🐾';
    const attrSum = (p.attr['지']||0)+(p.attr['수']||0)+(p.attr['화']||0)+(p.attr['풍']||0);
    const grade = p.grade ? `★${p.grade}` : '';
    return `
      <div class="pet-card" data-name="${p.name}" onclick="selectPet('${p.name.replace(/'/g,"\\'")}')">
        <div class="pet-card-img">${imgHTML}</div>
        <div class="pet-card-name">${p.name}</div>
        <div class="pet-card-stats">${grade} 속성${attrSum}</div>
      </div>
    `;
  }).join('');
}

function selectPet(name) {
  selectedPetName = name;
  document.querySelectorAll('.pet-card').forEach(el => {
    el.classList.toggle('selected', el.dataset.name === name);
  });
  document.getElementById('start-btn').disabled = false;
  try { localStorage.setItem('survival-last-pet', name); } catch(e) {}
}

function updateHighScoreDisplay() {
  try {
    const high = JSON.parse(localStorage.getItem('survival-highscore') || '{}');
    if (high.time !== undefined) {
      const mm = String(Math.floor(high.time/60)).padStart(2,'0');
      const ss = String(Math.floor(high.time%60)).padStart(2,'0');
      document.getElementById('high-score').textContent =
        `🏆 최고: ${mm}:${ss} · Lv.${high.level} · 💀${high.kills}`;
    }
  } catch(e) {}
}

// ───── 게임 상태 ─────
const G = {
  canvas: null, ctx: null,
  petLayer: null,    // DOM 레이어 (펫 이미지용)
  W: 0, H: 0,
  running: false, paused: false,
  time: 0, startTime: 0, lastFrame: 0,
  player: null,
  enemies: [], projectiles: [], gems: [], effects: [],
  weapons: [], orbitals: [],  // orbitals: 회전 무기 (axe, orb)
  passives: {},
  kills: 0, level: 1, exp: 0, expToNext: 5,
  spawnTimer: 0, bossTimer: 30, difficultyMul: 1,
  keys: {}, joystick: { active: false, dx: 0, dy: 0 },
  camX: 0, camY: 0,
};

// ───── 펫 능력치 ─────
function getPetStats(name) {
  const info = PET_DATA.find(p => p.name === name);
  if (!info) return null;
  let baseStats = { atk: 200, def: 150, spd: 150, hp: 1200 };
  if (info.ic && info.sg) {
    const ic = info.ic, sg = info.sg;
    const hp = (ic.hp||30) + (sg.hp||1)*140;
    const str = (ic.str||15) + (sg.str||0.5)*140;
    const vit = (ic.vit||15) + (sg.vit||0.5)*140;
    const agi = (ic.agi||15) + (sg.agi||0.5)*140;
    baseStats = {
      atk: Math.round(str + vit/10 + hp/10 + agi/20),
      def: Math.round(vit + str/10 + hp/10 + agi/20),
      spd: Math.round(agi),
      hp: Math.round(hp*4 + str + vit + agi),
    };
  }
  const attr = info.attr || {};
  let mainAttr = null, maxVal = 0;
  for (const a of ['지','수','화','풍']) {
    if ((attr[a]||0) > maxVal) { maxVal = attr[a]; mainAttr = a; }
  }
  return {
    name: info.name, image: info.image,
    attr, mainAttr,
    baseAtk: baseStats.atk, baseDef: baseStats.def,
    baseSpd: baseStats.spd, baseHp: baseStats.hp,
  };
}

// ───── 캔버스 설정 ─────
function setupCanvas() {
  G.canvas = document.getElementById('game-canvas');
  G.ctx = G.canvas.getContext('2d');
  // 펫 DOM 레이어
  if (!document.getElementById('pet-layer')) {
    const layer = document.createElement('div');
    layer.id = 'pet-layer';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:5;overflow:hidden;';
    document.body.appendChild(layer);
    G.petLayer = layer;
  } else {
    G.petLayer = document.getElementById('pet-layer');
  }
  const resize = () => {
    G.W = window.innerWidth;
    G.H = window.innerHeight;
    G.canvas.width = G.W * window.devicePixelRatio;
    G.canvas.height = G.H * window.devicePixelRatio;
    G.canvas.style.width = G.W + 'px';
    G.canvas.style.height = G.H + 'px';
    G.ctx.setTransform(1, 0, 0, 1, 0, 0);
    G.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  };
  resize();
  window.addEventListener('resize', resize);
}

// ───── 배경 그리기 (스톤에이지 분위기) ─────
function drawBackground() {
  const ctx = G.ctx;
  // 1. 잔디 베이스
  ctx.fillStyle = '#3a5a2a';
  ctx.fillRect(0, 0, G.W, G.H);
  
  // 2. 그라데이션 명암 (중앙 밝게)
  const grad = ctx.createRadialGradient(G.W/2, G.H/2, 0, G.W/2, G.H/2, Math.max(G.W, G.H)*0.7);
  grad.addColorStop(0, 'rgba(100, 140, 60, 0.4)');
  grad.addColorStop(1, 'rgba(20, 40, 10, 0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, G.W, G.H);

  // 3. 잔디 패턴 (점들 - 카메라 좌표 기반)
  const tileSize = 40;
  const offX = -((G.camX) % tileSize);
  const offY = -((G.camY) % tileSize);
  // 시드 기반 패턴 (같은 위치는 같은 모양)
  ctx.save();
  for (let y = -tileSize; y < G.H + tileSize; y += tileSize) {
    for (let x = -tileSize; x < G.W + tileSize; x += tileSize) {
      const wx = Math.floor((x + G.camX - G.W/2) / tileSize);
      const wy = Math.floor((y + G.camY - G.H/2) / tileSize);
      const seed = (wx * 374761393 + wy * 668265263) & 0xffffffff;
      const r = ((seed >> 13) ^ (seed >> 27) ^ seed) & 0xff;
      // 잔디 풀
      if (r < 80) {
        const px = x + offX + (r % 20);
        const py = y + offY + ((r >> 4) % 20);
        ctx.fillStyle = 'rgba(50, 90, 30, 0.5)';
        ctx.fillRect(px, py, 3, 5);
        ctx.fillStyle = 'rgba(80, 130, 50, 0.4)';
        ctx.fillRect(px+1, py-2, 1, 3);
      }
      // 작은 돌
      else if (r < 95) {
        const px = x + offX + (r % 30);
        const py = y + offY + ((r >> 5) % 30);
        ctx.fillStyle = 'rgba(120, 110, 100, 0.5)';
        ctx.beginPath();
        ctx.ellipse(px, py, 4, 3, 0, 0, Math.PI*2);
        ctx.fill();
      }
      // 작은 꽃
      else if (r < 100) {
        const px = x + offX + (r % 30);
        const py = y + offY + ((r >> 5) % 30);
        ctx.fillStyle = ['#ff7a8a', '#fdd835', '#ff9a4a', '#f587b8'][r % 4];
        ctx.beginPath();
        ctx.arc(px, py, 2, 0, Math.PI*2);
        ctx.fill();
      }
      // 덤불
      else if (r < 105) {
        const px = x + offX + (r % 20);
        const py = y + offY + ((r >> 5) % 20);
        ctx.fillStyle = 'rgba(30, 60, 15, 0.6)';
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI*2);
        ctx.fill();
        ctx.fillStyle = 'rgba(60, 100, 35, 0.5)';
        ctx.beginPath();
        ctx.arc(px-2, py-2, 4, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }
  ctx.restore();

  // 4. 가장자리 어둡게 (비네트)
  const vig = ctx.createRadialGradient(G.W/2, G.H/2, Math.min(G.W,G.H)*0.3, G.W/2, G.H/2, Math.max(G.W,G.H)*0.7);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, G.W, G.H);
}

// ───── 펫 DOM 요소 관리 ─────
function createPetDOM(name, imgUrl, isPlayer, isBoss) {
  const el = document.createElement('div');
  const sz = isBoss ? 80 : (isPlayer ? 60 : 44);
  el.style.cssText = `
    position: absolute;
    width: ${sz}px;
    height: ${sz}px;
    margin-left: -${sz/2}px;
    margin-top: -${sz/2}px;
    pointer-events: none;
    transition: filter 0.1s;
    will-change: transform;
  `;
  if (imgUrl) {
    el.innerHTML = `<img src="${imgUrl}" alt="${name}" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated;filter:drop-shadow(0 4px 6px rgba(0,0,0,0.5));">`;
  } else {
    el.innerHTML = `<div style="font-size:${sz*0.7}px;text-align:center;line-height:${sz}px;">🐾</div>`;
  }
  // HP 바 (적용)
  if (!isPlayer) {
    const hpWrap = document.createElement('div');
    hpWrap.className = 'enemy-hp';
    hpWrap.style.cssText = `
      position: absolute;
      top: -8px; left: 10%; width: 80%;
      height: 4px;
      background: rgba(0,0,0,0.7);
      border-radius: 2px;
      overflow: hidden;
      display: none;
    `;
    const hpFill = document.createElement('div');
    hpFill.style.cssText = `width: 100%; height: 100%; background: ${isBoss ? '#fdd835' : '#ff5252'};`;
    hpWrap.appendChild(hpFill);
    el.appendChild(hpWrap);
    el._hpFill = hpFill;
    el._hpWrap = hpWrap;
  }
  if (isBoss) {
    const label = document.createElement('div');
    label.textContent = 'BOSS';
    label.style.cssText = `
      position: absolute; top: -22px; left: 50%; transform: translateX(-50%);
      color: #fdd835; font-weight: 900; font-size: 11px;
      font-family: 'Nunito', sans-serif;
      text-shadow: 0 2px 4px rgba(0,0,0,0.8);
      letter-spacing: 1px;
      white-space: nowrap;
    `;
    el.appendChild(label);
  }
  G.petLayer.appendChild(el);
  return el;
}

function updatePetDOM(el, worldX, worldY, hpRatio, hit, frozen) {
  const sx = worldX - G.camX + G.W/2;
  const sy = worldY - G.camY + G.H/2;
  el.style.transform = `translate(${sx}px, ${sy}px)`;
  if (el._hpFill) {
    if (hpRatio !== undefined && hpRatio < 1) {
      el._hpWrap.style.display = 'block';
      el._hpFill.style.width = (hpRatio * 100) + '%';
    }
  }
  // 피격 효과
  if (hit) {
    el.style.filter = 'brightness(2) sepia(1) hue-rotate(-30deg)';
    setTimeout(() => { el.style.filter = frozen ? 'brightness(1.3) hue-rotate(180deg)' : ''; }, 120);
  } else if (frozen !== undefined) {
    el.style.filter = frozen ? 'brightness(1.3) hue-rotate(180deg)' : '';
  }
}

function removePetDOM(el) {
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

// ───── 무기 이미지 캐시 ─────
const weaponImgCache = {};
function getWeaponImg(key) {
  if (!weaponImgCache[key]) {
    const def = WEAPON_DEFS[key];
    if (def) {
      const img = new Image();
      img.src = def.icon;
      img.crossOrigin = 'anonymous';
      weaponImgCache[key] = img;
    }
  }
  return weaponImgCache[key];
}

// ───── 입력 ─────
function setupInput() {
  window.addEventListener('keydown', e => {
    G.keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.key === 'Escape') { e.preventDefault(); togglePause(); }
  });
  window.addEventListener('keyup', e => { G.keys[e.key.toLowerCase()] = false; });

  const zone = document.getElementById('joystick-zone');
  const knob = document.getElementById('joystick-knob');
  let touchId = null;
  let baseX = 0, baseY = 0;
  function start(x, y, id) {
    const rect = zone.getBoundingClientRect();
    baseX = rect.left + rect.width/2;
    baseY = rect.top + rect.height/2;
    touchId = id;
    G.joystick.active = true;
    move(x, y);
  }
  function move(x, y) {
    let dx = x - baseX, dy = y - baseY;
    const dist = Math.hypot(dx, dy);
    const max = 60;
    if (dist > max) { dx = dx/dist*max; dy = dy/dist*max; }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    G.joystick.dx = dx/max; G.joystick.dy = dy/max;
  }
  function end() {
    knob.style.transform = 'translate(-50%, -50%)';
    G.joystick.active = false; G.joystick.dx = 0; G.joystick.dy = 0; touchId = null;
  }
  zone.addEventListener('touchstart', e => { e.preventDefault(); const t=e.changedTouches[0]; start(t.clientX, t.clientY, t.identifier); });
  zone.addEventListener('touchmove', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier===touchId) { move(t.clientX, t.clientY); break; } });
  zone.addEventListener('touchend', e => { e.preventDefault(); for (const t of e.changedTouches) if (t.identifier===touchId) { end(); break; } });
  zone.addEventListener('touchcancel', end);
  let mouseDown = false;
  zone.addEventListener('mousedown', e => { e.preventDefault(); mouseDown=true; start(e.clientX, e.clientY, 'mouse'); });
  window.addEventListener('mousemove', e => { if (mouseDown) move(e.clientX, e.clientY); });
  window.addEventListener('mouseup', () => { if (mouseDown) { mouseDown=false; end(); } });
}

// ───── 게임 시작 ─────
async function startGame() {
  if (!selectedPetName) return;
  const stats = getPetStats(selectedPetName);
  if (!stats) { alert('펫 데이터 로드 실패'); return; }

  document.getElementById('menu-screen').classList.add('hide');
  document.getElementById('game-hud').style.display = 'block';
  document.getElementById('weapon-icons').style.display = 'flex';
  document.getElementById('pause-btn').classList.add('show');
  const isMobile = ('ontouchstart' in window) || window.innerWidth < 768;
  if (isMobile) document.getElementById('joystick-zone').classList.add('show');

  // 펫 레이어 클리어
  if (G.petLayer) G.petLayer.innerHTML = '';

  G.player = {
    x: 0, y: 0,
    name: stats.name, image: stats.image,
    attr: stats.attr, mainAttr: stats.mainAttr,
    radius: 30,
    baseAtk: stats.baseAtk, baseDef: stats.baseDef,
    baseSpd: stats.baseSpd, baseHp: stats.baseHp,
    hp: stats.baseHp, maxHp: stats.baseHp,
    atk: stats.baseAtk, def: stats.baseDef,
    moveSpeed: 220,
    invincibleUntil: 0,
    dom: createPetDOM(stats.name, stats.image, true, false),
    facing: 1,  // 1 right, -1 left
  };
  G.enemies = [];
  G.projectiles = [];
  G.gems = [];
  G.effects = [];
  G.orbitals = [];

  // 시작 무기 (활)
  G.weapons = [];
  addWeapon('bow');

  G.passives = {
    atkMul: 1.0, defAdd: 0, hpMul: 1.0, spdMul: 1.0,
    cdMul: 1.0, rangeMul: 1.0, pickupRadius: 80, expMul: 1.0,
  };
  G.kills = 0; G.level = 1; G.exp = 0; G.expToNext = 5;
  G.time = 0;
  G.startTime = performance.now();
  G.lastFrame = G.startTime;
  G.spawnTimer = 0; G.bossTimer = 30; G.difficultyMul = 1;
  G.paused = false; G.running = true;

  updateHUD();
  updateWeaponIcons();
  requestAnimationFrame(gameLoop);
}

function addWeapon(key) {
  const def = WEAPON_DEFS[key];
  if (!def) return;
  const w = {
    key,
    ...def,
    level: 1,
    lastFire: 0,
  };
  G.weapons.push(w);
  // orbit / orb 무기는 회전 객체 생성
  if (def.style === 'orbit') {
    for (let i = 0; i < (def.orbitCount || 1); i++) {
      G.orbitals.push({ weapon: w, kind: 'orbit', angle: (i / (def.orbitCount||1)) * Math.PI * 2 });
    }
  } else if (def.style === 'orb') {
    for (let i = 0; i < (def.orbCount || 3); i++) {
      G.orbitals.push({ weapon: w, kind: 'orb', angle: (i / (def.orbCount||3)) * Math.PI * 2 });
    }
  }
}

// ───── 메인 루프 ─────
function gameLoop(now) {
  if (!G.running) return;
  if (G.paused) { G.lastFrame = now; requestAnimationFrame(gameLoop); return; }
  const dt = Math.min(0.05, (now - G.lastFrame) / 1000);
  G.lastFrame = now;
  G.time = (now - G.startTime) / 1000;
  update(dt, now);
  render();
  requestAnimationFrame(gameLoop);
}

function update(dt, now) {
  G.difficultyMul = 1 + G.time / 60;
  updatePlayer(dt);
  updateEnemies(dt, now);
  updateProjectiles(dt);
  updateGems(dt);
  updateEffects(dt);
  updateOrbitals(dt);
  updateWeapons(dt, now);
  updateSpawning(dt);
  updateHUD();
}

function updatePlayer(dt) {
  const p = G.player;
  let dx = 0, dy = 0;
  if (G.keys['w'] || G.keys['arrowup']) dy -= 1;
  if (G.keys['s'] || G.keys['arrowdown']) dy += 1;
  if (G.keys['a'] || G.keys['arrowleft']) dx -= 1;
  if (G.keys['d'] || G.keys['arrowright']) dx += 1;
  if (G.joystick.active) { dx = G.joystick.dx; dy = G.joystick.dy; }
  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; }
  const speed = p.moveSpeed * G.passives.spdMul;
  p.x += dx * speed * dt;
  p.y += dy * speed * dt;
  if (dx !== 0) p.facing = dx > 0 ? 1 : -1;
  G.camX = p.x; G.camY = p.y;
  // DOM 업데이트
  updatePetDOM(p.dom, p.x, p.y);
  p.dom.style.transform += ` scaleX(${p.facing})`;
}

function updateEnemies(dt, now) {
  const p = G.player;
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    // 얼린 상태면 천천히
    const slow = e.frozenUntil > now ? 0.3 : 1.0;
    const dx = p.x - e.x, dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    e.x += (dx/dist) * e.speed * slow * dt;
    e.y += (dy/dist) * e.speed * slow * dt;

    // 플레이어 충돌
    if (dist < p.radius + e.radius && now > p.invincibleUntil) {
      const mult = attrMul(e.attr, p.attr);
      const dmg = Math.max(1, Math.round((e.atk - (p.def * 0.3 + G.passives.defAdd)) * mult));
      p.hp -= dmg;
      p.invincibleUntil = now + 500;
      flashDamage();
      addFloatingText(p.x, p.y - 40, '-' + dmg, '#ff5252', true);
      if (p.hp <= 0) { p.hp = 0; gameOver(); return; }
    }

    // DOM 업데이트
    updatePetDOM(e.dom, e.x, e.y, e.hp/e.maxHp, false, e.frozenUntil > now);

    if (e.hp <= 0) {
      removePetDOM(e.dom);
      G.enemies.splice(i, 1);
      G.kills++;
      dropGem(e.x, e.y, e.boss ? 5 : 1);
      if (e.boss) {
        p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3));
        addFloatingText(p.x, p.y - 40, 'BOSS KILL!', '#fdd835', true);
      }
    }
  }
}

function updateProjectiles(dt) {
  const now = performance.now();
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    // 추적 (homing)
    if (pr.homing && pr.target) {
      const tx = pr.target.x - pr.x, ty = pr.target.y - pr.y;
      const td = Math.hypot(tx, ty) || 1;
      const sp = Math.hypot(pr.vx, pr.vy);
      const cx = tx/td, cy = ty/td;
      pr.vx = pr.vx * 0.85 + cx * sp * 0.15;
      pr.vy = pr.vy * 0.85 + cy * sp * 0.15;
      const newSp = Math.hypot(pr.vx, pr.vy);
      if (newSp > 0) { pr.vx = pr.vx/newSp*sp; pr.vy = pr.vy/newSp*sp; }
      // 죽은 적이면 추적 해제
      if (pr.target.hp <= 0) pr.target = null;
    }
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    if (pr.life <= 0) { G.projectiles.splice(i, 1); continue; }
    let hit = false;
    for (const e of G.enemies) {
      const dist = Math.hypot(e.x - pr.x, e.y - pr.y);
      if (dist < e.radius + pr.radius) {
        if (pr.hitSet && pr.hitSet.has(e)) continue;
        applyHit(e, pr.damage, G.player, pr.special);
        if (pr.pierce && pr.pierce > 0) {
          if (!pr.hitSet) pr.hitSet = new Set();
          pr.hitSet.add(e);
          pr.pierce--;
        } else { hit = true; break; }
      }
    }
    if (hit) G.projectiles.splice(i, 1);
  }
}

function applyHit(enemy, damage, attacker, special) {
  const mult = attrMul(attacker.attr, enemy.attr);
  let dmg = damage * mult;
  const isCrit = Math.random() < 0.08;
  if (isCrit) dmg *= 2;
  dmg = Math.max(1, Math.round(dmg));
  enemy.hp -= dmg;
  addFloatingText(enemy.x, enemy.y - 25, '-' + dmg, isCrit ? '#fdd835' : '#fff', isCrit);
  // 피격 효과
  updatePetDOM(enemy.dom, enemy.x, enemy.y, enemy.hp/enemy.maxHp, true, enemy.frozenUntil > performance.now());
  // 특수 효과
  if (special === 'freeze') {
    enemy.frozenUntil = performance.now() + 1500;
  }
}

function updateGems(dt) {
  const p = G.player;
  for (let i = G.gems.length - 1; i >= 0; i--) {
    const g = G.gems[i];
    const dx = p.x - g.x, dy = p.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist < p.radius) {
      G.exp += g.value * G.passives.expMul;
      G.gems.splice(i, 1);
      if (G.exp >= G.expToNext) levelUp();
    } else if (dist < G.passives.pickupRadius) {
      const pullSp = 600;
      g.x += (dx/dist) * pullSp * dt;
      g.y += (dy/dist) * pullSp * dt;
    } else {
      g.bounce = (g.bounce || 0) + dt * 5;
    }
  }
}

function updateEffects(dt) {
  for (let i = G.effects.length - 1; i >= 0; i--) {
    const ef = G.effects[i];
    ef.life -= dt;
    if (ef.update) ef.update(dt);
    if (ef.life <= 0) G.effects.splice(i, 1);
  }
}

function updateOrbitals(dt) {
  const now = performance.now();
  for (const o of G.orbitals) {
    o.angle += (o.weapon.orbitSpeed || o.weapon.orbSpeed || 2) * dt;
    const r = (o.weapon.orbitRadius || o.weapon.orbRadius || 70) * G.passives.rangeMul;
    const px = G.player.x + Math.cos(o.angle) * r;
    const py = G.player.y + Math.sin(o.angle) * r;
    o.x = px; o.y = py;
    // 적과 충돌
    const hitInterval = 300;
    if (!o.lastHits) o.lastHits = new Map();
    for (const e of G.enemies) {
      const dist = Math.hypot(e.x - px, e.y - py);
      if (dist < e.radius + 25) {
        const last = o.lastHits.get(e) || 0;
        if (now - last > hitInterval) {
          const dmg = G.player.atk * o.weapon.damage * G.passives.atkMul * 0.15;
          applyHit(e, dmg, G.player);
          o.lastHits.set(e, now);
        }
      }
    }
  }
}

function updateWeapons(dt, now) {
  for (const w of G.weapons) {
    if (w.style === 'orbit' || w.style === 'orb') continue; // 자동
    const cd = w.cooldown * G.passives.cdMul;
    if (now - w.lastFire >= cd) {
      fireWeapon(w, now);
      w.lastFire = now;
    }
  }
}

function fireWeapon(w, now) {
  const p = G.player;
  switch (w.style) {
    case 'arrow': {  // 정령왕의 활 - 추적 화살
      const target = findNearestEnemy();
      if (!target) return;
      const range = w.range * G.passives.rangeMul;
      if (Math.hypot(target.x - p.x, target.y - p.y) > range) return;
      const cnt = w.level || 1;
      for (let i = 0; i < Math.min(cnt, 3); i++) {
        const dx = target.x - p.x + (Math.random() - 0.5) * 20;
        const dy = target.y - p.y + (Math.random() - 0.5) * 20;
        const dist = Math.hypot(dx, dy) || 1;
        setTimeout(() => {
          G.projectiles.push({
            x: p.x, y: p.y,
            vx: (dx/dist) * w.projSpeed,
            vy: (dy/dist) * w.projSpeed,
            radius: 8,
            damage: p.atk * w.damage * G.passives.atkMul * 0.18,
            life: 2,
            type: 'arrow',
            color: '#fdd835',
            homing: true,
            target: target,
            pierce: 0,
          });
        }, i * 80);
      }
      break;
    }
    case 'thrust': {  // 헤티아의 창 - 직선 찌르기
      const target = findNearestEnemy();
      if (!target) return;
      const dx = target.x - p.x, dy = target.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx);
      const len = w.thrustLen * G.passives.rangeMul;
      const wid = w.thrustWidth;
      // 적 명중
      for (const e of G.enemies) {
        const ex = e.x - p.x, ey = e.y - p.y;
        const proj = ex * Math.cos(angle) + ey * Math.sin(angle);
        const perp = Math.abs(-ex * Math.sin(angle) + ey * Math.cos(angle));
        if (proj > 0 && proj < len && perp < wid + e.radius) {
          applyHit(e, p.atk * w.damage * G.passives.atkMul * 0.25, p);
        }
      }
      // 이펙트
      G.effects.push({
        x: p.x, y: p.y, angle, len, wid,
        life: 0.3, maxLife: 0.3, weaponKey: 'spear',
        draw(ctx) {
          const sx = this.x - G.camX + G.W/2;
          const sy = this.y - G.camY + G.H/2;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(this.angle);
          const t = 1 - this.life / this.maxLife;
          // 빛 줄기
          ctx.fillStyle = `rgba(253,216,53, ${0.4*(1-t)})`;
          ctx.fillRect(0, -this.wid/2, this.len * (0.5 + t*0.5), this.wid);
          // 창 이미지
          const img = getWeaponImg('spear');
          if (img && img.complete) {
            const sz = 60;
            ctx.drawImage(img, this.len * (0.3 + t*0.6) - sz/2, -sz/2, sz, sz);
          }
          ctx.restore();
        }
      });
      break;
    }
    case 'slash': {  // 흑룡의 발톱 - 빠른 연속 할퀴기
      const target = findNearestEnemy();
      if (!target) return;
      const range = w.range * G.passives.rangeMul;
      if (Math.hypot(target.x - p.x, target.y - p.y) > range) return;
      const cnt = w.slashCount || 3;
      for (let i = 0; i < cnt; i++) {
        setTimeout(() => {
          // 가장 가까운 적 다시 찾기
          const t = findNearestEnemy();
          if (!t) return;
          const dx = t.x - p.x, dy = t.y - p.y;
          const angle = Math.atan2(dy, dx);
          // 적 데미지
          for (const e of G.enemies) {
            const d = Math.hypot(e.x - p.x, e.y - p.y);
            if (d < range) {
              const ea = Math.atan2(e.y - p.y, e.x - p.x);
              const diff = Math.abs(((ea - angle + Math.PI*3) % (Math.PI*2)) - Math.PI);
              if (diff < 0.5) {
                applyHit(e, p.atk * w.damage * G.passives.atkMul * 0.15, p);
              }
            }
          }
          // 이펙트
          G.effects.push({
            x: p.x, y: p.y, angle,
            life: 0.25, maxLife: 0.25, weaponKey: 'claw',
            draw(ctx) {
              const sx = this.x - G.camX + G.W/2;
              const sy = this.y - G.camY + G.H/2;
              ctx.save();
              ctx.translate(sx, sy);
              ctx.rotate(this.angle);
              const t = 1 - this.life / this.maxLife;
              // 할퀸 자국
              ctx.strokeStyle = `rgba(255,80,80, ${0.8*(1-t)})`;
              ctx.lineWidth = 4;
              for (let j = -1; j <= 1; j++) {
                ctx.beginPath();
                ctx.moveTo(20, j*15);
                ctx.quadraticCurveTo(60 + t*30, j*20, 100 + t*30, j*25);
                ctx.stroke();
              }
              // 발톱 이미지
              const img = getWeaponImg('claw');
              if (img && img.complete) {
                const sz = 40;
                ctx.drawImage(img, 50 + t*40 - sz/2, -sz/2, sz, sz);
              }
              ctx.restore();
            }
          });
        }, i * 120);
      }
      break;
    }
    case 'meteor': {  // 의식의 곤봉 - 망치 떨어트리기
      const target = findNearestEnemy();
      if (!target) return;
      const cnt = w.level || 1;
      for (let i = 0; i < cnt; i++) {
        setTimeout(() => {
          const tx = target.x + (Math.random() - 0.5) * 60;
          const ty = target.y + (Math.random() - 0.5) * 60;
          // 망치 떨어지는 이펙트
          G.effects.push({
            x: tx, y: ty, startTime: performance.now(),
            life: 0.6, maxLife: 0.6,
            update(dt) {},
            draw(ctx) {
              const sx = this.x - G.camX + G.W/2;
              const sy = this.y - G.camY + G.H/2;
              const t = 1 - this.life / this.maxLife;
              const img = getWeaponImg('hammer');
              if (img && img.complete) {
                const sz = 60;
                const fallY = sy - (1-t)*200;
                ctx.save();
                ctx.translate(sx, fallY);
                ctx.rotate(t * Math.PI * 2);
                ctx.drawImage(img, -sz/2, -sz/2, sz, sz);
                ctx.restore();
                // 그림자
                ctx.fillStyle = `rgba(0,0,0, ${0.4 + t*0.3})`;
                ctx.beginPath();
                ctx.ellipse(sx, sy + 5, 25*t, 8*t, 0, 0, Math.PI*2);
                ctx.fill();
              }
            }
          });
          // 충격 시점 (떨어질 때)
          setTimeout(() => {
            G.effects.push({
              x: tx, y: ty, radius: 0, maxRadius: 80,
              life: 0.4, maxLife: 0.4,
              update(dt) { this.radius = (1-this.life/this.maxLife) * this.maxRadius; },
              draw(ctx) {
                const sx = this.x - G.camX + G.W/2;
                const sy = this.y - G.camY + G.H/2;
                const a = this.life / this.maxLife;
                ctx.strokeStyle = `rgba(255,150,50, ${a})`;
                ctx.lineWidth = 6;
                ctx.beginPath();
                ctx.arc(sx, sy, this.radius, 0, Math.PI*2);
                ctx.stroke();
                ctx.fillStyle = `rgba(255,200,100, ${a*0.3})`;
                ctx.beginPath();
                ctx.arc(sx, sy, this.radius, 0, Math.PI*2);
                ctx.fill();
              }
            });
            // 데미지
            for (const e of G.enemies) {
              const d = Math.hypot(e.x - tx, e.y - ty);
              if (d < 80) {
                applyHit(e, p.atk * w.damage * G.passives.atkMul * 0.3, p);
              }
            }
          }, 600);
        }, i * 200);
      }
      break;
    }
    case 'freeze': {  // 얼음 손톱 - 얼리기
      const range = w.range * G.passives.rangeMul;
      // 범위 안 적 모두 얼림 + 데미지
      const hit = [];
      for (const e of G.enemies) {
        if (Math.hypot(e.x - p.x, e.y - p.y) < range) {
          applyHit(e, p.atk * w.damage * G.passives.atkMul * 0.2, p, 'freeze');
          hit.push(e);
        }
      }
      // 얼음 폭풍 이펙트
      G.effects.push({
        x: p.x, y: p.y, radius: 0, maxRadius: range,
        life: 0.6, maxLife: 0.6,
        update(dt) { this.radius = (1-this.life/this.maxLife) * this.maxRadius; },
        draw(ctx) {
          const sx = this.x - G.camX + G.W/2;
          const sy = this.y - G.camY + G.H/2;
          const a = this.life / this.maxLife;
          // 얼음 파편들
          for (let i = 0; i < 8; i++) {
            const ang = (i / 8) * Math.PI * 2 + (1 - a) * 0.5;
            const r = this.radius * (0.5 + ((i*7)%3)/3*0.5);
            const ex = sx + Math.cos(ang) * r;
            const ey = sy + Math.sin(ang) * r;
            ctx.fillStyle = `rgba(150,220,255, ${a})`;
            ctx.strokeStyle = `rgba(255,255,255, ${a})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const sz = 8;
            ctx.moveTo(ex, ey - sz);
            ctx.lineTo(ex + sz*0.6, ey);
            ctx.lineTo(ex, ey + sz);
            ctx.lineTo(ex - sz*0.6, ey);
            ctx.closePath();
            ctx.fill(); ctx.stroke();
          }
          // 중앙 얼음 광채
          ctx.strokeStyle = `rgba(150,220,255, ${a*0.6})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(sx, sy, this.radius, 0, Math.PI*2);
          ctx.stroke();
        }
      });
      break;
    }
  }
}

function findNearestEnemy() {
  const p = G.player;
  let best = null, bestDist = Infinity;
  for (const e of G.enemies) {
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < bestDist) { bestDist = d; best = e; }
  }
  return best;
}

function updateSpawning(dt) {
  G.spawnTimer -= dt;
  if (G.spawnTimer <= 0) {
    spawnEnemy();
    G.spawnTimer = Math.max(0.15, 1.2 / G.difficultyMul);
  }
  G.bossTimer -= dt;
  if (G.bossTimer <= 0) {
    spawnBoss();
    G.bossTimer = 30;
  }
}

function spawnEnemy() {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.max(G.W, G.H) * 0.7;
  const x = G.player.x + Math.cos(angle) * dist;
  const y = G.player.y + Math.sin(angle) * dist;
  const enemyPets = PET_DATA.filter(p => p.attr && Object.values(p.attr).some(v => v > 0));
  const ep = enemyPets[Math.floor(Math.random() * enemyPets.length)];
  const lvMul = G.difficultyMul;
  const e = {
    x, y, name: ep.name, attr: ep.attr, radius: 22,
    hp: Math.round(20 * lvMul), maxHp: Math.round(20 * lvMul),
    atk: Math.round(15 * lvMul),
    speed: 80 + Math.random() * 40,
    boss: false, frozenUntil: 0,
    dom: createPetDOM(ep.name, ep.image, false, false),
  };
  G.enemies.push(e);
}

function spawnBoss() {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.max(G.W, G.H) * 0.7;
  const x = G.player.x + Math.cos(angle) * dist;
  const y = G.player.y + Math.sin(angle) * dist;
  const strongPets = PET_DATA.filter(p => p.attr).filter(p => {
    const s = (p.attr['지']||0)+(p.attr['수']||0)+(p.attr['화']||0)+(p.attr['풍']||0);
    return s >= 8;
  });
  const ep = strongPets[Math.floor(Math.random() * strongPets.length)] || PET_DATA[0];
  const e = {
    x, y, name: ep.name, attr: ep.attr, radius: 45,
    hp: Math.round(300 * G.difficultyMul), maxHp: Math.round(300 * G.difficultyMul),
    atk: Math.round(35 * G.difficultyMul),
    speed: 60, boss: true, frozenUntil: 0,
    dom: createPetDOM(ep.name, ep.image, false, true),
  };
  G.enemies.push(e);
  addFloatingText(x, y - 60, '⚠️ 보스 등장!', '#ff5252', true);
}

function dropGem(x, y, value) {
  G.gems.push({ x, y, value, bounce: 0 });
}

function attrMul(atkAttr, defAttr) {
  if (!atkAttr || !defAttr) return 1.0;
  let totalAtk = 0;
  for (const a of ['지','수','화','풍']) totalAtk += (atkAttr[a]||0);
  if (totalAtk === 0) return 1.0;
  let bonus = 0;
  for (const a of ['지','수','화','풍']) {
    const av = atkAttr[a]||0;
    if (av === 0) continue;
    const ar = av / totalAtk;
    for (const d of ['지','수','화','풍']) {
      const dv = defAttr[d]||0;
      if (dv === 0) continue;
      if (ATTR_STRONG[a] === d) bonus += dv * 0.1 * ar;
      else if (ATTR_STRONG[d] === a) bonus -= dv * 0.1 * ar;
    }
  }
  return Math.max(0.3, Math.min(2.0, 1.0 + bonus));
}

// ───── 데미지 텍스트 ─────
function addFloatingText(worldX, worldY, text, color, big) {
  const x = worldX - G.camX + G.W/2;
  const y = worldY - G.camY + G.H/2;
  const el = document.createElement('div');
  el.className = 'floating-text';
  el.textContent = text;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.color = color || '#fff';
  el.style.fontSize = big ? '24px' : '16px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 800);
}

function flashDamage() {
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:rgba(255,50,50,0.3);z-index:30;pointer-events:none;animation:fadeOut .3s forwards;';
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 300);
}

// ───── 렌더링 (잔상 없게 완전 클리어) ─────
function render() {
  const ctx = G.ctx;
  ctx.clearRect(0, 0, G.W, G.H);
  drawBackground();
  // 보석
  for (const g of G.gems) drawGem(g);
  // 발사체
  for (const pr of G.projectiles) drawProjectile(pr);
  // 회전 무기
  for (const o of G.orbitals) drawOrbital(o);
  // 이펙트
  for (const ef of G.effects) {
    if (ef.draw) ef.draw(ctx);
  }
  // (펫은 DOM이라 그냥 위에 그려짐)
}

function drawProjectile(pr) {
  const sx = pr.x - G.camX + G.W/2;
  const sy = pr.y - G.camY + G.H/2;
  if (pr.type === 'arrow') {
    // 화살: 진행 방향으로
    const angle = Math.atan2(pr.vy, pr.vx);
    G.ctx.save();
    G.ctx.translate(sx, sy);
    G.ctx.rotate(angle);
    const img = getWeaponImg('bow');
    if (img && img.complete) {
      G.ctx.drawImage(img, -16, -16, 32, 32);
    } else {
      G.ctx.fillStyle = pr.color;
      G.ctx.fillRect(-6, -2, 14, 4);
    }
    G.ctx.restore();
  } else {
    G.ctx.fillStyle = pr.color || '#fff';
    G.ctx.shadowColor = pr.color || '#fff';
    G.ctx.shadowBlur = 12;
    G.ctx.beginPath();
    G.ctx.arc(sx, sy, pr.radius, 0, Math.PI*2);
    G.ctx.fill();
    G.ctx.shadowBlur = 0;
  }
}

function drawOrbital(o) {
  const sx = o.x - G.camX + G.W/2;
  const sy = o.y - G.camY + G.H/2;
  const key = o.kind === 'orbit' ? 'axe' : 'stone';
  const img = getWeaponImg(key);
  G.ctx.save();
  G.ctx.translate(sx, sy);
  G.ctx.rotate(o.angle * (o.kind === 'orbit' ? 4 : 1));
  if (img && img.complete) {
    const sz = o.kind === 'orbit' ? 50 : 35;
    G.ctx.drawImage(img, -sz/2, -sz/2, sz, sz);
  } else {
    G.ctx.fillStyle = '#9b87f5';
    G.ctx.beginPath();
    G.ctx.arc(0, 0, 12, 0, Math.PI*2);
    G.ctx.fill();
  }
  G.ctx.restore();
}

function drawGem(g) {
  const sx = g.x - G.camX + G.W/2;
  const sy = g.y - G.camY + G.H/2;
  if (sx < -20 || sx > G.W + 20 || sy < -20 || sy > G.H + 20) return;
  const bob = Math.sin(g.bounce || 0) * 3;
  G.ctx.fillStyle = '#87d4f5';
  G.ctx.strokeStyle = '#fff';
  G.ctx.lineWidth = 1.5;
  G.ctx.shadowColor = '#87d4f5';
  G.ctx.shadowBlur = 8;
  const size = g.value > 1 ? 9 : 6;
  G.ctx.beginPath();
  G.ctx.moveTo(sx, sy - size + bob);
  G.ctx.lineTo(sx + size, sy + bob);
  G.ctx.lineTo(sx, sy + size + bob);
  G.ctx.lineTo(sx - size, sy + bob);
  G.ctx.closePath();
  G.ctx.fill();
  G.ctx.stroke();
  G.ctx.shadowBlur = 0;
}

// ───── HUD ─────
function updateHUD() {
  const p = G.player;
  if (!p) return;
  const mm = String(Math.floor(G.time/60)).padStart(2,'0');
  const ss = String(Math.floor(G.time%60)).padStart(2,'0');
  document.getElementById('hud-time').textContent = `${mm}:${ss}`;
  document.getElementById('hud-level').textContent = `Lv.${G.level}`;
  document.getElementById('hud-kills').textContent = `💀 ${G.kills}`;
  const hpPct = Math.max(0, p.hp) / p.maxHp * 100;
  const hpBar = document.getElementById('hp-bar');
  hpBar.style.width = hpPct + '%';
  hpBar.classList.toggle('low', hpPct < 30);
  document.getElementById('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
  document.getElementById('exp-bar').style.width = (G.exp / G.expToNext * 100) + '%';
}

function updateWeaponIcons() {
  const el = document.getElementById('weapon-icons');
  el.innerHTML = G.weapons.map(w => `
    <div class="weapon-icon">
      <img src="${w.icon}" style="width:24px;height:24px;image-rendering:pixelated;" alt="${w.name}">
      <span>${w.name.replace('의 ', '\n')}</span>
      <span class="weapon-icon-lv">Lv.${w.level}</span>
    </div>
  `).join('');
}

// ───── 레벨업 ─────
function buildUpgradeOptions() {
  const opts = [];
  // 보유한 무기 키
  const have = new Set(G.weapons.map(w => w.key));
  // 1) 새 무기 (안 가진 것)
  for (const key in WEAPON_DEFS) {
    if (have.has(key)) continue;
    const def = WEAPON_DEFS[key];
    opts.push({
      kind: 'new_weapon', key,
      icon: def.icon, isImg: true,
      name: def.name, desc: def.desc,
      apply: () => addWeapon(key),
    });
  }
  // 2) 무기 강화
  for (const w of G.weapons) {
    if (w.level >= 5) continue;
    opts.push({
      kind: 'weapon_lv', weapon: w,
      icon: w.icon, isImg: true,
      name: w.name + ' 강화',
      desc: `Lv.${w.level} → Lv.${w.level + 1} (데미지 +30%)`,
      apply: () => {
        w.level++;
        w.damage *= 1.3;
        w.cooldown *= 0.9;
        if (w.range) w.range *= 1.1;
        if (w.style === 'orbit' && w.level === 3) {
          // 3렙에 도끼 1개 추가
          G.orbitals.push({ weapon: w, kind: 'orbit', angle: Math.PI });
        }
        if (w.style === 'orb' && w.level === 3) {
          G.orbitals.push({ weapon: w, kind: 'orb', angle: Math.PI });
        }
      },
    });
  }
  // 3) 패시브 (반복)
  const passives = [
    { name: '공격력 +20%', icon: '⚔️', apply: () => G.passives.atkMul *= 1.2 },
    { name: '방어력 +10', icon: '🛡️', apply: () => G.passives.defAdd += 10 },
    { name: '최대 HP +25%', icon: '❤️', apply: () => {
      G.passives.hpMul *= 1.25;
      G.player.maxHp = Math.round(G.player.baseHp * G.passives.hpMul);
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + G.player.maxHp * 0.3);
    } },
    { name: '이동속도 +15%', icon: '💨', apply: () => G.passives.spdMul *= 1.15 },
    { name: '공격속도 +15%', icon: '🎯', apply: () => G.passives.cdMul *= 0.85 },
    { name: '공격범위 +25%', icon: '📡', apply: () => G.passives.rangeMul *= 1.25 },
    { name: '획득범위 +50%', icon: '🧲', apply: () => G.passives.pickupRadius *= 1.5 },
    { name: 'EXP +30%', icon: '🌟', apply: () => G.passives.expMul *= 1.3 },
    { name: 'HP 전체 회복', icon: '💖', apply: () => G.player.hp = G.player.maxHp },
  ];
  passives.forEach(p => opts.push({
    kind: 'passive', icon: p.icon, isImg: false,
    name: p.name, desc: '능력치 강화', apply: p.apply,
  }));
  return opts;
}

function levelUp() {
  G.exp -= G.expToNext;
  G.level++;
  G.expToNext = Math.round(G.expToNext * 1.5);
  const pool = buildUpgradeOptions();
  // 새 무기 우선 1개 (있다면)
  const newWeapons = pool.filter(o => o.kind === 'new_weapon');
  const others = pool.filter(o => o.kind !== 'new_weapon');
  others.sort(() => Math.random() - 0.5);
  const options = [];
  if (newWeapons.length > 0 && Math.random() < 0.7) {
    options.push(newWeapons[Math.floor(Math.random() * newWeapons.length)]);
  }
  while (options.length < 3 && others.length > 0) {
    options.push(others.shift());
  }
  showLevelUpModal(options);
}

function showLevelUpModal(options) {
  G.paused = true;
  const modal = document.getElementById('levelup-modal');
  const optsEl = document.getElementById('upgrade-options');
  document.getElementById('levelup-sub').textContent = `Lv.${G.level} 달성!`;
  optsEl.innerHTML = options.map((u, i) => {
    const iconHTML = u.isImg
      ? `<img src="${u.icon}" style="width:48px;height:48px;image-rendering:pixelated;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));" alt="">`
      : `<div class="upgrade-icon">${u.icon}</div>`;
    const cls = u.kind === 'new_weapon' ? 'new' : (u.kind === 'weapon_lv' ? 'weapon' : '');
    const badge = u.kind === 'new_weapon'
      ? '<div class="upgrade-new-badge">✨ NEW!</div>'
      : (u.kind === 'weapon_lv' ? '<div class="upgrade-lv-badge">⬆️ 강화</div>' : '');
    return `
      <div class="upgrade-option ${cls}" onclick="pickUpgrade(${i})">
        ${iconHTML}
        <div class="upgrade-name">${u.name}</div>
        <div class="upgrade-desc">${u.desc}</div>
        ${badge}
      </div>
    `;
  }).join('');
  window._levelUpOptions = options;
  modal.classList.add('show');
}

function pickUpgrade(idx) {
  const u = window._levelUpOptions[idx];
  if (!u) return;
  u.apply();
  document.getElementById('levelup-modal').classList.remove('show');
  G.paused = false;
  updateWeaponIcons();
}

function togglePause() {
  if (!G.running) return;
  if (document.getElementById('levelup-modal').classList.contains('show')) return;
  G.paused = !G.paused;
  document.getElementById('pause-btn').textContent = G.paused ? '▶️' : '⏸';
}

function gameOver() {
  G.running = false;
  document.getElementById('pause-btn').classList.remove('show');
  document.getElementById('joystick-zone').classList.remove('show');
  let high = {};
  try { high = JSON.parse(localStorage.getItem('survival-highscore') || '{}'); } catch(e) {}
  const isNew = !high.time || G.time > high.time;
  if (isNew) {
    high = { time: G.time, level: G.level, kills: G.kills, pet: G.player.name };
    try { localStorage.setItem('survival-highscore', JSON.stringify(high)); } catch(e) {}
  }
  const mm = String(Math.floor(G.time/60)).padStart(2,'0');
  const ss = String(Math.floor(G.time%60)).padStart(2,'0');
  document.getElementById('gameover-stats').innerHTML = `
    <div class="gameover-stat-row"><span class="gameover-stat-label">🕐 생존</span>
      <span class="gameover-stat-val ${isNew?'new-record':''}">${mm}:${ss}${isNew?' 🎉NEW!':''}</span></div>
    <div class="gameover-stat-row"><span class="gameover-stat-label">⚡ 레벨</span>
      <span class="gameover-stat-val gold">Lv.${G.level}</span></div>
    <div class="gameover-stat-row"><span class="gameover-stat-label">💀 처치</span>
      <span class="gameover-stat-val">${G.kills}</span></div>
    <div class="gameover-stat-row"><span class="gameover-stat-label">🐾 펫</span>
      <span class="gameover-stat-val">${G.player.name}</span></div>
  `;
  document.getElementById('gameover-modal').classList.add('show');
}

function restartGame() {
  document.getElementById('gameover-modal').classList.remove('show');
  startGame();
}

function goToMenu() {
  document.getElementById('gameover-modal').classList.remove('show');
  document.getElementById('game-hud').style.display = 'none';
  document.getElementById('weapon-icons').style.display = 'none';
  document.getElementById('menu-screen').classList.remove('hide');
  updateHighScoreDisplay();
  G.running = false;
  G.ctx.clearRect(0, 0, G.W, G.H);
  if (G.petLayer) G.petLayer.innerHTML = '';
}

(async () => {
  await loadGameData();
  setupCanvas();
  setupInput();
  // 무기 이미지 프리로드
  for (const key in WEAPON_DEFS) getWeaponImg(key);
  renderPetGrid();
  updateHighScoreDisplay();
  document.getElementById('pet-search').addEventListener('input', e => renderPetGrid(e.target.value));
  try {
    const last = localStorage.getItem('survival-last-pet');
    if (last) selectPet(last);
  } catch(e) {}
})();

const style = document.createElement('style');
style.textContent = '@keyframes fadeOut { to { opacity: 0; } }';
document.head.appendChild(style);
