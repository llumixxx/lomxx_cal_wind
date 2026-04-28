(function() {
  const MENUS = [
    { href: 'index.html',        label: '🏠 환각 계산기' },
    { href: 'pokedex.html',      label: '🐾 펫 도감' },
    { href: 'sim.html',          label: '🎮 시뮬레이터' },
    { href: 'pet_ranking.html',  label: '🏆 펫 랭킹' },
    { href: 'pet_worldcup.html', label: '🐾 이상형 월드컵' },
    { href: 'pet_recommend.html',label: '✨ 펫 추천' },
    { href: 'windrogue.html',    label: '⚔️ 윈드로그' },
    { href: 'raise.html',        label: '👑 프린세스 펫 메이커' },
    { href: 'daily.html',        label: '📊 데일리 윈드' },
  ];

  // 현재 페이지 파악
  const current = location.pathname.split('/').pop() || 'index.html';

  // 스타일 삽입
  const style = document.createElement('style');
  style.textContent = `
    #global-nav {
      display: flex;
      justify-content: center;
      gap: 7px;
      flex-wrap: wrap;
      padding: 10px 16px;
      background: #fff;
      border-bottom: 1.5px solid #e8e3ff;
      position: sticky;
      top: 0;
      z-index: 100;
    }
    #global-nav a {
      text-decoration: none;
      background: #f7f5ff;
      border: 1.5px solid #e8e3ff;
      border-radius: 99px;
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 700;
      color: #7b72a8;
      font-family: 'Noto Sans KR', sans-serif;
      transition: all .15s;
      white-space: nowrap;
    }
    #global-nav a:hover {
      border-color: #9b87f5;
      color: #6c5ce7;
      background: #ede9ff;
    }
    #global-nav a.nav-active {
      background: linear-gradient(135deg, #9b87f5, #f587b8);
      color: #fff;
      border-color: transparent;
    }
  `;
  document.head.appendChild(style);

  // nav 렌더
  const nav = document.createElement('div');
  nav.id = 'global-nav';
  nav.innerHTML = MENUS.map(m =>
    `<a href="${m.href}"${m.href === current ? ' class="nav-active"' : ''}>${m.label}</a>`
  ).join('');

  // body 맨 앞에 삽입
  document.body.insertBefore(nav, document.body.firstChild);
})();
