// ============================================================
//  estoque.js — Gerenciamento de estoques por cidade
// ============================================================

import {
  observarAuth, getDadosUsuario, logout,
  listarEstoque, listarEstoques,
  criarEstoque, deletarEstoque,
  adicionarPneusEmLote,
  inutilizarPneu, reativarPneu,
  transferirPneuEstoque,
  enviarParaRecapagem, receberDeRecapagem,
  atualizarCondicaoPneu,
} from './firebase.js';

// ─── Estado ─────────────────────────────────
let usuarioLogado    = null;
let todosEstoques    = [];
let todosPneus       = [];
let estoqueAtivo     = null;
let filtroStatus     = 'todos';
let buscaAtiva       = '';
let pneuAlvo         = null;

// ─── Estado: seleção múltipla ────────────────
let modoSelecao       = false;
let pneusSelecionados = new Set(); // set de ids selecionados
let modoLote          = false;     // flag: transfer modal em modo lote

// ─── Elementos ──────────────────────────────
const pneusGrid    = document.getElementById('pneusGrid');
const stateLoading = document.getElementById('stateLoading');
const stateEmpty   = document.getElementById('stateEmpty');
const emptyTitle   = document.getElementById('emptyTitle');
const emptyMsg     = document.getElementById('emptyMsg');
const searchInput  = document.getElementById('searchInput');
const estoquesTabs = document.getElementById('estoquesTabs');

// ─── Injetar botão "Selecionar" e barra flutuante ───
injetarControlesSelecao();

function injetarControlesSelecao() {
  // Botão "Selecionar" — injeta na action-bar-right se existir
  const btnSel = document.createElement('button');
  btnSel.id        = 'btnSelecionar';
  btnSel.className = 'btn-secondary';
  btnSel.style.cssText = 'display:inline-flex;align-items:center;gap:6px;';
  btnSel.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <polyline points="9 11 12 14 22 4"/>
    </svg>
    Selecionar`;
  btnSel.addEventListener('click', toggleModoSelecao);

  const actionBarRight = document.querySelector('.action-bar-right');
  if (actionBarRight) {
    actionBarRight.prepend(btnSel);
  } else {
    btnSel.style.position = 'fixed';
    btnSel.style.top      = '80px';
    btnSel.style.right    = '24px';
    btnSel.style.zIndex   = '90';
    document.body.appendChild(btnSel);
  }

  // Barra flutuante de seleção (parte inferior)
  const barra = document.createElement('div');
  barra.id = 'barraSelecao';
  barra.style.cssText = `
    display: none;
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 200;
    background: var(--card);
    border: 1.5px solid var(--accent);
    border-radius: var(--radius);
    box-shadow: var(--sombra);
    padding: 12px 20px;
    align-items: center;
    gap: 16px;
    white-space: nowrap;
    animation: fadeUp 0.2s ease both;
  `;
  barra.innerHTML = `
    <span id="barraCount" style="font-size:14px;font-weight:600;color:var(--texto);">
      0 selecionados
    </span>
    <button id="barraSelecionarTodos" style="
      background:var(--cinza-soft);border:1px solid var(--borda);
      border-radius:var(--radius-sm);padding:7px 14px;
      font-size:13px;font-weight:600;color:var(--texto-sub);cursor:pointer;">
      Selecionar todos
    </button>
    <button id="barraTransferir" style="
      background:var(--accent);border:none;
      border-radius:var(--radius-sm);padding:8px 18px;
      font-family:var(--font-display);font-size:15px;
      font-weight:700;letter-spacing:0.5px;color:#0F1117;cursor:pointer;">
      Transferir selecionados
    </button>
    <button id="barraCancelar" style="
      background:none;border:none;cursor:pointer;
      color:var(--texto-muted);font-size:13px;font-weight:600;
      padding:4px 8px;">
      Cancelar
    </button>
  `;
  document.body.appendChild(barra);

  document.getElementById('barraCancelar').addEventListener('click', cancelarSelecao);
  document.getElementById('barraTransferir').addEventListener('click', abrirModalTransferirLote);
  document.getElementById('barraSelecionarTodos').addEventListener('click', selecionarTodos);
}

// ─── Modo seleção ────────────────────────────
function toggleModoSelecao() {
  modoSelecao = !modoSelecao;
  pneusSelecionados.clear();

  const btnSel = document.getElementById('btnSelecionar');
  const barra  = document.getElementById('barraSelecao');

  if (modoSelecao) {
    btnSel.style.background  = 'var(--accent-soft)';
    btnSel.style.borderColor = 'var(--accent)';
    btnSel.style.color       = 'var(--accent)';
    barra.style.display      = 'flex';
  } else {
    btnSel.style.background  = '';
    btnSel.style.borderColor = '';
    btnSel.style.color       = '';
    barra.style.display      = 'none';
  }

  atualizarBarra();
  renderizarGrade();
}

function cancelarSelecao() {
  modoSelecao = false;
  pneusSelecionados.clear();
  const btnSel = document.getElementById('btnSelecionar');
  btnSel.style.background  = '';
  btnSel.style.borderColor = '';
  btnSel.style.color       = '';
  document.getElementById('barraSelecao').style.display = 'none';
  renderizarGrade();
}

function selecionarTodos() {
  let lista = pneusDoEstoqueAtivo();
  if (filtroStatus !== 'todos') lista = lista.filter(p => p.status === filtroStatus);
  if (buscaAtiva) {
    const q = buscaAtiva.toLowerCase();
    lista = lista.filter(p => p.numero_identificacao?.toLowerCase().includes(q));
  }
  const todosJaSelecionados = lista.length > 0 && lista.every(p => pneusSelecionados.has(p.id));
  if (todosJaSelecionados) {
    lista.forEach(p => pneusSelecionados.delete(p.id));
  } else {
    lista.forEach(p => pneusSelecionados.add(p.id));
  }
  atualizarBarra();
  renderizarGrade();
}

function atualizarBarra() {
  const count = pneusSelecionados.size;
  document.getElementById('barraCount').textContent =
    `${count} pneu${count !== 1 ? 's' : ''} selecionado${count !== 1 ? 's' : ''}`;

  const btnTransferir = document.getElementById('barraTransferir');
  btnTransferir.disabled      = count === 0;
  btnTransferir.style.opacity = count === 0 ? '0.5' : '1';
  btnTransferir.style.cursor  = count === 0 ? 'not-allowed' : 'pointer';

  // Texto do "selecionar todos"
  let lista = pneusDoEstoqueAtivo();
  if (filtroStatus !== 'todos') lista = lista.filter(p => p.status === filtroStatus);
  if (buscaAtiva) {
    const q = buscaAtiva.toLowerCase();
    lista = lista.filter(p => p.numero_identificacao?.toLowerCase().includes(q));
  }
  const todosJaSelecionados = lista.length > 0 && lista.every(p => pneusSelecionados.has(p.id));
  document.getElementById('barraSelecionarTodos').textContent =
    todosJaSelecionados ? 'Desmarcar todos' : 'Selecionar todos';
}

// ─── Auth ────────────────────────────────────
observarAuth(async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  const dados = await getDadosUsuario(user.uid);
  if (!dados || dados.ativo === false) {
    await logout(); window.location.href = 'login.html'; return;
  }
  usuarioLogado = { ...dados, uid: user.uid };
  document.getElementById('userAvatar').textContent =
    (usuarioLogado.nome || 'U')[0].toUpperCase();

  const params = new URLSearchParams(window.location.search);
  if (params.get('busca')) {
    buscaAtiva = params.get('busca');
    searchInput.value = buscaAtiva;
  }

  await carregarTudo();
});

// ─── Carregar tudo ───────────────────────────
async function carregarTudo() {
  mostrarEstado('loading');
  try {
    [todosEstoques, todosPneus] = await Promise.all([
      listarEstoques(),
      listarEstoque(),
    ]);
    renderizarTabs();
    atualizarKpis();
    renderizarGrade();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao carregar estoque.', 'error');
    mostrarEstado('empty');
  }
}

// ─── Tabs de estoque ─────────────────────────
function renderizarTabs() {
  estoquesTabs.innerHTML = '';

  const btnSem = criarTabBtn(null, 'Campo Grande', todosPneus.filter(p => !p.estoque_id).length);
  estoquesTabs.appendChild(btnSem);

  todosEstoques.forEach(e => {
    const qtd = todosPneus.filter(p => p.estoque_id === e.id).length;
    const btn = criarTabBtn(e, e.nome, qtd);
    estoquesTabs.appendChild(btn);
  });

  const btnNovo = document.createElement('button');
  btnNovo.className = 'estoque-tab-btn estoque-tab-novo';
  btnNovo.title = 'Criar novo estoque';
  btnNovo.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Novo`;
  btnNovo.addEventListener('click', () => abrirModalNovoEstoque());
  estoquesTabs.appendChild(btnNovo);
}

function criarTabBtn(estoque, label, qtd) {
  const btn = document.createElement('button');
  const isAtivo = estoque === null
    ? estoqueAtivo === null
    : estoqueAtivo?.id === estoque?.id;
  btn.className = `estoque-tab-btn${isAtivo ? ' active' : ''}`;
  btn.innerHTML = `${label}<span class="estoque-tab-count">${qtd}</span>`;

  btn.addEventListener('click', () => {
    estoqueAtivo = estoque;
    filtroStatus = 'todos';
    buscaAtiva   = '';
    searchInput.value = '';
    pneusSelecionados.clear();
    atualizarBarra();
    document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
    document.querySelector('.ftab[data-filtro="todos"]')?.classList.add('active');
    renderizarTabs();
    atualizarKpis();
    renderizarGrade();
  });

  if (estoque !== null) {
    const del = document.createElement('span');
    del.className = 'estoque-tab-del';
    del.title = 'Deletar estoque';
    del.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="10" height="10"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      abrirModalDeletarEstoque(estoque);
    });
    btn.appendChild(del);
  }

  return btn;
}

// ─── KPIs ────────────────────────────────────
function atualizarKpis() {
  const lista = pneusDoEstoqueAtivo();
  document.getElementById('kpiTotal').textContent        = lista.length;
  document.getElementById('kpiDisponivel').textContent   = lista.filter(p => p.status === 'disponivel').length;
  document.getElementById('kpiEmUso').textContent        = lista.filter(p => p.status === 'em_uso').length;
  document.getElementById('kpiInutilizavel').textContent = lista.filter(p => p.status === 'inutilizavel').length;
  // kpiRecapagem é opcional — só atualiza se o elemento existir
  const kpiRec = document.getElementById('kpiRecapagem');
  if (kpiRec) kpiRec.textContent = lista.filter(p => p.status === 'em_recapagem').length;
  document.getElementById('estoqueNomeLabel').textContent =
    estoqueAtivo ? estoqueAtivo.nome : 'Campo Grande';
}

function pneusDoEstoqueAtivo() {
  if (estoqueAtivo === null) return todosPneus.filter(p => !p.estoque_id);
  return todosPneus.filter(p => p.estoque_id === estoqueAtivo.id);
}

// ─── Renderizar grade ────────────────────────
function renderizarGrade() {
  stateLoading.style.display = 'none';
  let lista = pneusDoEstoqueAtivo();

  if (filtroStatus !== 'todos') lista = lista.filter(p => p.status === filtroStatus);
  if (buscaAtiva) {
    const q = buscaAtiva.toLowerCase();
    lista = lista.filter(p => p.numero_identificacao?.toLowerCase().includes(q));
  }

  if (lista.length === 0) {
    pneusGrid.style.display  = 'none';
    stateEmpty.style.display = 'flex';
    if (buscaAtiva) {
      emptyTitle.textContent = 'Nenhum resultado';
      emptyMsg.textContent   = `Nenhum pneu encontrado para "${buscaAtiva}".`;
    } else if (filtroStatus !== 'todos') {
      const labels = { disponivel: 'disponível', em_uso: 'em uso', inutilizavel: 'inutilizável', em_recapagem: 'em recapagem' };
      emptyTitle.textContent = `Nenhum pneu ${labels[filtroStatus]}`;
      emptyMsg.textContent   = 'Tente outro filtro.';
    } else {
      emptyTitle.textContent = 'Estoque vazio';
      emptyMsg.textContent   = estoqueAtivo
        ? `Nenhum pneu em ${estoqueAtivo.nome}.`
        : 'Nenhum pneu em Campo Grande.';
    }
    return;
  }

  stateEmpty.style.display = 'none';
  pneusGrid.style.display  = 'grid';
  pneusGrid.innerHTML      = '';
  lista.forEach((p, idx) => pneusGrid.appendChild(criarCardPneu(p, idx)));

  if (modoSelecao) atualizarBarra();
}

// ─── Card de pneu ────────────────────────────
function criarCardPneu(p, idx) {
  const selecionado = pneusSelecionados.has(p.id);
  const card = document.createElement('div');
  card.className = `pneu-card ${p.status}`;
  card.style.animationDelay = `${idx * 20}ms`;
  card.style.position = 'relative';

  if (modoSelecao) {
    card.style.cursor = 'pointer';
    if (selecionado) {
      card.style.borderColor = 'var(--accent)';
      card.style.boxShadow   = '0 0 0 2px var(--accent-soft), var(--sombra-card)';
    }
  }

  const statusLabel = {
    disponivel:    'Disponível',
    em_uso:        'Em Uso',
    inutilizavel:  'Inutilizável',
    em_recapagem:  'Em Recapagem',
  }[p.status] || p.status;

  // Badge condição
  const condicao = p.condicao || 'novo';
  const condicaoCfg = { novo: { label: 'Novo', cls: 'condicao-novo' }, medio: { label: 'Médio', cls: 'condicao-medio' }, ruim: { label: 'Ruim', cls: 'condicao-ruim' } };
  const cc = condicaoCfg[condicao] || condicaoCfg.novo;
  const condicaoHtml = `<span class="badge-condicao ${cc.cls}">${cc.label}</span>`;

  // Badge recapado
  const recapadoHtml = p.qtd_recapagens > 0 ? `
    <div class="badge-recapado">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="23 4 23 10 17 10"/>
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
      </svg>
      Recapado × ${p.qtd_recapagens}
    </div>` : '';

  // Checkmark de seleção
  const checkHtml = modoSelecao ? `
    <div style="
      position:absolute;top:10px;right:10px;
      width:22px;height:22px;border-radius:50%;
      border:2px solid ${selecionado ? 'var(--accent)' : 'var(--borda-light)'};
      background:${selecionado ? 'var(--accent)' : 'transparent'};
      display:flex;align-items:center;justify-content:center;
      transition:all 0.15s ease;flex-shrink:0;z-index:1;">
      ${selecionado ? `<svg viewBox="0 0 24 24" fill="none" stroke="#0F1117" stroke-width="3.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
    </div>` : '';

  let infoExtra = '';
  if (p.status === 'em_uso') {
    infoExtra = `
      <div class="pneu-info-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
          <line x1="3" y1="10" x2="21" y2="10"/>
        </svg>
        <span>${p.obra_nome || 'Obra desconhecida'}</span>
      </div>
      <div class="pneu-info-row">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="1" y="3" width="15" height="13" rx="2"/>
          <path d="M16 8h4l3 3v5h-7V8z"/>
          <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
        </svg>
        <span>${p.caminhao_nome || 'Veículo desconhecido'}</span>
      </div>`;
  }
  if (p.status === 'inutilizavel' && p.motivo_inutilizacao) {
    infoExtra = `<div class="pneu-info-motivo">${p.motivo_inutilizacao}</div>`;
  }
  if (p.status === 'inutilizavel' && p.data_inutilizacao) {
    const d = p.data_inutilizacao?.toDate?.() || new Date();
    infoExtra += `<div class="pneu-info-row" style="margin-top:2px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      ${d.toLocaleDateString('pt-BR')}
    </div>`;
  }

  // Botões de ação (ocultos no modo seleção)
  let acoesHtml = '';
  if (!modoSelecao) {
    if (p.status === 'disponivel' || p.status === 'em_uso') {
      acoesHtml += `<button class="btn-pneu-action inutilizar" data-id="${p.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg> Inutilizar
      </button>`;
    } else if (p.status === 'inutilizavel') {
      acoesHtml += `<button class="btn-pneu-action reativar" data-id="${p.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg> Reativar
      </button>`;
    }
    // Botão enviar para recapagem — disponivel e inutilizavel
    if (p.status === 'disponivel' || p.status === 'inutilizavel') {
      acoesHtml += `<button class="btn-pneu-action recapar" data-id="${p.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg> Recapar
      </button>`;
    }
    // Botão chegou da recapagem
    if (p.status === 'em_recapagem') {
      acoesHtml += `<button class="btn-pneu-action recebido" data-id="${p.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"/>
        </svg> Chegou
      </button>`;
    }
    if (todosEstoques.length > 0 && p.status !== 'em_recapagem') {
      acoesHtml += `<button class="btn-pneu-action transferir" data-id="${p.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg> Transferir
      </button>`;
    }
  }

  card.innerHTML = `
    ${checkHtml}
    <div class="pneu-card-top">
      <div class="pneu-icone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
        </svg>
      </div>
      <span class="status-badge">${statusLabel}</span>
      ${condicaoHtml}
    </div>
    <div class="pneu-numero">${p.numero_identificacao}</div>
    ${recapadoHtml}
    ${p.estoque_nome ? `<div class="pneu-estoque-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>${p.estoque_nome}</div>` : ''}
    ${infoExtra ? `<div class="pneu-card-info">${infoExtra}</div>` : ''}
    <div class="pneu-card-actions">${acoesHtml}</div>`;

  if (modoSelecao) {
    card.addEventListener('click', () => {
      if (pneusSelecionados.has(p.id)) {
        pneusSelecionados.delete(p.id);
      } else {
        pneusSelecionados.add(p.id);
      }
      atualizarBarra();
      renderizarGrade();
    });
  } else {
    card.querySelector('.inutilizar')?.addEventListener('click', () => abrirModalInutilizar(p));
    card.querySelector('.reativar')?.addEventListener('click',   () => abrirModalReativar(p));
    card.querySelector('.transferir')?.addEventListener('click', () => abrirModalTransferir(p));
    card.querySelector('.recapar')?.addEventListener('click',    () => abrirModalRecapar(p));
    card.querySelector('.recebido')?.addEventListener('click',   () => abrirModalRecebido(p));
    card.querySelector('.badge-condicao')?.addEventListener('click', () => abrirModalCondicao(p));
  }

  return card;
}

// ─── Filtros status ──────────────────────────
document.querySelectorAll('.ftab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filtroStatus = btn.dataset.filtro;
    renderizarGrade();
  });
});

searchInput.addEventListener('input', () => {
  buscaAtiva = searchInput.value.trim();
  renderizarGrade();
});

// ─── Modal: Novo estoque ─────────────────────
function abrirModalNovoEstoque() {
  document.getElementById('novoEstoqueNome').value = '';
  document.getElementById('novoEstoqueNomeError').textContent = '';
  abrirModal('modalNovoEstoque');
}

document.getElementById('salvarNovoEstoque').addEventListener('click', async () => {
  const nome = document.getElementById('novoEstoqueNome').value.trim();
  const errEl = document.getElementById('novoEstoqueNomeError');
  if (!nome) { errEl.textContent = 'Informe o nome da cidade.'; return; }
  if (todosEstoques.some(e => e.nome.toLowerCase() === nome.toLowerCase())) {
    errEl.textContent = 'Já existe um estoque com esse nome.'; return;
  }
  const btn = document.getElementById('salvarNovoEstoque');
  setLoadingBtn(btn, true, 'Criando...');
  try {
    const id = await criarEstoque(nome, usuarioLogado.uid, usuarioLogado.nome);
    fecharModal('modalNovoEstoque');
    mostrarToast(`Estoque "${nome}" criado! ✓`, 'success');
    estoqueAtivo = { id, nome };
    await carregarTudo();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao criar estoque.', 'error');
  } finally {
    setLoadingBtn(btn, false, 'Criar');
  }
});

// ─── Modal: Deletar estoque ──────────────────
function abrirModalDeletarEstoque(estoque) {
  pneuAlvo = estoque;
  document.getElementById('deletarEstoqueNome').textContent = estoque.nome;
  const qtd = todosPneus.filter(p => p.estoque_id === estoque.id).length;
  document.getElementById('deletarEstoqueInfo').textContent =
    qtd > 0 ? `⚠️ Este estoque tem ${qtd} pneu(s). Transfira-os antes de deletar.` : '';
  abrirModal('modalDeletarEstoque');
}

document.getElementById('confirmarDeletarEstoque').addEventListener('click', async () => {
  const btn = document.getElementById('confirmarDeletarEstoque');
  setLoadingBtn(btn, true, 'Deletando...');
  try {
    await deletarEstoque(pneuAlvo.id);
    if (estoqueAtivo?.id === pneuAlvo.id) estoqueAtivo = null;
    fecharModal('modalDeletarEstoque');
    mostrarToast(`Estoque "${pneuAlvo.nome}" deletado.`, 'info');
    await carregarTudo();
  } catch (err) {
    console.error(err);
    mostrarToast(err.message || 'Erro ao deletar estoque.', 'error');
  } finally {
    setLoadingBtn(btn, false, 'Deletar');
    pneuAlvo = null;
  }
});

// ─── Modal: Adicionar pneus ──────────────────
const qtdInput = document.getElementById('qtdPneus');
const qtyHint  = document.getElementById('qtyHint');

function atualizarHint() {
  const v    = parseInt(qtdInput.value) || 1;
  const dest = estoqueAtivo ? `estoque de ${estoqueAtivo.nome}` : 'Campo Grande';
  qtyHint.textContent = `${v} pneu(s) serão adicionados ao ${dest}`;
}

document.getElementById('qtyMinus').addEventListener('click', () => {
  qtdInput.value = Math.max(1, (parseInt(qtdInput.value) || 1) - 1);
  atualizarHint();
});
document.getElementById('qtyPlus').addEventListener('click', () => {
  qtdInput.value = Math.min(200, (parseInt(qtdInput.value) || 1) + 1);
  atualizarHint();
});
qtdInput.addEventListener('input', atualizarHint);

document.getElementById('btnAddEstoque').addEventListener('click', () => {
  qtdInput.value = 1;
  atualizarHint();
  abrirModal('modalAddEstoque');
});

document.getElementById('salvarAddEstoque').addEventListener('click', async () => {
  const qtd = Math.max(1, Math.min(200, parseInt(qtdInput.value) || 1));
  const btn = document.getElementById('salvarAddEstoque');
  setLoadingBtn(btn, true, `Adicionando ${qtd}...`);
  try {
    await adicionarPneusEmLote(qtd, estoqueAtivo?.id || null, estoqueAtivo?.nome || null);
    fecharModal('modalAddEstoque');
    mostrarToast(`${qtd} pneu(s) adicionado(s)! ✓`, 'success');
    await carregarTudo();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao adicionar pneus.', 'error');
  } finally {
    setLoadingBtn(btn, false, 'Confirmar');
  }
});

// ─── Modal: Transferir — preenchimento da lista ──
function preencherListaTransferir(estoqueAtualId) {
  const lista = document.getElementById('transferirEstoqueLista');
  lista.innerHTML = '';

  const opcoes = [
    { id: null, nome: 'Campo Grande' },
    ...todosEstoques,
  ].filter(e => e.id !== estoqueAtualId);

  if (opcoes.length === 0) {
    lista.innerHTML = '<p class="sem-pneus">Não há outros estoques disponíveis.</p>';
  } else {
    opcoes.forEach(e => {
      const item = document.createElement('div');
      item.className = 'estoque-select-item';
      const qtd = todosPneus.filter(x => (x.estoque_id || null) === e.id).length;
      item.innerHTML = `
        <div class="estoque-item-info">
          <span class="estoque-item-nome">${e.nome}</span>
          <span class="estoque-item-qtd">${qtd} pneu(s)</span>
        </div>`;
      item.addEventListener('click', () => {
        lista.querySelectorAll('.estoque-select-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        document.getElementById('confirmarTransferir').disabled = false;
        document.getElementById('confirmarTransferir').dataset.novoId   = e.id || '';
        document.getElementById('confirmarTransferir').dataset.novoNome = e.nome;
      });
      lista.appendChild(item);
    });
  }

  document.getElementById('confirmarTransferir').disabled = true;
}

// ─── Modal: Transferir individual ───────────
function abrirModalTransferir(p) {
  modoLote = false;
  pneuAlvo = p;

  const titulo = document.getElementById('transferirPneuNum');
  const origem = document.getElementById('transferirPneuOrigem');
  if (titulo) titulo.textContent = p.numero_identificacao;
  if (origem) origem.textContent = p.estoque_nome || 'Campo Grande';

  preencherListaTransferir(p.estoque_id || null);
  abrirModal('modalTransferir');
}

// ─── Modal: Transferir em lote ───────────────
function abrirModalTransferirLote() {
  if (pneusSelecionados.size === 0) return;
  modoLote = true;
  pneuAlvo = null;

  const count  = pneusSelecionados.size;
  const titulo = document.getElementById('transferirPneuNum');
  const origem = document.getElementById('transferirPneuOrigem');
  if (titulo) titulo.textContent = `${count} pneu${count !== 1 ? 's' : ''} selecionado${count !== 1 ? 's' : ''}`;
  if (origem) origem.textContent = estoqueAtivo ? estoqueAtivo.nome : 'Campo Grande';

  preencherListaTransferir(estoqueAtivo?.id || null);
  abrirModal('modalTransferir');
}

// ─── Confirmar transferência (individual ou lote) ──
document.getElementById('confirmarTransferir').addEventListener('click', async () => {
  const btn      = document.getElementById('confirmarTransferir');
  const novoId   = btn.dataset.novoId   || null;
  const novoNome = btn.dataset.novoNome || null;
  const destNome = novoNome;
  const destId   = novoNome === 'Campo Grande' ? null : (novoId || null);
  const destNomeFirestore = novoNome === 'Campo Grande' ? null : novoNome;

  if (modoLote) {
    const ids   = [...pneusSelecionados];
    const total = ids.length;
    setLoadingBtn(btn, true, `Transferindo ${total}...`);
    try {
      await Promise.all(ids.map(id => transferirPneuEstoque(id, destId, destNomeFirestore)));
      fecharModal('modalTransferir');
      mostrarToast(`${total} pneu${total !== 1 ? 's' : ''} transferido${total !== 1 ? 's' : ''} para ${destNome}! ✓`, 'success');
      cancelarSelecao();
      await carregarTudo();
    } catch (err) {
      console.error(err);
      mostrarToast('Erro ao transferir pneus.', 'error');
    } finally {
      setLoadingBtn(btn, false, 'Transferir');
    }
  } else {
    setLoadingBtn(btn, true, 'Transferindo...');
    try {
      await transferirPneuEstoque(pneuAlvo.id, destId, destNomeFirestore);
      fecharModal('modalTransferir');
      mostrarToast(`Pneu ${pneuAlvo.numero_identificacao} transferido para ${destNome}! ✓`, 'success');
      await carregarTudo();
    } catch (err) {
      console.error(err);
      mostrarToast('Erro ao transferir pneu.', 'error');
    } finally {
      setLoadingBtn(btn, false, 'Transferir');
      pneuAlvo = null;
    }
  }
});

// ─── Modal: Inutilizar ───────────────────────
function abrirModalInutilizar(p) {
  pneuAlvo = p;
  document.getElementById('inutPneuNum').textContent    = p.numero_identificacao;
  document.getElementById('inutPneuStatus').textContent =
    p.status === 'em_uso' ? '⚠️ Pneu em uso — será removido do veículo' : 'Disponível no estoque';
  document.getElementById('motivoError').textContent = '';
  document.getElementById('motivoLivreWrap').style.display = 'none';
  document.getElementById('motivoLivreInput').value = '';
  document.querySelectorAll('input[name="motivo"]').forEach(r => r.checked = false);
  abrirModal('modalInutilizar');
}

document.querySelectorAll('input[name="motivo"]').forEach(radio => {
  radio.addEventListener('change', () => {
    document.getElementById('motivoLivreWrap').style.display =
      radio.value === 'livre' ? 'block' : 'none';
    document.getElementById('motivoError').textContent = '';
  });
});

document.getElementById('confirmarInutilizar').addEventListener('click', async () => {
  const radioSelecionado = document.querySelector('input[name="motivo"]:checked');
  const errEl = document.getElementById('motivoError');
  const btn   = document.getElementById('confirmarInutilizar');
  if (!radioSelecionado) { errEl.textContent = 'Selecione um motivo.'; return; }
  let motivo = radioSelecionado.value;
  if (motivo === 'livre') {
    const livre = document.getElementById('motivoLivreInput').value.trim();
    if (!livre) { errEl.textContent = 'Descreva o motivo.'; return; }
    motivo = livre;
  }
  setLoadingBtn(btn, true, 'Inutilizando...');
  try {
    await inutilizarPneu(pneuAlvo.id, motivo, usuarioLogado.uid, usuarioLogado.nome);
    fecharModal('modalInutilizar');
    mostrarToast(`Pneu ${pneuAlvo.numero_identificacao} inutilizado.`, 'info');
    await carregarTudo();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao inutilizar pneu.', 'error');
  } finally {
    setLoadingBtn(btn, false, 'Inutilizar');
    pneuAlvo = null;
  }
});

// ─── Modal: Reativar ─────────────────────────
function abrirModalReativar(p) {
  pneuAlvo = p;
  document.getElementById('reativarNum').textContent = p.numero_identificacao;
  abrirModal('modalReativar');
}

document.getElementById('confirmarReativar').addEventListener('click', async () => {
  const btn = document.getElementById('confirmarReativar');
  setLoadingBtn(btn, true, 'Reativando...');
  try {
    await reativarPneu(pneuAlvo.id);
    fecharModal('modalReativar');
    mostrarToast(`Pneu ${pneuAlvo.numero_identificacao} reativado! ✓`, 'success');
    await carregarTudo();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao reativar pneu.', 'error');
  } finally {
    setLoadingBtn(btn, false, 'Reativar');
    pneuAlvo = null;
  }
});

// ─── Modal: Enviar para recapagem ────────────
function abrirModalRecapar(p) {
  pneuAlvo = p;
  document.getElementById('recaparNum').textContent = p.numero_identificacao;
  abrirModal('modalRecapar');
}

document.getElementById('confirmarRecapar').addEventListener('click', async () => {
  const btn = document.getElementById('confirmarRecapar');
  setLoadingBtn(btn, true, 'Enviando...');
  try {
    await enviarParaRecapagem(pneuAlvo.id);
    fecharModal('modalRecapar');
    mostrarToast(`Pneu ${pneuAlvo.numero_identificacao} enviado para recapagem.`, 'info');
    await carregarTudo();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao enviar para recapagem.', 'error');
  } finally {
    setLoadingBtn(btn, false, 'Enviar');
    pneuAlvo = null;
  }
});

// ─── Modal: Recebido da recapagem ─────────────
function abrirModalRecebido(p) {
  pneuAlvo = p;
  document.getElementById('recebidoNum').textContent = p.numero_identificacao;
  const qtdAnterior = p.qtd_recapagens || 0;
  const hintEl = document.getElementById('recebidoHint');
  hintEl.textContent = qtdAnterior > 0
    ? `Este pneu já foi recapado ${qtdAnterior} vez${qtdAnterior > 1 ? 'es' : ''} anteriormente.`
    : 'Primeira recapagem deste pneu.';
  abrirModal('modalRecebidoRecapagem');
}

document.getElementById('confirmarRecebido').addEventListener('click', async () => {
  const btn = document.getElementById('confirmarRecebido');
  setLoadingBtn(btn, true, 'Confirmando...');
  try {
    await receberDeRecapagem(pneuAlvo.id);
    fecharModal('modalRecebidoRecapagem');
    mostrarToast(`Pneu ${pneuAlvo.numero_identificacao} recapado e disponível! ✓`, 'success');
    await carregarTudo();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao confirmar recapagem.', 'error');
  } finally {
    setLoadingBtn(btn, false, 'Confirmar');
    pneuAlvo = null;
  }
});

// ─── Modal: Condição do pneu ─────────────────
function abrirModalCondicao(p) {
  pneuAlvo = p;
  document.getElementById('condicaoPneuNum').textContent = p.numero_identificacao;
  const condicaoAtual = p.condicao || 'novo';
  document.querySelectorAll('#modalCondicao .btn-condicao').forEach(btn => {
    btn.classList.toggle('ativo', btn.dataset.condicao === condicaoAtual);
  });
  abrirModal('modalCondicao');
}

document.querySelectorAll('#modalCondicao .btn-condicao').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!pneuAlvo) return;
    btn.disabled = true;
    try {
      await atualizarCondicaoPneu(pneuAlvo.id, btn.dataset.condicao);
      fecharModal('modalCondicao');
      mostrarToast(`Condição atualizada para ${btn.querySelector('.condicao-label').textContent}! ✓`, 'success');
      await carregarTudo();
    } catch (err) {
      console.error(err);
      mostrarToast('Erro ao atualizar condição.', 'error');
    } finally {
      btn.disabled = false;
      pneuAlvo = null;
    }
  });
});

// ─── Fechar modais ───────────────────────────
document.querySelectorAll('[data-close]').forEach(btn => {
  btn.addEventListener('click', () => fecharModal(btn.dataset.close));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModal(overlay.id);
  });
});

// ─── Helpers ─────────────────────────────────
function mostrarEstado(estado) {
  stateLoading.style.display = estado === 'loading' ? 'flex' : 'none';
  pneusGrid.style.display    = estado === 'grid'    ? 'grid' : 'none';
  stateEmpty.style.display   = estado === 'empty'   ? 'flex' : 'none';
}

function abrirModal(id)  { document.getElementById(id).style.display = 'flex'; }
function fecharModal(id) { document.getElementById(id).style.display = 'none'; }

let toastTimer = null;
function mostrarToast(msg, tipo = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className   = `toast ${tipo} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function setLoadingBtn(btn, loading, loadingText = '') {
  const t = btn.querySelector('.btn-text');
  btn.disabled = loading;
  if (t && loadingText) t.textContent = loading ? loadingText : (t.dataset.orig || t.textContent);
  if (t && !t.dataset.orig && loading) t.dataset.orig = t.textContent;
  if (t && !loading && t.dataset.orig) { t.textContent = t.dataset.orig; delete t.dataset.orig; }
}