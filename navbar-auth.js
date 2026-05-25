
window.addEventListener("DOMContentLoaded", () => {
  const logado = localStorage.getItem("lumina_logado");
  const email = localStorage.getItem("lumina_email");

  document.querySelectorAll("[data-auth-link]").forEach(link=>{
    if(logado==="sim" && email){
      link.href="minha-conta.html";
    } else {
      link.href="login.html";
    }
  });
});
