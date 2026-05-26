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
    // Evita duplicar
    if (nav.querySelector('.nav-actions')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'nav-actions';

    // Botão user/login
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

    // Hamburger toggle
    const menu = nav.querySelector('.menu');
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
