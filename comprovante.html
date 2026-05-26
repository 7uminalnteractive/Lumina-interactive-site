<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pagamento Pix | Lumina Interactive</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<nav class="navbar">
  <div class="logo">LUMINA <span>INTERACTIVE</span>™</div>
  <div class="menu">
    <a href="index.html">Início</a><a href="patches.html">Patchs</a>
    <a href="downloads.html">Downloads</a><a href="plus.html">Lumina Plus</a>
    <a href="login.html" data-auth-link>Login</a>
  </div>
</nav>
<div class="page-wrap">
  <div class="container">

    <section id="areaPagamento">
      <div class="page-hero" style="padding-left:0;padding-right:0">
        <div class="page-hero-label">Pagamento</div>
        <h1>Finalizar pedido</h1>
        <p>Escaneie o QR Code, pague via Pix/PicPay e envie o comprovante.</p>
      </div>
      <div class="checkout-layout">

        <!-- 1º — PIX -->
        <div class="summary-card reveal" style="text-align:center">
          <span class="badge">PIX / PICPAY</span>
          <h2>Finalize seu pagamento</h2>
          <img src="1005625839.jpg" style="width:100%;max-width:280px;border-radius:20px;background:white;padding:12px;margin:20px auto;display:block">
          <div style="margin:16px 0;padding:16px;border-radius:14px;background:var(--bg);border:1px solid var(--border);word-break:break-all;font-size:12px;line-height:1.6;text-align:left">
            <span id="pixCode">00020126740014br.gov.bcb.pix0111099248645900237Cofrinho de Luan Vinicius Da Silva Me5204000053039865802BR5925Luan Vinicius Da Silva Me6015Feira de Santan61084409220062270523COFRNDgzNzA5NDAxMDAwMDQ6304CC1B</span>
          </div>
          <button class="btn primary" style="width:100%" onclick="copiarPix()">Copiar Pix</button>
        </div>

        <!-- 2º — Comprovante -->
        <div class="form-card reveal">
          <div class="badge">Comprovante</div>
          <h2>Enviar comprovante</h2>
          <p>Seu pedido já foi registrado. Agora envie apenas o comprovante.</p>
          <p style="margin-bottom:24px"><strong>Pedido:</strong> <span id="pedidoInfo" style="color:#6aabff">Carregando...</span></p>
          <form id="formComprovante">
            <div class="field"><label>Anexar comprovante</label><input type="file" id="arquivo" accept="image/*" required></div>
            <button class="btn primary" type="submit" style="width:100%">Enviar comprovante</button>
          </form>
        </div>

      </div>
    </section>

    <section id="areaSucesso" style="display:none">
      <div class="confirm-card reveal" style="margin:60px auto">
        <div class="confirm-icon"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg></div>
        <span class="badge">PEDIDO EM ANÁLISE</span>
        <h1>Obrigado por apoiar a Lumina.</h1>
        <p>Seu pedido foi enviado para análise. Você receberá o link de download em até 10 horas.</p>
        <a href="minha-conta.html" class="btn primary">Ir para minha conta</a>
      </div>
    </section>

  </div>
</div>
<footer class="footer">
  <div class="footer-logo">LUMINA <span>INTERACTIVE</span>™</div>
  <div class="footer-links">
    <a href="index.html">Início</a><a href="patches.html">Patchs</a>
    <a href="downloads.html">Downloads</a><a href="plus.html">Lumina Plus</a>
    <a href="login.html" data-auth-link>Login</a>
  </div>
  <div class="footer-copy">© 2026 Lumina Interactive™. Todos os direitos reservados.</div>
</footer>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js"></script>
<script>
const supabaseClient=supabase.createClient("https://tqsalhscgkepttbczyjq.supabase.co","sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK");
const pedidoId=new URLSearchParams(window.location.search).get("pedido_id");
function copiarPix(){navigator.clipboard.writeText(document.getElementById("pixCode").innerText);alert("Pix copiado!");}
async function carregarPedido(){
  if(!pedidoId){document.getElementById("pedidoInfo").innerText="Pedido não encontrado.";return;}
  const {data,error}=await supabaseClient.from("pedidos").select("*").eq("id",pedidoId).single();
  document.getElementById("pedidoInfo").innerText=error?"Erro ao carregar pedido.":data.produto+" - "+data.nome_cliente;
}
document.addEventListener("DOMContentLoaded",()=>{
  carregarPedido();
  document.getElementById("formComprovante").addEventListener("submit",async(e)=>{
    e.preventDefault();
    const arquivo=document.getElementById("arquivo").files[0];
    if(!arquivo){alert("Selecione um comprovante.");return;}
    const nomeArquivo=Date.now()+"-"+arquivo.name;
    const {error:uploadError}=await supabaseClient.storage.from("comprovantes").upload(nomeArquivo,arquivo);
    if(uploadError){alert(uploadError.message);return;}
    const {data:urlData}=supabaseClient.storage.from("comprovantes").getPublicUrl(nomeArquivo);
    const {error}=await supabaseClient.from("pedidos").update({status:"pendente",comprovante_url:urlData.publicUrl}).eq("id",pedidoId);
    if(error){alert(error.message);return;}
    document.getElementById("areaPagamento").style.display="none";
    document.getElementById("areaSucesso").style.display="block";
    document.querySelector("#areaSucesso .reveal")?.classList.add("visible");
  });
});
</script>
<script>
const revealEls=document.querySelectorAll('.reveal');
const obs=new IntersectionObserver((e)=>{e.forEach((x,i)=>{if(x.isIntersecting){setTimeout(()=>x.target.classList.add('visible'),i*80);obs.unobserve(x.target);}});},{threshold:0.1});
revealEls.forEach(el=>obs.observe(el));
</script>
<script src="navbar-auth.js"></script>
</body>
</html>
