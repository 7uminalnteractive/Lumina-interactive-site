const SUPABASE_URL = "COLE_SUA_SUPABASE_URL_AQUI";
const SUPABASE_KEY = "COLE_SUA_SUPABASE_ANON_KEY_AQUI";

let supabaseClient = null;

if(SUPABASE_URL.includes("supabase.co") && !SUPABASE_KEY.includes("COLE")){
  supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

function moeda(valor){
  return Number(valor || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
}

function getParam(nome){
  return new URLSearchParams(window.location.search).get(nome);
}

function produtoPadrao(slug){
  const produtos = {
    "brazukas": {nome:"Brazukas Patch", preco:0, descricao:"O patch brasileiro definitivo para PES PSP."},
    "lpfl-normal": {nome:"LPFL Normal", preco:0, descricao:"Experiência clássica para PES PSP."},
    "lpfl-pro": {nome:"LPFL PRO", preco:0, descricao:"Versão premium do LPFL."},
    "lumina-plus": {nome:"Lumina Plus", preco:9.90, descricao:"Assinatura premium da Lumina Interactive."}
  };
  return produtos[slug] || produtos["lumina-plus"];
}

async function carregarProdutos(){
  const area = document.querySelector("#produtos-dinamicos");
  if(!area) return;

  if(!supabaseClient){
    area.innerHTML = "";
    ["brazukas","lpfl-normal","lpfl-pro"].forEach(slug=>{
      const p = produtoPadrao(slug);
      area.innerHTML += cardProduto(p, slug);
    });
    return;
  }

  const {data,error} = await supabaseClient.from("produtos").select("*").eq("ativo",true).order("id");
  if(error || !data?.length){
    area.innerHTML = "";
    ["brazukas","lpfl-normal","lpfl-pro"].forEach(slug=>{
      const p = produtoPadrao(slug);
      area.innerHTML += cardProduto(p, slug);
    });
    return;
  }

  area.innerHTML = "";
  data.filter(p=>p.slug !== "lumina-plus").forEach(p=> area.innerHTML += cardProduto(p, p.slug));
}

function cardProduto(p, slug){
  return `<div class="card">
    <span class="badge">${p.categoria || "PATCH"}</span>
    <h3>${p.nome}</h3>
    <p>${p.descricao || ""}</p>
    <a class="btn primary" href="checkout.html?produto=${slug}">Comprar / Baixar</a>
  </div>`;
}

async function iniciarCheckout(){
  const form = document.querySelector("#checkout-form");
  if(!form) return;

  const slug = getParam("produto") || "lumina-plus";
  let produto = produtoPadrao(slug);

  if(supabaseClient){
    const {data} = await supabaseClient.from("produtos").select("*").eq("slug",slug).single();
    if(data) produto = data;
  }

  document.querySelector("#checkout-produto").innerText = produto.nome;
  document.querySelector("#checkout-desc").innerText = produto.descricao || "";
  document.querySelector("#checkout-preco").innerText = moeda(produto.preco);

  form.addEventListener("submit", async (e)=>{
    e.preventDefault();

    const pedido = {
      nome_cliente: document.querySelector("#nome").value,
      email: document.querySelector("#email").value,
      whatsapp: document.querySelector("#whatsapp").value,
      produto: produto.nome,
      plano: slug,
      valor: Number(produto.preco || 0),
      status: "pendente",
      metodo_pagamento: document.querySelector("#pagamento").value
    };

    if(supabaseClient){
      const {error} = await supabaseClient.from("pedidos").insert([pedido]);
      if(error){
        alert("Erro ao registrar pedido: " + error.message);
        return;
      }
    }

    localStorage.setItem("ultimoPedidoLumina", JSON.stringify(pedido));
    window.location.href = "sucesso.html";
  });
}

async function carregarPedidosAdmin(){
  const tabela = document.querySelector("#pedidos-admin");
  if(!tabela) return;

  if(!supabaseClient){
    tabela.innerHTML = `<tr><td colspan="6">Configure o Supabase no app.js.</td></tr>`;
    return;
  }

  const {data,error} = await supabaseClient.from("pedidos").select("*").order("id",{ascending:false});
  if(error){
    tabela.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
    return;
  }

  tabela.innerHTML = "";
  data.forEach(p=>{
    tabela.innerHTML += `<tr>
      <td>${p.id}</td>
      <td>${p.nome_cliente || ""}</td>
      <td>${p.produto || ""}</td>
      <td>${moeda(p.valor)}</td>
      <td>${p.status || ""}</td>
      <td>${p.whatsapp || ""}</td>
    </tr>`;
  });
}

carregarProdutos();
iniciarCheckout();
carregarPedidosAdmin();
