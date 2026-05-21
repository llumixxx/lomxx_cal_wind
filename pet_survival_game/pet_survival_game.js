/* ═══════════════════════════════════════════════════════════
   🦇 펫 서바이벌 v2 - 진짜 게임 같이!
   ═══════════════════════════════════════════════════════════ */

// ───── 데이터 로딩 ─────
let PET_DATA = [];
let PET_IMAGES = {};
let RANKING_DATA = {};  // petName → top rankers
let selectedPetName = null;

const ATTR_STRONG = { '지': '풍', '풍': '수', '수': '화', '화': '지' };

async function loadGameData() {
  try {
    const r = await fetch('../pet_info_data.json?t=' + Date.now());
    const pets = await r.json();
    PET_DATA = pets;
    pets.forEach(p => { if (p.image) PET_IMAGES[p.name] = p.image; });
    console.log(`✅ ${pets.length} 마리 펫 로드`);
    // 랭킹 데이터 (보스 닉네임용)
    try {
      const r2 = await fetch('../wind_data.json?t=' + Date.now());
      if (r2.ok) {
        const data = await r2.json();
        if (data.pets) {
          data.pets.forEach(p => {
            if (p.name && p.general_ranking && p.general_ranking.length > 0) {
              RANKING_DATA[p.name] = p.general_ranking.slice(0, 5);
            }
          });
          console.log(`✅ 랭킹 데이터 ${Object.keys(RANKING_DATA).length}종`);
        }
      }
    } catch(e) { /* 랭킹 없어도 OK */ }
  } catch(e) {
    console.error('펫 데이터 로드 실패:', e);
  }
}

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
    desc: '앞 방향 부채꼴 휘두르기',
    cooldown: 1300, damage: 1.8, range: 180,
    style: 'sweep',
  },
  ice: {
    name: '얼음 손톱', icon: 'https://wind01.net/info/item/36289.png',
    desc: '눈꽃 발사 (얼리고 슬로우)',
    cooldown: 1500, damage: 1.2, range: 400,
    style: 'freeze',
  },
  stone: {
    name: '합성 돌9', icon: 'https://wind01.net/info/item/36186.png',
    desc: '하늘에서 떨어지는 돌',
    cooldown: 1800, damage: 2.0, range: 350,
    style: 'falling_stone',
  },
};

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
  petLayer: null,
  W: 0, H: 0,
  running: false, paused: false,
  time: 0, startTime: 0, lastFrame: 0,
  player: null,
  enemies: [], projectiles: [], gems: [], effects: [],
  weapons: [], orbitals: [],
  items: [],         // 🍖 🧲 💣
  obstacles: [],     // 나무, 큰 바위
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

// ───── 배경 (SVG 타일 + DOM 부드러운 이동) ─────
// 풀숲 SVG 타일 (256x256, seamless)
const GRASS_TILE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
  <defs>
    <radialGradient id="g1" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#5a8a3a"/>
      <stop offset="100%" stop-color="#3e6028"/>
    </radialGradient>
    <radialGradient id="bushG" cx="40%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#5a8a3a"/>
      <stop offset="60%" stop-color="#3a6020"/>
      <stop offset="100%" stop-color="#1e3812"/>
    </radialGradient>
  </defs>
  <!-- 베이스 잔디 -->
  <rect width="256" height="256" fill="url(#g1)"/>
  <!-- 큰 어두운 패치 (음영) -->
  <ellipse cx="60" cy="50" rx="50" ry="30" fill="#2a4818" opacity="0.4"/>
  <ellipse cx="200" cy="180" rx="60" ry="35" fill="#2a4818" opacity="0.4"/>
  <ellipse cx="130" cy="220" rx="45" ry="22" fill="#2a4818" opacity="0.35"/>
  <ellipse cx="220" cy="40" rx="35" ry="22" fill="#2a4818" opacity="0.3"/>
  <ellipse cx="20" cy="190" rx="40" ry="25" fill="#2a4818" opacity="0.35"/>
  <!-- 밝은 패치 -->
  <ellipse cx="180" cy="60" rx="35" ry="22" fill="#6a9a48" opacity="0.5"/>
  <ellipse cx="40" cy="150" rx="28" ry="20" fill="#6a9a48" opacity="0.45"/>
  <ellipse cx="155" cy="155" rx="32" ry="20" fill="#6a9a48" opacity="0.4"/>
  
  <!-- 큰 풀잎 무리 (실제 풀처럼 다발) -->
  <g stroke-linecap="round" fill="none">
    <!-- 풀 다발 1 -->
    <g transform="translate(45,75)" opacity="0.85">
      <path d="M0,0 q-1,-10 -3,-16" stroke="#3a6020" stroke-width="2"/>
      <path d="M2,0 q1,-8 0,-14" stroke="#4a7030" stroke-width="1.8"/>
      <path d="M-2,0 q-2,-7 -4,-13" stroke="#5a8038" stroke-width="1.5"/>
      <path d="M4,0 q3,-9 2,-15" stroke="#4a7030" stroke-width="1.8"/>
    </g>
    <!-- 풀 다발 2 -->
    <g transform="translate(180,110)" opacity="0.85">
      <path d="M0,0 q-1,-9 -2,-15" stroke="#3a6020" stroke-width="2"/>
      <path d="M3,0 q1,-7 0,-13" stroke="#5a8038" stroke-width="1.6"/>
      <path d="M-3,0 q-2,-6 -4,-12" stroke="#4a7030" stroke-width="1.7"/>
    </g>
    <!-- 풀 다발 3 -->
    <g transform="translate(95,170)" opacity="0.8">
      <path d="M0,0 q1,-10 2,-16" stroke="#3a6020" stroke-width="2"/>
      <path d="M-2,0 q-2,-8 -3,-14" stroke="#5a8038" stroke-width="1.5"/>
      <path d="M3,0 q2,-7 1,-13" stroke="#4a7030" stroke-width="1.7"/>
    </g>
    <!-- 풀 다발 4 -->
    <g transform="translate(215,225)" opacity="0.85">
      <path d="M0,0 q-1,-8 -2,-14" stroke="#3a6020" stroke-width="2"/>
      <path d="M2,0 q1,-9 0,-15" stroke="#4a7030" stroke-width="1.8"/>
    </g>
    <!-- 풀 다발 5 -->
    <g transform="translate(20,230)" opacity="0.8">
      <path d="M0,0 q-1,-7 -2,-13" stroke="#3a6020" stroke-width="1.8"/>
      <path d="M2,0 q2,-8 1,-14" stroke="#4a7030" stroke-width="1.5"/>
    </g>
    <!-- 흩어진 단일 풀잎 -->
    <path d="M130,40 q1,-6 0,-12" stroke="#4a7030" stroke-width="1.3" opacity="0.7"/>
    <path d="M65,200 q-1,-6 0,-12" stroke="#4a7030" stroke-width="1.3" opacity="0.7"/>
    <path d="M240,150 q1,-5 0,-11" stroke="#4a7030" stroke-width="1.3" opacity="0.7"/>
    <path d="M150,250 q-1,-6 0,-12" stroke="#4a7030" stroke-width="1.3" opacity="0.7"/>
  </g>
  
  <!-- 작은 디테일 잔디 (점들) -->
  <g fill="#4a7030" opacity="0.6">
    <circle cx="30" cy="60" r="1.5"/>
    <circle cx="70" cy="100" r="1"/>
    <circle cx="110" cy="50" r="1.2"/>
    <circle cx="150" cy="85" r="1"/>
    <circle cx="195" cy="130" r="1.5"/>
    <circle cx="235" cy="95" r="1"/>
    <circle cx="50" cy="160" r="1.2"/>
    <circle cx="100" cy="195" r="1"/>
    <circle cx="160" cy="230" r="1.3"/>
    <circle cx="225" cy="200" r="1"/>
    <circle cx="80" cy="240" r="1.2"/>
    <circle cx="200" cy="80" r="1"/>
  </g>
  
  <!-- 흙 패치 (밟힌 곳) -->
  <ellipse cx="125" cy="125" rx="28" ry="18" fill="#7a6048" opacity="0.4"/>
  <ellipse cx="125" cy="125" rx="20" ry="13" fill="#5a4028" opacity="0.3"/>
  
  <!-- 돌멩이들 -->
  <g>
    <ellipse cx="85" cy="55" rx="5" ry="3.5" fill="#7a7060"/>
    <ellipse cx="84" cy="54" rx="3" ry="2" fill="#9a9080" opacity="0.7"/>
  </g>
  <g>
    <ellipse cx="170" cy="130" rx="6" ry="4" fill="#7a7060"/>
    <ellipse cx="168" cy="128" rx="3.5" ry="2.3" fill="#9a9080" opacity="0.7"/>
  </g>
  <g>
    <ellipse cx="225" cy="205" rx="5" ry="3" fill="#7a7060"/>
    <ellipse cx="224" cy="204" rx="3" ry="1.8" fill="#9a9080" opacity="0.7"/>
  </g>
  <g>
    <ellipse cx="40" cy="225" rx="4" ry="2.5" fill="#7a7060"/>
  </g>
  
  <!-- 작은 꽃 -->
  <g>
    <circle cx="125" cy="48" r="3" fill="#ff9a4a"/>
    <circle cx="125" cy="48" r="1.2" fill="#fdd835"/>
  </g>
  <g>
    <circle cx="195" cy="160" r="2.5" fill="#f587b8"/>
    <circle cx="195" cy="160" r="1" fill="#fff"/>
  </g>
  <g>
    <circle cx="60" cy="195" r="2.5" fill="#9b87f5"/>
    <circle cx="60" cy="195" r="1" fill="#fdd835"/>
  </g>
  <g>
    <circle cx="225" cy="85" r="3" fill="#fdd835"/>
    <circle cx="225" cy="85" r="1.2" fill="#ff9a4a"/>
  </g>
  <g>
    <circle cx="35" cy="130" r="2.5" fill="#f587b8"/>
  </g>
  
  <!-- 큰 덤불 (입체적) -->
  <g opacity="0.85">
    <ellipse cx="105" cy="105" rx="20" ry="14" fill="url(#bushG)"/>
    <ellipse cx="100" cy="100" rx="12" ry="8" fill="#3a6a25" opacity="0.7"/>
    <ellipse cx="108" cy="103" rx="7" ry="5" fill="#5a8a35"/>
    <!-- 잔디 디테일 -->
    <path d="M95,92 q-1,-4 -2,-7" stroke="#3a5818" stroke-width="1.2" fill="none"/>
    <path d="M105,90 q0,-5 -1,-8" stroke="#3a5818" stroke-width="1.2" fill="none"/>
    <path d="M115,93 q1,-4 0,-7" stroke="#3a5818" stroke-width="1.2" fill="none"/>
  </g>
  <g opacity="0.85">
    <ellipse cx="205" cy="45" rx="16" ry="11" fill="url(#bushG)"/>
    <ellipse cx="202" cy="42" rx="9" ry="6" fill="#3a6a25" opacity="0.7"/>
    <ellipse cx="208" cy="44" rx="5" ry="3.5" fill="#5a8a35"/>
  </g>
  <g opacity="0.8">
    <ellipse cx="155" cy="245" rx="18" ry="12" fill="url(#bushG)"/>
    <ellipse cx="152" cy="242" rx="10" ry="7" fill="#3a6a25" opacity="0.7"/>
    <ellipse cx="158" cy="244" rx="6" ry="4" fill="#5a8a35"/>
  </g>
</svg>`;

const GRASS_TILE_URL = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(GRASS_TILE_SVG)));

let _bgEl = null;
function setupBackground() {
  if (_bgEl) return;
  _bgEl = document.createElement('div');
  _bgEl.id = 'game-bg';
  _bgEl.style.cssText = `
    position: fixed;
    inset: 0;
    background-image: url("${GRASS_TILE_URL}");
    background-repeat: repeat;
    background-size: 256px 256px;
    pointer-events: none;
    z-index: 1;
    will-change: background-position;
  `;
  document.body.insertBefore(_bgEl, document.body.firstChild);
}

function updateBackgroundPosition() {
  if (!_bgEl) return;
  // 카메라 반대 방향으로 배경 이동 (자연스러운 스크롤)
  _bgEl.style.backgroundPosition = `${-G.camX}px ${-G.camY}px`;
}

// ───── 펫 DOM 요소 관리 ─────
function createPetDOM(name, imgUrl, isPlayer, isBoss, bossLabel) {
  const el = document.createElement('div');
  const sz = isBoss ? 90 : (isPlayer ? 60 : 44);
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
      height: ${isBoss ? '6px' : '4px'};
      background: rgba(0,0,0,0.7);
      border-radius: 3px;
      overflow: hidden;
      ${isBoss ? '' : 'display: none;'}
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
    label.textContent = bossLabel || 'BOSS';
    label.style.cssText = `
      position: absolute; top: -28px; left: 50%; transform: translateX(-50%);
      color: #fdd835; font-weight: 900; font-size: 12px;
      font-family: 'Noto Sans KR', sans-serif;
      text-shadow: 0 2px 4px rgba(0,0,0,0.9), 0 0 6px rgba(0,0,0,0.8);
      letter-spacing: 0.5px;
      white-space: nowrap;
      padding: 2px 8px;
      background: rgba(0,0,0,0.5);
      border: 1px solid rgba(253,216,53,0.5);
      border-radius: 99px;
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

function safeDrawImage(ctx, img, x, y, w, h) {
  if (!img || !img.complete || img.naturalWidth === 0) return false;
  try {
    ctx.drawImage(img, x, y, w, h);
    return true;
  } catch(e) {
    return false;
  }
}

// ───── 무기 이미지 캐시 + 배경 제거 ─────
const weaponImgCache = {};       // 원본
const weaponCleanedCache = {};   // 검은 배경 제거된 캔버스
function getWeaponImg(key) {
  if (!weaponImgCache[key]) {
    const def = WEAPON_DEFS[key];
    if (def) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = def.icon;
      weaponImgCache[key] = img;
      // 로드 완료 시 cleaned 버전 만들기
      img.addEventListener('load', () => makeCleanedImage(key, img));
      // 실패 시 crossOrigin 없이 재시도
      img.addEventListener('error', () => {
        const fallback = new Image();
        fallback.src = def.icon;
        weaponImgCache[key] = fallback;
      });
    }
  }
  return weaponImgCache[key];
}

function makeCleanedImage(key, img) {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    // 검은 픽셀 (배경) 투명 처리
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i+1], b = data[i+2];
      // 거의 검은색 (모든 채널 40 미만)이면 투명
      if (r < 40 && g < 40 && b < 40) {
        data[i+3] = 0;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    weaponCleanedCache[key] = canvas;
  } catch(e) {
    console.warn('cleaned image fail (CORS?)', key, e);
    // CORS 에러 시 원본 사용
  }
}

function getCleanWeaponImg(key) {
  return weaponCleanedCache[key] || weaponImgCache[key];
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
  G.items = [];
  G.obstacles = [];
  // 시작 오브젝트 (나무/바위 30개 무작위 배치)
  for (let i = 0; i < 30; i++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 200 + Math.random() * 800;
    G.obstacles.push({
      x: Math.cos(ang) * dist,
      y: Math.sin(ang) * dist,
      type: Math.random() < 0.6 ? 'tree' : 'rock',
      size: 30 + Math.random() * 20,
      seed: Math.random(),
    });
  }

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
  // orbit 무기 (도끼) - 회전 객체
  if (def.style === 'orbit') {
    for (let i = 0; i < (def.orbitCount || 1); i++) {
      G.orbitals.push({ weapon: w, kind: 'orbit', angle: (i / (def.orbitCount||1)) * Math.PI * 2 });
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
  try {
    update(dt, now);
    render();
  } catch(err) {
    console.error('[Game] loop error:', err);
  }
  requestAnimationFrame(gameLoop);
}

function update(dt, now) {
  G.difficultyMul = 1 + G.time / 60;
  updatePlayer(dt);
  updateEnemies(dt, now);
  updateProjectiles(dt);
  updateGems(dt);
  updateItems(dt);
  updateObstacles(dt);
  updateEffects(dt);
  updateOrbitals(dt);
  updateWeapons(dt, now);
  updateSpawning(dt);
  updateHUD();
}

// 아이템 업데이트 (자석으로 끌어오기 / 픽업)
function updateItems(dt) {
  const p = G.player;
  for (let i = G.items.length - 1; i >= 0; i--) {
    const it = G.items[i];
    it.bounce = (it.bounce || 0) + dt * 5;
    const dx = p.x - it.x, dy = p.y - it.y;
    const dist = Math.hypot(dx, dy);
    if (dist < p.radius + it.pickupRadius) {
      // 효과 발동
      applyItem(it.type);
      // 픽업 이펙트
      G.effects.push({
        x: it.x, y: it.y, life: 0.4, maxLife: 0.4, radius: 0,
        update(dt) { this.radius = (1-this.life/this.maxLife) * 50; },
        draw(ctx) {
          const sx = this.x - G.camX + G.W/2;
          const sy = this.y - G.camY + G.H/2;
          const a = this.life / this.maxLife;
          ctx.strokeStyle = `rgba(255,255,200, ${a})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(sx, sy, this.radius, 0, Math.PI*2);
          ctx.stroke();
        }
      });
      G.items.splice(i, 1);
    } else if (dist < 200) {
      // 가까이 가면 살짝 끌어옴
      it.x += (dx/dist) * 200 * dt;
      it.y += (dy/dist) * 200 * dt;
    }
  }
}

// 오브젝트 (나무/바위) 업데이트 - 멀리 가면 제거, 새 거 생성
function updateObstacles(dt) {
  const p = G.player;
  const farLimit = 1500;
  // 너무 먼 거 제거
  for (let i = G.obstacles.length - 1; i >= 0; i--) {
    const o = G.obstacles[i];
    if (Math.hypot(o.x - p.x, o.y - p.y) > farLimit) {
      G.obstacles.splice(i, 1);
    }
  }
  // 부족하면 새로 생성 (시야 밖에)
  while (G.obstacles.length < 30) {
    const ang = Math.random() * Math.PI * 2;
    const dist = 500 + Math.random() * 600;
    G.obstacles.push({
      x: p.x + Math.cos(ang) * dist,
      y: p.y + Math.sin(ang) * dist,
      type: Math.random() < 0.6 ? 'tree' : 'rock',
      size: 30 + Math.random() * 20,
      seed: Math.random(),
    });
  }
}

// 아이템 효과 적용
function applyItem(type) {
  const p = G.player;
  if (type === 'meat') {
    // 고기 - HP 50% 회복
    const heal = Math.round(p.maxHp * 0.5);
    p.hp = Math.min(p.maxHp, p.hp + heal);
    addFloatingText(p.x, p.y - 40, '+' + heal + ' HP', '#4caf50', true);
  } else if (type === 'bomb') {
    // 폭탄 - 화면 안 모든 적 즉사 (보스는 50% 데미지)
    const screenRange = Math.max(G.W, G.H) * 0.7;
    for (const e of G.enemies) {
      if (Math.hypot(e.x - p.x, e.y - p.y) < screenRange) {
        if (e.boss) e.hp -= e.maxHp * 0.5;
        else e.hp = 0;
      }
    }
    addFloatingText(p.x, p.y - 40, '💣 BOOM!', '#ff5252', true);
    // 화면 흔들기 효과
    G.effects.push({
      x: p.x, y: p.y, life: 0.5, maxLife: 0.5, radius: 0, maxRadius: screenRange,
      update(dt) { this.radius = (1-this.life/this.maxLife) * this.maxRadius; },
      draw(ctx) {
        const sx = this.x - G.camX + G.W/2;
        const sy = this.y - G.camY + G.H/2;
        const a = this.life / this.maxLife;
        ctx.strokeStyle = `rgba(255,80,80, ${a})`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius, 0, Math.PI*2);
        ctx.stroke();
        ctx.fillStyle = `rgba(255,200,100, ${a*0.2})`;
        ctx.beginPath();
        ctx.arc(sx, sy, this.radius, 0, Math.PI*2);
        ctx.fill();
      }
    });
  } else if (type === 'magnet') {
    // 자석 - 모든 보석 즉시 흡수
    let total = 0;
    for (const g of G.gems) total += g.value;
    G.exp += total * G.passives.expMul;
    G.gems = [];
    addFloatingText(p.x, p.y - 40, '🧲 +' + total + ' EXP', '#9b87f5', true);
    while (G.exp >= G.expToNext) levelUp();
  }
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
  if (dx > 0.1) p.facing = 1;
  else if (dx < -0.1) p.facing = -1;
  G.camX = p.x; G.camY = p.y;
  // DOM 업데이트 (transform 한 번에)
  const sx = p.x - G.camX + G.W/2;
  const sy = p.y - G.camY + G.H/2;
  p.dom.style.transform = `translate(${sx}px, ${sy}px) scaleX(${p.facing})`;
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
      tryDropItem(e.x, e.y, e.boss);
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
    // 회전 (눈꽃 등)
    if (pr.rotSpeed) pr.rotation = (pr.rotation || 0) + pr.rotSpeed * dt;
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
    if (w.style === 'orbit') continue; // orbit은 orbital이 자동 처리
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
    case 'thrust': {  // 헤티아의 창 - 확! 찌르기
      const target = findNearestEnemy();
      if (!target) return;
      const dx = target.x - p.x, dy = target.y - p.y;
      const dist = Math.hypot(dx, dy) || 1;
      const angle = Math.atan2(dy, dx);
      const len = w.thrustLen * G.passives.rangeMul;
      const wid = w.thrustWidth;
      // 적 명중 (관통)
      for (const e of G.enemies) {
        const ex = e.x - p.x, ey = e.y - p.y;
        const proj = ex * Math.cos(angle) + ey * Math.sin(angle);
        const perp = Math.abs(-ex * Math.sin(angle) + ey * Math.cos(angle));
        if (proj > 0 && proj < len && perp < wid + e.radius) {
          applyHit(e, p.atk * w.damage * G.passives.atkMul * 0.25, p);
        }
      }
      // 빠르고 강렬한 찌르기 이펙트
      G.effects.push({
        x: p.x, y: p.y, angle, len, wid,
        life: 0.2, maxLife: 0.2,
        draw(ctx) {
          const sx = this.x - G.camX + G.W/2;
          const sy = this.y - G.camY + G.H/2;
          const t = 1 - this.life / this.maxLife;
          const alpha = this.life / this.maxLife;
          // 빠르게 뻗어나가는 줄기 (0~0.3는 빨리 확장, 그 후 페이드)
          const extendT = Math.min(1, t / 0.3);
          const visibleLen = this.len * extendT;
          ctx.save();
          ctx.translate(sx, sy);
          ctx.rotate(this.angle);
          // 외곽 빛 (그라데이션)
          const grad = ctx.createLinearGradient(0, 0, visibleLen, 0);
          grad.addColorStop(0, `rgba(255,255,255, ${alpha * 0.9})`);
          grad.addColorStop(0.7, `rgba(253,216,53, ${alpha * 0.7})`);
          grad.addColorStop(1, `rgba(245,165,35, 0)`);
          ctx.fillStyle = grad;
          // 길쭉한 다이아몬드 모양
          ctx.beginPath();
          ctx.moveTo(0, -this.wid/2);
          ctx.lineTo(visibleLen * 0.95, -this.wid/4);
          ctx.lineTo(visibleLen, 0);
          ctx.lineTo(visibleLen * 0.95, this.wid/4);
          ctx.lineTo(0, this.wid/2);
          ctx.closePath();
          ctx.fill();
          // 안쪽 강한 코어 (밝은 선)
          ctx.shadowColor = '#fdd835';
          ctx.shadowBlur = 20;
          ctx.strokeStyle = `rgba(255,255,255, ${alpha})`;
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(visibleLen, 0);
          ctx.stroke();
          // 끝부분 폭발 (창끝 임팩트)
          if (extendT > 0.5) {
            ctx.shadowBlur = 30;
            ctx.fillStyle = `rgba(255,255,255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(visibleLen, 0, 12 + (1-alpha)*8, 0, Math.PI*2);
            ctx.fill();
            // 빛 줄기들 (방사형)
            ctx.strokeStyle = `rgba(253,216,53, ${alpha * 0.8})`;
            ctx.lineWidth = 2;
            for (let k = 0; k < 6; k++) {
              const a = (k / 6) * Math.PI * 2;
              ctx.beginPath();
              ctx.moveTo(visibleLen, 0);
              ctx.lineTo(visibleLen + Math.cos(a) * 18, Math.sin(a) * 18);
              ctx.stroke();
            }
          }
          ctx.shadowBlur = 0;
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
          // 이펙트 - 할퀴는 자국 (이미지 없음)
          G.effects.push({
            x: p.x, y: p.y, angle,
            life: 0.35, maxLife: 0.35,
            draw(ctx) {
              const sx = this.x - G.camX + G.W/2;
              const sy = this.y - G.camY + G.H/2;
              ctx.save();
              ctx.translate(sx, sy);
              ctx.rotate(this.angle);
              const t = 1 - this.life / this.maxLife;
              const alpha = this.life / this.maxLife;
              // 할퀸 자국 3줄 (긴 곡선 + 두꺼움 + 빛남)
              const length = 130 + t * 60;
              for (let j = -1; j <= 1; j++) {
                // 빛나는 배경 (블러)
                ctx.shadowColor = '#ff3838';
                ctx.shadowBlur = 12;
                ctx.strokeStyle = `rgba(255,50,50, ${alpha * 0.8})`;
                ctx.lineWidth = 6;
                ctx.lineCap = 'round';
                ctx.beginPath();
                const startX = 25;
                const endX = length;
                const offsetY = j * 18;
                ctx.moveTo(startX, offsetY * 0.5);
                ctx.quadraticCurveTo((startX + endX)/2, offsetY * 1.2, endX, offsetY);
                ctx.stroke();
                // 안쪽 밝은 줄
                ctx.shadowBlur = 0;
                ctx.strokeStyle = `rgba(255,255,255, ${alpha * 0.9})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(startX, offsetY * 0.5);
                ctx.quadraticCurveTo((startX + endX)/2, offsetY * 1.2, endX, offsetY);
                ctx.stroke();
              }
              ctx.restore();
            }
          });
        }, i * 120);
      }
      break;
    }
    case 'sweep': {  // 의식의 곤봉 - 한 방향 휘두르기
      const target = findNearestEnemy();
      if (!target) return;
      const dx = target.x - p.x, dy = target.y - p.y;
      const baseAngle = Math.atan2(dy, dx);
      const range = w.range * G.passives.rangeMul;
      const swingArc = Math.PI * 0.7; // 부채꼴 각도 (약 126도)
      // 휘두르기 명중 - 적이 부채꼴 안에 있는지
      for (const e of G.enemies) {
        const ed = Math.hypot(e.x - p.x, e.y - p.y);
        if (ed > range + e.radius) continue;
        const ea = Math.atan2(e.y - p.y, e.x - p.x);
        let diff = Math.abs(((ea - baseAngle + Math.PI*3) % (Math.PI*2)) - Math.PI);
        if (diff < swingArc / 2) {
          applyHit(e, p.atk * w.damage * G.passives.atkMul * 0.25, p);
          // 넉백
          const knockDist = 30;
          e.x += Math.cos(ea) * knockDist;
          e.y += Math.sin(ea) * knockDist;
        }
      }
      // 휘두르기 이펙트 (곤봉이 호를 그리며 휘둘러짐)
      G.effects.push({
        x: p.x, y: p.y, baseAngle, range, arc: swingArc,
        life: 0.35, maxLife: 0.35,
        draw(ctx) {
          const sx = this.x - G.camX + G.W/2;
          const sy = this.y - G.camY + G.H/2;
          const t = 1 - this.life / this.maxLife; // 0 -> 1
          const alpha = this.life / this.maxLife;
          // 휘두르는 현재 각도 (start -> end)
          const startA = this.baseAngle - this.arc/2;
          const endA = this.baseAngle + this.arc/2;
          const curA = startA + (endA - startA) * t;
          // 부채꼴 잔상 (회를 그림)
          ctx.save();
          ctx.translate(sx, sy);
          // 잔상 호
          ctx.strokeStyle = `rgba(255,200,100, ${alpha * 0.6})`;
          ctx.lineWidth = 8;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.arc(0, 0, this.range * 0.85, startA, curA);
          ctx.stroke();
          // 빛나는 호
          ctx.shadowColor = '#ffcc55';
          ctx.shadowBlur = 16;
          ctx.strokeStyle = `rgba(255,255,200, ${alpha * 0.9})`;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(0, 0, this.range * 0.85, startA, curA);
          ctx.stroke();
          ctx.shadowBlur = 0;
          // 곤봉 이미지 (현재 휘두르는 위치에)
          const cx = Math.cos(curA) * this.range * 0.7;
          const cy = Math.sin(curA) * this.range * 0.7;
          const img = getCleanWeaponImg('hammer');
          if (img && (img.complete !== false)) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(curA + Math.PI/4);
            const sz = 60;
            try { ctx.drawImage(img, -sz/2, -sz/2, sz, sz); } catch(e) {}
            ctx.restore();
          }
          ctx.restore();
        }
      });
      break;
    }
    case 'falling_stone': {  // 합성 돌9 - 하늘에서 떨어지기
      // 가장 가까운 적 위에 돌 N개 떨어뜨림
      const lv = w.level || 1;
      const cnt = Math.min(3 + lv, 8);
      const range = w.range * G.passives.rangeMul;
      for (let i = 0; i < cnt; i++) {
        setTimeout(() => {
          // 화면 안 랜덤한 적 또는 랜덤 위치
          const eligibleEnemies = G.enemies.filter(e =>
            Math.hypot(e.x - p.x, e.y - p.y) < range
          );
          let tx, ty;
          if (eligibleEnemies.length > 0) {
            const target = eligibleEnemies[Math.floor(Math.random() * eligibleEnemies.length)];
            tx = target.x + (Math.random() - 0.5) * 40;
            ty = target.y + (Math.random() - 0.5) * 40;
          } else {
            // 적 없으면 플레이어 주변
            const ang = Math.random() * Math.PI * 2;
            const rd = Math.random() * range;
            tx = p.x + Math.cos(ang) * rd;
            ty = p.y + Math.sin(ang) * rd;
          }
          // 돌 떨어지는 이펙트
          G.effects.push({
            x: tx, y: ty,
            life: 0.7, maxLife: 0.7,
            draw(ctx) {
              const sx = this.x - G.camX + G.W/2;
              const sy = this.y - G.camY + G.H/2;
              const t = 1 - this.life / this.maxLife; // 0 -> 1
              const img = getCleanWeaponImg('stone');
              if (img && (img.complete !== false)) {
                const sz = 50;
                const fallY = sy - (1-t)*250;
                ctx.save();
                ctx.translate(sx, fallY);
                ctx.rotate(t * Math.PI * 3);
                try { ctx.drawImage(img, -sz/2, -sz/2, sz, sz); } catch(e) {}
                ctx.restore();
                // 그림자 (점점 진해짐)
                ctx.fillStyle = `rgba(0,0,0, ${0.3 + t*0.4})`;
                ctx.beginPath();
                ctx.ellipse(sx, sy + 5, 20 + t*10, 6 + t*4, 0, 0, Math.PI*2);
                ctx.fill();
              }
            }
          });
          // 충격 시점 (떨어질 때)
          setTimeout(() => {
            G.effects.push({
              x: tx, y: ty, radius: 0, maxRadius: 70,
              life: 0.35, maxLife: 0.35,
              update(dt) { this.radius = (1-this.life/this.maxLife) * this.maxRadius; },
              draw(ctx) {
                const sx = this.x - G.camX + G.W/2;
                const sy = this.y - G.camY + G.H/2;
                const a = this.life / this.maxLife;
                ctx.strokeStyle = `rgba(150,140,120, ${a})`;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.arc(sx, sy, this.radius, 0, Math.PI*2);
                ctx.stroke();
                // 흙 먼지 파편
                for (let k = 0; k < 6; k++) {
                  const ang = (k/6) * Math.PI*2;
                  const r = this.radius;
                  const px = sx + Math.cos(ang) * r;
                  const py = sy + Math.sin(ang) * r;
                  ctx.fillStyle = `rgba(100,80,60, ${a*0.7})`;
                  ctx.beginPath();
                  ctx.arc(px, py, 4, 0, Math.PI*2);
                  ctx.fill();
                }
              }
            });
            // 데미지
            for (const e of G.enemies) {
              const d = Math.hypot(e.x - tx, e.y - ty);
              if (d < 70) {
                applyHit(e, p.atk * w.damage * G.passives.atkMul * 0.3, p);
              }
            }
          }, 700);
        }, i * 150);
      }
      break;
    }
    case 'freeze': {  // 얼음 손톱 - 눈꽃결정 발사
      const target = findNearestEnemy();
      if (!target) return;
      const range = w.range * G.passives.rangeMul;
      if (Math.hypot(target.x - p.x, target.y - p.y) > range) return;
      // 3방향으로 눈꽃 발사 (메인 + 좌우)
      const baseDx = target.x - p.x, baseDy = target.y - p.y;
      const baseAngle = Math.atan2(baseDy, baseDx);
      const spread = 0.3;
      const angles = [baseAngle - spread, baseAngle, baseAngle + spread];
      for (const ang of angles) {
        const sp = 400;
        G.projectiles.push({
          x: p.x, y: p.y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          radius: 14,
          damage: p.atk * w.damage * G.passives.atkMul * 0.18,
          life: 1.2,
          type: 'snowflake',
          special: 'freeze',
          rotation: 0,
          rotSpeed: (Math.random() - 0.5) * 8,
          pierce: 1,
        });
      }
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
    // 시간에 따라 더 많이 스폰 (한 번에 1~3마리)
    const burst = Math.min(3, 1 + Math.floor(G.time / 60));
    for (let i = 0; i < burst; i++) spawnEnemy();
    G.spawnTimer = Math.max(0.1, 0.8 / G.difficultyMul);
  }
  G.bossTimer -= dt;
  if (G.bossTimer <= 0) {
    spawnBoss();
    G.bossTimer = 30;
  }
}

function spawnEnemy() {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.max(G.W, G.H) * 0.65;
  const x = G.player.x + Math.cos(angle) * dist;
  const y = G.player.y + Math.sin(angle) * dist;
  const enemyPets = PET_DATA.filter(p => p.attr && Object.values(p.attr).some(v => v > 0));
  const ep = enemyPets[Math.floor(Math.random() * enemyPets.length)];
  const lvMul = G.difficultyMul;
  // 더 강한 적
  const e = {
    x, y, name: ep.name, attr: ep.attr, radius: 22,
    hp: Math.round(40 * lvMul), maxHp: Math.round(40 * lvMul),
    atk: Math.round(35 * lvMul),  // 데미지 강화 (15 → 35)
    speed: 90 + Math.random() * 50,  // 속도 증가
    boss: false, frozenUntil: 0,
    dom: createPetDOM(ep.name, ep.image, false, false),
  };
  G.enemies.push(e);
}

// 랭커 닉네임 가져오기
function getRandomRanker(petName) {
  const list = RANKING_DATA[petName];
  if (!list || list.length === 0) return null;
  // TOP3 중 랜덤
  const top = list.slice(0, 3);
  return top[Math.floor(Math.random() * top.length)];
}

function spawnBoss() {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.max(G.W, G.H) * 0.7;
  const x = G.player.x + Math.cos(angle) * dist;
  const y = G.player.y + Math.sin(angle) * dist;
  // 랭킹 있는 펫 우선 (보스 닉네임 표시 가능)
  const rankedPets = PET_DATA.filter(p => p.attr && RANKING_DATA[p.name]);
  const strongPets = rankedPets.length > 0 ? rankedPets : PET_DATA.filter(p => p.attr).filter(p => {
    const s = (p.attr['지']||0)+(p.attr['수']||0)+(p.attr['화']||0)+(p.attr['풍']||0);
    return s >= 8;
  });
  const ep = strongPets[Math.floor(Math.random() * strongPets.length)] || PET_DATA[0];
  // 랭커 닉네임
  const ranker = getRandomRanker(ep.name);
  const bossLabel = ranker ? `${ranker.nickname}의 ${ep.name}` : ep.name;
  const e = {
    x, y, name: ep.name, attr: ep.attr, radius: 50,
    hp: Math.round(500 * G.difficultyMul), maxHp: Math.round(500 * G.difficultyMul),
    atk: Math.round(60 * G.difficultyMul),
    speed: 70, boss: true, frozenUntil: 0,
    bossLabel,
    dom: createPetDOM(ep.name, ep.image, false, true, bossLabel),
  };
  G.enemies.push(e);
  addFloatingText(x, y - 60, '⚠️ ' + bossLabel + ' 등장!', '#ff5252', true);
}

function dropGem(x, y, value) {
  G.gems.push({ x, y, value, bounce: 0 });
}

// 아이템 드롭 (적 잡으면 가끔)
function tryDropItem(x, y, isBoss) {
  const roll = Math.random();
  let type = null;
  if (isBoss) {
    // 보스는 무조건 좋은거
    const items = ['meat', 'bomb', 'magnet'];
    type = items[Math.floor(Math.random() * items.length)];
  } else {
    // 일반 적: 2% 확률로 아이템
    if (roll < 0.005) type = 'bomb';       // 0.5%
    else if (roll < 0.015) type = 'magnet'; // 1%
    else if (roll < 0.035) type = 'meat';   // 2%
  }
  if (type) {
    G.items.push({
      x, y, type,
      bounce: 0,
      pickupRadius: 30,
      createdAt: performance.now(),
    });
  }
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
  ctx.clearRect(0, 0, G.W, G.H);
  // 배경은 DOM에서 알아서 - 위치만 업데이트
  updateBackgroundPosition();
  // 비네트 (캔버스에 어두운 가장자리)
  const vig = ctx.createRadialGradient(G.W/2, G.H/2, Math.min(G.W,G.H)*0.35, G.W/2, G.H/2, Math.max(G.W,G.H)*0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, G.W, G.H);
  // 오브젝트 (배경 위, 펫 뒤)
  for (const o of G.obstacles) drawObstacle(o);
  // 보석
  for (const g of G.gems) drawGem(g);
  // 아이템
  for (const it of G.items) drawItem(it);
  // 발사체
  for (const pr of G.projectiles) drawProjectile(pr);
  // 회전 무기
  for (const o of G.orbitals) drawOrbital(o);
  // 이펙트
  for (const ef of G.effects) {
    if (ef.draw) {
      try { ef.draw(ctx); } catch(e) {}
    }
  }
}

// 나무/바위 그리기
function drawObstacle(o) {
  const sx = o.x - G.camX + G.W/2;
  const sy = o.y - G.camY + G.H/2;
  if (sx < -100 || sx > G.W + 100 || sy < -100 || sy > G.H + 100) return;
  const ctx = G.ctx;
  if (o.type === 'tree') {
    // 그림자
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + o.size*0.4, o.size*0.7, o.size*0.2, 0, 0, Math.PI*2);
    ctx.fill();
    // 줄기
    ctx.fillStyle = '#4a3020';
    ctx.fillRect(sx - 4, sy - o.size*0.2, 8, o.size*0.5);
    // 잎 (3겹 - 가장 큰 거 어두운 색)
    ctx.fillStyle = '#1a3a10';
    ctx.beginPath();
    ctx.arc(sx, sy - o.size*0.3, o.size*0.8, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#2a5a18';
    ctx.beginPath();
    ctx.arc(sx - o.size*0.2, sy - o.size*0.4, o.size*0.55, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#3a7028';
    ctx.beginPath();
    ctx.arc(sx + o.size*0.15, sy - o.size*0.35, o.size*0.4, 0, Math.PI*2);
    ctx.fill();
    // 하이라이트
    ctx.fillStyle = '#5a9038';
    ctx.beginPath();
    ctx.arc(sx + o.size*0.2, sy - o.size*0.5, o.size*0.15, 0, Math.PI*2);
    ctx.fill();
  } else {
    // 바위
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + o.size*0.3, o.size*0.6, o.size*0.18, 0, 0, Math.PI*2);
    ctx.fill();
    // 바위 본체
    ctx.fillStyle = '#5a5040';
    ctx.beginPath();
    ctx.ellipse(sx, sy, o.size*0.6, o.size*0.45, 0, 0, Math.PI*2);
    ctx.fill();
    // 어두운 부분
    ctx.fillStyle = '#3a3020';
    ctx.beginPath();
    ctx.ellipse(sx + o.size*0.1, sy + o.size*0.1, o.size*0.5, o.size*0.35, 0, 0, Math.PI*2);
    ctx.fill();
    // 하이라이트
    ctx.fillStyle = '#8a8070';
    ctx.beginPath();
    ctx.ellipse(sx - o.size*0.15, sy - o.size*0.15, o.size*0.3, o.size*0.18, 0, 0, Math.PI*2);
    ctx.fill();
  }
}

// 아이템 그리기
function drawItem(it) {
  const sx = it.x - G.camX + G.W/2;
  const sy = it.y - G.camY + G.H/2;
  if (sx < -30 || sx > G.W + 30 || sy < -30 || sy > G.H + 30) return;
  const bob = Math.sin(it.bounce) * 5;
  const ctx = G.ctx;
  // 빛나는 후광
  const glow = ctx.createRadialGradient(sx, sy + bob, 0, sx, sy + bob, 30);
  let glowColor;
  if (it.type === 'meat') glowColor = 'rgba(255,180,100,0.6)';
  else if (it.type === 'bomb') glowColor = 'rgba(255,80,80,0.6)';
  else glowColor = 'rgba(155,135,245,0.6)';
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(sx, sy + bob, 30, 0, Math.PI*2);
  ctx.fill();
  // 이모지 (큰 글씨로)
  ctx.font = '32px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const emoji = it.type === 'meat' ? '🍖' : (it.type === 'bomb' ? '💣' : '🧲');
  ctx.fillText(emoji, sx, sy + bob);
}

function drawProjectile(pr) {
  const sx = pr.x - G.camX + G.W/2;
  const sy = pr.y - G.camY + G.H/2;
  const ctx = G.ctx;
  if (pr.type === 'arrow') {
    // 화살 그리기 (활 이미지 X)
    const angle = Math.atan2(pr.vy, pr.vx);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(angle);
    // 화살대 (갈색)
    ctx.fillStyle = '#8B5A2B';
    ctx.fillRect(-16, -1.5, 28, 3);
    // 화살촉 (회색 삼각형)
    ctx.fillStyle = '#c0c0c0';
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(12, -5);
    ctx.lineTo(12, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // 화살깃 (뒤쪽 깃털)
    ctx.fillStyle = '#fdd835';
    ctx.beginPath();
    ctx.moveTo(-16, 0);
    ctx.lineTo(-22, -4);
    ctx.lineTo(-19, 0);
    ctx.lineTo(-22, 4);
    ctx.closePath();
    ctx.fill();
    // 빛나는 효과
    ctx.shadowColor = '#fdd835';
    ctx.shadowBlur = 6;
    ctx.fillStyle = 'rgba(253,216,53,0.5)';
    ctx.fillRect(-16, -0.5, 28, 1);
    ctx.shadowBlur = 0;
    ctx.restore();
  } else if (pr.type === 'snowflake') {
    // 눈꽃결정
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(pr.rotation || 0);
    // 빛나는 배경
    ctx.shadowColor = '#aaddff';
    ctx.shadowBlur = 15;
    // 6방향 눈꽃 가지
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    const arms = 6;
    const size = pr.radius;
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2;
      const tx = Math.cos(a) * size;
      const ty = Math.sin(a) * size;
      // 메인 가지
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      // 작은 가지 (V자)
      const midX = Math.cos(a) * size * 0.6;
      const midY = Math.sin(a) * size * 0.6;
      const perpA = a + Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(midX, midY);
      ctx.lineTo(midX + Math.cos(a + Math.PI*0.7) * size*0.3, midY + Math.sin(a + Math.PI*0.7) * size*0.3);
      ctx.moveTo(midX, midY);
      ctx.lineTo(midX + Math.cos(a - Math.PI*0.7) * size*0.3, midY + Math.sin(a - Math.PI*0.7) * size*0.3);
      ctx.stroke();
    }
    // 중앙 빛
    ctx.fillStyle = '#aaddff';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  } else {
    ctx.fillStyle = pr.color || '#fff';
    ctx.shadowColor = pr.color || '#fff';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(sx, sy, pr.radius, 0, Math.PI*2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawOrbital(o) {
  const sx = o.x - G.camX + G.W/2;
  const sy = o.y - G.camY + G.H/2;
  const key = o.kind === 'orbit' ? 'axe' : 'stone';
  const img = getCleanWeaponImg(key);
  G.ctx.save();
  G.ctx.translate(sx, sy);
  G.ctx.rotate(o.angle * (o.kind === 'orbit' ? 4 : 1));
  if (img && (img.complete !== false)) {
    const sz = o.kind === 'orbit' ? 50 : 35;
    try { G.ctx.drawImage(img, -sz/2, -sz/2, sz, sz); } catch(e) {}
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
  setupBackground();
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
