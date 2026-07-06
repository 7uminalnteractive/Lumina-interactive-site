/* site-nav.js
   Preenche dinamicamente os links do menu (navbar) e do rodapé (footer)
   a partir da tabela "site_links" no Supabase, editável pela aba
   "Navbar & Rodapé" do admin.html.

   Como usar em uma página:
   1. No <div class="menu"> do navbar, adicione o atributo id="menuDinamico"
   2. No <div class="footer-links"> do footer, adicione id="footerDinamico"
   3. Inclua este script ANTES de navbar-auth.js:
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js"></script>
      <script src="site-nav.js"></script>
      <script src="navbar-auth.js"></script>

   Se a busca falhar (offline, tabela ainda não criada, etc.), a página
   mantém os links estáticos que já estavam escritos no HTML como
   fallback — nada quebra.
*/

(function () {
  if (typeof supabase === "undefined") return;

  const supabaseNavClient = supabase.createClient(
    "https://tqsalhscgkepttbczyjq.supabase.co",
    "sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK"
  );

  function linkHtml(item) {
    const authAttr = item.somente_logado ? " data-auth-link" : "";
    const activeAttr = (window.location.pathname.split("/").pop() === item.url) ? ' class="active"' : "";
    return `<a href="${item.url}"${activeAttr}${authAttr}>${item.texto}</a>`;
  }

  async function popularNav() {
    const menuEl = document.getElementById("menuDinamico");
    const footerEl = document.getElementById("footerDinamico");

    if (!menuEl && !footerEl) {
      document.dispatchEvent(new CustomEvent("site-nav-pronto"));
      return; // página não usa nav dinâmico
    }

    const { data, error } = await supabaseNavClient
      .from("site_links")
      .select("*")
      .eq("ativo", true)
      .order("ordem", { ascending: true });

    if (error || !data || !data.length) {
      document.dispatchEvent(new CustomEvent("site-nav-pronto"));
      return; // mantém fallback estático já no HTML
    }

    if (menuEl) {
      const links = data.filter(i => i.local === "navbar");
      if (links.length) menuEl.innerHTML = links.map(linkHtml).join("\n");
    }

    if (footerEl) {
      const links = data.filter(i => i.local === "footer");
      if (links.length) footerEl.innerHTML = links.map(linkHtml).join("\n");
    }

    document.dispatchEvent(new CustomEvent("site-nav-pronto"));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", popularNav);
  } else {
    popularNav();
  }
})();
