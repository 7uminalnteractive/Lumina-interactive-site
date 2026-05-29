window.addEventListener("DOMContentLoaded", () => {
  const logado = localStorage.getItem("lumina_logado");
  const email  = localStorage.getItem("lumina_email");

  // ── Links simples [data-auth-link] ──
  document.querySelectorAll('[data-auth-link]').forEach((link) => {
    if (logado === "sim" && email) {
      link.textContent = "Minha conta";
      link.href = "minha-conta.html";
    } else {
      link.textContent = "Login";
      link.href = "login.html";
    }
  });

  // ── Injetar hamburger + user icon em TODAS as navbars ──
  document.querySelectorAll('.navbar').forEach((nav) => {
    if (nav.querySelector('.nav-actions')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'nav-actions';

    const userHref  = (logado === "sim" && email) ? "minha-conta.html" : "login.html";
    const userTitle = (logado === "sim" && email) ? "Minha conta" : "Login";

    wrapper.innerHTML = `
      <a href="${userHref}" class="nav-user-btn" title="${userTitle}">
        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
          <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/>
        </svg>
      </a>
      <button class="nav-hamburger" aria-label="Menu" id="navHamburger">
        <span></span><span></span><span></span>
      </button>
    `;
    nav.appendChild(wrapper);

    // Adiciona itens extras no menu (Suporte)
    const menu = nav.querySelector('.menu');
    if (menu) {
      // Separador
      const divider = document.createElement('div');
      divider.style.cssText = 'height:1px;background:var(--border);margin:6px 8px;';
      menu.appendChild(divider);

      // Suporte
      const suporteLink = document.createElement('a');
      suporteLink.href = 'suporte.html';
      suporteLink.style.cssText = 'display:flex;align-items:center;gap:8px;';
      suporteLink.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="opacity:0.6">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92C13.45 12.9 13 13.5 13 15h-2v-.5c0-1.1.45-2.1 1.17-2.83l1.24-1.26c.37-.36.59-.86.59-1.41 0-1.1-.9-2-2-2s-2 .9-2 2H8c0-2.21 1.79-4 4-4s4 1.79 4 4c0 .88-.36 1.68-.93 2.25z"/>
        </svg>
        Suporte
      `;
      menu.appendChild(suporteLink);
    }

    // Hamburger toggle
    const hamburger = wrapper.querySelector('#navHamburger');
    if (menu && hamburger) {
      hamburger.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('menu-open');
        hamburger.classList.toggle('active');
      });
      document.addEventListener('click', () => {
        menu.classList.remove('menu-open');
        hamburger.classList.remove('active');
      });
      menu.addEventListener('click', (e) => e.stopPropagation());
    }
  });
});
