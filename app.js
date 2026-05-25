// app.js — Lumina Interactive
// Nota: este arquivo requer que @supabase/supabase-js já esteja carregado.

const SUPABASE_URL = "https://tqsalhscgkepttbczyjq.supabase.co";
const SUPABASE_KEY = "sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getParam(nome) {
  return new URLSearchParams(window.location.search).get(nome);
}

/* ── PRODUTOS (downloads.html) ── */
function carregarProdutos() {
  const area = document.querySelector("#produtos-dinamicos");
  if (!area) return;

  const produtos = [
    { slug: "brazukas",    nome: "Brazukas Patch", categoria: "PATCH", descricao: "O patch brasileiro definitivo." },
    { slug: "lpfl-normal", nome: "LPFL Normal",    categoria: "PATCH", descricao: "Experiência clássica do LPFL." },
    { slug: "lpfl-pro",    nome: "LPFL PRO",       categoria: "PRO",   descricao: "Versão premium do LPFL." }
  ];

  area.innerHTML = "";
  produtos.forEach((p) => {
    area.innerHTML += `
      <div class="card">
        <span class="badge">${p.categoria}</span>
        <h3>${p.nome}</h3>
        <p>${p.descricao}</p>
        <a class="btn primary" href="checkout.html?produto=${p.slug}">Comprar / Baixar</a>
      </div>`;
  });
}

/* ── ADMIN ── */
async function carregarPedidosAdmin() {
  const tabela = document.querySelector("#pedidos-admin");
  if (!tabela) return;

  const { data, error } = await supabaseClient
    .from("pedidos")
    .select("*")
    .order("id", { ascending: false });

  if (error) {
    tabela.innerHTML = `<tr><td colspan="6" style="color:#ef4444">${error.message}</td></tr>`;
    return;
  }

  tabela.innerHTML = "";
  if (!data.length) {
    tabela.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#64748b;padding:40px">Nenhum pedido encontrado.</td></tr>`;
    return;
  }

  data.forEach((p) => {
    tabela.innerHTML += `
      <tr>
        <td>${p.id}</td>
        <td>${p.nome_cliente || ""}</td>
        <td>${p.produto || ""}</td>
        <td>${moeda(p.valor)}</td>
        <td>${p.status || ""}</td>
        <td>${p.whatsapp || ""}</td>
      </tr>`;
  });
}

/* ── INIT — aguarda DOM ── */
document.addEventListener("DOMContentLoaded", () => {
  carregarProdutos();
  carregarPedidosAdmin();
});
