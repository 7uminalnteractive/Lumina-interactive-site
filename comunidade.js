/* ============================================================
   LUMINA INTERACTIVE™ — Comunidade
   Feed único estilo Instagram (curtir com duplo toque, salvar,
   comentários expandindo embaixo, hashtags), pesquisa por
   @ID/#hashtag com perfil público, mensagens privadas (DM)
   e edição do perfil da Comunidade (foto, nome, bio).
   ============================================================ */

const SUPABASE_URL = "https://tqsalhscgkepttbczyjq.supabase.co";
const SUPABASE_KEY = "sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let userSession = null;
let meuPerfil = null;          // { nome, id_online, foto_url, bio, banner_url }
let postsCache = [];           // último resultado carregado do feed
let dmCanal = null;
let dmConversaAtivaId = null;
let dmOutroUsuario = null;     // perfil da outra pessoa na conversa aberta
let dmMensagensCache = {};     // id -> mensagem (da conversa aberta), pra montar previews de resposta/menu
let dmRespondendoA = null;     // mensagem sendo respondida no momento
let dmImagemStagedFile = null; // arquivo de imagem escolhido, aguardando envio
let dmMenuMensagemAtual = null;// mensagem selecionada no menu de contexto (long-press/clique)
const DM_STICKERS = ["😂","❤️","🔥","👍","😢","😮","🎉","🙏","😎","💀","👏","🥶","🐊","⚽","🏆","💯"];
let novoBannerPerfilFile = null;
let segModalUsuarioId = null;  // de quem é a lista de seguidores/seguindo aberta no modal
let segModalAbaAtual = "seguidores";

/* ───────────────────────────────────────────
   INICIALIZAÇÃO
   ─────────────────────────────────────────── */
async function initComunidade() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    userSession = session;
    const { data: perfil, error: erroPerfil } = await supabaseClient
      .from("perfis").select("nome, id_online, foto_url, bio, verificado, banner_url").eq("id", session.user.id).maybeSingle();
    if (erroPerfil) console.error("Erro ao carregar perfil da Comunidade:", erroPerfil.message);
    meuPerfil = perfil || {};
    if (!meuPerfil.nome) meuPerfil.nome = session.user.user_metadata?.nome || session.user.email.split("@")[0];
    meuPerfil._planoPlus = await checarAssinantePlus(session.user.email);
  }

  montarComposer();
  configurarTabs();
  configurarArrastoTabs();
  configurarLightbox();
  configurarSubTabsConfig();

  carregarFeed();
  iniciarMensagens();
}

/* descobre o selo de verificado de um usuário: dourado (aprovado/comprado) tem prioridade sobre azul (assinante Plus) */
function seloDoPerfil(perfil) {
  if (perfil && perfil.verificado === "dourado") return "dourado";
  if (perfil && (perfil.verificado === "azul" || perfil._planoPlus)) return "azul";
  return null;
}

/* checa se o e-mail tem uma assinatura Lumina Plus ativa (mesmo critério usado em minha-conta.html) */
async function checarAssinantePlus(email) {
  if (!email) return false;
  const { data, error } = await supabaseClient.from("pedidos").select("*")
    .eq("email", email).ilike("produto", "%plus%").in("status", ["aprovado", "ativa"])
    .order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) { console.error("Erro ao checar assinatura Plus:", error.message); return false; }
  if (!data) return false;
  const val = data.validade_ate ? new Date(data.validade_ate) : (data.data_fim ? new Date(data.data_fim) : null);
  return !val || val > new Date();
}

/* gera o HTML do selo (svg estrela), dourado ou azul, do tamanho pedido */
function seloHtml(tipo, size) {
  if (!tipo) return "";
  size = size || 14;
  return `<span class="selo-verificado ${tipo}" title="${tipo === 'dourado' ? 'Lumina Verified+' : 'Assinante Lumina Plus'}">
    <svg width="${size}" height="${size}" viewBox="0 0 24 24"><path class="bg" d="M12 2l2.7 1.5 3 .3 1.5 2.7 2.3 2-1 2.9 1 2.9-2.3 2-1.5 2.7-3 .3L12 22l-2.7-1.5-3-.3-1.5-2.7-2.3-2 1-2.9-1-2.9 2.3-2 1.5-2.7 3-.3z"/>
    <path d="M8.5 12.2l2.3 2.3 4.7-5.4" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </span>`;
}

/* busca o selo de verificação de vários autores de uma vez (usado em feed, comentários, DM) */
async function buscarSelosDeAutores(idsAutores) {
  const mapa = {};
  const ids = [...new Set(idsAutores)].filter(Boolean);
  if (!ids.length) return mapa;

  const { data: perfis } = await supabaseClient.from("perfis").select("id, verificado, email").in("id", ids);
  if (!perfis) return mapa;

  for (const p of perfis) {
    if (p.verificado === "dourado") { mapa[p.id] = "dourado"; continue; }
    if (p.verificado === "azul") { mapa[p.id] = "azul"; continue; }
    if (p.email) {
      const ehPlus = await checarAssinantePlus(p.email);
      mapa[p.id] = ehPlus ? "azul" : null;
    } else {
      mapa[p.id] = null;
    }
  }
  return mapa;
}

/* ───────────────────────────────────────────
   ABAS (Feed / Pesquisar / Mensagens / Meu perfil)
   ─────────────────────────────────────────── */
function configurarTabs() {
  document.querySelectorAll(".com-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (tab.dataset.arrastou) { delete tab.dataset.arrastou; return; } // ignora clique se veio de um arrasto
      document.querySelectorAll(".com-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".com-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
      if (tab.dataset.tab === "perfil") carregarMeuPerfil();
    });
  });
}

/* permite arrastar a barra de abas horizontalmente com o mouse (touch já funciona nativamente) */
function configurarArrastoTabs() {
  const barra = document.getElementById("comTabs");
  if (!barra) return;

  let arrastando = false;
  let comecouEm = 0;
  let scrollInicial = 0;
  let moveuBastante = false;

  barra.addEventListener("mousedown", (e) => {
    arrastando = true;
    moveuBastante = false;
    comecouEm = e.pageX;
    scrollInicial = barra.scrollLeft;
    barra.classList.add("dragging");
  });

  window.addEventListener("mouseup", () => {
    if (!arrastando) return;
    arrastando = false;
    barra.classList.remove("dragging");
    if (moveuBastante) {
      // marca os botões pra ignorar o "click" disparado logo depois do arrasto
      barra.querySelectorAll(".com-tab").forEach((t) => { t.dataset.arrastou = "1"; });
    }
  });

  window.addEventListener("mousemove", (e) => {
    if (!arrastando) return;
    const delta = e.pageX - comecouEm;
    if (Math.abs(delta) > 5) moveuBastante = true;
    barra.scrollLeft = scrollInicial - delta;
  });
}

/* ───────────────────────────────────────────
   HELPERS
   ─────────────────────────────────────────── */
function avatarHtml(fotoUrl, size) {
  size = size || 42;
  if (fotoUrl) {
    return `<img class="com-avatar" style="width:${size}px;height:${size}px" src="${fotoUrl}" alt="">`;
  }
  return `<div class="com-avatar" style="width:${size}px;height:${size}px">
    <svg viewBox="0 0 24 24" width="${size * 0.48}" height="${size * 0.48}" fill="#6aabff"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
  </div>`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str || "";
  return div.innerHTML;
}

/* transforma #hashtags em links clicáveis (texto já deve estar com escapeHtml aplicado) */
function comHashtagsClicaveis(textoEscapado) {
  return textoEscapado.replace(/(#[\wÀ-ú]+)/g, (match) => {
    const tag = match.slice(1);
    return `<span class="com-hashtag" onclick="irParaHashtag('${tag.replace(/'/g, "")}')">${match}</span>`;
  });
}

/* extrai lista de hashtags (sem #) de um texto, em minúsculo, sem duplicatas */
function extrairHashtags(texto) {
  if (!texto) return [];
  const encontradas = texto.match(/#[\wÀ-ú]+/g) || [];
  return [...new Set(encontradas.map(h => h.slice(1).toLowerCase()))];
}

function tempoRelativo(dataIso) {
  const diff = (Date.now() - new Date(dataIso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return Math.floor(diff / 60) + "min";
  if (diff < 86400) return Math.floor(diff / 3600) + "h";
  if (diff < 604800) return Math.floor(diff / 86400) + "d";
  return new Date(dataIso).toLocaleDateString("pt-BR");
}

function tempoMaiusculo(dataIso) {
  const diff = (Date.now() - new Date(dataIso).getTime()) / 1000;
  if (diff < 60) return "agora mesmo";
  if (diff < 3600) return Math.floor(diff / 60) + " min atrás";
  if (diff < 86400) return Math.floor(diff / 3600) + " h atrás";
  if (diff < 604800) return Math.floor(diff / 86400) + " d atrás";
  return new Date(dataIso).toLocaleDateString("pt-BR");
}

/* ───────────────────────────────────────────
   COMPOSER (criar post)
   ─────────────────────────────────────────── */
function montarComposer() {
  const el = document.getElementById("composerFeed");

  if (!userSession) {
    el.innerHTML = `
      <div class="com-composer">
        <div class="com-locked">
          Entre na sua conta para publicar na comunidade.<br>
          <a href="login.html">Fazer login</a> ou <a href="registrar.html">criar conta grátis</a>.
        </div>
      </div>`;
    return;
  }

  el.innerHTML = `
    <div class="com-composer">
      <div class="com-composer-top">
        ${avatarHtml(meuPerfil.foto_url, 42)}
        <textarea id="texto-post" placeholder="Em que clube você tá? Use #hashtags pra organizar seu post..." rows="2"></textarea>
      </div>
      <div id="imgPreview-post" class="com-img-preview">
        <img id="imgPreviewSrc-post" src="">
        <div class="remove-img" onclick="removerImagemComposer()">✕</div>
      </div>
      <div class="com-composer-foot">
        <div class="com-composer-tools">
          <input type="file" id="imgInput-post" accept="image/*" style="display:none" onchange="previewImagemComposer()">
          <button type="button" class="com-tool-btn" onclick="document.getElementById('imgInput-post').click()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
            Foto
          </button>
        </div>
        <button class="btn primary" id="btnPublicar-post" onclick="publicarPost()" style="padding:10px 22px;font-size:14px">Publicar</button>
      </div>
    </div>`;
}

let _postImgBlob = null; // blob editado do post, usado no publicarPost

function previewImagemComposer() {
  const file = document.getElementById("imgInput-post").files[0];
  if (!file) return;
  abrirEditor(file, (blob) => {
    _postImgBlob = blob;
    const url = URL.createObjectURL(blob);
    document.getElementById("imgPreviewSrc-post").src = url;
    document.getElementById("imgPreview-post").style.display = "block";
  });
}
function removerImagemComposer() {
  _postImgBlob = null;
  document.getElementById("imgInput-post").value = "";
  document.getElementById("imgPreview-post").style.display = "none";
}

async function publicarPost() {
  const textoEl = document.getElementById("texto-post");
  const texto = textoEl.value.trim();
  const btn = document.getElementById("btnPublicar-post");
  const temImagem = _postImgBlob || document.getElementById("imgInput-post").files[0];

  if (!texto && !temImagem) { mostrarToast("Escreva algo ou adicione uma imagem."); return; }

  btn.textContent = "Publicando..."; btn.disabled = true;

  let imgUrl = null;
  try {
    const fileInput = document.getElementById("imgInput-post");
    const blob = _postImgBlob || fileInput.files[0];
    if (blob) {
      const nomeArq = `posts/${userSession.user.id}-${Date.now()}.jpg`;
      const { error: upErr } = await supabaseClient.storage.from("comunidade").upload(nomeArq, blob, { contentType: "image/jpeg" });
      if (upErr) throw upErr;
      const { data: urlData } = supabaseClient.storage.from("comunidade").getPublicUrl(nomeArq);
      imgUrl = urlData.publicUrl;
    }

    const { error } = await supabaseClient.from("comunidade_posts").insert([{
      autor_id: userSession.user.id,
      autor_nome: meuPerfil.nome || "Jogador",
      autor_id_online: meuPerfil.id_online || null,
      autor_foto: meuPerfil.foto_url || null,
      texto: texto || null,
      imagem_url: imgUrl,
      hashtags: extrairHashtags(texto)
    }]);
    if (error) throw error;

    textoEl.value = "";
    removerImagemComposer();
    mostrarToast("Publicado com sucesso!");
    carregarFeed();
  } catch (err) {
    mostrarToast("Erro ao publicar: " + (err.message || "tente novamente"));
  }

  btn.textContent = "Publicar"; btn.disabled = false;
}

/* ───────────────────────────────────────────
   FEED ÚNICO
   ─────────────────────────────────────────── */
async function carregarFeed() {
  const { data: posts, error } = await supabaseClient
    .from("comunidade_posts")
    .select("*")
    .order("criado_em", { ascending: false })
    .limit(80);

  if (error || !posts) { postsCache = []; renderizarFeed(); return; }

  // curtidas e salvos do usuário logado
  let curtidos = new Set();
  let salvos = new Set();
  if (userSession && posts.length) {
    const ids = posts.map(p => p.id);
    const { data: curtidasData } = await supabaseClient
      .from("comunidade_curtidas").select("post_id").eq("usuario_id", userSession.user.id).in("post_id", ids);
    (curtidasData || []).forEach(c => curtidos.add(c.post_id));

    const { data: salvosData } = await supabaseClient
      .from("comunidade_salvos").select("post_id").eq("usuario_id", userSession.user.id).in("post_id", ids);
    (salvosData || []).forEach(s => salvos.add(s.post_id));
  }

  postsCache = posts.map(p => ({ ...p, _curtiu: curtidos.has(p.id), _salvou: salvos.has(p.id) }));

  const selos = await buscarSelosDeAutores(posts.map(p => p.autor_id));
  postsCache = postsCache.map(p => ({ ...p, _selo: selos[p.autor_id] || null }));

  renderizarFeed();
}

function renderizarFeed() {
  const lista = document.getElementById("listaFeed");

  if (!postsCache.length) {
    lista.innerHTML = estadoVazio();
    return;
  }

  lista.innerHTML = postsCache.map(p => renderPost(p)).join("");

  postsCache.forEach(p => {
    atualizarContadores(p.id);
    configurarDoubleTap(p.id);
    observarVisualizacaoPost(p.id);
  });
}

function estadoVazio() {
  return `<div class="com-empty">
    <svg width="56" height="56" viewBox="0 0 24 24" fill="#6aabff"><path d="M4 4h16v2H4V4zm0 7h16v2H4v-2zm0 7h16v2H4v-2z"/></svg>
    <div class="com-empty-title">O feed está vazio</div>
    <div class="com-empty-text">Publique o primeiro post da comunidade!</div>
  </div>`;
}

function renderPost(p) {
  const nomeId = p.autor_id_online ? `<span class="com-post-id">@${escapeHtml(p.autor_id_online)}</span>` : "";
  const podeExcluir = userSession && userSession.user.id === p.autor_id;
  const jaCurtiu = p._curtiu;
  const jaSalvou = p._salvou;
  const textoComHashtags = comHashtagsClicaveis(escapeHtml(p.texto || ""));
  const seloAutor = seloHtml(p._selo, 14);

  const midiaHtml = p.imagem_url
    ? `<div class="com-post-img" id="img-${p.id}">
         <img src="${p.imagem_url}" alt="imagem do post">
         <svg class="com-heart-burst" id="burst-${p.id}" width="90" height="90" viewBox="0 0 24 24" fill="#fff"><path d="M12 21s-7.5-4.6-10-9.3C.5 8.4 2.3 5 5.6 5c2 0 3.4 1.1 4.4 2.6C11 6.1 12.4 5 14.4 5c3.3 0 5.1 3.4 3.6 6.7C19.5 16.4 12 21 12 21z"/></svg>
       </div>`
    : `<div class="com-post-textcard" id="img-${p.id}">
         <p>${textoComHashtags}</p>
         <svg class="com-heart-burst" id="burst-${p.id}" width="90" height="90" viewBox="0 0 24 24" fill="#fff"><path d="M12 21s-7.5-4.6-10-9.3C.5 8.4 2.3 5 5.6 5c2 0 3.4 1.1 4.4 2.6C11 6.1 12.4 5 14.4 5c3.3 0 5.1 3.4 3.6 6.7C19.5 16.4 12 21 12 21z"/></svg>
       </div>`;

  // se tem imagem, a legenda some embaixo; se não tem imagem, o texto já está na "capa" e não repetimos
  const legendaHtml = (p.imagem_url && p.texto)
    ? `<div class="com-post-caption"><span class="who">${escapeHtml(p.autor_nome)}${seloAutor}</span>${textoComHashtags}</div>`
    : "";

  return `
  <div class="com-post" id="post-${p.id}">
    <div class="com-post-head" onclick='abrirPerfilPublico("${p.autor_id}")' style="cursor:pointer">
      ${avatarHtml(p.autor_foto, 38)}
      <div class="com-post-meta">
        <div class="com-post-name">${escapeHtml(p.autor_nome)}${seloAutor} ${nomeId}</div>
        <div class="com-post-time">${tempoRelativo(p.criado_em)}</div>
      </div>
    </div>

    ${midiaHtml}

    <div class="com-post-actions">
      <button class="com-action-btn ${jaCurtiu ? "liked" : ""}" id="btnLike-${p.id}" onclick="curtirPost(${p.id})">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="${jaCurtiu ? "#ff4d6d" : "none"}" stroke="currentColor" stroke-width="2"><path d="M12 21s-7.5-4.6-10-9.3C.5 8.4 2.3 5 5.6 5c2 0 3.4 1.1 4.4 2.6C11 6.1 12.4 5 14.4 5c3.3 0 5.1 3.4 3.6 6.7C19.5 16.4 12 21 12 21z"/></svg>
      </button>
      <button class="com-action-btn" onclick="toggleComentarios(${p.id})">
        <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z"/></svg>
      </button>
      <button class="com-action-btn" onclick="compartilharPost(${p.id})">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 21l21-9L2 3v7l15 2-15 2v7z"/></svg>
      </button>
      <button class="com-action-btn ${jaSalvou ? "saved" : ""}" id="btnSave-${p.id}" onclick="salvarPost(${p.id})" style="margin-left:auto">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="${jaSalvou ? "#6aabff" : "none"}" stroke="currentColor" stroke-width="2"><path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4-7 4V5a1 1 0 0 1 1-1z"/></svg>
      </button>
      ${podeExcluir ? `
      <button class="com-action-btn delete" onclick="excluirPost(${p.id})">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>` : ""}
    </div>

    <div class="com-post-likes" id="likesText-${p.id}">0 curtidas</div>
    ${legendaHtml}
    <button class="com-post-viewcomments" id="viewComments-${p.id}" onclick="toggleComentarios(${p.id})">Ver comentários</button>
    <div class="com-post-time-bottom">${tempoMaiusculo(p.criado_em)}</div>

    <div class="com-comments" id="comments-${p.id}">
      <div class="com-comments-divider"></div>
      <div id="commentsList-${p.id}"></div>
      ${userSession ? `
      <div class="com-comment-form">
        <input type="text" id="commentInput-${p.id}" placeholder="Adicione um comentário..." maxlength="400"
               oninput="document.getElementById('commentSend-${p.id}').classList.toggle('active', this.value.trim().length>0)"
               onkeydown="if(event.key==='Enter'){enviarComentario(${p.id})}">
        <button class="com-comment-send" id="commentSend-${p.id}" onclick="enviarComentario(${p.id})">Publicar</button>
      </div>` : `<div style="font-size:12.5px;color:var(--muted);text-align:center;padding:8px 0">Entre para comentar.</div>`}
    </div>
  </div>`;
}

async function atualizarContadores(postId) {
  const { count: likes } = await supabaseClient.from("comunidade_curtidas").select("*", { count: "exact", head: true }).eq("post_id", postId);
  const { count: comentarios } = await supabaseClient.from("comunidade_comentarios").select("*", { count: "exact", head: true }).eq("post_id", postId);

  const likesEl = document.getElementById(`likesText-${postId}`);
  if (likesEl) {
    const n = likes || 0;
    likesEl.textContent = n === 0 ? "Seja o primeiro a curtir" : (n === 1 ? "1 curtida" : `${n} curtidas`);
  }
  const viewEl = document.getElementById(`viewComments-${postId}`);
  if (viewEl) {
    const n = comentarios || 0;
    viewEl.textContent = n === 0 ? "Comentar" : `Ver ${n === 1 ? "1 comentário" : n + " comentários"}`;
  }
}

/* curtir/descurtir (botão) */
async function curtirPost(postId) {
  if (!userSession) { mostrarToast("Entre na sua conta para curtir."); return; }
  const btn = document.getElementById(`btnLike-${postId}`);
  const jaCurtiu = btn.classList.contains("liked");

  if (jaCurtiu) {
    await supabaseClient.from("comunidade_curtidas").delete().eq("post_id", postId).eq("usuario_id", userSession.user.id);
    btn.classList.remove("liked");
    btn.querySelector("svg").setAttribute("fill", "none");
  } else {
    await supabaseClient.from("comunidade_curtidas").insert([{ post_id: postId, usuario_id: userSession.user.id }]);
    btn.classList.add("liked");
    btn.querySelector("svg").setAttribute("fill", "#ff4d6d");
  }
  atualizarContadores(postId);
}

/* duplo toque na imagem/capa pra curtir, com animação de coração */
function configurarDoubleTap(postId) {
  const area = document.getElementById(`img-${postId}`);
  if (!area) return;
  let ultimoToque = 0;

  area.addEventListener("click", async () => {
    const agora = Date.now();
    if (agora - ultimoToque < 350) {
      // duplo toque detectado
      dispararCoracao(postId);
      const btn = document.getElementById(`btnLike-${postId}`);
      if (!userSession) { mostrarToast("Entre na sua conta para curtir."); return; }
      if (!btn.classList.contains("liked")) {
        await supabaseClient.from("comunidade_curtidas").insert([{ post_id: postId, usuario_id: userSession.user.id }]);
        btn.classList.add("liked");
        btn.querySelector("svg").setAttribute("fill", "#ff4d6d");
        atualizarContadores(postId);
      }
    }
    ultimoToque = agora;
  });
}

function dispararCoracao(postId) {
  const burst = document.getElementById(`burst-${postId}`);
  if (!burst) return;
  burst.classList.remove("animate");
  // força reflow pra poder re-disparar a animação em toques seguidos
  void burst.offsetWidth;
  burst.classList.add("animate");
}

/* registra "visto" quando o post aparece na tela por pelo menos 1s, uma vez por usuário/post */
const postsJaVistos = new Set();
function observarVisualizacaoPost(postId) {
  if (!userSession || postsJaVistos.has(postId)) return;
  const el = document.getElementById(`post-${postId}`);
  if (!el) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        setTimeout(async () => {
          if (!postsJaVistos.has(postId)) {
            postsJaVistos.add(postId);
            await supabaseClient.from("comunidade_visualizacoes")
              .upsert([{ post_id: postId, usuario_id: userSession.user.id }], { onConflict: "post_id,usuario_id" });
          }
          observer.disconnect();
        }, 1000);
      }
    });
  }, { threshold: 0.5 });

  observer.observe(el);
}

/* registra visualização de perfil (uma vez por usuário/perfil visitado) */
const perfisJaVistos = new Set();
async function registrarVisualizacaoPerfil(perfilId) {
  if (!userSession || userSession.user.id === perfilId || perfisJaVistos.has(perfilId)) return;
  perfisJaVistos.add(perfilId);
  await supabaseClient.from("comunidade_visualizacoes")
    .upsert([{ perfil_id: perfilId, usuario_id: userSession.user.id }], { onConflict: "perfil_id,usuario_id" });
}

/* salvar (estilo IG, só local de coleção pessoal) */
async function salvarPost(postId) {
  if (!userSession) { mostrarToast("Entre na sua conta para salvar."); return; }
  const btn = document.getElementById(`btnSave-${postId}`);
  const jaSalvou = btn.classList.contains("saved");

  if (jaSalvou) {
    await supabaseClient.from("comunidade_salvos").delete().eq("post_id", postId).eq("usuario_id", userSession.user.id);
    btn.classList.remove("saved");
    btn.querySelector("svg").setAttribute("fill", "none");
  } else {
    await supabaseClient.from("comunidade_salvos").insert([{ post_id: postId, usuario_id: userSession.user.id }]);
    btn.classList.add("saved");
    btn.querySelector("svg").setAttribute("fill", "#6aabff");
    mostrarToast("Post salvo.");
  }
}

async function compartilharPost(postId) {
  const url = `${window.location.origin}${window.location.pathname}#post-${postId}`;
  if (navigator.share) {
    navigator.share({ title: "Comunidade Lumina Interactive", url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
    mostrarToast("Link copiado!");
  }
  if (userSession) {
    await supabaseClient.from("comunidade_compartilhamentos").insert([{ post_id: postId, usuario_id: userSession.user.id }]);
  }
}

async function excluirPost(postId) {
  if (!confirm("Excluir esta publicação?")) return;
  await supabaseClient.from("comunidade_comentarios").delete().eq("post_id", postId);
  await supabaseClient.from("comunidade_curtidas").delete().eq("post_id", postId);
  await supabaseClient.from("comunidade_salvos").delete().eq("post_id", postId);
  const { error } = await supabaseClient.from("comunidade_posts").delete().eq("id", postId);
  if (error) { mostrarToast("Erro ao excluir: " + error.message); return; }
  postsCache = postsCache.filter(p => p.id !== postId);
  renderizarFeed();
  mostrarToast("Publicação excluída.");
}

/* ───────────────────────────────────────────
   COMENTÁRIOS (expandindo embaixo do post)
   ─────────────────────────────────────────── */
async function toggleComentarios(postId) {
  const el = document.getElementById(`comments-${postId}`);
  const abrindo = !el.classList.contains("open");
  el.classList.toggle("open");
  if (abrindo) await carregarComentarios(postId);
}

async function carregarComentarios(postId) {
  const lista = document.getElementById(`commentsList-${postId}`);
  lista.innerHTML = `<div style="font-size:12.5px;color:var(--muted);padding:6px 0">Carregando...</div>`;

  const { data, error } = await supabaseClient
    .from("comunidade_comentarios").select("*").eq("post_id", postId).order("criado_em", { ascending: true });

  if (error || !data || !data.length) {
    lista.innerHTML = `<div style="font-size:12.5px;color:var(--muted);padding:6px 0">Nenhum comentário ainda.</div>`;
    return;
  }

  const selos = await buscarSelosDeAutores(data.map(c => c.autor_id));

  lista.innerHTML = data.map(c => `
    <div class="com-comment">
      ${avatarHtml(c.autor_foto, 30)}
      <div class="com-comment-bubble">
        <span class="com-comment-name">${escapeHtml(c.autor_nome)}${seloHtml(selos[c.autor_id], 12)} ${c.autor_id_online ? `<span class="com-comment-id">@${escapeHtml(c.autor_id_online)}</span>` : ""}</span>
        <div class="com-comment-text">${escapeHtml(c.texto)}</div>
        <div class="com-comment-time">${tempoRelativo(c.criado_em)}</div>
      </div>
    </div>
  `).join("");
}

async function enviarComentario(postId) {
  if (!userSession) { mostrarToast("Entre na sua conta para comentar."); return; }
  const input = document.getElementById(`commentInput-${postId}`);
  const texto = input.value.trim();
  if (!texto) return;

  input.value = "";
  const sendBtn = document.getElementById(`commentSend-${postId}`);
  if (sendBtn) sendBtn.classList.remove("active");

  const { error } = await supabaseClient.from("comunidade_comentarios").insert([{
    post_id: postId,
    autor_id: userSession.user.id,
    autor_nome: meuPerfil.nome || "Jogador",
    autor_id_online: meuPerfil.id_online || null,
    autor_foto: meuPerfil.foto_url || null,
    texto: texto
  }]);
  if (error) { mostrarToast("Erro ao comentar: " + error.message); return; }

  await carregarComentarios(postId);
  atualizarContadores(postId);
}

/* ───────────────────────────────────────────
   MENSAGENS PRIVADAS (DM) — busca por @ID,
   lista de conversas e thread 1-a-1 em tempo real
   ─────────────────────────────────────────── */
async function iniciarMensagens() {
  if (!userSession) {
    document.getElementById("dmConversasList").innerHTML = `
      <div class="com-locked">
        Entre na sua conta pra mandar mensagem pra outros jogadores.<br>
        <a href="login.html">Fazer login</a> ou <a href="registrar.html">criar conta grátis</a>.
      </div>`;
    return;
  }
  await carregarConversasDm();

  document.getElementById("dmForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await enviarMensagemDm();
  });
}

/* busca por @ID em tempo real conforme digita */
let dmBuscaTimeout = null;
function buscarUsuarioPorId() {
  clearTimeout(dmBuscaTimeout);
  const termo = document.getElementById("dmSearchInput").value.trim().toLowerCase().replace(/^@/, "");
  const resultsEl = document.getElementById("dmSearchResults");

  if (!termo) { resultsEl.classList.remove("open"); resultsEl.innerHTML = ""; return; }

  dmBuscaTimeout = setTimeout(async () => {
    const { data, error } = await supabaseClient
      .from("perfis").select("id, nome, id_online, foto_url")
      .ilike("id_online", `%${termo}%`)
      .limit(8);

    if (error || !data || !data.length) {
      resultsEl.classList.add("open");
      resultsEl.innerHTML = `<div style="padding:14px;font-size:13px;color:var(--muted);text-align:center">Nenhum jogador encontrado.</div>`;
      return;
    }

    const resultados = data.filter(u => u.id !== userSession.user.id);
    if (!resultados.length) {
      resultsEl.classList.add("open");
      resultsEl.innerHTML = `<div style="padding:14px;font-size:13px;color:var(--muted);text-align:center">Nenhum jogador encontrado.</div>`;
      return;
    }

    resultsEl.classList.add("open");
    resultsEl.innerHTML = resultados.map(u => `
      <div class="dm-search-item" onclick='abrirOuCriarConversa(${JSON.stringify(u).replace(/'/g, "&apos;")})'>
        ${avatarHtml(u.foto_url, 38)}
        <div>
          <div class="dm-search-item-name">${escapeHtml(u.nome || "Jogador")}</div>
          <div class="dm-search-item-id">@${escapeHtml(u.id_online || "")}</div>
        </div>
      </div>
    `).join("");
  }, 300);
}

/* identifica conversa existente entre eu e outroId, ou cria uma nova */
async function abrirOuCriarConversa(outroPerfil) {
  document.getElementById("dmSearchInput").value = "";
  document.getElementById("dmSearchResults").classList.remove("open");
  document.getElementById("dmSearchResults").innerHTML = "";

  const meuId = userSession.user.id;
  const outroId = outroPerfil.id;
  const a = meuId < outroId ? meuId : outroId;
  const b = meuId < outroId ? outroId : meuId;

  let { data: conversa } = await supabaseClient
    .from("comunidade_conversas").select("*").eq("usuario_a", a).eq("usuario_b", b).maybeSingle();

  if (!conversa) {
    const { data: nova, error } = await supabaseClient
      .from("comunidade_conversas").insert([{ usuario_a: a, usuario_b: b }]).select().single();
    if (error) { mostrarToast("Erro ao iniciar conversa: " + error.message); return; }
    conversa = nova;
  }

  abrirThreadDm(conversa.id, outroPerfil);
}

async function carregarConversasDm() {
  const lista = document.getElementById("dmConversasList");
  lista.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px 0">Carregando conversas...</div>`;

  const meuId = userSession.user.id;
  const { data: conversas, error } = await supabaseClient
    .from("comunidade_conversas").select("*")
    .or(`usuario_a.eq.${meuId},usuario_b.eq.${meuId}`)
    .order("ultima_msg_em", { ascending: false, nullsFirst: false });

  if (error || !conversas || !conversas.length) {
    lista.innerHTML = `<div class="com-empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#6aabff" stroke-width="1.5"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
      <div class="com-empty-title">Nenhuma conversa ainda</div>
      <div class="com-empty-text">Busque um jogador pelo @ID acima pra começar a conversar.</div>
    </div>`;
    return;
  }

  const outrosIds = conversas.map(c => c.usuario_a === meuId ? c.usuario_b : c.usuario_a);
  const { data: perfis } = await supabaseClient.from("perfis").select("id, nome, id_online, foto_url").in("id", outrosIds);
  const perfilPorId = {};
  (perfis || []).forEach(p => perfilPorId[p.id] = p);
  const selos = await buscarSelosDeAutores(outrosIds);

  lista.innerHTML = conversas.map(c => {
    const outroId = c.usuario_a === meuId ? c.usuario_b : c.usuario_a;
    const outro = perfilPorId[outroId] || { nome: "Jogador" };
    const preview = (c.ultima_msg_texto && c.ultima_msg_texto.trim()) ? escapeHtml(c.ultima_msg_texto) : "";
    const tempo = c.ultima_msg_em ? tempoRelativo(c.ultima_msg_em) : "";
    return `<div class="dm-list-item" onclick='abrirThreadDm(${c.id}, ${JSON.stringify(outro).replace(/'/g, "&apos;")})'>
      ${avatarHtml(outro.foto_url, 44)}
      <div class="dm-list-item-info">
        <div class="dm-list-item-name">${escapeHtml(outro.nome || "Jogador")}${seloHtml(selos[outroId], 13)}${outro.id_online ? ` <span style="color:var(--blue);font-weight:600">@${escapeHtml(outro.id_online)}</span>` : ""}</div>
        <div class="dm-list-item-preview">${preview}</div>
      </div>
      <div class="dm-list-item-time">${tempo}</div>
    </div>`;
  }).join("");
}

async function abrirThreadDm(conversaId, outroPerfil) {
  dmConversaAtivaId = conversaId;
  dmOutroUsuario = outroPerfil;
  dmMensagensCache = {};
  cancelarResposta();
  cancelarImagemStaged();

  // garante que a aba "Mensagens" fique visível, mesmo se chamada de outra aba (ex: perfil público)
  document.querySelectorAll(".com-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "mensagens"));
  document.querySelectorAll(".com-panel").forEach((p) => p.classList.toggle("active", p.id === "panel-mensagens"));

  document.getElementById("dmTelaLista").style.display = "none";
  document.getElementById("dmTelaThread").style.display = "block";
  document.getElementById("dmThreadAvatar").innerHTML = avatarHtml(outroPerfil.foto_url, 36);
  document.getElementById("dmThreadNome").innerHTML = `${escapeHtml(outroPerfil.nome || "Jogador")}`;
  document.getElementById("dmThreadId").textContent = outroPerfil.id_online ? "@" + outroPerfil.id_online : "";

  buscarSelosDeAutores([outroPerfil.id]).then((selos) => {
    const tipo = selos[outroPerfil.id];
    if (tipo) document.getElementById("dmThreadNome").innerHTML += seloHtml(tipo, 14);
  });

  const msgsEl = document.getElementById("dmThreadMsgs");
  msgsEl.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0">Carregando mensagens...</div>`;

  const { data: mensagens, error } = await supabaseClient
    .from("comunidade_mensagens_dm").select("*").eq("conversa_id", conversaId).order("criado_em", { ascending: true });

  if (error) { msgsEl.innerHTML = `<div style="text-align:center;color:#ef4444;font-size:13px;padding:20px 0">Erro ao carregar.</div>`; return; }

  // ignora, no cliente, as mensagens que eu já apaguei "só pra mim"
  let ocultasIds = new Set();
  if (userSession) {
    const { data: ocultas } = await supabaseClient
      .from("comunidade_mensagens_dm_ocultas").select("mensagem_id").eq("usuario_id", userSession.user.id);
    (ocultas || []).forEach(o => ocultasIds.add(o.mensagem_id));
  }

  msgsEl.innerHTML = "";
  (mensagens || []).filter(m => !ocultasIds.has(m.id) && !m.apagada_para_todos).forEach(m => adicionarMensagemDm(m));
  scrollDmParaFim();

  // realtime: escuta novas mensagens e atualizações (ex: apagada-pra-todos) desta conversa
  if (dmCanal) supabaseClient.removeChannel(dmCanal);
  dmCanal = supabaseClient
    .channel(`dm_conversa_${conversaId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "comunidade_mensagens_dm", filter: `conversa_id=eq.${conversaId}` }, (payload) => {
      if (ocultasIds.has(payload.new.id)) return;
      adicionarMensagemDm(payload.new);
      scrollDmParaFim();
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "comunidade_mensagens_dm", filter: `conversa_id=eq.${conversaId}` }, (payload) => {
      atualizarMensagemDmNaTela(payload.new);
    })
    .subscribe();
}

/* clique no nome/avatar do header da thread de DM -> abre o perfil público da pessoa */
function abrirPerfilDaThreadDm() {
  if (!dmOutroUsuario || !dmOutroUsuario.id) return;
  document.querySelectorAll(".com-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "pesquisar"));
  document.querySelectorAll(".com-panel").forEach((p) => p.classList.toggle("active", p.id === "panel-pesquisar"));
  document.getElementById("buscaTelaResultados").style.display = "none";
  document.getElementById("buscaTelaPerfil").style.display = "block";
  abrirPerfilPublico(dmOutroUsuario.id);
}

function voltarParaListaDm() {
  document.getElementById("dmTelaThread").style.display = "none";
  document.getElementById("dmTelaLista").style.display = "block";
  if (dmCanal) { supabaseClient.removeChannel(dmCanal); dmCanal = null; }
  dmConversaAtivaId = null;
  carregarConversasDm();
}

/* monta o conteúdo (texto, imagem, sticker e preview de resposta) de uma bolha de mensagem */
function montarConteudoBolhaDm(m) {
  if (m.apagada_para_todos) {
    return `<div class="dm-text">Mensagem apagada</div>`;
  }

  let html = "";

  if (m.resposta_a && dmMensagensCache[m.resposta_a]) {
    const ref = dmMensagensCache[m.resposta_a];
    const minhaRef = ref.autor_id === userSession.user.id;
    const nomeRef = minhaRef ? "Você" : (dmOutroUsuario?.nome || "Jogador");
    let previewTexto = ref.apagada_para_todos ? "Mensagem apagada" : (ref.texto || (ref.imagem_url ? "📷 Foto" : ref.sticker_url ? "Figurinha" : ""));
    html += `<div class="dm-reply-preview">
      <div class="dm-reply-preview-name">${escapeHtml(nomeRef)}</div>
      <div class="dm-reply-preview-text">${escapeHtml(previewTexto)}</div>
    </div>`;
  }

  if (m.sticker_url) {
    html += `<img class="dm-msg-sticker" src="${m.sticker_url}" alt="figurinha">`;
  } else if (m.imagem_url) {
    html += `<img class="dm-msg-img" src="${m.imagem_url}" alt="imagem" onclick="event.stopPropagation();abrirLightbox('${m.imagem_url}')">`;
  }

  if (m.texto) {
    html += `<div class="dm-text">${escapeHtml(m.texto)}</div>`;
  }

  return html;
}

function adicionarMensagemDm(m) {
  dmMensagensCache[m.id] = m;
  const msgsEl = document.getElementById("dmThreadMsgs");
  const minha = m.autor_id === userSession.user.id;
  const div = document.createElement("div");
  div.className = "dm-msg" + (minha ? " mine" : "") + (m.apagada_para_todos ? " apagada" : "");
  div.id = `dm-msg-${m.id}`;
  const bubbleOnClick = m.apagada_para_todos ? "" : `onclick='abrirMenuMensagem(${m.id})'`;
  div.innerHTML = `<div class="dm-bubble" ${bubbleOnClick}>${montarConteudoBolhaDm(m)}</div>`;
  msgsEl.appendChild(div);
}

/* re-renderiza uma mensagem já existente na tela (ex: depois de ser apagada pra todos via realtime) */
function atualizarMensagemDmNaTela(m) {
  dmMensagensCache[m.id] = m;
  const div = document.getElementById(`dm-msg-${m.id}`);
  if (!div) return;
  // se foi apagada pra todos, some da tela completamente
  if (m.apagada_para_todos) {
    div.remove();
    return;
  }
  const bubble = div.querySelector(".dm-bubble");
  bubble.innerHTML = montarConteudoBolhaDm(m);
  bubble.setAttribute("onclick", `abrirMenuMensagem(${m.id})`);
}

function scrollDmParaFim() {
  const msgsEl = document.getElementById("dmThreadMsgs");
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

/* ── responder mensagem ── */
function abrirMenuMensagem(mensagemId) {
  const m = dmMensagensCache[mensagemId];
  if (!m) return;
  dmMenuMensagemAtual = m;

  const minha = m.autor_id === userSession.user.id;

  // verifica se a mensagem tem menos de 1 hora (pra permitir apagar pra todos)
  const criadoEm = m.criado_em ? new Date(m.criado_em) : null;
  const dentroDaJanela = criadoEm && (Date.now() - criadoEm.getTime()) < 60 * 60 * 1000;
  const podeApagarParaTodos = minha && dentroDaJanela;

  const preview = document.getElementById("dmMsgMenuPreview");
  preview.textContent = m.texto || (m.imagem_url ? "📷 Foto" : m.sticker_url ? "Figurinha" : "");
  preview.style.display = preview.textContent ? "block" : "none";

  // "apagar pra todos" só aparece se for minha e dentro de 1h
  document.getElementById("dmMsgMenuApagarTodos").style.display = podeApagarParaTodos ? "flex" : "none";

  document.getElementById("dmMsgMenuOverlay").classList.add("open");
}

function fecharMenuMensagem() {
  document.getElementById("dmMsgMenuOverlay").classList.remove("open");
}

function responderMensagemAtual() {
  if (!dmMenuMensagemAtual) return;
  dmRespondendoA = dmMenuMensagemAtual;
  const minha = dmRespondendoA.autor_id === userSession.user.id;
  document.getElementById("dmReplyBarNome").textContent = minha ? "Você" : (dmOutroUsuario?.nome || "Jogador");
  document.getElementById("dmReplyBarTexto").textContent =
    dmRespondendoA.texto || (dmRespondendoA.imagem_url ? "📷 Foto" : dmRespondendoA.sticker_url ? "Figurinha" : "");
  document.getElementById("dmReplyBar").classList.add("open");
  fecharMenuMensagem();
  document.getElementById("dmInput").focus();
}

function cancelarResposta() {
  dmRespondendoA = null;
  const bar = document.getElementById("dmReplyBar");
  if (bar) bar.classList.remove("open");
}

/* ── apagar mensagem (pra mim ou pra todos) ── */
async function apagarMensagemAtual(paraTodos) {
  const m = dmMenuMensagemAtual;
  fecharMenuMensagem();
  if (!m) return;

  if (paraTodos) {
    if (!confirm("Apagar esta mensagem para todos? Essa ação não pode ser desfeita.")) return;
    const { error } = await supabaseClient
      .from("comunidade_mensagens_dm")
      .update({ apagada_para_todos: true, texto: null, imagem_url: null, sticker_url: null })
      .eq("id", m.id);
    if (error) { mostrarToast("Erro ao apagar: " + error.message); return; }

    // atualiza preview da lista (busca a msg mais recente ainda visível, cobrindo null e false)
    const { data: ultima } = await supabaseClient
      .from("comunidade_mensagens_dm")
      .select("id, texto, imagem_url, sticker_url")
      .eq("conversa_id", dmConversaAtivaId)
      .or("apagada_para_todos.is.null,apagada_para_todos.eq.false")
      .order("criado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    const novoPreview = ultima
      ? (ultima.texto || (ultima.imagem_url ? "📷 Foto" : ultima.sticker_url ? "Figurinha" : ""))
      : "";
    await supabaseClient.from("comunidade_conversas")
      .update({ ultima_msg_texto: novoPreview || null })
      .eq("id", dmConversaAtivaId);

    const atualizada = { ...m, apagada_para_todos: true, texto: null, imagem_url: null, sticker_url: null };
    atualizarMensagemDmNaTela(atualizada);
    mostrarToast("Mensagem apagada para todos.");
  } else {
    const { error } = await supabaseClient
      .from("comunidade_mensagens_dm_ocultas")
      .insert([{ mensagem_id: m.id, usuario_id: userSession.user.id }]);
    if (error) { mostrarToast("Erro ao apagar: " + error.message); return; }
    const div = document.getElementById(`dm-msg-${m.id}`);
    if (div) div.remove();
    mostrarToast("Mensagem apagada pra você.");
  }
}

/* ── encaminhar mensagem ── */
async function abrirEncaminharMensagemAtual() {
  const m = dmMenuMensagemAtual;
  fecharMenuMensagem();
  if (!m) return;
  dmMenuMensagemAtual = m; // mantém referência pro confirmarEncaminhar

  const lista = document.getElementById("dmForwardList");
  lista.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:24px 0">Carregando conversas...</div>`;
  document.getElementById("dmForwardOverlay").classList.add("open");
  document.getElementById("dmForwardEnviarBtn").disabled = true;

  const meuId = userSession.user.id;
  const { data: conversas } = await supabaseClient
    .from("comunidade_conversas").select("*").or(`usuario_a.eq.${meuId},usuario_b.eq.${meuId}`)
    .order("ultima_msg_em", { ascending: false, nullsFirst: false });

  if (!conversas || !conversas.length) {
    lista.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:24px 0">Você ainda não tem conversas pra encaminhar.</div>`;
    return;
  }

  const outrosIds = conversas.map(c => c.usuario_a === meuId ? c.usuario_b : c.usuario_a);
  const { data: perfis } = await supabaseClient.from("perfis").select("id, nome, id_online, foto_url").in("id", outrosIds);
  const perfilPorId = {};
  (perfis || []).forEach(p => perfilPorId[p.id] = p);

  lista.innerHTML = conversas.map(c => {
    const outroId = c.usuario_a === meuId ? c.usuario_b : c.usuario_a;
    const outro = perfilPorId[outroId] || { nome: "Jogador" };
    return `<div class="dm-forward-item" data-conversa-id="${c.id}" data-outro='${JSON.stringify(outro).replace(/'/g, "&apos;")}' onclick="toggleSelecaoEncaminhar(this)">
      ${avatarHtml(outro.foto_url, 38)}
      <div class="dm-forward-item-name">${escapeHtml(outro.nome || "Jogador")}</div>
      <svg class="dm-forward-item-check" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
    </div>`;
  }).join("");
}

function toggleSelecaoEncaminhar(el) {
  el.classList.toggle("selected");
  const algumSelecionado = document.querySelectorAll(".dm-forward-item.selected").length > 0;
  document.getElementById("dmForwardEnviarBtn").disabled = !algumSelecionado;
}

function fecharEncaminhar() {
  document.getElementById("dmForwardOverlay").classList.remove("open");
}

async function confirmarEncaminhar() {
  const m = dmMenuMensagemAtual;
  if (!m) return;
  const selecionados = Array.from(document.querySelectorAll(".dm-forward-item.selected"));
  if (!selecionados.length) return;

  const btn = document.getElementById("dmForwardEnviarBtn");
  btn.disabled = true; btn.textContent = "Encaminhando...";

  for (const item of selecionados) {
    const conversaId = item.dataset.conversaId;
    const outro = JSON.parse(item.dataset.outro);

    const { error } = await supabaseClient.from("comunidade_mensagens_dm").insert([{
      conversa_id: conversaId,
      autor_id: userSession.user.id,
      texto: m.texto || null,
      imagem_url: m.imagem_url || null,
      sticker_url: m.sticker_url || null,
      encaminhada: true
    }]);
    if (!error) {
      const preview = m.texto || (m.imagem_url ? "📷 Foto" : m.sticker_url ? "Figurinha" : "");
      await supabaseClient.from("comunidade_conversas")
        .update({ ultima_msg_texto: preview, ultima_msg_em: new Date().toISOString() })
        .eq("id", conversaId);
    }
  }

  btn.textContent = "Encaminhar"; btn.disabled = false;
  fecharEncaminhar();
  mostrarToast(`Mensagem encaminhada para ${selecionados.length} conversa${selecionados.length > 1 ? "s" : ""}.`);
}

/* ── enviar foto na conversa ── */
function stageImagemDm() {
  const file = document.getElementById("dmImgInput").files[0];
  if (!file) return;
  abrirEditor(file, (blob) => {
    dmImagemStagedFile = new File([blob], "foto.jpg", { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    document.getElementById("dmImgStagedPreview").src = url;
    document.getElementById("dmImgStaged").classList.add("open");
  });
}

function cancelarImagemStaged() {
  dmImagemStagedFile = null;
  const input = document.getElementById("dmImgInput");
  if (input) input.value = "";
  const staged = document.getElementById("dmImgStaged");
  if (staged) staged.classList.remove("open");
}

/* ── enviar figurinha ── */
function abrirSeletorStickers() {
  const grid = document.getElementById("dmStickerGrid");
  grid.innerHTML = DM_STICKERS.map(s => `<div class="dm-sticker-grid-item" onclick="enviarSticker('${s}')">${s}</div>`).join("");
  document.getElementById("dmStickerOverlay").classList.add("open");
}

function fecharSeletorStickers() {
  document.getElementById("dmStickerOverlay").classList.remove("open");
}

/* gera um PNG simples do emoji escolhido pra usar como "figurinha" (sticker_url) */
function emojiParaStickerDataUrl(emoji) {
  const canvas = document.createElement("canvas");
  canvas.width = 240; canvas.height = 240;
  const ctx = canvas.getContext("2d");
  ctx.font = "180px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, 120, 132);
  return canvas.toDataURL("image/png");
}

async function enviarSticker(emoji) {
  fecharSeletorStickers();
  if (!dmConversaAtivaId) return;

  const stickerUrl = emojiParaStickerDataUrl(emoji);
  const respostaAId = dmRespondendoA ? dmRespondendoA.id : null;

  const { error } = await supabaseClient.from("comunidade_mensagens_dm").insert([{
    conversa_id: dmConversaAtivaId,
    autor_id: userSession.user.id,
    sticker_url: stickerUrl,
    resposta_a: respostaAId
  }]);
  if (error) { mostrarToast("Erro ao enviar figurinha: " + error.message); return; }

  cancelarResposta();
  await supabaseClient.from("comunidade_conversas")
    .update({ ultima_msg_texto: "Figurinha", ultima_msg_em: new Date().toISOString() })
    .eq("id", dmConversaAtivaId);
}

async function enviarMensagemDm() {
  if (!dmConversaAtivaId) return;
  const input = document.getElementById("dmInput");
  const texto = input.value.trim();
  const file = dmImagemStagedFile;

  if (!texto && !file) return;

  input.value = "";
  const respostaAId = dmRespondendoA ? dmRespondendoA.id : null;
  cancelarResposta();
  cancelarImagemStaged();

  let imgUrl = null;
  if (file) {
    const nomeArq = `dm/${userSession.user.id}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabaseClient.storage.from("comunidade").upload(nomeArq, file);
    if (upErr) { mostrarToast("Erro ao enviar imagem: " + upErr.message); return; }
    const { data: urlData } = supabaseClient.storage.from("comunidade").getPublicUrl(nomeArq);
    imgUrl = urlData.publicUrl;
  }

  const { error } = await supabaseClient.from("comunidade_mensagens_dm").insert([{
    conversa_id: dmConversaAtivaId,
    autor_id: userSession.user.id,
    texto: texto || null,
    imagem_url: imgUrl,
    resposta_a: respostaAId
  }]);
  if (error) { mostrarToast("Erro ao enviar: " + error.message); return; }

  const preview = texto || (imgUrl ? "📷 Foto" : "");
  await supabaseClient.from("comunidade_conversas")
    .update({ ultima_msg_texto: preview, ultima_msg_em: new Date().toISOString() })
    .eq("id", dmConversaAtivaId);
}

/* ───────────────────────────────────────────
   PESQUISAR — @ID (perfil público) ou #hashtag (posts)
   ─────────────────────────────────────────── */
let buscaGeralTimeout = null;
function pesquisarGeral() {
  clearTimeout(buscaGeralTimeout);
  const valor = document.getElementById("buscaGeralInput").value.trim();
  const dica = document.getElementById("buscaDica");
  const resultados = document.getElementById("buscaResultados");

  if (!valor) {
    dica.style.display = "block";
    dica.textContent = "Digite um @ID pra encontrar um jogador ou uma #hashtag pra ver os posts marcados.";
    resultados.innerHTML = "";
    return;
  }

  buscaGeralTimeout = setTimeout(async () => {
    if (valor.startsWith("#")) {
      await pesquisarPorHashtag(valor.slice(1));
    } else {
      await pesquisarPorId(valor.replace(/^@/, ""));
    }
  }, 300);
}

async function pesquisarPorId(termo) {
  const dica = document.getElementById("buscaDica");
  const resultados = document.getElementById("buscaResultados");
  if (!termo) { dica.style.display = "block"; resultados.innerHTML = ""; return; }

  const { data, error } = await supabaseClient
    .from("perfis").select("id, nome, id_online, foto_url, bio").ilike("id_online", `%${termo}%`).limit(15);

  dica.style.display = "none";

  if (error || !data || !data.length) {
    resultados.innerHTML = `<div class="busca-dica" style="display:block">Nenhum jogador encontrado com esse @ID.</div>`;
    return;
  }

  resultados.innerHTML = data.map(u => `
    <div class="busca-resultado-item" onclick='abrirPerfilPublico("${u.id}")'>
      ${avatarHtml(u.foto_url, 48)}
      <div style="min-width:0">
        <div class="busca-resultado-nome">${escapeHtml(u.nome || "Jogador")}</div>
        <div class="busca-resultado-sub">@${escapeHtml(u.id_online || "")}</div>
        ${u.bio ? `<div class="busca-resultado-bio">${escapeHtml(u.bio)}</div>` : ""}
      </div>
    </div>
  `).join("");
}

async function pesquisarPorHashtag(termo) {
  const dica = document.getElementById("buscaDica");
  const resultados = document.getElementById("buscaResultados");
  const tag = termo.trim().toLowerCase();
  if (!tag) { dica.style.display = "block"; resultados.innerHTML = ""; return; }

  const { data, error } = await supabaseClient
    .from("comunidade_posts").select("*").contains("hashtags", [tag]).order("criado_em", { ascending: false }).limit(40);

  dica.style.display = "none";

  if (error || !data || !data.length) {
    resultados.innerHTML = `<div class="busca-dica" style="display:block">Nenhum post encontrado com #${escapeHtml(tag)}.</div>`;
    return;
  }

  // curtidas/salvos do usuário pra esses posts, igual no feed
  let curtidos = new Set(), salvos = new Set();
  if (userSession) {
    const ids = data.map(p => p.id);
    const { data: cData } = await supabaseClient.from("comunidade_curtidas").select("post_id").eq("usuario_id", userSession.user.id).in("post_id", ids);
    (cData || []).forEach(c => curtidos.add(c.post_id));
    const { data: sData } = await supabaseClient.from("comunidade_salvos").select("post_id").eq("usuario_id", userSession.user.id).in("post_id", ids);
    (sData || []).forEach(s => salvos.add(s.post_id));
  }

  const postsComEstado = data.map(p => ({ ...p, _curtiu: curtidos.has(p.id), _salvou: salvos.has(p.id) }));
  resultados.innerHTML = `<div style="font-size:13px;color:var(--muted);margin-bottom:12px">${postsComEstado.length} post${postsComEstado.length > 1 ? "s" : ""} com <span class="com-hashtag" style="cursor:default">#${escapeHtml(tag)}</span></div>` +
    postsComEstado.map(p => renderPost(p)).join("");

  postsComEstado.forEach(p => {
    atualizarContadores(p.id);
    configurarDoubleTap(p.id);
    observarVisualizacaoPost(p.id);
  });
}

function irParaHashtag(tag) {
  document.querySelectorAll(".com-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "pesquisar"));
  document.querySelectorAll(".com-panel").forEach((p) => p.classList.toggle("active", p.id === "panel-pesquisar"));
  document.getElementById("buscaTelaPerfil").style.display = "none";
  document.getElementById("buscaTelaResultados").style.display = "block";
  document.getElementById("buscaGeralInput").value = "#" + tag;
  pesquisarPorHashtag(tag);
}

function voltarParaBusca() {
  document.getElementById("buscaTelaPerfil").style.display = "none";
  document.getElementById("buscaTelaResultados").style.display = "block";
}

/* abre o perfil público de qualquer usuário (bio, foto, grid de posts) */
async function abrirPerfilPublico(usuarioId) {
  // garante que a aba Pesquisar esteja visível
  document.querySelectorAll(".com-tab").forEach(t => t.classList.toggle("active", t.dataset.tab === "pesquisar"));
  document.querySelectorAll(".com-panel").forEach(p => p.classList.toggle("active", p.id === "panel-pesquisar"));

  document.getElementById("buscaTelaResultados").style.display = "none";
  document.getElementById("buscaTelaPerfil").style.display = "block";
  const cont = document.getElementById("perfilPublicoConteudo");
  cont.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px 0">Carregando perfil...</div>`;

  const { data: perfil, error } = await supabaseClient
    .from("perfis").select("id, nome, id_online, foto_url, bio, verificado, email, banner_url").eq("id", usuarioId).maybeSingle();

  if (error || !perfil) { cont.innerHTML = `<div class="com-empty"><div class="com-empty-title">Perfil não encontrado</div></div>`; return; }

  const { data: posts } = await supabaseClient
    .from("comunidade_posts").select("id, texto, imagem_url, criado_em").eq("autor_id", usuarioId).order("criado_em", { ascending: false }).limit(30);

  const { count: totalPosts } = await supabaseClient
    .from("comunidade_posts").select("*", { count: "exact", head: true }).eq("autor_id", usuarioId);

  const { count: totalSeguidores } = await supabaseClient
    .from("comunidade_seguidores").select("*", { count: "exact", head: true }).eq("seguido_id", usuarioId);

  const { count: totalSeguindo } = await supabaseClient
    .from("comunidade_seguidores").select("*", { count: "exact", head: true }).eq("seguidor_id", usuarioId);

  const ehMeuProprioPerfil = userSession && userSession.user.id === usuarioId;

  let euSigo = false;
  if (userSession && !ehMeuProprioPerfil) {
    const { data: relacao } = await supabaseClient
      .from("comunidade_seguidores").select("seguidor_id").eq("seguidor_id", userSession.user.id).eq("seguido_id", usuarioId).maybeSingle();
    euSigo = !!relacao;
  }

  const selo = seloDoPerfil({ ...perfil, _planoPlus: perfil.verificado === "azul" ? true : await checarAssinantePlus(perfil.email) });

  cont.innerHTML = `
    <div class="perfil-card">
      <div class="perfil-capa" style="${perfil.banner_url ? `background:url('${perfil.banner_url}') center/cover no-repeat` : ""}"></div>
      <div class="perfil-info">
        <div class="perfil-avatar-wrap">${avatarHtml(perfil.foto_url, 76)}</div>
        <div class="perfil-nome">${escapeHtml(perfil.nome || "Jogador")}${seloHtml(selo, 18)}</div>
        <div class="perfil-id">@${escapeHtml(perfil.id_online || "")}</div>
        <div class="perfil-bio ${perfil.bio ? "" : "vazia"}">${perfil.bio ? escapeHtml(perfil.bio) : "Sem bio ainda."}</div>
        <div class="perfil-stats">
          <div><div class="perfil-stat-num">${totalPosts || 0}</div><div class="perfil-stat-label">Posts</div></div>
          <button class="perfil-stat" onclick="abrirModalSeguidores('${perfil.id}','seguidores')"><div class="perfil-stat-num">${totalSeguidores || 0}</div><div class="perfil-stat-label">Seguidores</div></button>
          <button class="perfil-stat" onclick="abrirModalSeguidores('${perfil.id}','seguindo')"><div class="perfil-stat-num">${totalSeguindo || 0}</div><div class="perfil-stat-label">Seguindo</div></button>
        </div>
        ${ehMeuProprioPerfil ? "" : `
        <div class="perfil-acoes">
          <button class="btn btn-seguir ${euSigo ? "seguindo" : ""}" id="btnSeguirPerfil" onclick='toggleSeguir("${perfil.id}", ${JSON.stringify({ id: perfil.id, nome: perfil.nome, id_online: perfil.id_online, foto_url: perfil.foto_url }).replace(/'/g, "&apos;")})'>
            <span class="label-padrao">${euSigo ? "Seguindo" : "Seguir"}</span><span class="label-hover">Deixar de seguir</span>
          </button>
          <button class="btn" onclick='abrirOuCriarConversa(${JSON.stringify({ id: perfil.id, nome: perfil.nome, id_online: perfil.id_online, foto_url: perfil.foto_url }).replace(/'/g, "&apos;")})'>Enviar mensagem</button>
        </div>`}
      </div>
    </div>
    <div class="perfil-grid">
      ${(posts && posts.length) ? posts.map(p => renderGridItem(p)).join("") : `<div style="grid-column:1/-1"><div class="com-empty"><div class="com-empty-title">Sem posts ainda</div></div></div>`}
    </div>
  `;

  registrarVisualizacaoPerfil(usuarioId);
}

/* ───────────────────────────────────────────
   SEGUIDORES / SEGUINDO
   ─────────────────────────────────────────── */

/* segue ou deixa de seguir o usuário com id `outroId` */
async function toggleSeguir(outroId, outroPerfilResumo) {
  if (!userSession) { mostrarToast("Entre na sua conta para seguir jogadores."); return; }
  if (userSession.user.id === outroId) return;

  const btn = document.getElementById("btnSeguirPerfil");
  const jaSegue = btn && btn.classList.contains("seguindo");

  if (btn) btn.disabled = true;

  try {
    if (jaSegue) {
      const { error } = await supabaseClient.from("comunidade_seguidores")
        .delete().eq("seguidor_id", userSession.user.id).eq("seguido_id", outroId);
      if (error) throw error;
      if (btn) { btn.classList.remove("seguindo"); btn.querySelector(".label-padrao").textContent = "Seguir"; }
    } else {
      const { error } = await supabaseClient.from("comunidade_seguidores")
        .insert([{ seguidor_id: userSession.user.id, seguido_id: outroId }]);
      if (error) throw error;
      if (btn) { btn.classList.add("seguindo"); btn.querySelector(".label-padrao").textContent = "Seguindo"; }
      mostrarToast(`Você está seguindo ${outroPerfilResumo?.nome || "este jogador"}.`);
    }
  } catch (err) {
    mostrarToast("Erro: " + (err.message || "tente novamente"));
  }

  if (btn) btn.disabled = false;

  // atualiza o contador de seguidores na tela, se estiver visível
  atualizarContadorSeguidoresNaTela(outroId);
}

/* recalcula e atualiza visualmente o número de seguidores de um perfil já renderizado na tela */
async function atualizarContadorSeguidoresNaTela(usuarioId) {
  const { count } = await supabaseClient.from("comunidade_seguidores").select("*", { count: "exact", head: true }).eq("seguido_id", usuarioId);
  document.querySelectorAll(`.perfil-stat[onclick*="'${usuarioId}','seguidores'"] .perfil-stat-num`).forEach(el => el.textContent = count || 0);
}

/* segue/deixa de seguir diretamente a partir de um item de lista (modal de seguidores/seguindo) */
async function toggleSeguirNaLista(btn, outroId, outroNome) {
  if (!userSession) { mostrarToast("Entre na sua conta para seguir jogadores."); return; }
  if (userSession.user.id === outroId) return;

  const jaSegue = btn.classList.contains("seguindo");
  btn.disabled = true;

  try {
    if (jaSegue) {
      const { error } = await supabaseClient.from("comunidade_seguidores")
        .delete().eq("seguidor_id", userSession.user.id).eq("seguido_id", outroId);
      if (error) throw error;
      btn.classList.remove("seguindo");
      btn.innerHTML = `<span class="label-padrao">Seguir</span><span class="label-hover">Seguir</span>`;
    } else {
      const { error } = await supabaseClient.from("comunidade_seguidores")
        .insert([{ seguidor_id: userSession.user.id, seguido_id: outroId }]);
      if (error) throw error;
      btn.classList.add("seguindo");
      btn.innerHTML = `<span class="label-padrao">Seguindo</span><span class="label-hover">Deixar</span>`;
    }
  } catch (err) {
    mostrarToast("Erro: " + (err.message || "tente novamente"));
  }

  btn.disabled = false;
  atualizarContadorSeguidoresNaTela(outroId);
}

/* abre o modal mostrando a lista de seguidores ou de quem o usuário segue */
async function abrirModalSeguidores(usuarioId, aba) {
  segModalUsuarioId = usuarioId;
  segModalAbaAtual = aba || "seguidores";
  document.getElementById("segModalOverlay").classList.add("open");
  document.getElementById("segTabSeguidores").classList.toggle("active", segModalAbaAtual === "seguidores");
  document.getElementById("segTabSeguindo").classList.toggle("active", segModalAbaAtual === "seguindo");
  await carregarListaSeguidores();
}

function fecharModalSeguidores() {
  document.getElementById("segModalOverlay").classList.remove("open");
  segModalUsuarioId = null;
}

async function trocarAbaSeguidores(aba) {
  segModalAbaAtual = aba;
  document.getElementById("segTabSeguidores").classList.toggle("active", aba === "seguidores");
  document.getElementById("segTabSeguindo").classList.toggle("active", aba === "seguindo");
  await carregarListaSeguidores();
}

async function carregarListaSeguidores() {
  const body = document.getElementById("segModalBody");
  body.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px 0">Carregando...</div>`;
  if (!segModalUsuarioId) return;

  let query;
  if (segModalAbaAtual === "seguidores") {
    query = supabaseClient.from("comunidade_seguidores").select("seguidor_id").eq("seguido_id", segModalUsuarioId);
  } else {
    query = supabaseClient.from("comunidade_seguidores").select("seguido_id").eq("seguidor_id", segModalUsuarioId);
  }
  const { data: relacoes, error } = await query;

  if (error) { body.innerHTML = `<div class="com-empty"><div class="com-empty-title">Erro ao carregar</div></div>`; return; }

  const ids = (relacoes || []).map(r => segModalAbaAtual === "seguidores" ? r.seguidor_id : r.seguido_id);
  if (!ids.length) {
    body.innerHTML = `<div class="com-empty">
      <div class="com-empty-title">${segModalAbaAtual === "seguidores" ? "Sem seguidores ainda" : "Não segue ninguém ainda"}</div>
    </div>`;
    return;
  }

  const { data: perfis } = await supabaseClient.from("perfis").select("id, nome, id_online, foto_url, verificado, email").in("id", ids);
  if (!perfis || !perfis.length) { body.innerHTML = `<div class="com-empty"><div class="com-empty-title">Ninguém encontrado</div></div>`; return; }

  const selos = await buscarSelosDeAutores(perfis.map(p => p.id));

  let meusSeguidos = new Set();
  if (userSession) {
    const { data: minhasRelacoes } = await supabaseClient
      .from("comunidade_seguidores").select("seguido_id").eq("seguidor_id", userSession.user.id).in("seguido_id", ids);
    (minhasRelacoes || []).forEach(r => meusSeguidos.add(r.seguido_id));
  }

  body.innerHTML = perfis.map(p => {
    const souEu = userSession && userSession.user.id === p.id;
    const jaSegue = meusSeguidos.has(p.id);
    const botaoSeguir = souEu ? "" : `
      <button class="btn btn-seguir ${jaSegue ? "seguindo" : ""}" onclick='toggleSeguirNaLista(this, "${p.id}", ${JSON.stringify(p.nome || "Jogador").replace(/'/g, "&apos;")})'>
        <span class="label-padrao">${jaSegue ? "Seguindo" : "Seguir"}</span><span class="label-hover">${jaSegue ? "Deixar" : "Seguir"}</span>
      </button>`;
    return `<div class="seg-item">
      ${avatarHtml(p.foto_url, 44)}
      <div class="seg-item-info" onclick='fecharModalSeguidores();abrirPerfilPublico("${p.id}")'>
        <div class="seg-item-name">${escapeHtml(p.nome || "Jogador")}${seloHtml(selos[p.id], 13)}</div>
        <div class="seg-item-id">@${escapeHtml(p.id_online || "")}</div>
      </div>
      ${botaoSeguir}
    </div>`;
  }).join("");
}

function renderGridItem(p) {
  if (p.imagem_url) {
    return `<div class="perfil-grid-item" onclick="abrirLightbox('${p.imagem_url}')"><img src="${p.imagem_url}" alt=""></div>`;
  }
  return `<div class="perfil-grid-item texto"><p>${escapeHtml(p.texto || "")}</p></div>`;
}

/* ───────────────────────────────────────────
   MEU PERFIL (Comunidade) — visualizar e editar
   foto, nome e bio (o @ID fica só em minha-conta.html)
   ─────────────────────────────────────────── */
async function carregarMeuPerfil() {
  const view = document.getElementById("meuPerfilView");

  if (!userSession) {
    view.innerHTML = `
      <div class="com-locked">
        Entre na sua conta pra ver e editar seu perfil na comunidade.<br>
        <a href="login.html">Fazer login</a> ou <a href="registrar.html">criar conta grátis</a>.
      </div>`;
    return;
  }

  view.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px 0">Carregando...</div>`;
  document.getElementById("meuPerfilEditar").style.display = "none";
  view.style.display = "block";

  const { count: totalPosts } = await supabaseClient
    .from("comunidade_posts").select("*", { count: "exact", head: true }).eq("autor_id", userSession.user.id);

  const { data: posts } = await supabaseClient
    .from("comunidade_posts").select("id, texto, imagem_url, criado_em").eq("autor_id", userSession.user.id).order("criado_em", { ascending: false }).limit(30);

  const { count: totalSeguidores } = await supabaseClient
    .from("comunidade_seguidores").select("*", { count: "exact", head: true }).eq("seguido_id", userSession.user.id);

  const { count: totalSeguindo } = await supabaseClient
    .from("comunidade_seguidores").select("*", { count: "exact", head: true }).eq("seguidor_id", userSession.user.id);

  view.innerHTML = `
    <div class="perfil-card" style="position:relative">
      <button class="perfil-config-btn" onclick="abrirConfiguracoes()" title="Configurações">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
      <div class="perfil-capa" style="${meuPerfil.banner_url ? `background:url('${meuPerfil.banner_url}') center/cover no-repeat` : ""}"></div>
      <div class="perfil-info">
        <div class="perfil-avatar-wrap">${avatarHtml(meuPerfil.foto_url, 76)}</div>
        <div class="perfil-nome">${escapeHtml(meuPerfil.nome || "Jogador")}${seloHtml(seloDoPerfil(meuPerfil), 18)}</div>
        <div class="perfil-id">@${escapeHtml(meuPerfil.id_online || "")}</div>
        <div class="perfil-bio ${meuPerfil.bio ? "" : "vazia"}">${meuPerfil.bio ? escapeHtml(meuPerfil.bio) : "Você ainda não escreveu uma bio."}</div>
        <div class="perfil-stats">
          <div><div class="perfil-stat-num">${totalPosts || 0}</div><div class="perfil-stat-label">Posts</div></div>
          <button class="perfil-stat" onclick="abrirModalSeguidores('${userSession.user.id}','seguidores')"><div class="perfil-stat-num">${totalSeguidores || 0}</div><div class="perfil-stat-label">Seguidores</div></button>
          <button class="perfil-stat" onclick="abrirModalSeguidores('${userSession.user.id}','seguindo')"><div class="perfil-stat-num">${totalSeguindo || 0}</div><div class="perfil-stat-label">Seguindo</div></button>
        </div>
        <div class="perfil-acoes">
          <button class="btn" onclick="abrirEdicaoPerfil()">Editar perfil</button>
        </div>
      </div>
    </div>
    <div class="perfil-grid">
      ${(posts && posts.length) ? posts.map(p => renderGridItem(p)).join("") : `<div style="grid-column:1/-1"><div class="com-empty"><div class="com-empty-title">Você ainda não postou nada</div><div class="com-empty-text">Vá até o Feed e compartilhe sua Master League!</div></div></div>`}
    </div>
  `;
}

function abrirEdicaoPerfil() {
  document.getElementById("meuPerfilView").style.display = "none";
  document.getElementById("meuPerfilEditar").style.display = "block";
  document.getElementById("editarAvatarPreview").innerHTML = avatarHtml(meuPerfil.foto_url, 64);
  document.getElementById("editarNomeInput").value = meuPerfil.nome || "";
  document.getElementById("editarBioInput").value = meuPerfil.bio || "";
  atualizarContadorBio();
  // Carrega banner atual no preview
  const bannerEl = document.getElementById("editarBannerPreview");
  if (meuPerfil.banner_url) {
    const imgExist = bannerEl.querySelector("img");
    if (!imgExist) {
      const img = document.createElement("img");
      img.src = meuPerfil.banner_url;
      bannerEl.insertBefore(img, bannerEl.firstChild);
    } else {
      imgExist.src = meuPerfil.banner_url;
    }
    bannerEl.classList.remove("sem-banner");
  } else {
    const imgExist = bannerEl.querySelector("img");
    if (imgExist) imgExist.remove();
    bannerEl.classList.add("sem-banner");
  }
  novoBannerPerfilFile = null;
}

function cancelarEdicaoPerfil() {
  document.getElementById("meuPerfilEditar").style.display = "none";
  document.getElementById("meuPerfilView").style.display = "block";
  document.getElementById("editarFotoInput").value = "";
  document.getElementById("editarBannerInput").value = "";
  novoBannerPerfilFile = null;
}

function atualizarContadorBio() {
  const len = document.getElementById("editarBioInput").value.length;
  document.getElementById("bioContador").textContent = len;
}

let novaFotoPerfilFile = null;
function previewFotoPerfil() {
  const file = document.getElementById("editarFotoInput").files[0];
  if (!file) return;
  abrirEditor(file, (blob) => {
    novaFotoPerfilFile = new File([blob], "foto.jpg", { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    document.getElementById("editarAvatarPreview").innerHTML = `<img class="com-avatar" style="width:64px;height:64px" src="${url}" alt="">`;
  });
}

function previewBannerPerfil() {
  const file = document.getElementById("editarBannerInput").files[0];
  if (!file) return;
  abrirEditor(file, (blob) => {
    novoBannerPerfilFile = new File([blob], "banner.jpg", { type: "image/jpeg" });
    const url = URL.createObjectURL(blob);
    const bannerEl = document.getElementById("editarBannerPreview");
    let img = bannerEl.querySelector("img");
    if (!img) { img = document.createElement("img"); bannerEl.insertBefore(img, bannerEl.firstChild); }
    img.src = url;
    bannerEl.classList.remove("sem-banner");
  });
}

async function salvarMeuPerfil() {
  const nome = document.getElementById("editarNomeInput").value.trim();
  const bio = document.getElementById("editarBioInput").value.trim();
  const btn = document.getElementById("btnSalvarPerfil");

  if (!nome) { mostrarToast("O nome não pode ficar em branco."); return; }

  btn.textContent = "Salvando..."; btn.disabled = true;

  try {
    let fotoUrl = meuPerfil.foto_url || null;
    if (novaFotoPerfilFile) {
      const nomeArq = `avatares/${userSession.user.id}-${Date.now()}-${novaFotoPerfilFile.name}`;
      const { error: upErr } = await supabaseClient.storage.from("comunidade").upload(nomeArq, novaFotoPerfilFile);
      if (upErr) throw upErr;
      const { data: urlData } = supabaseClient.storage.from("comunidade").getPublicUrl(nomeArq);
      fotoUrl = urlData.publicUrl;
    }

    let bannerUrl = meuPerfil.banner_url || null;
    if (novoBannerPerfilFile) {
      const nomeArq = `banners/${userSession.user.id}-${Date.now()}-${novoBannerPerfilFile.name}`;
      const { error: upErr } = await supabaseClient.storage.from("comunidade").upload(nomeArq, novoBannerPerfilFile);
      if (upErr) throw upErr;
      const { data: urlData } = supabaseClient.storage.from("comunidade").getPublicUrl(nomeArq);
      bannerUrl = urlData.publicUrl;
    }

    const { error } = await supabaseClient.from("perfis")
      .update({ nome, bio, foto_url: fotoUrl, banner_url: bannerUrl }).eq("id", userSession.user.id);
    if (error) throw error;

    meuPerfil.nome = nome;
    meuPerfil.bio = bio;
    meuPerfil.foto_url = fotoUrl;
    meuPerfil.banner_url = bannerUrl;
    novaFotoPerfilFile = null;
    novoBannerPerfilFile = null;

    mostrarToast("Perfil atualizado!");
    cancelarEdicaoPerfil();
    carregarMeuPerfil();
    montarComposer(); // atualiza avatar do composer também
  } catch (err) {
    mostrarToast("Erro ao salvar: " + (err.message || "tente novamente"));
  }

  btn.textContent = "Salvar"; btn.disabled = false;
}

/* ───────────────────────────────────────────
   CONFIGURAÇÕES (engrenagem no Meu Perfil)
   ─────────────────────────────────────────── */
function abrirConfiguracoes() {
  document.getElementById("meuPerfilView").style.display = "none";
  document.getElementById("meuPerfilConfig").style.display = "block";
  carregarAtividade("vistos");
}

function fecharConfiguracoes() {
  document.getElementById("meuPerfilConfig").style.display = "none";
  document.getElementById("meuPerfilView").style.display = "block";
  // reseta as sub-telas do verificado pra próxima vez que abrir
  document.getElementById("verificadoEscolha").style.display = "block";
  document.getElementById("verificadoSolicitarForm").style.display = "none";
  document.getElementById("verificadoSucesso").style.display = "none";
  carregarMeuPerfil();
}

function configurarSubTabsConfig() {
  document.querySelectorAll(".config-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".config-tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".config-panel").forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("config-" + tab.dataset.config).classList.add("active");
    });
  });
  document.querySelectorAll(".atividade-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".atividade-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      carregarAtividade(tab.dataset.ativ);
    });
  });
}

/* ── Sua atividade: vistos, curtidas, salvos, compartilhados ── */
async function carregarAtividade(tipo) {
  const lista = document.getElementById("atividadeLista");
  if (!userSession) { lista.innerHTML = `<div class="com-empty"><div class="com-empty-title">Entre na sua conta</div></div>`; return; }
  lista.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px 0">Carregando...</div>`;

  const config = {
    vistos:          { tabela: "comunidade_visualizacoes", vazio: "Você ainda não visualizou nenhum post." },
    curtidas:        { tabela: "comunidade_curtidas",       vazio: "Você ainda não curtiu nenhum post." },
    salvos:          { tabela: "comunidade_salvos",         vazio: "Você ainda não salvou nenhum post." },
    compartilhados:  { tabela: "comunidade_compartilhamentos", vazio: "Você ainda não compartilhou nenhum post." }
  }[tipo];

  let query = supabaseClient.from(config.tabela).select("*").eq("usuario_id", userSession.user.id).order("criado_em", { ascending: false }).limit(50);
  if (tipo === "vistos") query = query.not("post_id", "is", null); // só os posts vistos, perfis vistos não entram aqui

  const { data, error } = await query;

  if (error || !data || !data.length) {
    lista.innerHTML = `<div class="com-empty"><div class="com-empty-title">Nada por aqui ainda</div><div class="com-empty-text">${config.vazio}</div></div>`;
    return;
  }

  const postIds = data.map(d => d.post_id).filter(Boolean);
  const { data: posts } = await supabaseClient.from("comunidade_posts").select("id, texto, imagem_url, autor_nome, criado_em").in("id", postIds);
  const postPorId = {};
  (posts || []).forEach(p => postPorId[p.id] = p);

  lista.innerHTML = data.map(item => {
    const post = postPorId[item.post_id];
    if (!post) return ""; // post pode ter sido excluído
    const thumb = post.imagem_url
      ? `<img class="atividade-item-thumb" src="${post.imagem_url}" alt="">`
      : `<div class="atividade-item-thumb texto">${seloHtml(null)}<svg width="20" height="20" viewBox="0 0 24 24" fill="#6aabff"><path d="M4 4h16v2H4V4zm0 7h16v2H4v-2zm0 7h16v2H4v-2z"/></svg></div>`;
    return `<div class="atividade-item" onclick="abrirPostNoFeed(${post.id})">
      ${thumb}
      <div class="atividade-item-info">
        <div class="atividade-item-texto">${escapeHtml(post.autor_nome || "Jogador")}: ${escapeHtml(post.texto || "Foto")}</div>
        <div class="atividade-item-time">${tempoRelativo(item.criado_em)}</div>
      </div>
    </div>`;
  }).join("") || `<div class="com-empty"><div class="com-empty-title">Nada por aqui ainda</div><div class="com-empty-text">${config.vazio}</div></div>`;
}

function abrirPostNoFeed(postId) {
  fecharConfiguracoes();
  document.querySelectorAll(".com-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "feed"));
  document.querySelectorAll(".com-panel").forEach((p) => p.classList.toggle("active", p.id === "panel-feed"));
  setTimeout(() => {
    const el = document.getElementById(`post-${postId}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 150);
}

/* ── Solicitar / Comprar Lumina Verified+ ── */
function abrirSolicitarVerificado() {
  document.getElementById("verificadoEscolha").style.display = "none";
  document.getElementById("verificadoSolicitarForm").style.display = "block";
}

function voltarEscolhaVerificado() {
  document.getElementById("verificadoSolicitarForm").style.display = "none";
  document.getElementById("verificadoEscolha").style.display = "block";
}

let printVerificadoFile = null;
function previewPrintVerificado() {
  const file = document.getElementById("verifPrintInput").files[0];
  if (!file) return;
  printVerificadoFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("verifPrintPreview").style.display = "block";
    document.getElementById("verifPrintPreview").innerHTML = `<img src="${e.target.result}" alt=""><div class="remove-img" onclick="document.getElementById('verifPrintPreview').style.display='none';document.getElementById('verifPrintInput').value='';printVerificadoFile=null">✕</div>`;
  };
  reader.readAsDataURL(file);
}

async function enviarSolicitacaoVerificado() {
  const nome = document.getElementById("verifNomeInput").value.trim();
  const email = document.getElementById("verifEmailInput").value.trim();
  const link = document.getElementById("verifLinkInput").value.trim();
  const btn = document.getElementById("btnEnviarVerificacao");

  if (!nome || !email || !link) { mostrarToast("Preencha nome, email e link do canal."); return; }
  if (!userSession) { mostrarToast("Entre na sua conta para solicitar."); return; }

  btn.textContent = "Enviando..."; btn.disabled = true;

  try {
    let printUrl = null;
    if (printVerificadoFile) {
      const nomeArq = `verificacoes/${userSession.user.id}-${Date.now()}-${printVerificadoFile.name}`;
      const { error: upErr } = await supabaseClient.storage.from("comunidade").upload(nomeArq, printVerificadoFile);
      if (upErr) throw upErr;
      const { data: urlData } = supabaseClient.storage.from("comunidade").getPublicUrl(nomeArq);
      printUrl = urlData.publicUrl;
    }

    const { error } = await supabaseClient.from("comunidade_verificacoes").insert([{
      usuario_id: userSession.user.id,
      nome_completo: nome,
      email: email,
      link_canal: link,
      print_url: printUrl,
      status: "pendente"
    }]);
    if (error) throw error;

    document.getElementById("verificadoSolicitarForm").style.display = "none";
    document.getElementById("verificadoSucesso").style.display = "block";
  } catch (err) {
    mostrarToast("Erro ao enviar: " + (err.message || "tente novamente"));
  }

  btn.textContent = "Enviar informações"; btn.disabled = false;
}

/* compra do Lumina Verified+ por R$5 — checkout dedicado (mesmo padrão visual do checkout.html) */
function abrirComprarVerificado() {
  window.location.href = "checkout-verificado.html";
}

/* ───────────────────────────────────────────
   LIGHTBOX
   ─────────────────────────────────────────── */
function configurarLightbox() {
  document.getElementById("comLightbox").addEventListener("click", () => {
    document.getElementById("comLightbox").classList.remove("open");
  });
}
function abrirLightbox(url) {
  document.getElementById("comLightboxImg").src = url;
  document.getElementById("comLightbox").classList.add("open");
}

/* ───────────────────────────────────────────
   TOAST
   ─────────────────────────────────────────── */
let toastTimeout = null;
function mostrarToast(msg) {
  const el = document.getElementById("comToast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove("show"), 3200);
}

document.addEventListener("DOMContentLoaded", initComunidade);

/* ═══════════════════════════════════════════
   EDITOR DE IMAGEM — estilo WhatsApp
   crop via alças, flip e rotate
   ═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   EDITOR DE IMAGEM — estilo WhatsApp
   crop via alças, flip e rotate
   ═══════════════════════════════════════════ */

const ie = {
  img:      null,
  callback: null,
  flipH:    false,
  flipV:    false,
  rotation: 0,       // 0 | 90 | 180 | 270
  // crop em fração da imagem renderizada (0..1)
  // cx,cy = canto superior esquerdo; cw,ch = largura/altura
  cx: 0, cy: 0, cw: 1, ch: 1,
  // pixels do canvas renderizado
  renderW: 0, renderH: 0,
  // drag
  activeHandle: null,
  dragStartX: 0, dragStartY: 0,
  dragStartCrop: null,
  MIN_PX: 44, // mínimo em pixels do canvas renderizado
};

function abrirEditor(file, callback) {
  ie.callback = callback;
  ie.flipH = false; ie.flipV = false; ie.rotation = 0;
  ie.cx = 0; ie.cy = 0; ie.cw = 1; ie.ch = 1;
  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      ie.img = img;
      document.getElementById("imgEditorOverlay").classList.add("open");
      requestAnimationFrame(() => { ieRender(); ieUpdateUI(); });
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* desenha no canvas do preview */
function ieRender() {
  const wrap   = document.getElementById("imgEditorCanvasWrap");
  const canvas = document.getElementById("imgEditorCanvas");
  const img    = ie.img;
  const rot    = ie.rotation;
  const rotated= rot === 90 || rot === 270;
  const logW   = rotated ? img.height : img.width;
  const logH   = rotated ? img.width  : img.height;

  const maxW = wrap.clientWidth;
  const maxH = wrap.clientHeight || window.innerHeight * 0.55;
  const scale= Math.min(maxW / logW, maxH / logH);
  const rW   = Math.round(logW * scale);
  const rH   = Math.round(logH * scale);

  canvas.width  = rW;
  canvas.height = rH;
  ie.renderW = rW;
  ie.renderH = rH;

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, rW, rH);
  ctx.save();
  ctx.translate(rW / 2, rH / 2);
  ctx.rotate(rot * Math.PI / 180);
  if (ie.flipH) ctx.scale(-1,  1);
  if (ie.flipV) ctx.scale( 1, -1);
  ctx.drawImage(img,
    -img.width  * scale / 2,
    -img.height * scale / 2,
    img.width  * scale,
    img.height * scale
  );
  ctx.restore();
}

/* atualiza retângulo e sombras — crop em fração → pixels do canvas */
function ieUpdateUI() {
  const rW = ie.renderW, rH = ie.renderH;
  const px = Math.round(ie.cx * rW);
  const py = Math.round(ie.cy * rH);
  const pw = Math.round(ie.cw * rW);
  const ph = Math.round(ie.ch * rH);

  document.getElementById("imgEditorCropRect").style.cssText =
    `left:${px}px;top:${py}px;width:${pw}px;height:${ph}px`;

  const wW = document.getElementById("imgEditorCanvasWrap").clientWidth;
  const wH = document.getElementById("imgEditorCanvasWrap").clientHeight || rH;
  const off= (wW - rW) / 2; // canvas centralizado no wrap

  const shade = (id, l, t, w, h) => {
    document.getElementById(id).style.cssText = `left:${l}px;top:${t}px;width:${w}px;height:${h}px`;
  };
  shade("ieShadeT", 0,        0,       wW,        py);
  shade("ieShadeB", 0,        py+ph,   wW,        wH-py-ph);
  shade("ieShadeL", 0,        py,      off+px,    ph);
  shade("ieShadeR", off+px+pw,py,      wW-off-px-pw, ph);
}

/* ── drag nas alças ── */
function iePointerDown(e) {
  const handle = e.target.closest("[data-handle]");
  if (!handle) return;
  ie.activeHandle = handle.dataset.handle;
  const p = iePos(e);
  ie.dragStartX = p.x; ie.dragStartY = p.y;
  ie.dragStartCrop = { cx:ie.cx, cy:ie.cy, cw:ie.cw, ch:ie.ch };
  e.preventDefault();
}

function iePointerMove(e) {
  if (!ie.activeHandle) return;
  const p   = iePos(e);
  const dx  = (p.x - ie.dragStartX) / ie.renderW;
  const dy  = (p.y - ie.dragStartY) / ie.renderH;
  const MIN = ie.MIN_PX / ie.renderW;
  let { cx, cy, cw, ch } = ie.dragStartCrop;
  const h = ie.activeHandle;

  if (h === "move") {
    cx = Math.max(0, Math.min(1 - cw, cx + dx));
    cy = Math.max(0, Math.min(1 - ch, cy + dy));
  } else {
    if (h==="tl"||h==="lm"||h==="bl") { const nx=Math.max(0,Math.min(cx+cw-MIN,cx+dx)); cw+=cx-nx; cx=nx; }
    if (h==="tr"||h==="rm"||h==="br") { cw=Math.max(MIN,Math.min(1-cx,cw+dx)); }
    if (h==="tl"||h==="tm"||h==="tr") { const ny=Math.max(0,Math.min(cy+ch-MIN,cy+dy)); ch+=cy-ny; cy=ny; }
    if (h==="bl"||h==="bm"||h==="br") { ch=Math.max(MIN,Math.min(1-cy,ch+dy)); }
    if (h==="lm") { const nx=Math.max(0,Math.min(cx+cw-MIN,cx+dx)); cw+=cx-nx; cx=nx; }
    if (h==="rm") { cw=Math.max(MIN,Math.min(1-cx,cw+dx)); }
    if (h==="tm") { const ny=Math.max(0,Math.min(cy+ch-MIN,cy+dy)); ch+=cy-ny; cy=ny; }
    if (h==="bm") { ch=Math.max(MIN,Math.min(1-cy,ch+dy)); }
  }

  ie.cx=cx; ie.cy=cy; ie.cw=cw; ie.ch=ch;
  ieUpdateUI();
  e.preventDefault();
}

function iePointerUp() { ie.activeHandle = null; }

function iePos(e) {
  const canvas = document.getElementById("imgEditorCanvas");
  const r = canvas.getBoundingClientRect();
  const src = e.touches ? e.touches[0] : e;
  return { x: src.clientX - r.left, y: src.clientY - r.top };
}

document.addEventListener("DOMContentLoaded", () => {
  const wrap = document.getElementById("imgEditorCanvasWrap");
  wrap.addEventListener("mousedown",  iePointerDown);
  window.addEventListener("mousemove",  iePointerMove);
  window.addEventListener("mouseup",    iePointerUp);
  wrap.addEventListener("touchstart", iePointerDown,  { passive:false });
  window.addEventListener("touchmove",  iePointerMove, { passive:false });
  window.addEventListener("touchend",   iePointerUp);
  window.addEventListener("resize", () => {
    if (!ie.img || !document.getElementById("imgEditorOverlay").classList.contains("open")) return;
    ieRender(); ieUpdateUI();
  });
});

function editorFlip(dir) {
  if (dir === 'h') ie.flipH = !ie.flipH;
  else             ie.flipV = !ie.flipV;
  ieRender(); ieUpdateUI();
}

function editorRotate(deg) {
  ie.rotation = ((ie.rotation + deg) % 360 + 360) % 360;
  ie.cx=0; ie.cy=0; ie.cw=1; ie.ch=1;
  ieRender(); ieUpdateUI();
}

function cancelarEditor() {
  document.getElementById("imgEditorOverlay").classList.remove("open");
  ie.callback = null;
}

function confirmarEditor() {
  const img    = ie.img;
  const rot    = ie.rotation;
  const rotated= rot === 90 || rot === 270;
  // dimensões lógicas após rotação
  const logW   = rotated ? img.height : img.width;
  const logH   = rotated ? img.width  : img.height;

  // área de crop em pixels reais da imagem lógica
  const cropX = ie.cx * logW;
  const cropY = ie.cy * logH;
  const cropW = ie.cw * logW;
  const cropH = ie.ch * logH;

  const out = document.createElement("canvas");
  out.width  = Math.round(cropW);
  out.height = Math.round(cropH);
  const ctx  = out.getContext("2d");

  // usa drawImage com sx,sy,sw,sh direto na imagem — sem matrix de rotação no output
  // em vez disso criamos um canvas intermediário com a imagem já rotacionada/flipada
  const mid = document.createElement("canvas");
  mid.width  = logW;
  mid.height = logH;
  const mctx = mid.getContext("2d");
  mctx.save();
  mctx.translate(logW / 2, logH / 2);
  mctx.rotate(rot * Math.PI / 180);
  if (ie.flipH) mctx.scale(-1,  1);
  if (ie.flipV) mctx.scale( 1, -1);
  mctx.drawImage(img, -img.width / 2, -img.height / 2, img.width, img.height);
  mctx.restore();

  // recorta a área certa do canvas intermediário
  ctx.drawImage(mid, cropX, cropY, cropW, cropH, 0, 0, out.width, out.height);

  out.toBlob(blob => {
    if (!blob) { mostrarToast("Erro ao processar imagem."); return; }
    cancelarEditor();
    if (ie.callback) ie.callback(blob);
  }, "image/jpeg", 0.95);
}

