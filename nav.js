(function() {
  // ─── 메뉴 구조: 카테고리별 그룹 ───
  const MENU_GROUPS = [
    {
      label: '🏠 홈',
      href: 'index.html',
    },
    {
      label: '🐾 펫 정보',
      items: [
        { href: 'pokedex.html',       label: '📖 펫 도감' },
        { href: 'pet_ranking.html',   label: '🏆 펫 랭킹' },
        { href: 'pet_recommend.html', label: '✨ 펫 추천' },
        { href: 'pet_worldcup.html',  label: '🐾 이상형 월드컵' },
      ],
    },
    {
      label: '🎮 시뮬레이터',
      href: 'sim.html',
    },
    {
      label: '🎲 미니게임',
      items: [
        { href: 'pet_survival_game/pet_survival.html', label: '🦇 펫 서바이벌' },
        { href: 'windrogue.html',                       label: '⚔️ 윈드로그' },
        { href: 'raise.html',                           label: '👑 프린세스 펫 메이커' },
      ],
    },
    {
      label: '📊 경제',
      href: 'daily.html',
    },
  ];

  function injectNav() {
    if (document.getElementById('global-nav')) return;

    const path = location.pathname;
    const current = path.split('/').pop() || 'index.html';
    const inSubfolder = path.includes('/pet_survival_game/');
    const prefix = inSubfolder ? '../' : '';

    // 스타일
    if (!document.getElementById('global-nav-style')) {
      const style = document.createElement('style');
      style.id = 'global-nav-style';
      style.textContent = `
        #global-nav {
          display: flex;
          justify-content: center;
          gap: 6px;
          flex-wrap: wrap;
          padding: 10px 14px;
          background: #fff;
          border-bottom: 1px solid #ede9ff;
          position: sticky;
          top: 0;
          z-index: 9999;
          font-family: 'Noto Sans KR', sans-serif;
        }
        .nav-item { position: relative; }
        .nav-link {
          display: inline-block;
          text-decoration: none;
          background: #f7f5ff;
          border: 1.5px solid #e8e3ff;
          border-radius: 99px;
          padding: 7px 16px;
          font-size: 12.5px;
          font-weight: 700;
          color: #7b72a8;
          cursor: pointer;
          transition: all .15s;
          white-space: nowrap;
          user-select: none;
        }
        .nav-link:hover, .nav-item.open > .nav-link {
          border-color: #9b87f5;
          color: #6c5ce7;
          background: #ede9ff;
        }
        .nav-link.nav-active {
          background: linear-gradient(135deg, #9b87f5, #f587b8);
          color: #fff;
          border-color: transparent;
        }
        .nav-link.has-children::after {
          content: '▾';
          margin-left: 4px;
          font-size: 9px;
          opacity: 0.7;
        }
        .nav-dropdown {
          position: absolute;
          top: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          background: #fff;
          border: 1.5px solid #e8e3ff;
          border-radius: 14px;
          padding: 6px;
          box-shadow: 0 8px 24px rgba(155,135,245,0.18);
          min-width: 170px;
          display: none;
          flex-direction: column;
          gap: 2px;
          z-index: 10000;
          animation: dropdownIn 0.15s ease;
        }
        @keyframes dropdownIn {
          from { opacity: 0; transform: translateX(-50%) translateY(-4px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .nav-item.open > .nav-dropdown { display: flex; }
        .nav-dropdown a {
          text-decoration: none;
          color: #5b5388;
          font-size: 12.5px;
          font-weight: 700;
          padding: 8px 14px;
          border-radius: 10px;
          white-space: nowrap;
          transition: all .12s;
        }
        .nav-dropdown a:hover {
          background: linear-gradient(135deg, #f7f5ff, #ffe9f2);
          color: #6c5ce7;
        }
        .nav-dropdown a.nav-active {
          background: linear-gradient(135deg, #9b87f5, #f587b8);
          color: #fff;
        }
        .nav-item.has-active > .nav-link {
          border-color: #f587b8;
          color: #6c5ce7;
          background: #fdeaf3;
        }
        @media (max-width: 600px) {
          #global-nav { gap: 4px; padding: 8px 10px; }
          .nav-link { padding: 6px 12px; font-size: 12px; }
          .nav-dropdown { min-width: 150px; }
        }
      `;
      document.head.appendChild(style);
    }

    const nav = document.createElement('div');
    nav.id = 'global-nav';

    MENU_GROUPS.forEach(group => {
      const item = document.createElement('div');
      item.className = 'nav-item';

      if (group.items) {
        // 드롭다운 그룹
        const hasActive = group.items.some(it => it.href.split('/').pop() === current);

        const btn = document.createElement('span');
        btn.className = 'nav-link has-children';
        if (hasActive) item.classList.add('has-active');
        btn.textContent = group.label;
        item.appendChild(btn);

        const dropdown = document.createElement('div');
        dropdown.className = 'nav-dropdown';
        group.items.forEach(it => {
          const a = document.createElement('a');
          const targetFile = it.href.split('/').pop();
          const isActive = targetFile === current;
          let href;
          if (it.href.includes('pet_survival_game/')) {
            href = inSubfolder ? 'pet_survival.html' : it.href;
          } else {
            href = prefix + it.href;
          }
          a.href = href;
          a.textContent = it.label;
          if (isActive) a.classList.add('nav-active');
          dropdown.appendChild(a);
        });
        item.appendChild(dropdown);

        // 호버 + 클릭
        let hoverTimer;
        item.addEventListener('mouseenter', () => {
          clearTimeout(hoverTimer);
          closeAllDropdowns();
          item.classList.add('open');
        });
        item.addEventListener('mouseleave', () => {
          hoverTimer = setTimeout(() => item.classList.remove('open'), 200);
        });
        btn.addEventListener('click', e => {
          e.stopPropagation();
          const isOpen = item.classList.contains('open');
          closeAllDropdowns();
          if (!isOpen) item.classList.add('open');
        });
      } else {
        const a = document.createElement('a');
        a.className = 'nav-link';
        const targetFile = group.href.split('/').pop();
        const isActive = targetFile === current;
        let href;
        if (group.href.includes('pet_survival_game/')) {
          href = inSubfolder ? 'pet_survival.html' : group.href;
        } else {
          href = prefix + group.href;
        }
        a.href = href;
        a.textContent = group.label;
        if (isActive) a.classList.add('nav-active');
        item.appendChild(a);
      }

      nav.appendChild(item);
    });

    if (document.body) {
      document.body.insertBefore(nav, document.body.firstChild);
    }

    document.addEventListener('click', () => closeAllDropdowns());
  }

  function closeAllDropdowns() {
    document.querySelectorAll('.nav-item.open').forEach(el => el.classList.remove('open'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectNav);
  } else {
    injectNav();
  }
})();
