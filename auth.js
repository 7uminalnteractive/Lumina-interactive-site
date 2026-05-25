// Lumina Interactive — Auth helper (Supabase)
(function () {
  if (window.__luminaAuthLoaded) return;
  window.__luminaAuthLoaded = true;

  const SUPABASE_URL = "https://tqsalhscgkepttbczyjq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK";

  function ensureSupabase() {
    return new Promise((resolve) => {
      if (window.supabase) { resolve(); return; }
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js";
      s.onload = resolve;
      document.head.appendChild(s);
    });
  }

  async function updateNavbar() {
    await ensureSupabase();
    const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: { user } } = await client.auth.getUser();

    document.querySelectorAll("a").forEach((link) => {
      const txt = link.textContent.trim().toLowerCase();
      const href = link.getAttribute("href") || "";
      if (txt === "login" || href.includes("login.html") || href.includes("minha-conta.html")) {
        if (user) {
          link.textContent = "Minha conta";
          link.href = "minha-conta.html";
        } else {
          link.textContent = "Login";
          link.href = "login.html";
        }
      }
    });
  }

  document.addEventListener("DOMContentLoaded", updateNavbar);
})();
