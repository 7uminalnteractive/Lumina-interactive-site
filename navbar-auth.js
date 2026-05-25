// Redireciona para auth.js (compatibilidade com páginas que carregam navbar-auth.js)
(function () {
  if (window.__luminaAuthLoaded) return;
  const s = document.createElement("script");
  s.src = "auth.js";
  document.head.appendChild(s);
})();
