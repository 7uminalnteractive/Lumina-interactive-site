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
let meuPerfil = null;          // { nome, id_online, foto_url, bio }
let postsCache = [];           // último resultado carregado do feed
let dmCanal = null;
let dmConversaAtivaId = null;
let dmOutroUsuario = null;     // perfil da outra pessoa na conversa aberta

/* ───────────────────────────────────────────
   INICIALIZAÇÃO
   ─────────────────────────────────────────── */
async function initComunidade() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    userSession = session;
    const { data: perfil } = await supabaseClient
      .from("perfis").select("nome, id_online, foto_url, bio").eq("id", session.user.id).maybeSingle();
    meuPerfil = perfil || {};
    if (!meuPerfil.nome) meuPerfil.nome = session.user.user_metadata?.nome || session.user.email.split("@")[0];
  }

  montarComposer();
  configurarTabs();
  configurarArrastoTabs();
  configurarLightbox();

  carregarFeed();
  iniciarMensagens();
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

function previewImagemComposer() {
  const file = document.getElementById("imgInput-post").files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("imgPreviewSrc-post").src = e.target.result;
    document.getElementById("imgPreview-post").style.display = "block";
  };
  reader.readAsDataURL(file);
}
function removerImagemComposer() {
  document.getElementById("imgInput-post").value = "";
  document.getElementById("imgPreview-post").style.display = "none";
}

async function publicarPost() {
  const textoEl = document.getElementById("texto-post");
  const texto = textoEl.value.trim();
  const fileInput = document.getElementById("imgInput-post");
  const file = fileInput.files[0];
  const btn = document.getElementById("btnPublicar-post");

  if (!texto && !file) { mostrarToast("Escreva algo ou adicione uma imagem."); return; }

  btn.textContent = "Publicando..."; btn.disabled = true;

  let imgUrl = null;
  try {
    if (file) {
      const nomeArq = `posts/${userSession.user.id}-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabaseClient.storage.from("comunidade").upload(nomeArq, file);
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
    ? `<div class="com-post-caption"><span class="who">${escapeHtml(p.autor_nome)}</span>${textoComHashtags}</div>`
    : "";

  return `
  <div class="com-post" id="post-${p.id}">
    <div class="com-post-head">
      ${avatarHtml(p.autor_foto, 38)}
      <div class="com-post-meta">
        <div class="com-post-name">${escapeHtml(p.autor_nome)} ${nomeId}</div>
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

function compartilharPost(postId) {
  const url = `${window.location.origin}${window.location.pathname}#post-${postId}`;
  if (navigator.share) {
    navigator.share({ title: "Comunidade Lumina Interactive", url }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(url);
    mostrarToast("Link copiado!");
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

  lista.innerHTML = data.map(c => `
    <div class="com-comment">
      ${avatarHtml(c.autor_foto, 30)}
      <div class="com-comment-bubble">
        <span class="com-comment-name">${escapeHtml(c.autor_nome)} ${c.autor_id_online ? `<span class="com-comment-id">@${escapeHtml(c.autor_id_online)}</span>` : ""}</span>
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

  lista.innerHTML = conversas.map(c => {
    const outroId = c.usuario_a === meuId ? c.usuario_b : c.usuario_a;
    const outro = perfilPorId[outroId] || { nome: "Jogador" };
    const preview = c.ultima_msg_texto ? escapeHtml(c.ultima_msg_texto) : "Diga olá 👋";
    const tempo = c.ultima_msg_em ? tempoRelativo(c.ultima_msg_em) : "";
    return `<div class="dm-list-item" onclick='abrirThreadDm(${c.id}, ${JSON.stringify(outro).replace(/'/g, "&apos;")})'>
      ${avatarHtml(outro.foto_url, 44)}
      <div class="dm-list-item-info">
        <div class="dm-list-item-name">${escapeHtml(outro.nome || "Jogador")}${outro.id_online ? ` <span style="color:var(--blue);font-weight:600">@${escapeHtml(outro.id_online)}</span>` : ""}</div>
        <div class="dm-list-item-preview">${preview}</div>
      </div>
      <div class="dm-list-item-time">${tempo}</div>
    </div>`;
  }).join("");
}

async function abrirThreadDm(conversaId, outroPerfil) {
  dmConversaAtivaId = conversaId;
  dmOutroUsuario = outroPerfil;

  // garante que a aba "Mensagens" fique visível, mesmo se chamada de outra aba (ex: perfil público)
  document.querySelectorAll(".com-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === "mensagens"));
  document.querySelectorAll(".com-panel").forEach((p) => p.classList.toggle("active", p.id === "panel-mensagens"));

  document.getElementById("dmTelaLista").style.display = "none";
  document.getElementById("dmTelaThread").style.display = "block";
  document.getElementById("dmThreadAvatar").innerHTML = avatarHtml(outroPerfil.foto_url, 36);
  document.getElementById("dmThreadNome").textContent = outroPerfil.nome || "Jogador";
  document.getElementById("dmThreadId").textContent = outroPerfil.id_online ? "@" + outroPerfil.id_online : "";

  const msgsEl = document.getElementById("dmThreadMsgs");
  msgsEl.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:20px 0">Carregando mensagens...</div>`;

  const { data: mensagens, error } = await supabaseClient
    .from("comunidade_mensagens_dm").select("*").eq("conversa_id", conversaId).order("criado_em", { ascending: true });

  if (error) { msgsEl.innerHTML = `<div style="text-align:center;color:#ef4444;font-size:13px;padding:20px 0">Erro ao carregar.</div>`; return; }

  msgsEl.innerHTML = "";
  (mensagens || []).forEach(m => adicionarMensagemDm(m));
  scrollDmParaFim();

  // realtime: escuta novas mensagens desta conversa
  if (dmCanal) supabaseClient.removeChannel(dmCanal);
  dmCanal = supabaseClient
    .channel(`dm_conversa_${conversaId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "comunidade_mensagens_dm", filter: `conversa_id=eq.${conversaId}` }, (payload) => {
      adicionarMensagemDm(payload.new);
      scrollDmParaFim();
    })
    .subscribe();
}

function voltarParaListaDm() {
  document.getElementById("dmTelaThread").style.display = "none";
  document.getElementById("dmTelaLista").style.display = "block";
  if (dmCanal) { supabaseClient.removeChannel(dmCanal); dmCanal = null; }
  dmConversaAtivaId = null;
  carregarConversasDm();
}

function adicionarMensagemDm(m) {
  const msgsEl = document.getElementById("dmThreadMsgs");
  const minha = m.autor_id === userSession.user.id;
  const div = document.createElement("div");
  div.className = "dm-msg" + (minha ? " mine" : "");
  div.innerHTML = `<div class="dm-bubble"><div class="dm-text">${escapeHtml(m.texto)}</div></div>`;
  msgsEl.appendChild(div);
}

function scrollDmParaFim() {
  const msgsEl = document.getElementById("dmThreadMsgs");
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

async function enviarMensagemDm() {
  const input = document.getElementById("dmInput");
  const texto = input.value.trim();
  if (!texto || !dmConversaAtivaId) return;
  input.value = "";

  const { error } = await supabaseClient.from("comunidade_mensagens_dm").insert([{
    conversa_id: dmConversaAtivaId,
    autor_id: userSession.user.id,
    texto: texto
  }]);
  if (error) { mostrarToast("Erro ao enviar: " + error.message); return; }

  await supabaseClient.from("comunidade_conversas")
    .update({ ultima_msg_texto: texto, ultima_msg_em: new Date().toISOString() })
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
  document.getElementById("buscaTelaResultados").style.display = "none";
  document.getElementById("buscaTelaPerfil").style.display = "block";
  const cont = document.getElementById("perfilPublicoConteudo");
  cont.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:13px;padding:30px 0">Carregando perfil...</div>`;

  const { data: perfil, error } = await supabaseClient
    .from("perfis").select("id, nome, id_online, foto_url, bio").eq("id", usuarioId).maybeSingle();

  if (error || !perfil) { cont.innerHTML = `<div class="com-empty"><div class="com-empty-title">Perfil não encontrado</div></div>`; return; }

  const { data: posts } = await supabaseClient
    .from("comunidade_posts").select("id, texto, imagem_url, criado_em").eq("autor_id", usuarioId).order("criado_em", { ascending: false }).limit(30);

  const { count: totalPosts } = await supabaseClient
    .from("comunidade_posts").select("*", { count: "exact", head: true }).eq("autor_id", usuarioId);

  const ehMeuProprioPerfil = userSession && userSession.user.id === usuarioId;

  cont.innerHTML = `
    <div class="perfil-card">
      <div class="perfil-capa"></div>
      <div class="perfil-info">
        <div class="perfil-avatar-wrap">${avatarHtml(perfil.foto_url, 76)}</div>
        <div class="perfil-nome">${escapeHtml(perfil.nome || "Jogador")}</div>
        <div class="perfil-id">@${escapeHtml(perfil.id_online || "")}</div>
        <div class="perfil-bio ${perfil.bio ? "" : "vazia"}">${perfil.bio ? escapeHtml(perfil.bio) : "Sem bio ainda."}</div>
        <div class="perfil-stats">
          <div><div class="perfil-stat-num">${totalPosts || 0}</div><div class="perfil-stat-label">Posts</div></div>
        </div>
        ${ehMeuProprioPerfil ? "" : `
        <div class="perfil-acoes">
          <button class="btn primary" onclick='abrirOuCriarConversa(${JSON.stringify({ id: perfil.id, nome: perfil.nome, id_online: perfil.id_online, foto_url: perfil.foto_url }).replace(/'/g, "&apos;")})'>Enviar mensagem</button>
        </div>`}
      </div>
    </div>
    <div class="perfil-grid">
      ${(posts && posts.length) ? posts.map(p => renderGridItem(p)).join("") : `<div style="grid-column:1/-1"><div class="com-empty"><div class="com-empty-title">Sem posts ainda</div></div></div>`}
    </div>
  `;
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

  view.innerHTML = `
    <div class="perfil-card">
      <div class="perfil-capa"></div>
      <div class="perfil-info">
        <div class="perfil-avatar-wrap">${avatarHtml(meuPerfil.foto_url, 76)}</div>
        <div class="perfil-nome">${escapeHtml(meuPerfil.nome || "Jogador")}</div>
        <div class="perfil-id">@${escapeHtml(meuPerfil.id_online || "")}</div>
        <div class="perfil-bio ${meuPerfil.bio ? "" : "vazia"}">${meuPerfil.bio ? escapeHtml(meuPerfil.bio) : "Você ainda não escreveu uma bio."}</div>
        <div class="perfil-stats">
          <div><div class="perfil-stat-num">${totalPosts || 0}</div><div class="perfil-stat-label">Posts</div></div>
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
}

function cancelarEdicaoPerfil() {
  document.getElementById("meuPerfilEditar").style.display = "none";
  document.getElementById("meuPerfilView").style.display = "block";
  document.getElementById("editarFotoInput").value = "";
}

function atualizarContadorBio() {
  const len = document.getElementById("editarBioInput").value.length;
  document.getElementById("bioContador").textContent = len;
}

let novaFotoPerfilFile = null;
function previewFotoPerfil() {
  const file = document.getElementById("editarFotoInput").files[0];
  if (!file) return;
  novaFotoPerfilFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("editarAvatarPreview").innerHTML = `<img class="com-avatar" style="width:64px;height:64px" src="${e.target.result}" alt="">`;
  };
  reader.readAsDataURL(file);
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

    const { error } = await supabaseClient.from("perfis")
      .update({ nome, bio, foto_url: fotoUrl }).eq("id", userSession.user.id);
    if (error) throw error;

    meuPerfil.nome = nome;
    meuPerfil.bio = bio;
    meuPerfil.foto_url = fotoUrl;
    novaFotoPerfilFile = null;

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
