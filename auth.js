const SUPABASE_URL = "https://tqsalhscgkepttbczyjq.supabase.co";
const SUPABASE_KEY = "sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK";

const supabaseClient = supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

async function atualizarNavbar() {

  const { data: { user } } =
    await supabaseClient.auth.getUser();

  const contaLink =
    document.getElementById("contaLink");

  if (!contaLink) return;

  if (user) {

    contaLink.innerText = "Minha conta";
    contaLink.href = "minha-conta.html";

  } else {

    contaLink.innerText = "Login";
    contaLink.href = "login.html";

  }

}

document.addEventListener("DOMContentLoaded", () => {

  atualizarNavbar();

});
