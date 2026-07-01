/* ════════════════════════════════════════════════════════════════
   LUMINA INTERACTIVE™ — PAINEL DA EQUIPE (equipe.js)
   Mesmo padrão do admin.html: Supabase com service_role key
   (bypassa RLS). Substitua SUPA_URL e SUPA_SERVICE_KEY abaixo.
   ════════════════════════════════════════════════════════════════ */

const SUPA_URL = "https://tqsalhscgkepttbczyjq.supabase.co";
const SUPA_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRxc2FsaHNjZ2tlcHR0YmN6eWpxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTQ5NTIwNSwiZXhwIjoyMDk1MDcxMjA1fQ.1qvrbIaOyAUED9OmsOqJuSP_HvGKzUMOaA82CPZQp1I";

const supaEquipe = window.supabase.createClient(SUPA_URL, SUPA_SERVICE_KEY, {
  auth: { persistSession: false, storageKey: "lumina-equipe-service" },
});

/* Client separado com a chave pública — usado só pra checar se quem
   está logando no painel da equipe é, na verdade, um administrador
   (autenticado via Supabase Auth, mesma base do admin.html).
   O storageKey precisa ser IGUAL ao usado em admin.html (supaAuth),
   pois é assim que a sessão criada aqui é reconhecida lá depois do redirect. */
const SUPA_ANON_KEY = "sb_publishable_Q99EhX_HpUVotGGqmWAf4A_pkiTB7bK";
const supaAuthCheck = window.supabase.createClient(SUPA_URL, SUPA_ANON_KEY, {
  auth: { storageKey: "lumina-equipe-auth" },
});

let eqIntegranteAtual = null;   // registro completo do integrante logado
let eqFuncoesCache = {};        // id -> {nome, cor}
let eqServicosCache = {};       // id -> serviço
let eqTimerInterval = null;
let eqChatCanal = null;
let eqUploadServicoId = null;

/* ────────────────────────────────────────────────────────────────
   HELPERS
   ──────────────────────────────────────────────────────────────── */
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function mostrarToast(msg, tipo) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "show" + (tipo ? " " + tipo : "");
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => { t.className = ""; }, 3200);
}

function formatarData(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR") + " às " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function corMoral(pct) {
  if (pct >= 70) return "#22c55e";
  if (pct >= 30) return "#fbbf24";
  return "#ef4444";
}

function classeMoral(pct) {
  if (pct >= 70) return "ok";
  if (pct >= 30) return "warn";
  return "danger";
}

/* ────────────────────────────────────────────────────────────────
   LOGIN
   ──────────────────────────────────────────────────────────────── */
async function verificarLoginEquipe() {
  const usuario = document.getElementById("eqUsuario").value.trim();
  const senha = document.getElementById("eqSenha").value;
  const errBox = document.getElementById("eqLoginErr");
  const demitidoBox = document.getElementById("eqDemitidoMsg");
  errBox.classList.remove("show");
  demitidoBox.style.display = "none";

  if (!usuario || !senha) {
    errBox.textContent = "Preencha usuário e senha.";
    errBox.classList.add("show");
    return;
  }

  // Verifica primeiro se é um administrador (login real via Supabase Auth).
  // Se for, redireciona direto para o painel de gestão em admin.html.
  const { data: authData, error: authErr } = await supaAuthCheck.auth.signInWithPassword({
    email: usuario, password: senha,
  });

  if (!authErr && authData.user) {
    const { data: perfilAdmin } = await supaEquipe
      .from("equipe_admins")
      .select("*")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (perfilAdmin) {
      // Mantém essa sessão de auth viva pro admin.html reconhecer (getSession)
      window.location.href = "admin.html#equipe";
      return;
    }
    // Autenticou mas não é admin cadastrado — encerra essa sessão de auth
    // e segue tentando como integrante comum (usuário pode coincidir com um e-mail).
    await supaAuthCheck.auth.signOut();
  }

  const { data, error } = await supaEquipe
    .from("equipe_integrantes")
    .select("*, equipe_funcoes(id, nome, cor)")
    .eq("usuario", usuario)
    .eq("senha", senha)
    .maybeSingle();

  if (error || !data) {
    errBox.textContent = "Usuário ou senha incorretos.";
    errBox.classList.add("show");
    return;
  }

  if (data.status === "demitido") {
    demitidoBox.style.display = "block";
    return;
  }

  eqIntegranteAtual = data;
  sessionStorage.setItem("eq_integrante_id", String(data.id));
  sessionStorage.setItem("eq_usuario", usuario);
  sessionStorage.setItem("eq_senha", senha);
  entrarNoPainel();
}

function logoutEquipe() {
  sessionStorage.removeItem("eq_integrante_id");
  sessionStorage.removeItem("eq_usuario");
  sessionStorage.removeItem("eq_senha");
  if (eqChatCanal) { supaEquipe.removeChannel(eqChatCanal); eqChatCanal = null; }
  if (eqTimerInterval) clearInterval(eqTimerInterval);
  eqIntegranteAtual = null;
  document.getElementById("eqPanel").style.display = "none";
  document.getElementById("eqLoginOverlay").style.display = "flex";
  document.getElementById("eqUsuario").value = "";
  document.getElementById("eqSenha").value = "";
}

async function tentarSessaoSalva() {
  const usuario = sessionStorage.getItem("eq_usuario");
  const senha = sessionStorage.getItem("eq_senha");
  if (!usuario || !senha) return;

  const { data, error } = await supaEquipe
    .from("equipe_integrantes")
    .select("*, equipe_funcoes(id, nome, cor)")
    .eq("usuario", usuario)
    .eq("senha", senha)
    .maybeSingle();

  if (error || !data || data.status === "demitido") {
    sessionStorage.removeItem("eq_integrante_id");
    sessionStorage.removeItem("eq_usuario");
    sessionStorage.removeItem("eq_senha");
    return;
  }

  eqIntegranteAtual = data;
  entrarNoPainel();
}

function entrarNoPainel() {
  document.getElementById("eqLoginOverlay").style.display = "none";
  document.getElementById("eqPanel").style.display = "block";
  atualizarNavIntegrante();
  carregarFuncoes().then(() => {
    carregarServicosDisponiveis();
    carregarServicosAndamento();
  });
  iniciarTimerGlobal();
}

function atualizarNavIntegrante() {
  const m = eqIntegranteAtual;
  document.getElementById("eqNome").textContent = m.nome;
  document.getElementById("eqFuncaoBadge").textContent = m.equipe_funcoes ? m.equipe_funcoes.nome : "—";
  const pct = m.moral;
  document.getElementById("moralMiniPct").textContent = pct + "%";
  document.getElementById("moralMiniFill").style.width = pct + "%";
  document.getElementById("moralMiniFill").style.background = corMoral(pct);
}

/* ────────────────────────────────────────────────────────────────
   FUNÇÕES/CARGOS (cache)
   ──────────────────────────────────────────────────────────────── */
async function carregarFuncoes() {
  const { data } = await supaEquipe.from("equipe_funcoes").select("*");
  eqFuncoesCache = {};
  (data || []).forEach((f) => { eqFuncoesCache[f.id] = f; });
}

/* ────────────────────────────────────────────────────────────────
   ABAS
   ──────────────────────────────────────────────────────────────── */
function mudarAbaEquipe(aba) {
  ["Servicos", "Andamento", "Chat", "Historico", "Moral"].forEach((a) => {
    document.getElementById("tab" + a).style.display = a === aba ? "block" : "none";
    document.getElementById("tab" + a + "Btn").classList.toggle("active", a === aba);
  });
  if (aba === "Servicos") carregarServicosDisponiveis();
  if (aba === "Andamento") carregarServicosAndamento();
  if (aba === "Chat") abrirChatEquipe();
  if (aba === "Historico") carregarHistorico();
  if (aba === "Moral") carregarPainelMoral();
}

/* ────────────────────────────────────────────────────────────────
   SERVIÇOS DISPONÍVEIS
   ──────────────────────────────────────────────────────────────── */
async function carregarServicosDisponiveis() {
  const grid = document.getElementById("servicosDisponiveisGrid");
  grid.innerHTML = `<div class="empty-state">Carregando...</div>`;

  const { data, error } = await supaEquipe
    .from("equipe_servicos")
    .select("*")
    .eq("funcao_id", eqIntegranteAtual.funcao_id)
    .eq("status", "disponivel")
    .order("prioridade", { ascending: false })
    .order("data_envio", { ascending: false });

  if (error) { grid.innerHTML = `<div class="empty-state">Erro ao carregar serviços.</div>`; return; }

  if (!data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state">Nenhum serviço disponível para sua função no momento.</div>`;
    return;
  }

  grid.innerHTML = "";
  data.forEach((s) => {
    eqServicosCache[s.id] = s;
    grid.insertAdjacentHTML("beforeend", montarCardServicoDisponivel(s));
  });
}

function montarCardServicoDisponivel(s) {
  const arquivos = Array.isArray(s.arquivos_urls) ? s.arquivos_urls : [];
  const arquivosHtml = arquivos.length
    ? `<div class="svc-arquivos">${arquivos.map(a => `<a class="svc-arquivo-item" href="${a.url}" target="_blank" rel="noopener">📎 ${escapeHtml(a.nome || "arquivo")}</a>`).join("")}</div>`
    : "";

  return `
    <div class="svc-card">
      <div class="svc-card-top">
        <div>
          <div class="svc-nome">${escapeHtml(s.nome)}</div>
        </div>
        <span class="svc-tag prio-${s.prioridade}">${labelPrioridade(s.prioridade)}</span>
      </div>
      <div class="svc-desc">${escapeHtml(s.descricao || "Sem descrição.")}</div>
      <div class="svc-meta">
        ${s.categoria ? `<span class="svc-tag">📂 ${escapeHtml(s.categoria)}</span>` : ""}
        <span class="svc-tag">⏳ ${s.prazo_dias} dia(s)</span>
        <span class="svc-tag">📅 ${formatarData(s.data_envio)}</span>
      </div>
      ${arquivosHtml}
      <div class="svc-actions">
        <button class="btn-aceitar" onclick="aceitarServico(${s.id})">Aceitar serviço</button>
        <button class="btn-recusar" onclick="recusarServico(${s.id})">Recusar</button>
      </div>
    </div>`;
}

function labelPrioridade(p) {
  return { baixa: "Baixa", media: "Média", alta: "Alta", urgente: "🔥 Urgente" }[p] || p;
}

async function aceitarServico(servicoId) {
  const { error } = await supaEquipe.rpc("equipe_aceitar_servico", {
    p_servico_id: servicoId,
    p_integrante_id: eqIntegranteAtual.id,
  });
  if (error) { mostrarToast("Erro ao aceitar serviço: " + error.message, "err"); return; }
  mostrarToast("Serviço aceito! Contador de prazo iniciado.", "ok");
  carregarServicosDisponiveis();
  carregarServicosAndamento();
}

async function recusarServico(servicoId) {
  if (!confirm("Tem certeza que deseja recusar este serviço? Você perderá 10% de moral.")) return;

  const { error } = await supaEquipe.rpc("equipe_recusar_servico", {
    p_servico_id: servicoId,
    p_integrante_id: eqIntegranteAtual.id,
  });
  if (error) { mostrarToast("Erro ao recusar serviço: " + error.message, "err"); return; }

  await recarregarIntegranteAtual();
  mostrarToast("Serviço recusado. Moral reduzida em 10%.", "err");
  carregarServicosDisponiveis();

  if (eqIntegranteAtual.status === "demitido") {
    mostrarToast("Sua moral chegou a 0%. Você foi demitido.", "err");
    setTimeout(logoutEquipe, 2500);
  }
}

async function recarregarIntegranteAtual() {
  const { data } = await supaEquipe
    .from("equipe_integrantes")
    .select("*, equipe_funcoes(id, nome, cor)")
    .eq("id", eqIntegranteAtual.id)
    .maybeSingle();
  if (data) { eqIntegranteAtual = data; atualizarNavIntegrante(); }
}

/* ────────────────────────────────────────────────────────────────
   SERVIÇOS EM ANDAMENTO (com timer)
   ──────────────────────────────────────────────────────────────── */
async function carregarServicosAndamento() {
  const grid = document.getElementById("servicosAndamentoGrid");
  grid.innerHTML = `<div class="empty-state">Carregando...</div>`;

  const { data, error } = await supaEquipe
    .from("equipe_servicos")
    .select("*")
    .eq("integrante_id", eqIntegranteAtual.id)
    .in("status", ["em_andamento", "aguardando_aprovacao", "alteracoes_solicitadas"])
    .order("prazo_final", { ascending: true });

  if (error) { grid.innerHTML = `<div class="empty-state">Erro ao carregar.</div>`; return; }

  if (!data || data.length === 0) {
    grid.innerHTML = `<div class="empty-state">Nenhum serviço em andamento.</div>`;
    return;
  }

  grid.innerHTML = "";
  data.forEach((s) => {
    eqServicosCache[s.id] = s;
    grid.insertAdjacentHTML("beforeend", montarCardServicoAndamento(s));
  });
}

function montarCardServicoAndamento(s) {
  const arquivos = Array.isArray(s.arquivos_urls) ? s.arquivos_urls : [];
  const arquivosHtml = arquivos.length
    ? `<div class="svc-arquivos">${arquivos.map(a => `<a class="svc-arquivo-item" href="${a.url}" target="_blank" rel="noopener">📎 ${escapeHtml(a.nome || "arquivo")}</a>`).join("")}</div>`
    : "";

  let acaoHtml = "";
  if (s.status === "em_andamento") {
    acaoHtml = `<button class="btn primary" style="width:100%" onclick="abrirModalUpload(${s.id})">Enviar Link do Drive</button>`;
  } else if (s.status === "aguardando_aprovacao") {
    acaoHtml = `<div class="empty-state" style="padding:10px 0;font-size:12.5px">Aguardando aprovação do administrador...</div>`;
  } else if (s.status === "alteracoes_solicitadas") {
    acaoHtml = `
      ${s.observacao_admin ? `<div style="background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.3);border-radius:10px;padding:10px 12px;font-size:12.5px;color:#fdba74">💬 ${escapeHtml(s.observacao_admin)}</div>` : ""}
      <button class="btn primary" style="width:100%" onclick="abrirModalUpload(${s.id})">Reenviar Link do Drive</button>`;
  }

  return `
    <div class="svc-card">
      <div class="svc-card-top">
        <div class="svc-nome">${escapeHtml(s.nome)}</div>
        <span class="status-badge status-${s.status}">${labelStatus(s.status)}</span>
      </div>
      <div class="svc-desc">${escapeHtml(s.descricao || "")}</div>
      <div class="svc-meta">
        ${s.categoria ? `<span class="svc-tag">📂 ${escapeHtml(s.categoria)}</span>` : ""}
        <span class="svc-tag prio-${s.prioridade}">${labelPrioridade(s.prioridade)}</span>
      </div>
      ${arquivosHtml}
      ${s.status === "em_andamento" ? `<div class="svc-timer" id="timer-svc-${s.id}" data-prazo="${s.prazo_final}">⏱️ calculando...</div>` : ""}
      ${acaoHtml}
    </div>`;
}

function labelStatus(s) {
  return {
    disponivel: "Disponível",
    em_andamento: "Em andamento",
    aguardando_aprovacao: "Aguardando aprovação",
    aprovado: "Aprovado",
    alteracoes_solicitadas: "Alterações solicitadas",
    reprovado: "Reprovado",
    recusado: "Recusado",
    atrasado: "Atrasado",
    cancelado: "Cancelado",
  }[s] || s;
}

/* ────────────────────────────────────────────────────────────────
   TIMER GLOBAL — atualiza todos os contadores visíveis a cada segundo
   ──────────────────────────────────────────────────────────────── */
function iniciarTimerGlobal() {
  if (eqTimerInterval) clearInterval(eqTimerInterval);
  eqTimerInterval = setInterval(atualizarTodosOsTimers, 1000);
}

function atualizarTodosOsTimers() {
  document.querySelectorAll("[id^='timer-svc-']").forEach((el) => {
    const prazo = el.getAttribute("data-prazo");
    if (!prazo) return;
    const restante = new Date(prazo).getTime() - Date.now();

    if (restante <= 0) {
      el.textContent = "⏱️ Prazo vencido — recusado automaticamente";
      el.className = "svc-timer danger";
      // recarrega a lista pra refletir o novo status (o backend marca via equipe_checar_prazos_vencidos)
      supaEquipe.rpc("equipe_checar_prazos_vencidos").then(() => {
        carregarServicosAndamento();
        recarregarIntegranteAtual();
      });
      return;
    }

    const dias = Math.floor(restante / 86400000);
    const horas = Math.floor((restante % 86400000) / 3600000);
    const min = Math.floor((restante % 3600000) / 60000);
    const seg = Math.floor((restante % 60000) / 1000);

    let texto = "⏱️ ";
    if (dias > 0) texto += `${dias}d ${horas}h ${min}m`;
    else if (horas > 0) texto += `${horas}h ${min}m ${seg}s`;
    else texto += `${min}m ${seg}s`;

    el.textContent = texto;
    el.className = "svc-timer" + (restante < 3600000 ? " danger" : restante < 86400000 ? " warn" : "");
  });
}

/* ────────────────────────────────────────────────────────────────
   MODAL DE ENTREGA — links do Google Drive (sem upload de arquivo)
   ──────────────────────────────────────────────────────────────── */
function abrirModalUpload(servicoId) {
  eqUploadServicoId = servicoId;
  const s = eqServicosCache[servicoId];
  document.getElementById("uploadModalServico").textContent = "Serviço: " + (s ? s.nome : "#" + servicoId);
  document.getElementById("uploadModalLinks").value = "";
  document.getElementById("uploadModalMsg").style.display = "none";
  document.getElementById("uploadModalOverlay").classList.add("show");
}

function fecharModalUpload() {
  document.getElementById("uploadModalOverlay").classList.remove("show");
  eqUploadServicoId = null;
}

/* Converte o textarea de links do Drive em [{nome, url}].
   Aceita "Nome | link" por linha, ou só o link (usa "Arquivo N" como nome). */
function parseLinksDrive(texto) {
  if (!texto || !texto.trim()) return [];
  return texto.split("\n").map((l) => l.trim()).filter(Boolean).map((linha, i) => {
    const partes = linha.split("|").map((p) => p.trim());
    if (partes.length >= 2) return { nome: partes[0], url: partes[1] };
    return { nome: "Arquivo " + (i + 1), url: partes[0] };
  }).filter((a) => a.url);
}

async function confirmarEnvioArquivos() {
  const textarea = document.getElementById("uploadModalLinks");
  const urls = parseLinksDrive(textarea.value);
  const msg = document.getElementById("uploadModalMsg");

  if (urls.length === 0) { mostrarToast("Cole ao menos um link do Google Drive.", "err"); return; }

  const btn = document.getElementById("btnConfirmarEnvio");
  btn.disabled = true;
  btn.textContent = "Enviando...";
  msg.style.display = "none";

  try {
    for (const a of urls) {
      await supaEquipe.from("equipe_arquivos_enviados").insert([{
        servico_id: eqUploadServicoId,
        integrante_id: eqIntegranteAtual.id,
        nome_arquivo: a.nome,
        url: a.url,
      }]);
    }

    const { error: updErr } = await supaEquipe
      .from("equipe_servicos")
      .update({ status: "aguardando_aprovacao", entrega_urls: urls, data_entrega: new Date().toISOString() })
      .eq("id", eqUploadServicoId);
    if (updErr) throw updErr;

    mostrarToast("Entrega enviada! Aguardando aprovação.", "ok");
    fecharModalUpload();
    carregarServicosAndamento();
  } catch (err) {
    msg.textContent = "Erro ao enviar: " + (err.message || "tente novamente.");
    msg.style.color = "#fca5a5";
    msg.style.display = "block";
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar para aprovação";
  }
}

/* ────────────────────────────────────────────────────────────────
   HISTÓRICO
   ──────────────────────────────────────────────────────────────── */
async function carregarHistorico() {
  const list = document.getElementById("historicoList");
  list.innerHTML = `<div class="empty-state">Carregando...</div>`;

  const { data, error } = await supaEquipe
    .from("equipe_servicos")
    .select("*")
    .eq("integrante_id", eqIntegranteAtual.id)
    .in("status", ["aprovado", "reprovado", "recusado", "cancelado"])
    .order("atualizado_em", { ascending: false });

  if (error) { list.innerHTML = `<div class="empty-state">Erro ao carregar.</div>`; return; }

  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state">Nenhum serviço no histórico ainda.</div>`;
    return;
  }

  list.innerHTML = data.map((s) => {
    const inicio = s.data_aceite ? formatarData(s.data_aceite) : "—";
    const entrega = s.data_entrega ? formatarData(s.data_entrega) : "—";
    let tempoUsado = "—";
    if (s.data_aceite && s.data_entrega) {
      const ms = new Date(s.data_entrega) - new Date(s.data_aceite);
      const dias = Math.floor(ms / 86400000);
      const horas = Math.floor((ms % 86400000) / 3600000);
      tempoUsado = `${dias}d ${horas}h`;
    }
    return `
      <div class="hist-item">
        <div class="hist-item-left">
          <div class="hist-nome">${escapeHtml(s.nome)}</div>
          <div class="hist-meta">${escapeHtml(s.categoria || "Sem categoria")} · Início: ${inicio} · Entrega: ${entrega} · Tempo: ${tempoUsado}</div>
        </div>
        <span class="status-badge status-${s.status}">${labelStatus(s.status)}</span>
      </div>`;
  }).join("");
}

/* ────────────────────────────────────────────────────────────────
   PAINEL DE MORAL
   ──────────────────────────────────────────────────────────────── */
async function carregarPainelMoral() {
  await recarregarIntegranteAtual();
  const m = eqIntegranteAtual;
  const pct = m.moral;

  const pctEl = document.getElementById("moralPainelPct");
  pctEl.textContent = pct + "%";
  pctEl.className = "moral-pct " + classeMoral(pct);

  const barEl = document.getElementById("moralPainelBar");
  barEl.style.width = pct + "%";
  barEl.style.background = corMoral(pct);

  document.getElementById("moralTotalRecusas").textContent = m.total_recusas;
  document.getElementById("moralTotalConcluidos").textContent = m.total_concluidos;
  document.getElementById("moralStatusAtual").textContent = m.status === "ativo" ? "Ativo" : "Demitido";
  document.getElementById("moralStatusAtual").style.color = m.status === "ativo" ? "#22c55e" : "#ef4444";

  const list = document.getElementById("moralHistoricoList");
  list.innerHTML = `<div class="empty-state">Carregando...</div>`;

  const { data, error } = await supaEquipe
    .from("equipe_moral_historico")
    .select("*")
    .eq("integrante_id", m.id)
    .order("criado_em", { ascending: false })
    .limit(50);

  if (error) { list.innerHTML = `<div class="empty-state">Erro ao carregar.</div>`; return; }

  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state">Nenhuma variação de moral registrada ainda. 🎉</div>`;
    return;
  }

  list.innerHTML = data.map((h) => `
    <div class="hist-item">
      <div class="hist-item-left">
        <div class="hist-nome">${motivoLabel(h.motivo)}</div>
        <div class="hist-meta">${formatarData(h.criado_em)}</div>
      </div>
      <span class="status-badge" style="color:${h.variacao < 0 ? '#fca5a5' : '#86efac'};border:1px solid ${h.variacao < 0 ? 'rgba(239,68,68,.3)' : 'rgba(34,197,94,.3)'};background:${h.variacao < 0 ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.1)'}">${h.variacao > 0 ? "+" : ""}${h.variacao}%</span>
    </div>`).join("");
}

function motivoLabel(m) {
  return {
    recusa_servico: "Recusa de serviço",
    prazo_vencido: "Prazo vencido",
    redefinicao_admin: "Moral redefinida pelo administrador",
  }[m] || m;
}

/* ────────────────────────────────────────────────────────────────
   CHAT DA EQUIPE (tempo real — mesmo padrão da comunidade)
   ──────────────────────────────────────────────────────────────── */
async function abrirChatEquipe() {
  const msgsEl = document.getElementById("eqChatMsgs");
  msgsEl.innerHTML = `<div class="empty-state">Carregando mensagens...</div>`;

  const { data, error } = await supaEquipe
    .from("equipe_mensagens")
    .select("*, equipe_integrantes(id, nome, avatar_url)")
    .order("criado_em", { ascending: true })
    .limit(200);

  if (error) { msgsEl.innerHTML = `<div class="empty-state">Erro ao carregar chat.</div>`; return; }

  msgsEl.innerHTML = "";
  (data || []).forEach((m) => adicionarMensagemEquipe(m));
  scrollChatEquipeParaFim();

  if (eqChatCanal) supaEquipe.removeChannel(eqChatCanal);
  eqChatCanal = supaEquipe
    .channel("equipe_chat_global")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "equipe_mensagens" }, async (payload) => {
      const { data: autor } = await supaEquipe.from("equipe_integrantes").select("id, nome, avatar_url").eq("id", payload.new.autor_id).maybeSingle();
      adicionarMensagemEquipe({ ...payload.new, equipe_integrantes: autor });
      scrollChatEquipeParaFim();
    })
    .subscribe();
}

function adicionarMensagemEquipe(m) {
  const msgsEl = document.getElementById("eqChatMsgs");
  const minha = m.autor_id === eqIntegranteAtual.id;
  const autor = m.equipe_integrantes || { nome: "Integrante" };
  const iniciais = (autor.nome || "?").trim().charAt(0).toUpperCase();

  const div = document.createElement("div");
  div.className = "eq-chat-msg" + (minha ? " mine" : "");

  const avatarHtml = autor.avatar_url
    ? `<img class="eq-chat-avatar" src="${autor.avatar_url}" alt="">`
    : `<div class="eq-chat-avatar">${iniciais}</div>`;

  let conteudo = "";
  if (m.imagem_url) conteudo += `<img class="eq-chat-img" src="${m.imagem_url}" onclick="window.open('${m.imagem_url}','_blank')">`;
  if (m.arquivo_url) conteudo += `<a class="eq-chat-file" href="${m.arquivo_url}" target="_blank" rel="noopener">📎 ${escapeHtml(m.arquivo_nome || "arquivo")}</a><br>`;
  if (m.texto) conteudo += `<div class="eq-chat-text">${escapeHtml(m.texto)}</div>`;

  div.innerHTML = `
    ${avatarHtml}
    <div>
      <div class="eq-chat-name">${escapeHtml(autor.nome)}</div>
      <div class="eq-chat-bubble">${conteudo}</div>
      <div class="eq-chat-time">${new Date(m.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div>
    </div>`;
  msgsEl.appendChild(div);
}

function scrollChatEquipeParaFim() {
  const msgsEl = document.getElementById("eqChatMsgs");
  msgsEl.scrollTop = msgsEl.scrollHeight;
}

async function enviarMensagemEquipe() {
  const input = document.getElementById("eqChatInput");
  const texto = input.value.trim();
  if (!texto) return;
  input.value = "";

  const { error } = await supaEquipe.from("equipe_mensagens").insert([{ autor_id: eqIntegranteAtual.id, texto }]);
  if (error) mostrarToast("Erro ao enviar mensagem: " + error.message, "err");
}

document.addEventListener("DOMContentLoaded", () => {
  const imgInput = document.getElementById("eqChatImgInput");
  const fileInput = document.getElementById("eqChatFileInput");

  if (imgInput) imgInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    try {
      const nomeArq = `chat/${Date.now()}_${file.name}`;
      const { error: upErr } = await supaEquipe.storage.from("equipe_chat").upload(nomeArq, file);
      if (upErr) throw upErr;
      const { data: urlData } = supaEquipe.storage.from("equipe_chat").getPublicUrl(nomeArq);
      await supaEquipe.from("equipe_mensagens").insert([{ autor_id: eqIntegranteAtual.id, imagem_url: urlData.publicUrl }]);
    } catch (err) {
      mostrarToast("Erro ao enviar imagem: " + err.message, "err");
    }
  });

  if (fileInput) fileInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    try {
      const nomeArq = `chat/${Date.now()}_${file.name}`;
      const { error: upErr } = await supaEquipe.storage.from("equipe_chat").upload(nomeArq, file);
      if (upErr) throw upErr;
      const { data: urlData } = supaEquipe.storage.from("equipe_chat").getPublicUrl(nomeArq);
      await supaEquipe.from("equipe_mensagens").insert([{ autor_id: eqIntegranteAtual.id, arquivo_url: urlData.publicUrl, arquivo_nome: file.name }]);
    } catch (err) {
      mostrarToast("Erro ao enviar arquivo: " + err.message, "err");
    }
  });
});

/* ────────────────────────────────────────────────────────────────
   INIT
   ──────────────────────────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", tentarSessaoSalva);
