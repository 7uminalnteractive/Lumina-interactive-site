/* auth.js — Lumina Interactive
   Navbar com menu "..." e ícone de usuário dinâmico */
(function () {
  if (window.__luminaAuthLoaded) return;
  window.__luminaAuthLoaded = true;

  const SUPABASE_URL = "https://tqsalhscgkepttbczyjq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK";

  function carregarSupabase() {
    return new Promise((resolve) => {
      if (window.supabase) { resolve(); return; }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  async function construirNavbar() {
    await carregarSupabase();
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: { user } } = await client.auth.getUser();

    // Injeta CSS da navbar
    const style = document.createElement("style");
    style.textContent = `
      .navbar {
        width: 100%;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 32px;
        background: #020617;
        border-bottom: 1px solid rgba(255,255,255,0.08);
        position: sticky;
        top: 0;
        z-index: 1000;
        box-sizing: border-box;
      }
      .navbar .logo {
        font-size: 22px;
        font-weight: 800;
        letter-spacing: 1px;
        color: white;
        text-decoration: none;
        white-space: nowrap;
      }
      .navbar .nav-right {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      /* Dropdown "..." */
      .nav-dropdown {
        position: relative;
      }
      .nav-dots-btn {
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.12);
        color: white;
        font-size: 20px;
        font-weight: 800;
        width: 44px;
        height: 44px;
        border-radius: 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        letter-spacing: 1px;
        transition: background 0.2s;
        padding: 0;
        line-height: 1;
      }
      .nav-dots-btn:hover {
        background: rgba(255,255,255,0.13);
      }
      .nav-dropdown-menu {
        display: none;
        position: absolute;
        right: 0;
        top: calc(100% + 10px);
        background: #0d1b2e;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        min-width: 180px;
        padding: 8px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        z-index: 999;
      }
      .nav-dropdown-menu.open {
        display: block;
      }
      .nav-dropdown-menu a {
        display: block;
        padding: 12px 16px;
        color: #cbd5e1;
        font-size: 15px;
        font-weight: 500;
        border-radius: 10px;
        text-decoration: none;
        transition: background 0.15s, color 0.15s;
      }
      .nav-dropdown-menu a:hover {
        background: rgba(59,130,246,0.15);
        color: white;
      }
      /* Botão de usuário */
      .nav-user-btn {
        background: #2563eb;
        border: none;
        color: white;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.2s, transform 0.15s;
        text-decoration: none;
        flex-shrink: 0;
      }
      .nav-user-btn:hover {
        background: #1d4ed8;
        transform: scale(1.07);
      }
      .nav-user-btn svg {
        width: 22px;
        height: 22px;
        fill: white;
      }
      /* Fecha dropdown ao clicar fora */
    `;
    document.head.appendChild(style);

    // Substitui a navbar existente
    const navbarEl = document.querySelector("nav.navbar");
    if (!navbarEl) return;

    const userHref = user ? "minha-conta.html" : "login.html";
    const userTitle = user ? "Minha conta" : "Entrar / Login";

    navbarEl.innerHTML = `
      <a class="logo" href="index.html">LUMINA INTERACTIVE™</a>
      <div class="nav-right">

        <div class="nav-dropdown" id="navDropdown">
          <button class="nav-dots-btn" id="navDotsBtn" title="Menu" aria-label="Menu">•••</button>
          <div class="nav-dropdown-menu" id="navDropdownMenu">
            <a href="index.html">Início</a>
            <a href="patches.html">Patchs</a>
            <a href="downloads.html">Downloads</a>
            <a href="plus.html">Lumina Plus</a>
          </div>
        </div>

        <a class="nav-user-btn" href="${userHref}" title="${userTitle}" aria-label="${userTitle}">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
          </svg>
        </a>

      </div>
    `;

    // Toggle dropdown
    const btn = document.getElementById("navDotsBtn");
    const menu = document.getElementById("navDropdownMenu");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("open");
    });

    document.addEventListener("click", () => {
      menu.classList.remove("open");
    });

    menu.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }

  document.addEventListener("DOMContentLoaded", construirNavbar);
})();
