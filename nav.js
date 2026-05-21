(function() {
  const MENUS = [
    { href: 'index.html',        label: '🏠 환각 계산기' },
    { href: 'pokedex.html',      label: '🐾 펫 도감' },
    { href: 'sim.html',          label: '🎮 시뮬레이터' },
    { href: 'pet_ranking.html',  label: '🏆 펫 랭킹' },
    { href: 'pet_worldcup.html', label: '🐾 이상형 월드컵' },
    { href: 'pet_recommend.html',label: '✨ 펫 추천' },
    { href: 'pet_survival_game/pet_survival.html', label: '🦇 펫 서바이벌' },
    { href: 'windrogue.html',    label: '⚔️ 윈드로그' },
    { href: 'raise.html',        label: '👑 프린세스 펫 메이커' },
    { href: 'daily.html',        label: '📈 STOCK·WIND' },
  ];

  function injectNav() {
    // 이미 삽입됐으면 스킵
    if (document.getElementById('global-nav')) return;

    // 현재 페이지 파악
    const path = location.pathname;
    const parts = path.split('/').filter(Boolean);
    const current = parts[parts.length - 1] || 'index.html';
    // 폴더 깊이 (마지막 파일명 제외)
    // 예: /repo/file.html → 깊이 0 (루트)
    //     /repo/subfolder/file.html → 깊이 1 (../ 필요)
    // GitHub Pages: /repoName/sub/file.html → repo 다음부터 깊이 계산
    // 간단하게: pet_survival_game 폴더 안인지 체크
    const inSubfolder = path.includes('/pet_survival_game/');
    const prefix = inSubfolder ? '../' : '';

    // 스타일 삽입
    if (!document.getElementById('global-nav-style')) {
      const style = document.createElement('style');
      style.id = 'global-nav-style';
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
    }

    // nav 렌더
    const nav = document.createElement('div');
    nav.id = 'global-nav';
    nav.innerHTML = MENUS.map(m => {
      // 펫 서바이벌은 폴더 안 페이지
      const isSurvival = m.href.includes('pet_survival_game/');
      let href;
      if (isSurvival) {
        // 서바이벌은 폴더 안이므로 - 루트에선 그대로, 폴더 안에선 같은 폴더의 pet_survival.html
        href = inSubfolder ? 'pet_survival.html' : m.href;
      } else {
        // 일반 페이지 - 폴더 안에선 ../ 붙이기
        href = prefix + m.href;
      }
      // active 체크 (파일명만 비교)
      const targetFile = m.href.split('/').pop();
      const isActive = targetFile === current;
      return `<a href="${href}"${isActive ? ' class="nav-active"' : ''}>${m.label}</a>`;
    }).join('');

    // body 맨 앞에 삽입
    if (document.body) {
      document.body.insertBefore(nav, document.body.firstChild);
    }
  }

  // DOM이 준비된 시점에 실행
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();
