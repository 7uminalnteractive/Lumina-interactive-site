const SUPABASE_URL =
"https://tqsalhscgkepttbczyjq.supabase.co";

const SUPABASE_KEY =
"sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK";

const supabaseClient =
supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

async function atualizarConta() {

  const {
    data: { user }
  } = await supabaseClient.auth.getUser();

  const links =
    document.querySelectorAll("a");

  links.forEach((link) => {

    const texto =
      link.textContent.trim();

    if (
      texto === "Login" ||
      texto === "Minha conta"
    ) {

      if (user) {

        link.innerText =
          "Minha conta";

        link.href =
          "minha-conta.html";

      } else {

        link.innerText =
          "Login";

        link.href =
          "login.html";

      }

    }

  });

}

window.addEventListener(
  "load",
  atualizarConta
);