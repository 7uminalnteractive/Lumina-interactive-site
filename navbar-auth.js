/* navbar-auth.js — Lumina Interactive
   Fallback leve para páginas que não carregam auth.js */
(function () {
  if (window.__luminaAuthLoaded) return; // auth.js já está ativo
  document.addEventListener("DOMContentLoaded", function () {
    // Sem auth.js, mantém estado padrão (Login)
    // Não faz nada extra para não conflitar
  });
})();
