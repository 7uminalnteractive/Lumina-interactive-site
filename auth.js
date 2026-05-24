(function () {
  if (window.__luminaAuthNavbarLoaded) return;
  window.__luminaAuthNavbarLoaded = true;

  const SUPABASE_URL = "https://tqsalhscgkepttbczyjq.supabase.co";
  const SUPABASE_KEY = "sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK";

  function carregarSupabase() {
    return new Promise((resolve) => {
      if (window.supabase) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js";
      script.onload = resolve;
      document.head.appendChild(script);
    });
  }

  async function atualizarNavbar() {
    await carregarSupabase();

    const client = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY
    );

    const { data: { user } } =
      await client.auth.getUser();

    const links =
      document.querySelectorAll("a");

    links.forEach((link) => {

      const texto =
        link.textContent.trim().toLowerCase();

      const href =
        link.getAttribute("href") || "";

      if (
        texto === "login" ||
        href.includes("login.html") ||
        href.includes("minha-conta.html")
      ) {

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

  document.addEventListener(
    "DOMContentLoaded",
    atualizarNavbar
  );

})();