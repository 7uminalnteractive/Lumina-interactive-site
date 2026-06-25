const SUPABASE_URL =
"https://tqsalhscgkepttbczyjq.supabase.co";

const SUPABASE_KEY =
"sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK";

const supabaseClient =
supabase.createClient(
SUPABASE_URL,
SUPABASE_KEY
);

function moeda(valor){

return Number(valor || 0)
.toLocaleString(
"pt-BR",
{
style:"currency",
currency:"BRL"
}
);

}

function getParam(nome){

return new URLSearchParams(
window.location.search
).get(nome);

}

function produtoPadrao(slug){

const produtos = {

"brazukas": {

nome:"Brazukas Patch",
preco:0,
descricao:
"O patch brasileiro definitivo."

},

"lpfl-normal": {

nome:"LPFL Normal",
preco:0,
descricao:
"Experiência clássica."

},

"lpfl-pro": {

nome:"LPFL PRO",
preco:0,
descricao:
"Versão premium do LPFL."

},

"lumina-plus": {

nome:"Lumina Plus",
preco:9.90,
descricao:
"Acesso premium da Lumina Interactive."

}

};

return produtos[slug]
|| produtos["lumina-plus"];

}

/* =========================
CARREGAR PRODUTOS
========================= */

async function carregarProdutos(){

const area =
document.querySelector(
"#produtos-dinamicos"
);

if(!area) return;

const produtos = [
  { slug:"brazukas",  nome:"Brazukas Patch", categoria:"PATCH", descricao:"O patch brasileiro definitivo.", gratuito:true,  pagina:"brazukas.html" },
  { slug:"lpfl-normal",nome:"LPFL Normal",   categoria:"PATCH", descricao:"Experiência clássica.",          gratuito:true,  pagina:"lpfl-normal.html" },
  { slug:"lpfl-pro",  nome:"LPFL PRO",       categoria:"PRO",   descricao:"Versão premium do LPFL.",        gratuito:false, pagina:"lpfl-pro.html" }
];

area.innerHTML = "";

produtos.forEach((p) => {
  const btnHref  = p.gratuito ? p.pagina : `checkout.html?produto=${p.slug}`;
  const btnTexto = p.gratuito ? "Ver / Baixar" : "Assinar — R$ 9,90";
  area.innerHTML += `
<div class="card">
  <span class="badge">${p.categoria}</span>
  <h3>${p.nome}</h3>
  <p>${p.descricao}</p>
  <a class="btn primary" href="${btnHref}">${btnTexto}</a>
</div>`;
});

}
/* =========================
CHECKOUT
========================= */

async function iniciarCheckout(){

const form =
document.querySelector(
"#checkout-form"
);

if(!form) return;

const slug =
getParam("produto")
|| "lumina-plus";

let produto =
produtoPadrao(slug);

document.querySelector(
"#checkout-produto"
).innerText =
produto.nome;

document.querySelector(
"#checkout-desc"
).innerText =
produto.descricao;

document.querySelector(
"#checkout-preco"
).innerText =
moeda(produto.preco);

form.addEventListener(
"submit",
async (e)=>{

e.preventDefault();

const pedido = {

nome_cliente:
document.querySelector(
"#nome"
).value,

email:
document.querySelector(
"#email"
).value,

whatsapp:
document.querySelector(
"#whatsapp"
).value,

produto:
produto.nome,

plano:
slug,

valor:
Number(
produto.preco || 0
),

status:
"pendente",

metodo_pagamento:
document.querySelector(
"#pagamento"
).value

};

const { error } =
await supabaseClient
.from("pedidos")
.insert([pedido]);

if(error){

alert(
"Erro ao registrar pedido: "
+ error.message
);

console.log(error);

return;

}

/* AQUI FOI ALTERADO */

window.location.href =
"comprovante.html";

});

}

/* =========================
INICIAR
========================= */

carregarProdutos();

iniciarCheckout();