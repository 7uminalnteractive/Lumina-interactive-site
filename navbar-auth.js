window.addEventListener("load", () => {

  const logado =
    localStorage.getItem("lumina_logado");

  const links =
    document.querySelectorAll("a");

  links.forEach((link) => {

    const texto =
      link.textContent.trim().toLowerCase();

    const href =
      link.getAttribute("href") || "";

    if (
      texto === "login" ||
      href.includes("login.html")
    ) {

      if (logado === "sim") {

        link.textContent =
          "Minha conta";

        link.href =
          "minha-conta.html";

      } else {

        link.textContent =
          "Login";

        link.href =
          "login.html";

      }

    }

  });

});