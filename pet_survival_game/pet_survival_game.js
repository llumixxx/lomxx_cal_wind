/* ═══════════════════════════════════════════════════════════
   🦇 펫 서바이벌 게임
   ═══════════════════════════════════════════════════════════ */

// ───── 데이터 로딩 ─────
let PET_DATA = [];        // 전체 펫 정보 (이미지, 능력치)
let PET_RANKING = {};     // 펫별 랭킹 (있는 펫만)
let PET_IMAGES = {};      // 이름 → 이미지URL
let selectedPetName = null;

const ATTR_STRONG = { '지': '풍', '풍': '수', '수': '화', '화': '지' };
const ATTR_COLORS = { '지': '#a8c068', '수': '#7ab8e0', '화': '#ff7a5a', '풍': '#c8a8ff' };

async function loadGameData() {
  try {
    // 펫 정보 (상위 폴더에서 가져오기)
    const r = await fetch('../pet_info_data.json?t=' + Date.now());
    const pets = await r.json();
    PET_DATA = pets;
    pets.forEach(p => {
      if (p.image) PET_IMAGES[p.name] = p.image;
    });
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
  // 인기 펫부터 (강한 펫 위주로)
  const validPets = PET_DATA.filter(p => p.attr && (
    (p.attr['지']||0) + (p.attr['수']||0) + (p.attr['화']||0) + (p.attr['풍']||0)
  ) > 0);
  const filtered = q
    ? validPets.filter(p => p.name.toLowerCase().includes(q))
    : validPets;
  // 정렬: 이름순
  filtered.sort((a, b) => a.name.localeCompare(b.name, 'ko'));

  grid.innerHTML = filtered.slice(0, 100).map(p => {
    const img = PET_IMAGES[p.name];
    const imgHTML = img ? `<img src="${img}" alt="${p.name}">` : '🐾';
    // 능력치 표시 (대략적)
    const attrSum = (p.attr['지']||0) + (p.attr['수']||0) + (p.attr['화']||0) + (p.attr['풍']||0);
    const grade = p.grade ? `★${p.grade}` : '';
    return `
      <div class="pet-card" data-name="${p.name}" onclick="selectPet('${p.name.replace(/'/g, "\\'")}')">
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
      const mm = String(Math.floor(high.time / 60)).padStart(2, '0');
      const ss = String(Math.floor(high.time % 60)).padStart(2, '0');
      document.getElementById('high-score').textContent =
        `🏆 최고: ${mm}:${ss} · Lv.${high.level} · 💀${high.kills}`;
    }
  } catch(e) {}
}

// ───── 게임 상태 ─────
const G = {
  canvas: null, ctx: null,
  W: 0, H: 0,
  running: false,
  paused: false,
  time: 0,        // 게임 시간 (초)
  startTime: 0,
  lastFrame: 0,
  player: null,   // 플레이어 펫
  enemies: [],
  projectiles: [],
  gems: [],
  effects: [],    // 데미지 텍스트, 폭발 등
  weapons: [],    // 활성화된 무기들
  passives: {},   // 패시브 보너스
  kills: 0,
  level: 1,
  exp: 0,
  expToNext: 5,
  spawnTimer: 0,
  bossTimer: 30,  // 30초마다 보스
  difficultyMul: 1,
  // 입력
  keys: {},
  joystick: { active: false, dx: 0, dy: 0 },
  // 카메라 (월드는 무한)
  camX: 0, camY: 0,
};

// ───── 펫 능력치 가져오기 (있으면 랭킹, 없으면 기본) ─────
function getPetStats(name) {
  const info = PET_DATA.find(p => p.name === name);
  if (!info) return null;

  // 랭킹 데이터 있으면 1위 사용
  let baseStats = { atk: 200, def: 150, spd: 150, hp: 1200 };
  // 펫 기본정보의 ic + sg × 140으로 추정 (만렙)
  if (info.ic && info.sg) {
    // 풍 펫은 (체력, 완력, 활력, 속력) 베이스가 있음
    const ic = info.ic, sg = info.sg;
    // 만렙 (140) 기준 능력치 (캐릭터 공식 응용)
    const hp = (ic.hp || 30) + (sg.hp || 1) * 140;
    const str = (ic.str || 15) + (sg.str || 0.5) * 140;
    const vit = (ic.vit || 15) + (sg.vit || 0.5) * 140;
    const agi = (ic.agi || 15) + (sg.agi || 0.5) * 140;
    baseStats = {
      atk: Math.round(str + vit/10 + hp/10 + agi/20),
      def: Math.round(vit + str/10 + hp/10 + agi/20),
      spd: Math.round(agi),
      hp: Math.round(hp * 4 + str + vit + agi),
    };
  }

  // 속성 정보
  const attr = info.attr || {};
  // 주속성 (가장 비율 높은 거)
  let mainAttr = null, maxVal = 0;
  for (const a of ['지', '수', '화', '풍']) {
    if ((attr[a]||0) > maxVal) { maxVal = attr[a]; mainAttr = a; }
  }

  return {
    name: info.name,
    image: info.image,
    attr,
    mainAttr,
    baseAtk: baseStats.atk,
    baseDef: baseStats.def,
    baseSpd: baseStats.spd,
    baseHp: baseStats.hp,
  };
}

// ───── 캔버스 설정 ─────
function setupCanvas() {
  G.canvas = document.getElementById('game-canvas');
  G.ctx = G.canvas.getContext('2d');
  const resize = () => {
    G.W = window.innerWidth;
    G.H = window.innerHeight;
    G.canvas.width = G.W * window.devicePixelRatio;
    G.canvas.height = G.H * window.devicePixelRatio;
    G.canvas.style.width = G.W + 'px';
    G.canvas.style.height = G.H + 'px';
    G.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  };
  resize();
  window.addEventListener('resize', resize);
}

// ───── 이미지 캐시 ─────
const imgCache = {};
function loadImage(url) {
  if (!url) return null;
  if (imgCache[url]) return imgCache[url];
  const img = new Image();
  img.src = url;
  imgCache[url] = img;
  return img;
}

// ───── 입력 처리 ─────
function setupInput() {
  // 키보드
  window.addEventListener('keydown', e => {
    G.keys[e.key.toLowerCase()] = true;
    if (e.key === ' ' || e.key === 'Escape') { e.preventDefault(); togglePause(); }
  });
  window.addEventListener('keyup', e => {
    G.keys[e.key.toLowerCase()] = false;
  });

  // 모바일 조이스틱
  const zone = document.getElementById('joystick-zone');
  const knob = document.getElementById('joystick-knob');
  let touchId = null;
  let baseX = 0, baseY = 0;

  function start(x, y, id) {
    const rect = zone.getBoundingClientRect();
    baseX = rect.left + rect.width / 2;
    baseY = rect.top + rect.height / 2;
    touchId = id;
    G.joystick.active = true;
    move(x, y);
  }
  function move(x, y) {
    let dx = x - baseX, dy = y - baseY;
    const dist = Math.hypot(dx, dy);
    const maxDist = 60;
    if (dist > maxDist) {
      dx = dx / dist * maxDist;
      dy = dy / dist * maxDist;
    }
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    G.joystick.dx = dx / maxDist;
    G.joystick.dy = dy / maxDist;
  }
  function end() {
    knob.style.transform = 'translate(-50%, -50%)';
    G.joystick.active = false;
    G.joystick.dx = 0;
    G.joystick.dy = 0;
    touchId = null;
  }

  zone.addEventListener('touchstart', e => {
    e.preventDefault();
    const t = e.changedTouches[0];
    start(t.clientX, t.clientY, t.identifier);
  });
  zone.addEventListener('touchmove', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touchId) { move(t.clientX, t.clientY); break; }
    }
  });
  zone.addEventListener('touchend', e => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === touchId) { end(); break; }
    }
  });
  zone.addEventListener('touchcancel', end);

  // 마우스도 조이스틱처럼
  let mouseDown = false;
  zone.addEventListener('mousedown', e => {
    e.preventDefault();
    mouseDown = true;
    start(e.clientX, e.clientY, 'mouse');
  });
  window.addEventListener('mousemove', e => {
    if (mouseDown) move(e.clientX, e.clientY);
  });
  window.addEventListener('mouseup', () => {
    if (mouseDown) { mouseDown = false; end(); }
  });
}

// ───── 게임 시작 ─────
async function startGame() {
  if (!selectedPetName) return;
  const stats = getPetStats(selectedPetName);
  if (!stats) {
    alert('펫 데이터를 불러올 수 없습니다');
    return;
  }

  // UI 전환
  document.getElementById('menu-screen').classList.add('hide');
  document.getElementById('game-hud').style.display = 'block';
  document.getElementById('weapon-icons').style.display = 'flex';
  document.getElementById('pause-btn').classList.add('show');
  // 모바일 감지
  const isMobile = ('ontouchstart' in window) || window.innerWidth < 768;
  if (isMobile) document.getElementById('joystick-zone').classList.add('show');

  // 게임 상태 초기화
  G.player = {
    x: 0, y: 0,
    name: stats.name,
    image: stats.image,
    attr: stats.attr,
    mainAttr: stats.mainAttr,
    radius: 28,
    baseAtk: stats.baseAtk,
    baseDef: stats.baseDef,
    baseSpd: stats.baseSpd,
    baseHp: stats.baseHp,
    hp: stats.baseHp,
    maxHp: stats.baseHp,
    atk: stats.baseAtk,
    def: stats.baseDef,
    moveSpeed: 200, // 픽셀/초
    invincibleUntil: 0,
    img: loadImage(stats.image),
  };
  G.enemies = [];
  G.projectiles = [];
  G.gems = [];
  G.effects = [];
  G.weapons = [{
    type: 'basic',
    name: '기본 공격',
    icon: '⚔️',
    level: 1,
    cooldown: 800,  // ms
    lastFire: 0,
    damage: 1.0,    // 배율
    range: 400,
    projSpeed: 500,
  }];
  G.passives = {
    atkMul: 1.0,
    defAdd: 0,
    hpMul: 1.0,
    spdMul: 1.0,
    cdMul: 1.0,
    rangeMul: 1.0,
    pickupRadius: 80,
    expMul: 1.0,
  };
  G.kills = 0;
  G.level = 1;
  G.exp = 0;
  G.expToNext = 5;
  G.time = 0;
  G.startTime = performance.now();
  G.lastFrame = G.startTime;
  G.spawnTimer = 0;
  G.bossTimer = 30;
  G.difficultyMul = 1;
  G.paused = false;
  G.running = true;

  updateHUD();
  updateWeaponIcons();
  requestAnimationFrame(gameLoop);
}

// ───── 메인 게임 루프 ─────
function gameLoop(now) {
  if (!G.running) return;
  if (G.paused) {
    G.lastFrame = now;
    requestAnimationFrame(gameLoop);
    return;
  }
  const dt = Math.min(0.05, (now - G.lastFrame) / 1000); // 최대 50ms (작은 화면멈춤 방지)
  G.lastFrame = now;
  G.time = (now - G.startTime) / 1000;

  update(dt, now);
  render();

  requestAnimationFrame(gameLoop);
}

// ───── 업데이트 ─────
function update(dt, now) {
  // 난이도 증가 (시간에 따라)
  G.difficultyMul = 1 + G.time / 60; // 1분마다 1배 증가

  updatePlayer(dt);
  updateEnemies(dt);
  updateProjectiles(dt);
  updateGems(dt);
  updateEffects(dt);
  updateWeapons(dt, now);
  updateSpawning(dt);
  updateHUD();
}

function updatePlayer(dt) {
  const p = G.player;
  let dx = 0, dy = 0;
  // 키보드
  if (G.keys['w'] || G.keys['arrowup']) dy -= 1;
  if (G.keys['s'] || G.keys['arrowdown']) dy += 1;
  if (G.keys['a'] || G.keys['arrowleft']) dx -= 1;
  if (G.keys['d'] || G.keys['arrowright']) dx += 1;
  // 조이스틱
  if (G.joystick.active) {
    dx = G.joystick.dx;
    dy = G.joystick.dy;
  }
  const len = Math.hypot(dx, dy);
  if (len > 0) { dx /= len; dy /= len; }
  const speed = p.moveSpeed * G.passives.spdMul;
  p.x += dx * speed * dt;
  p.y += dy * speed * dt;

  // 카메라 따라가기
  G.camX = p.x;
  G.camY = p.y;
}

function updateEnemies(dt) {
  const p = G.player;
  const now = performance.now();
  for (let i = G.enemies.length - 1; i >= 0; i--) {
    const e = G.enemies[i];
    // 플레이어 방향 이동
    const dx = p.x - e.x, dy = p.y - e.y;
    const dist = Math.hypot(dx, dy) || 1;
    e.x += (dx / dist) * e.speed * dt;
    e.y += (dy / dist) * e.speed * dt;
    // 충돌 (플레이어 데미지)
    if (dist < p.radius + e.radius && now > p.invincibleUntil) {
      // 속성 상성 적용
      const mult = attrMul(e.attr, p.attr);
      const dmg = Math.max(1, Math.round((e.atk - p.def * 0.3) * mult));
      p.hp -= dmg;
      p.invincibleUntil = now + 500; // 무적 시간
      flashDamage();
      addFloatingText(p.x, p.y - 30, '-' + dmg, '#ff5252');
      if (p.hp <= 0) {
        p.hp = 0;
        gameOver();
        return;
      }
    }
    // HP 0 이면 제거
    if (e.hp <= 0) {
      G.enemies.splice(i, 1);
      G.kills++;
      // 보석 드롭
      dropGem(e.x, e.y, e.boss ? 5 : 1);
      // 보스 잡으면 HP 회복
      if (e.boss) {
        p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.3));
        addFloatingText(p.x, p.y - 40, 'BOSS KILL!', '#fdd835');
      }
    }
  }
}

function updateProjectiles(dt) {
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const pr = G.projectiles[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    if (pr.life <= 0) { G.projectiles.splice(i, 1); continue; }

    // 적과 충돌 체크
    let hit = false;
    for (const e of G.enemies) {
      const dist = Math.hypot(e.x - pr.x, e.y - pr.y);
      if (dist < e.radius + pr.radius) {
        // 이미 맞은 적 스킵 (관통용)
        if (pr.hitSet && pr.hitSet.has(e)) continue;
        // 데미지
        const mult = attrMul(G.player.attr, e.attr);
        let dmg = pr.damage * mult;
        // 크리티컬 (5%)
        const isCrit = Math.random() < 0.05;
        if (isCrit) dmg *= 2;
        dmg = Math.max(1, Math.round(dmg));
        e.hp -= dmg;
        addFloatingText(e.x, e.y - 20, '-' + dmg, isCrit ? '#fdd835' : '#fff', isCrit);

        if (pr.pierce && pr.pierce > 0) {
          if (!pr.hitSet) pr.hitSet = new Set();
          pr.hitSet.add(e);
          pr.pierce--;
        } else {
          hit = true;
          break;
        }
      }
    }
    if (hit) G.projectiles.splice(i, 1);
  }
}

function updateGems(dt) {
  const p = G.player;
  for (let i = G.gems.length - 1; i >= 0; i--) {
    const g = G.gems[i];
    const dx = p.x - g.x, dy = p.y - g.y;
    const dist = Math.hypot(dx, dy);
    if (dist < p.radius) {
      // 흡수
      G.exp += g.value * G.passives.expMul;
      G.gems.splice(i, 1);
      if (G.exp >= G.expToNext) levelUp();
    } else if (dist < G.passives.pickupRadius) {
      // 끌어오기
      const pullSpeed = 600;
      g.x += (dx / dist) * pullSpeed * dt;
      g.y += (dy / dist) * pullSpeed * dt;
    } else {
      // 미세 떠다님
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

function updateWeapons(dt, now) {
  G.weapons.forEach(w => {
    const cd = w.cooldown * G.passives.cdMul;
    if (now - w.lastFire >= cd) {
      fireWeapon(w);
      w.lastFire = now;
    }
  });
}

function fireWeapon(w) {
  const p = G.player;
  if (w.type === 'basic' || w.type === 'magic_arrow') {
    // 가장 가까운 적
    const target = findNearestEnemy();
    if (!target) return;
    const range = w.range * G.passives.rangeMul;
    if (Math.hypot(target.x - p.x, target.y - p.y) > range) return;
    const dx = target.x - p.x, dy = target.y - p.y;
    const dist = Math.hypot(dx, dy) || 1;
    G.projectiles.push({
      x: p.x, y: p.y,
      vx: (dx / dist) * w.projSpeed,
      vy: (dy / dist) * w.projSpeed,
      radius: 8,
      damage: p.atk * w.damage * G.passives.atkMul * 0.15,
      life: 2,
      color: w.type === 'magic_arrow' ? '#9b87f5' : '#fff',
      pierce: w.pierce || 0,
    });
  } else if (w.type === 'orbit') {
    // 주변 회전 ()
    // 이미 처리됨 (별도 effect)
  } else if (w.type === 'aoe_pulse') {
    // 주변 폭발
    const range = (w.range || 100) * G.passives.rangeMul;
    G.effects.push({
      x: p.x, y: p.y,
      radius: 0, maxRadius: range,
      life: 0.4, maxLife: 0.4,
      update(dt) {
        this.radius = (1 - this.life / this.maxLife) * this.maxRadius;
      },
      draw(ctx) {
        ctx.strokeStyle = `rgba(245,135,184, ${this.life / this.maxLife})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(this.x - G.camX + G.W/2, this.y - G.camY + G.H/2, this.radius, 0, Math.PI * 2);
        ctx.stroke();
      },
    });
    // 데미지 적용
    G.enemies.forEach(e => {
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= range) {
        const dmg = Math.max(1, Math.round(p.atk * w.damage * G.passives.atkMul * 0.2));
        e.hp -= dmg;
        addFloatingText(e.x, e.y - 20, '-' + dmg, '#f587b8');
      }
    });
  } else if (w.type === 'lightning') {
    // 랜덤 적에게 번개
    if (G.enemies.length === 0) return;
    const cnt = w.level || 1;
    for (let i = 0; i < cnt; i++) {
      const e = G.enemies[Math.floor(Math.random() * G.enemies.length)];
      const dmg = Math.max(1, Math.round(p.atk * w.damage * G.passives.atkMul * 0.25));
      e.hp -= dmg;
      addFloatingText(e.x, e.y - 20, '⚡' + dmg, '#fdd835');
      // 번개 effect
      G.effects.push({
        x1: p.x, y1: p.y, x2: e.x, y2: e.y,
        life: 0.2, maxLife: 0.2,
        update() {},
        draw(ctx) {
          ctx.strokeStyle = `rgba(253,216,53, ${this.life/this.maxLife})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(this.x1 - G.camX + G.W/2, this.y1 - G.camY + G.H/2);
          // 지그재그
          const steps = 6;
          for (let s = 1; s < steps; s++) {
            const t = s / steps;
            const mx = this.x1 + (this.x2 - this.x1) * t + (Math.random() - 0.5) * 30;
            const my = this.y1 + (this.y2 - this.y1) * t + (Math.random() - 0.5) * 30;
            ctx.lineTo(mx - G.camX + G.W/2, my - G.camY + G.H/2);
          }
          ctx.lineTo(this.x2 - G.camX + G.W/2, this.y2 - G.camY + G.H/2);
          ctx.stroke();
        },
      });
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
    // 시간 지날수록 더 자주 (난이도)
    G.spawnTimer = Math.max(0.15, 1.2 / G.difficultyMul);
  }
  // 보스
  G.bossTimer -= dt;
  if (G.bossTimer <= 0) {
    spawnBoss();
    G.bossTimer = 30;
  }
}

function spawnEnemy() {
  // 화면 밖 랜덤 위치
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.max(G.W, G.H) * 0.7;
  const x = G.player.x + Math.cos(angle) * dist;
  const y = G.player.y + Math.sin(angle) * dist;

  // 랜덤 적 펫 (속성 있는 것 중에서)
  const enemyPets = PET_DATA.filter(p => p.attr && Object.values(p.attr).some(v => v > 0));
  const ep = enemyPets[Math.floor(Math.random() * enemyPets.length)];

  // 난이도에 따른 스탯
  const lvMul = G.difficultyMul;
  G.enemies.push({
    x, y,
    name: ep.name,
    img: loadImage(ep.image),
    attr: ep.attr,
    radius: 22,
    hp: Math.round(20 * lvMul),
    maxHp: Math.round(20 * lvMul),
    atk: Math.round(15 * lvMul),
    speed: 80 + Math.random() * 40,
    boss: false,
  });
}

function spawnBoss() {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.max(G.W, G.H) * 0.7;
  const x = G.player.x + Math.cos(angle) * dist;
  const y = G.player.y + Math.sin(angle) * dist;

  // 강한 펫 (속성 합 큰 거)
  const strongPets = PET_DATA.filter(p => p.attr).filter(p => {
    const sum = (p.attr['지']||0) + (p.attr['수']||0) + (p.attr['화']||0) + (p.attr['풍']||0);
    return sum >= 8;
  });
  const ep = strongPets[Math.floor(Math.random() * strongPets.length)] || PET_DATA[0];

  G.enemies.push({
    x, y,
    name: ep.name,
    img: loadImage(ep.image),
    attr: ep.attr,
    radius: 45,
    hp: Math.round(300 * G.difficultyMul),
    maxHp: Math.round(300 * G.difficultyMul),
    atk: Math.round(35 * G.difficultyMul),
    speed: 60,
    boss: true,
  });
  addFloatingText(x, y - 60, '⚠️ 보스 등장!', '#ff5252');
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

// ───── 렌더링 ─────
function render() {
  const ctx = G.ctx;
  ctx.fillStyle = 'rgba(10, 10, 26, 0.3)';
  ctx.fillRect(0, 0, G.W, G.H);

  // 배경 그리드 (월드 좌표)
  drawGrid();

  // 보석
  for (const g of G.gems) drawGem(g);
  // 적
  for (const e of G.enemies) drawEnemy(e);
  // 플레이어
  drawPlayer(G.player);
  // 발사체
  for (const pr of G.projectiles) drawProjectile(pr);
  // 이펙트
  for (const ef of G.effects) {
    if (ef.draw) ef.draw(ctx);
  }
}

function drawGrid() {
  const ctx = G.ctx;
  const gridSize = 100;
  const offX = -((G.camX - G.W/2) % gridSize);
  const offY = -((G.camY - G.H/2) % gridSize);
  ctx.strokeStyle = 'rgba(155,135,245,0.08)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = offX; x < G.W; x += gridSize) {
    ctx.moveTo(x, 0); ctx.lineTo(x, G.H);
  }
  for (let y = offY; y < G.H; y += gridSize) {
    ctx.moveTo(0, y); ctx.lineTo(G.W, y);
  }
  ctx.stroke();
}

function drawPlayer(p) {
  const sx = p.x - G.camX + G.W/2;
  const sy = p.y - G.camY + G.H/2;
  // 무적이면 깜빡임
  const now = performance.now();
  if (now < p.invincibleUntil && Math.floor(now / 80) % 2) return;
  // 그림자
  G.ctx.fillStyle = 'rgba(0,0,0,0.3)';
  G.ctx.beginPath();
  G.ctx.ellipse(sx, sy + p.radius - 4, p.radius * 0.8, p.radius * 0.3, 0, 0, Math.PI * 2);
  G.ctx.fill();
  // 원 배경
  G.ctx.fillStyle = '#fff';
  G.ctx.strokeStyle = '#fff';
  G.ctx.lineWidth = 3;
  G.ctx.beginPath();
  G.ctx.arc(sx, sy, p.radius, 0, Math.PI * 2);
  G.ctx.fill();
  G.ctx.stroke();
  // 펫 이미지
  if (p.img && p.img.complete) {
    G.ctx.save();
    G.ctx.beginPath();
    G.ctx.arc(sx, sy, p.radius - 2, 0, Math.PI * 2);
    G.ctx.clip();
    const sz = p.radius * 1.5;
    G.ctx.drawImage(p.img, sx - sz/2, sy - sz/2, sz, sz);
    G.ctx.restore();
  }
}

function drawEnemy(e) {
  const sx = e.x - G.camX + G.W/2;
  const sy = e.y - G.camY + G.H/2;
  // 화면 밖이면 스킵
  if (sx < -60 || sx > G.W + 60 || sy < -60 || sy > G.H + 60) return;
  // 그림자
  G.ctx.fillStyle = 'rgba(0,0,0,0.4)';
  G.ctx.beginPath();
  G.ctx.ellipse(sx, sy + e.radius - 2, e.radius * 0.7, e.radius * 0.25, 0, 0, Math.PI * 2);
  G.ctx.fill();
  // 원
  G.ctx.fillStyle = e.boss ? '#fff5e8' : '#fff';
  G.ctx.strokeStyle = e.boss ? '#fdd835' : '#ff7a8a';
  G.ctx.lineWidth = e.boss ? 4 : 2;
  G.ctx.beginPath();
  G.ctx.arc(sx, sy, e.radius, 0, Math.PI * 2);
  G.ctx.fill();
  G.ctx.stroke();
  // 이미지
  if (e.img && e.img.complete) {
    G.ctx.save();
    G.ctx.beginPath();
    G.ctx.arc(sx, sy, e.radius - 1, 0, Math.PI * 2);
    G.ctx.clip();
    const sz = e.radius * 1.5;
    G.ctx.drawImage(e.img, sx - sz/2, sy - sz/2, sz, sz);
    G.ctx.restore();
  }
  // HP 바
  if (e.hp < e.maxHp) {
    const barW = e.radius * 2;
    const barH = 4;
    G.ctx.fillStyle = 'rgba(0,0,0,0.6)';
    G.ctx.fillRect(sx - barW/2, sy - e.radius - 8, barW, barH);
    G.ctx.fillStyle = e.boss ? '#fdd835' : '#ff5252';
    G.ctx.fillRect(sx - barW/2, sy - e.radius - 8, barW * (e.hp / e.maxHp), barH);
  }
  // 보스 라벨
  if (e.boss) {
    G.ctx.fillStyle = '#fdd835';
    G.ctx.font = 'bold 12px Nunito, sans-serif';
    G.ctx.textAlign = 'center';
    G.ctx.fillText('BOSS', sx, sy - e.radius - 14);
  }
}

function drawProjectile(pr) {
  const sx = pr.x - G.camX + G.W/2;
  const sy = pr.y - G.camY + G.H/2;
  G.ctx.fillStyle = pr.color || '#fff';
  G.ctx.shadowColor = pr.color || '#fff';
  G.ctx.shadowBlur = 12;
  G.ctx.beginPath();
  G.ctx.arc(sx, sy, pr.radius, 0, Math.PI * 2);
  G.ctx.fill();
  G.ctx.shadowBlur = 0;
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
  // 다이아 모양
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

// ───── HUD 업데이트 ─────
function updateHUD() {
  const p = G.player;
  if (!p) return;
  const mm = String(Math.floor(G.time / 60)).padStart(2, '0');
  const ss = String(Math.floor(G.time % 60)).padStart(2, '0');
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
      <span class="weapon-icon-emoji">${w.icon}</span>
      <span>${w.name}</span>
      <span class="weapon-icon-lv">Lv.${w.level}</span>
    </div>
  `).join('') + Object.entries({
    '⚔️': G.passives.atkMul > 1 ? `+${Math.round((G.passives.atkMul-1)*100)}%` : null,
    '🛡️': G.passives.defAdd > 0 ? `+${G.passives.defAdd}` : null,
    '❤️': G.passives.hpMul > 1 ? `+${Math.round((G.passives.hpMul-1)*100)}%` : null,
    '💨': G.passives.spdMul > 1 ? `+${Math.round((G.passives.spdMul-1)*100)}%` : null,
  }).filter(([_, v]) => v).map(([k, v]) => `
    <div class="weapon-icon"><span class="weapon-icon-emoji">${k}</span><span>${v}</span></div>
  `).join('');
}

// ───── 레벨업 ─────
const ALL_UPGRADES = [
  // === 새 무기 ===
  { id: 'magic_arrow', type: 'weapon', name: '마법 화살', icon: '🏹',
    desc: '추가 자동 화살 공격',
    apply: (g) => g.weapons.push({ type:'magic_arrow', name:'마법 화살', icon:'🏹', level:1,
      cooldown:1000, lastFire:0, damage:1.2, range:500, projSpeed:600 })
  },
  { id: 'aoe_pulse', type: 'weapon', name: '충격파', icon: '💥',
    desc: '주변 적에게 광역 데미지',
    apply: (g) => g.weapons.push({ type:'aoe_pulse', name:'충격파', icon:'💥', level:1,
      cooldown:2500, lastFire:0, damage:1.5, range:120 })
  },
  { id: 'lightning', type: 'weapon', name: '번개', icon: '⚡',
    desc: '랜덤한 적에게 번개',
    apply: (g) => g.weapons.push({ type:'lightning', name:'번개', icon:'⚡', level:1,
      cooldown:1500, lastFire:0, damage:1.8 })
  },
  // === 패시브 ===
  { id: 'atk', type: 'passive', name: '공격력 +20%', icon: '⚔️', desc: '데미지 강화',
    repeatable: true, apply: (g) => g.passives.atkMul *= 1.2 },
  { id: 'def', type: 'passive', name: '방어력 +10', icon: '🛡️', desc: '받는 데미지 감소',
    repeatable: true, apply: (g) => g.passives.defAdd += 10 },
  { id: 'hp', type: 'passive', name: '최대 HP +25%', icon: '❤️', desc: '체력 증가 + 회복',
    repeatable: true, apply: (g) => {
      g.passives.hpMul *= 1.25;
      g.player.maxHp = Math.round(g.player.baseHp * g.passives.hpMul);
      g.player.hp = Math.min(g.player.maxHp, g.player.hp + g.player.maxHp * 0.3);
    } },
  { id: 'spd', type: 'passive', name: '이동속도 +15%', icon: '💨', desc: '회피력 증가',
    repeatable: true, apply: (g) => g.passives.spdMul *= 1.15 },
  { id: 'cd', type: 'passive', name: '공격속도 +15%', icon: '🎯', desc: '쿨다운 감소',
    repeatable: true, apply: (g) => g.passives.cdMul *= 0.85 },
  { id: 'range', type: 'passive', name: '공격범위 +25%', icon: '📡', desc: '사거리 증가',
    repeatable: true, apply: (g) => g.passives.rangeMul *= 1.25 },
  { id: 'pickup', type: 'passive', name: '획득 범위 +50%', icon: '🧲', desc: '보석 흡수 거리',
    repeatable: true, apply: (g) => g.passives.pickupRadius *= 1.5 },
  { id: 'exp', type: 'passive', name: 'EXP +30%', icon: '🌟', desc: '경험치 보너스',
    repeatable: true, apply: (g) => g.passives.expMul *= 1.3 },
  { id: 'heal', type: 'passive', name: 'HP 회복', icon: '💖', desc: 'HP 전체 회복',
    repeatable: true, apply: (g) => { g.player.hp = g.player.maxHp; } },
];

function levelUp() {
  G.exp -= G.expToNext;
  G.level++;
  G.expToNext = Math.round(G.expToNext * 1.5);

  // 옵션 3개 선택
  const haveWeapons = new Set(G.weapons.map(w => w.type));
  const pool = ALL_UPGRADES.filter(u => {
    if (u.type === 'weapon' && haveWeapons.has(u.id)) {
      // 이미 가진 무기는 레벨업 옵션으로
      return false;
    }
    return true;
  });

  // 가진 무기 레벨업 추가
  G.weapons.forEach(w => {
    if (w.type === 'basic') return;
    pool.push({
      id: 'wlv_' + w.type, type: 'weapon_lv',
      name: w.name + ' 강화', icon: w.icon,
      desc: `Lv.${w.level} → Lv.${w.level + 1}`,
      apply: (g) => {
        w.level++;
        w.damage *= 1.3;
        w.cooldown *= 0.9;
        if (w.range) w.range *= 1.1;
      }
    });
  });

  // 랜덤 3개
  const shuffled = pool.sort(() => Math.random() - 0.5);
  const options = shuffled.slice(0, 3);

  showLevelUpModal(options);
}

function showLevelUpModal(options) {
  G.paused = true;
  const modal = document.getElementById('levelup-modal');
  const optsEl = document.getElementById('upgrade-options');
  document.getElementById('levelup-sub').textContent = `Lv.${G.level} 달성! 능력을 선택하세요`;
  optsEl.innerHTML = options.map((u, i) => {
    const isNew = u.type === 'weapon';
    const isWlv = u.type === 'weapon_lv';
    const cls = isNew ? 'new' : (isWlv ? 'weapon' : '');
    const badge = isNew
      ? '<div class="upgrade-new-badge">✨ NEW!</div>'
      : (isWlv ? '<div class="upgrade-lv-badge">⬆️ 강화</div>' : '');
    return `
      <div class="upgrade-option ${cls}" onclick="pickUpgrade(${i})">
        <div class="upgrade-icon">${u.icon}</div>
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
  u.apply(G);
  document.getElementById('levelup-modal').classList.remove('show');
  G.paused = false;
  updateWeaponIcons();
}

// ───── 일시정지 ─────
function togglePause() {
  if (!G.running) return;
  // 레벨업 중엔 무시
  if (document.getElementById('levelup-modal').classList.contains('show')) return;
  G.paused = !G.paused;
  document.getElementById('pause-btn').textContent = G.paused ? '▶️' : '⏸';
}

// ───── 게임오버 ─────
function gameOver() {
  G.running = false;
  document.getElementById('pause-btn').classList.remove('show');
  document.getElementById('joystick-zone').classList.remove('show');

  // 최고기록 갱신
  let high = {};
  try { high = JSON.parse(localStorage.getItem('survival-highscore') || '{}'); } catch(e) {}
  const isNew = !high.time || G.time > high.time;
  if (isNew) {
    high = { time: G.time, level: G.level, kills: G.kills, pet: G.player.name };
    try { localStorage.setItem('survival-highscore', JSON.stringify(high)); } catch(e) {}
  }

  // 모달 표시
  const mm = String(Math.floor(G.time / 60)).padStart(2, '0');
  const ss = String(Math.floor(G.time % 60)).padStart(2, '0');
  document.getElementById('gameover-stats').innerHTML = `
    <div class="gameover-stat-row">
      <span class="gameover-stat-label">🕐 생존 시간</span>
      <span class="gameover-stat-val ${isNew ? 'new-record' : ''}">${mm}:${ss}${isNew ? ' 🎉NEW!' : ''}</span>
    </div>
    <div class="gameover-stat-row">
      <span class="gameover-stat-label">⚡ 최종 레벨</span>
      <span class="gameover-stat-val gold">Lv.${G.level}</span>
    </div>
    <div class="gameover-stat-row">
      <span class="gameover-stat-label">💀 처치 수</span>
      <span class="gameover-stat-val">${G.kills}</span>
    </div>
    <div class="gameover-stat-row">
      <span class="gameover-stat-label">🐾 사용 펫</span>
      <span class="gameover-stat-val">${G.player.name}</span>
    </div>
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
  // 게임 정리
  G.running = false;
  G.ctx.clearRect(0, 0, G.W, G.H);
}

// ───── 초기화 ─────
(async () => {
  await loadGameData();
  setupCanvas();
  setupInput();
  renderPetGrid();
  updateHighScoreDisplay();
  document.getElementById('pet-search').addEventListener('input', e => {
    renderPetGrid(e.target.value);
  });
  // 마지막 선택 펫 자동
  try {
    const last = localStorage.getItem('survival-last-pet');
    if (last) selectPet(last);
  } catch(e) {}
})();

// fadeOut 애니메이션 추가
const style = document.createElement('style');
style.textContent = '@keyframes fadeOut { to { opacity: 0; } }';
document.head.appendChild(style);
