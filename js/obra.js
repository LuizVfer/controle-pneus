// ============================================================
//  js/obra.js — Detalhes da Obra com diagrama de eixos
// ============================================================

import {
  observarAuth, getDadosUsuario, getObra, atualizarObra,
  finalizarObra, arquivarObra, listarCaminhoes, adicionarCaminhao,
  deletarCaminhao, listarPneusDisponiveis,
  adicionarPneuAoCaminhao, removerPneuDoCaminhao, trocarPneuNoCaminhao,
  listarTrocas, sincronizarCaminhaoComFrota, listarVeiculosFrota, logout, db,
  listarEstoques, listarEstoque,
  listarHistoricoPneu,
} from './firebase.js';

import { TIPOS_VEICULO, getTipoVeiculo } from './veiculos-tipos.js';

import {
  doc, updateDoc, arrayRemove, getDoc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── Estado ───────────────────────────────────
const params  = new URLSearchParams(window.location.search);
const OBRA_ID = params.get('id');

let usuarioLogado    = null;
let obra             = null;
let caminhoes        = [];
let pneusDisponiveis = [];
let trocas           = [];
let estoques         = [];
let todosPneus       = []; // todos os pneus (para lookup de condicao no diagrama)
let estoqueAtribuir  = null;      // estoque selecionado no modal atribuir
let caminhaoAlvo     = null;
let posicaoAlvo      = null;
const PNEUS_MODAL_POR_PAG = 10;
let paginaModalObra  = 1;
let pneuSelecionado  = null;
let modoTroca        = false;

// Histórico
const HIST_PAGINA   = 20;
let histPagina      = 0;
let histFiltros     = { busca: '', tipo: '' };
let trocasFiltradas = [];

// ─── Elementos ────────────────────────────────
const pageLoading     = document.getElementById('pageLoading');
const mainContent     = document.getElementById('mainContent');
const userAvatar      = document.getElementById('userAvatar');
const obraStatusBadge = document.getElementById('obraStatusBadge');
const obraNome        = document.getElementById('obraNome');
const obraMeta        = document.getElementById('obraMeta');
const obraActions     = document.getElementById('obraActions');
const statCaminhoes   = document.getElementById('statCaminhoes');
const statPneus       = document.getElementById('statPneus');
const statTempo       = document.getElementById('statTempo');
const statCriador     = document.getElementById('statCriador');
const tabCountCaminhoes = document.getElementById('tabCountCaminhoes');
const tabCountTrocas    = document.getElementById('tabCountTrocas');
const caminhoesGrid  = document.getElementById('caminhoesGrid');
const historicoLista = document.getElementById('historicoLista');
const infoCaminhoes  = document.getElementById('infoCaminhoes');
const btnAddCaminhao = document.getElementById('btnAddCaminhao');

if (!OBRA_ID) window.location.href = 'dashboard.html';

// ─── Auth guard ───────────────────────────────
observarAuth(async (user) => {
  if (!user) { window.location.href = '../html/login.html'; return; }
  const dados = await getDadosUsuario(user.uid);
  if (!dados || dados.ativo === false) {
    await logout();
    window.location.href = '../html/login.html';
    return;
  }
  usuarioLogado = { ...dados, uid: user.uid };
  userAvatar.textContent = dados.nome.charAt(0).toUpperCase();
  await carregarTudo();
});

// ─── Carregamento inicial ─────────────────────
async function carregarTudo() {
  try {
    obra             = await getObra(OBRA_ID);
    if (!obra) { window.location.href = 'dashboard.html'; return; }
    caminhoes        = await listarCaminhoes(OBRA_ID);

    // Sincroniza caminhões vinculados à frota
    const comFrota = caminhoes.filter(c => c.frota_veiculo_id);
    if (comFrota.length > 0) {
      await Promise.all(comFrota.map(c =>
        sincronizarCaminhaoComFrota(OBRA_ID, c.id).catch(() => {})
      ));
      caminhoes = await listarCaminhoes(OBRA_ID);
    }

    pneusDisponiveis = await listarPneusDisponiveis();
    trocas           = await listarTrocas(OBRA_ID);
    estoques         = await listarEstoques();
    todosPneus       = await listarEstoque();
    renderizarHeader();
    renderizarCaminhoes();
    renderizarHistorico();
    pageLoading.style.display = 'none';
    mainContent.style.display = 'block';
  } catch (err) {
    console.error('Erro ao carregar obra:', err);
    mostrarToast('Erro ao carregar obra.', 'error');
  }
}

async function recarregarDados() {
  caminhoes        = await listarCaminhoes(OBRA_ID);
  trocas           = await listarTrocas(OBRA_ID);
  obra             = await getObra(OBRA_ID);
  pneusDisponiveis = await listarPneusDisponiveis();
  estoques         = await listarEstoques();
  todosPneus       = await listarEstoque();
  renderizarHeader();
  renderizarCaminhoes();
  renderizarHistorico();
}

// ─── Header ───────────────────────────────────
function renderizarHeader() {
  const statusLabel = { aberta: 'Em aberto', finalizada: 'Finalizada', arquivada: 'Arquivada' };
  obraStatusBadge.textContent = statusLabel[obra.status] || obra.status;
  obraStatusBadge.className   = `obra-status-badge ${obra.status}`;
  obraNome.textContent        = obra.nome;

  const dataCriacao = obra.data_criacao?.toDate
    ? obra.data_criacao.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  obraMeta.innerHTML = `
    <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Criada em ${dataCriacao}</span>
    ${obra.data_finalizacao ? `<span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Finalizada em ${obra.data_finalizacao.toDate().toLocaleDateString('pt-BR')}</span>` : ''}
  `;

  const totalPneus = caminhoes.reduce((acc, c) => acc + (c.pneus_ids || []).length, 0);
  const totalPos   = caminhoes.reduce((acc, c) => acc + (c.posicoes  || []).length, 0);
  statCaminhoes.textContent = `${caminhoes.length} veículo(s)`;
  statPneus.textContent     = `${totalPneus} pneu(s) em uso / ${totalPos} posições`;
  statCriador.textContent   = obra.criado_por_nome || '—';
  statTempo.textContent     = calcularTempo(obra);

  tabCountCaminhoes.textContent = caminhoes.length;
  tabCountTrocas.textContent    = trocas.length;
  renderizarAcoesObra();
}

function renderizarAcoesObra() {
  const aberta = obra.status === 'aberta';
  obraActions.innerHTML = '';

  const btnEdit = criarBtnAcao('edit', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Editar nome`);
  btnEdit.addEventListener('click', abrirEditarNome);
  obraActions.appendChild(btnEdit);

  if (aberta) {
    const btnFin = criarBtnAcao('finalizar', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Finalizar obra`);
    btnFin.addEventListener('click', () => {
      document.getElementById('finalizarNomeObra').textContent = obra.nome;
      abrirModal('modalFinalizar');
    });
    obraActions.appendChild(btnFin);
  }

  if (obra.status !== 'arquivada') {
    const btnArq = criarBtnAcao('arquivar', `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg> Arquivar obra`);
    btnArq.addEventListener('click', () => {
      document.getElementById('arquivarNomeObra').textContent = obra.nome;
      abrirModal('modalArquivar');
    });
    obraActions.appendChild(btnArq);
  }

  if (!aberta) btnAddCaminhao.disabled = true;
}

function criarBtnAcao(cls, html) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `btn-obra-action ${cls}`;
  btn.innerHTML = html;
  return btn;
}

// ─── TABS ─────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab${capitalizar(btn.dataset.tab)}`).classList.add('active');
  });
});

// ═══════════════════════════════════════════════
//  DIAGRAMA DE EIXOS
// ═══════════════════════════════════════════════

function gerarDiagrama(caminhao) {
  const posicoes = caminhao.posicoes;
  if (!posicoes || posicoes.length === 0) {
    return `<div class="diagrama-sem-dados">
      <span>Veículo sem diagrama — tipo não configurado</span>
    </div>`;
  }

  // Agrupa por eixo
  const eixosMap = {};
  posicoes.forEach(p => {
    if (!eixosMap[p.eixo]) eixosMap[p.eixo] = [];
    eixosMap[p.eixo].push(p);
  });
  const eixoNums = Object.keys(eixosMap).map(Number).sort((a, b) => a - b);

  // Verifica se tem rolo (RC-01: eixo 1 não está nos posicoes)
  const temRolo = caminhao.tipo_veiculo_id === 'RC-01';

  const pneusAtrib = posicoes.filter(p => p.pneu_id).length;
  const totalPos   = posicoes.length;
  const pct = totalPos > 0 ? Math.round((pneusAtrib / totalPos) * 100) : 0;

  let linhas = '';

  if (temRolo) {
    linhas += `<div class="diagrama-row">
      <div class="diagrama-lado esq"><div class="rolo-badge">ROLO</div></div>
      <div class="diagrama-centro"><div class="eixo-bar"></div><span class="eixo-lbl">E1</span><div class="eixo-bar"></div></div>
      <div class="diagrama-lado dir"></div>
    </div>`;
  }

  eixoNums.forEach(en => {
    const posEixo = eixosMap[en];
    const isDuplo = posEixo[0].tipo === 'duplo';

    const esq = posEixo
      .filter(p => p.lado === 'esquerdo')
      .sort((a, b) => (a.posicao === 'externo' ? -1 : 1));
    const dir = posEixo
      .filter(p => p.lado === 'direito')
      .sort((a, b) => (a.posicao === 'interno' ? -1 : 1));

    const renderRoda = (p) => {
      const temPneu = !!p.pneu_id;
      const numCurto = p.pneu_numero
        ? p.pneu_numero.split('-').pop()
        : '';

      // Determina classe de cor pela condição do pneu
      let rodaCls = temPneu ? 'ocupado' : 'vazio';
      if (temPneu) {
        const dadosPneu = todosPneus.find(x => x.id === p.pneu_id);
        if (dadosPneu?.qtd_recapagens > 0) {
          rodaCls = 'ocupado recapado';
        } else if (dadosPneu?.condicao === 'ruim') {
          rodaCls = 'ocupado ruim';
        } else if (dadosPneu?.condicao === 'medio') {
          rodaCls = 'ocupado medio';
        } else {
          rodaCls = 'ocupado novo';
        }
      }

      return `<div
        class="roda ${rodaCls}"
        data-caminhao-id="${caminhao.id}"
        data-pos-id="${p.id}"
        title="${p.label}${temPneu ? ' — ' + p.pneu_numero : ' — Clique para atribuir pneu'}"
      >${temPneu
          ? `<span class="roda-num">${numCurto}</span>`
          : `<span class="roda-plus">+</span>`
      }</div>`;
    };

    linhas += `<div class="diagrama-row ${isDuplo ? 'duplo' : 'simples'}">
      <div class="diagrama-lado esq">${esq.map(renderRoda).join('')}</div>
      <div class="diagrama-centro">
        <div class="eixo-line"></div>
        <span class="eixo-lbl">E${en}</span>
        <div class="eixo-line"></div>
      </div>
      <div class="diagrama-lado dir">${dir.map(renderRoda).join('')}</div>
    </div>`;
  });

  return `
    <div class="diagrama-wrap" data-caminhao-id="${caminhao.id}">
      <div class="diagrama-header">
        <div class="diagrama-labels-dir">
          <span class="diagrama-dir-label">← ESQ</span>
          <span class="diagrama-dir-label">DIR →</span>
        </div>
        <div class="diagrama-progresso-wrap">
          <div class="diagrama-progresso">
            <div class="diagrama-prog-bar" style="width:${pct}%"></div>
          </div>
          <span class="diagrama-pct">${pneusAtrib}/${totalPos}</span>
        </div>
      </div>
      <div class="diagrama-corpo">
        <div class="diagrama-body-faixa"></div>
        ${linhas}
      </div>
      <div class="diagrama-frente-tras">
        <span>▲ FRENTE</span>
        <span>▼ TRÁS</span>
      </div>
    </div>`;
}

// ─── VEÍCULOS ─────────────────────────────────

// ─── FILTRO DE VEÍCULOS ───────────────────────
let filtroVeiculoNome = '';
let filtroVeiculoTipo = '';

function inicializarFiltroVeiculos() {
  const filterBar   = document.getElementById('veiculoFilterBar');
  const searchInput = document.getElementById('veiculoSearch');
  const tipoSelect  = document.getElementById('veiculoTipoFilter');

  if (!filterBar) return;

  // Mostra a barra se houver veículos
  filterBar.style.display = caminhoes.length > 0 ? 'flex' : 'none';

  // Popula select de tipos com os que existem na obra
  const tiposNaObra = [...new Set(caminhoes.map(c => c.tipo_veiculo_id).filter(Boolean))];
  tipoSelect.innerHTML = '<option value="">Todos os tipos</option>';
  tiposNaObra.forEach(id => {
    const tipo = getTipoVeiculo(id);
    if (!tipo) return;
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `${tipo.tag} — ${tipo.nome}`;
    tipoSelect.appendChild(opt);
  });

  // Mantém valores dos filtros ativos
  searchInput.value = filtroVeiculoNome;
  tipoSelect.value  = filtroVeiculoTipo;

  searchInput.oninput = () => {
    filtroVeiculoNome = searchInput.value.trim().toLowerCase();
    renderizarCaminhoesFiltrados();
  };
  tipoSelect.onchange = () => {
    filtroVeiculoTipo = tipoSelect.value;
    renderizarCaminhoesFiltrados();
  };
}

function renderizarCaminhoesFiltrados() {
  const termo = filtroVeiculoNome;
  const tipo  = filtroVeiculoTipo;

  const filtrados = caminhoes.filter(c => {
    const nomeMatch  = !termo || c.nome?.toLowerCase().includes(termo) || c.placa?.toLowerCase().includes(termo);
    const tipoMatch  = !tipo  || c.tipo_veiculo_id === tipo;
    return nomeMatch && tipoMatch;
  });

  const countEl = document.getElementById('veiculoFilterCount');
  if (countEl) {
    const mostrando = filtrados.length;
    const total     = caminhoes.length;
    countEl.textContent = (termo || tipo) ? `${mostrando} de ${total}` : `${total} veículo(s)`;
  }

  caminhoesGrid.innerHTML = '';
  if (filtrados.length === 0) {
    caminhoesGrid.appendChild(estadoVazio(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
      'Nenhum veículo encontrado', 'Tente ajustar os filtros.'
    ));
    return;
  }
  filtrados.forEach((c, i) => criarCardVeiculo(c, i));
}

function renderizarCaminhoes() {
  caminhoesGrid.innerHTML = '';
  infoCaminhoes.textContent = `${caminhoes.length} veículo(s) nesta obra`;

  if (caminhoes.length === 0) {
    document.getElementById('veiculoFilterBar').style.display = 'none';
    caminhoesGrid.appendChild(estadoVazio(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
      'Nenhum veículo', 'Adicione veículos a esta obra.'
    ));
    return;
  }

  inicializarFiltroVeiculos();
  renderizarCaminhoesFiltrados();
}

function criarCardVeiculo(c, index) {
  const card = document.createElement('div');
  card.className = 'caminhao-card';
  card.style.animationDelay = `${index * 50}ms`;
  const bloqueado = obra.status !== 'aberta';

  const posicoes = c.posicoes || [];
  const pneusAtrib = posicoes.filter(p => p.pneu_id).length;
  const totalPos   = posicoes.length;

  card.innerHTML = `
    <div class="caminhao-card-top">
      <div class="caminhao-info">
        ${c.tipo_veiculo_tag ? `<span class="veiculo-tag">${c.tipo_veiculo_tag}</span>` : ''}
        <div class="caminhao-nome">${c.nome}</div>
        ${c.placa ? `<div class="caminhao-placa">${c.placa}</div>` : ''}
        ${c.tipo_veiculo_nome ? `<div class="caminhao-tipo-nome">${c.tipo_veiculo_nome}</div>` : ''}
      </div>
      <div class="caminhao-card-actions">
        <button class="btn-card-action danger btn-del-caminhao" title="Remover veículo" ${bloqueado ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="diagrama-container" id="diag-${c.id}">
      ${gerarDiagrama(c)}
    </div>
    <div class="caminhao-pneus-footer">
      <span class="pneus-count">${pneusAtrib}/${totalPos} pneus atribuídos</span>
      ${pneusAtrib < totalPos && !bloqueado
        ? `<span class="pneus-falta">${totalPos - pneusAtrib} posição(ões) vazia(s)</span>`
        : pneusAtrib === totalPos && totalPos > 0
        ? `<span class="pneus-completo">✓ Completo</span>`
        : ''}
    </div>
  `;

  // Remover veículo
  card.querySelector('.btn-del-caminhao').addEventListener('click', () => {
    caminhaoAlvo = c;
    document.getElementById('removerCaminhaoNome').textContent = c.nome;
    abrirModal('modalRemoverCaminhao');
  });

  // Cliques no diagrama (delegação de eventos)
  const diag = card.querySelector('.diagrama-container');
  diag.addEventListener('click', (e) => {
    if (bloqueado) return;
    const rodaEl = e.target.closest('.roda');
    if (!rodaEl) return;

    const caminhaoId = rodaEl.dataset.caminhaoId;
    const posId      = rodaEl.dataset.posId;
    const cam = caminhoes.find(x => x.id === caminhaoId);
    if (!cam) return;
    const pos = (cam.posicoes || []).find(p => p.id === posId);
    if (!pos) return;

    if (rodaEl.classList.contains('vazio')) {
      abrirModalAtribuirPosicao(cam, pos, false);
    } else {
      abrirModalOpcoesPosicao(cam, pos);
    }
  });

  caminhoesGrid.appendChild(card);
}

// ─── Adicionar veículo (modal) ────────────────

// ── Seletor de frota no modal Add Caminhão ─────
let frotaDisponivelCache = [];
let veiculoFrotaSelecionado = null;

function renderFrotaModal(filtro = '') {
  const lista = document.getElementById('addCaminhaoLista');
  const errEl = document.getElementById('addCaminhaoSelectError');
  errEl.textContent = '';

  // IDs já na obra
  const jaAdicionados = new Set(caminhoes.map(c => c.frota_veiculo_id).filter(Boolean));

  const filtrados = frotaDisponivelCache.filter(v => {
    if (!filtro) return true;
    const t = filtro.toLowerCase();
    return v.nome?.toLowerCase().includes(t) || v.placa?.toLowerCase().includes(t) || v.tipo_veiculo_tag?.toLowerCase().includes(t);
  });

  lista.innerHTML = '';

  if (filtrados.length === 0) {
    lista.innerHTML = `<div class="frota-modal-vazio">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
      <p>${filtro ? 'Nenhum veículo encontrado.' : 'Todos os veículos já foram adicionados ou a frota está vazia.<br><a href="veiculos.html" style="color:var(--accent)">Cadastrar veículos →</a>'}</p>
    </div>`;
    return;
  }

  filtrados.forEach(v => {
    const jaEsta   = jaAdicionados.has(v.id);
    const selected = veiculoFrotaSelecionado?.id === v.id;
    const tipo     = getTipoVeiculo(v.tipo_veiculo_id);
    const pneusUso = (v.pneus_ids || []).length;
    const pneusMax = v.qtd_pneus_tipo || tipo?.qtd_pneus || 0;

    const item = document.createElement('div');
    item.className = `frota-modal-item${selected ? ' selecionado' : ''}${jaEsta ? ' ja-adicionado' : ''}`;

    item.innerHTML = `
      <div class="frota-item-check">
        <div class="check-box${selected ? ' marcado' : ''}">
          ${jaEsta
            ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>`
            : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="12" height="12"><polyline points="20 6 9 17 4 12"/></svg>`
          }
        </div>
      </div>
      <div class="frota-item-info">
        <div class="frota-item-top">
          <span class="frota-item-tag">${v.tipo_veiculo_tag || '—'}</span>
          <span class="frota-item-nome">${v.nome}</span>
          ${v.placa ? `<span class="frota-item-placa">${v.placa}</span>` : ''}
          ${jaEsta ? '<span class="frota-item-badge-ja">Já adicionado</span>' : ''}
        </div>
        <div class="frota-item-sub">
          <span class="frota-item-tipo">${v.tipo_veiculo_nome || '—'}</span>
          <span class="frota-item-pneus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
            ${pneusUso}/${pneusMax} pneus
          </span>
        </div>
      </div>`;

    if (!jaEsta) {
      item.addEventListener('click', () => {
        veiculoFrotaSelecionado = v;
        renderFrotaModal(document.getElementById('addCaminhaoSearch').value.trim());
      });
    }
    lista.appendChild(item);
  });
}

btnAddCaminhao.addEventListener('click', async () => {
  veiculoFrotaSelecionado = null;
  document.getElementById('addCaminhaoSearch').value = '';
  document.getElementById('addCaminhaoSelectError').textContent = '';
  document.getElementById('addCaminhaoLista').innerHTML = '';
  document.getElementById('addCaminhaoLoading').style.display = 'flex';
  abrirModal('modalAddCaminhao');

  // Garante que X e Cancelar fecham o modal (listeners explícitos)
  document.querySelectorAll('#modalAddCaminhao .modal-close, #modalAddCaminhao .btn-cancelar').forEach(el => {
    el.onclick = () => fecharModal('modalAddCaminhao');
  });

  try {
    frotaDisponivelCache = await listarVeiculosFrota();
  } catch(e) {
    frotaDisponivelCache = [];
  }
  document.getElementById('addCaminhaoLoading').style.display = 'none';
  renderFrotaModal();
});

document.getElementById('addCaminhaoSearch').addEventListener('input', e => {
  renderFrotaModal(e.target.value.trim());
});

document.getElementById('salvarAddCaminhao').addEventListener('click', async () => {
  const errEl = document.getElementById('addCaminhaoSelectError');
  if (!veiculoFrotaSelecionado) {
    errEl.textContent = 'Selecione um veículo da frota.';
    return;
  }

  const v    = veiculoFrotaSelecionado;
  const tipo = getTipoVeiculo(v.tipo_veiculo_id);
  const btn  = document.getElementById('salvarAddCaminhao');

  setLoadingBtn(btn, true);
  try {
    await adicionarCaminhao(OBRA_ID, {
      nome:              v.nome,
      placa:             v.placa || null,
      tipo_veiculo_id:   v.tipo_veiculo_id,
      tipo_veiculo_nome: v.tipo_veiculo_nome || tipo?.nome || '',
      tipo_veiculo_tag:  v.tipo_veiculo_tag  || tipo?.tag  || '',
      qtd_pneus_tipo:    v.qtd_pneus_tipo    || tipo?.qtd_pneus || 0,
      posicoes:          v.posicoes          || tipo?.posicoes  || [],
      frota_veiculo_id:  v.id,
    });
    await atualizarObra(OBRA_ID, { qtd_caminhoes: caminhoes.length + 1 }, { qtd_caminhoes: caminhoes.length }, usuarioLogado.uid, usuarioLogado.nome);
    fecharModal('modalAddCaminhao');
    mostrarToast(`Veículo "${v.nome}" adicionado! ✓`, 'success');
    await recarregarDados();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao adicionar veículo.', 'error');
  } finally {
    setLoadingBtn(btn, false);
  }
});

// Remover veículo
document.getElementById('confirmarRemoverCaminhao').addEventListener('click', async () => {
  if (!caminhaoAlvo) return;
  const btn = document.getElementById('confirmarRemoverCaminhao');
  setLoadingBtn(btn, true);
  try {
    await deletarCaminhao(OBRA_ID, caminhaoAlvo.id);
    await atualizarObra(OBRA_ID, { qtd_caminhoes: Math.max(0, caminhoes.length - 1) }, { qtd_caminhoes: caminhoes.length }, usuarioLogado.uid, usuarioLogado.nome);
    fecharModal('modalRemoverCaminhao');
    mostrarToast('Veículo removido.', 'success');
    await recarregarDados();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao remover veículo.', 'error');
  } finally {
    setLoadingBtn(btn, false);
    caminhaoAlvo = null;
  }
});

// ═══════════════════════════════════════════════
//  MODAL: ATRIBUIR PNEU À POSIÇÃO (vazia ou troca)
// ═══════════════════════════════════════════════

function abrirModalAtribuirPosicao(caminhao, posicao, isTroca = false) {
  posicaoAlvo     = { caminhao, posicao };
  pneuSelecionado = null;
  modoTroca       = isTroca;
  estoqueAtribuir = null;

  document.querySelector('#modalAtribuirPosicao .modal-title').textContent =
    isTroca ? 'Trocar Pneu' : 'Atribuir Pneu';
  document.getElementById('modalAtribuirPosLabel').textContent = posicao.label;
  document.getElementById('atribuirPosError').textContent      = '';
  document.getElementById('obraAtribuirEstoqueErr').textContent = '';
  document.getElementById('confirmarAtribuirPos').disabled     = true;
  document.getElementById('buscaPneuPos').value = '';

  // Mostra passo 1, oculta passo 2
  document.getElementById('obraAtribuirEstoqueStep').style.display = 'block';
  document.getElementById('obraAtribuirPneuStep').style.display    = 'none';

  renderizarEstoquesObra();
  fecharModal('modalOpcoesPosicao');
  abrirModal('modalAtribuirPosicao');
}

function renderizarEstoquesObra() {
  const lista = document.getElementById('obraAtribuirEstoqueLista');
  lista.innerHTML = '';

  // Campo Grande (estoque principal, id = null)
  const qtdCG = pneusDisponiveis.filter(p => !p.estoque_id).length;
  lista.appendChild(criarItemEstoqueObra(null, 'Campo Grande', qtdCG));

  estoques.forEach(e => {
    const qtd = pneusDisponiveis.filter(p => p.estoque_id === e.id).length;
    lista.appendChild(criarItemEstoqueObra(e.id, e.nome, qtd));
  });
}

function criarItemEstoqueObra(id, nome, qtd) {
  const item = document.createElement('div');
  item.className = 'atribuir-estoque-item' + (qtd === 0 ? ' sem-pneus' : '');
  item.innerHTML = `
    <div class="atribuir-estoque-info">
      <span class="atribuir-estoque-nome">${nome}</span>
      <span class="atribuir-estoque-qtd">${qtd} disponível(is)</span>
    </div>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
      width="14" height="14" class="atribuir-estoque-arrow">
      <polyline points="9 18 15 12 9 6"/>
    </svg>`;
  if (qtd === 0) {
    item.title = 'Nenhum pneu disponível neste estoque';
  } else {
    item.addEventListener('click', () => selecionarEstoqueObra(id, nome));
  }
  return item;
}

function selecionarEstoqueObra(id, nome) {
  estoqueAtribuir = { id, nome };

  const { caminhao } = posicaoAlvo;
  const idsNoVeiculo = caminhao.pneus_ids || [];
  const disponiveis  = pneusDisponiveis.filter(p => {
    if (idsNoVeiculo.includes(p.id)) return false;
    if (id === null) return !p.estoque_id;
    return p.estoque_id === id;
  });

  document.getElementById('obraAtribuirEstoqueStep').style.display    = 'none';
  document.getElementById('obraAtribuirPneuStep').style.display       = 'block';
  document.getElementById('obraAtribuirEstoqueNomeLabel').textContent = nome;

  // Popular select de marcas
  const selMarca = document.getElementById('selectMarcaPos');
  selMarca.innerHTML = '<option value="">Todas as marcas</option>';
  const marcasPresentes = [...new Set(disponiveis.filter(p => p.marca_id).map(p => JSON.stringify({ id: p.marca_id, nome: p.marca_nome })))]
    .map(s => JSON.parse(s))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  marcasPresentes.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.id; opt.textContent = m.nome;
    selMarca.appendChild(opt);
  });
  selMarca.value = '';

  paginaModalObra = 1;
  popularListaPneus(disponiveis, document.getElementById('pneuPosLista'), '', '');

  const inputBusca = document.getElementById('buscaPneuPos');
  inputBusca.value = '';

  const atualizarFiltro = () => {
    paginaModalObra = 1;
    pneuSelecionado = null;
    document.getElementById('confirmarAtribuirPos').disabled = true;
    popularListaPneus(disponiveis, document.getElementById('pneuPosLista'), inputBusca.value.trim().toLowerCase(), selMarca.value);
  };
  inputBusca.oninput   = atualizarFiltro;
  selMarca.onchange    = atualizarFiltro;
}

document.getElementById('btnObraTrocarEstoque').addEventListener('click', () => {
  estoqueAtribuir = null;
  pneuSelecionado = null;
  document.getElementById('confirmarAtribuirPos').disabled          = true;
  document.getElementById('obraAtribuirEstoqueStep').style.display  = 'block';
  document.getElementById('obraAtribuirPneuStep').style.display     = 'none';
  document.getElementById('buscaPneuPos').value                     = '';
});

function popularListaPneus(disponiveis, container, termo, marcaFiltro = '') {
  container.innerHTML = '';
  const pagEl = document.getElementById('paginacaoPosObra');

  const filtrados = disponiveis
    .filter(p => !termo || p.numero_identificacao.toLowerCase().includes(termo))
    .filter(p => !marcaFiltro || p.marca_id === marcaFiltro)
    .slice()
    .sort((a, b) => {
      const da = a.criado_em?.toDate?.() || new Date(0);
      const db = b.criado_em?.toDate?.() || new Date(0);
      return db - da;
    });

  if (filtrados.length === 0) {
    const p = document.createElement('p');
    p.className   = 'sem-pneus';
    p.textContent = disponiveis.length === 0
      ? 'Nenhum pneu disponível no estoque.'
      : `Nenhum pneu encontrado para "${termo}".`;
    container.appendChild(p);
    if (pagEl) pagEl.style.display = 'none';
    return;
  }

  const totalPags = Math.ceil(filtrados.length / PNEUS_MODAL_POR_PAG);
  if (paginaModalObra > totalPags) paginaModalObra = 1;
  const inicio = (paginaModalObra - 1) * PNEUS_MODAL_POR_PAG;
  const slice  = filtrados.slice(inicio, inicio + PNEUS_MODAL_POR_PAG);

  slice.forEach(p => {
    const item = document.createElement('div');
    item.className  = 'pneu-select-item';
    item.dataset.id = p.id;

    const condicao = p.condicao || 'novo';
    const condicaoCfg = { novo: { label: 'Novo', cls: 'condicao-novo' }, medio: { label: 'Médio', cls: 'condicao-medio' }, ruim: { label: 'Ruim', cls: 'condicao-ruim' } };
    const cc = condicaoCfg[condicao] || condicaoCfg.novo;
    const recapadoHtml = p.qtd_recapagens > 0
      ? `<span class="pneu-select-recapado">Recapado ×${p.qtd_recapagens}</span>`
      : '';

    item.innerHTML = `
      <div class="pneu-select-icone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
        </svg>
      </div>
      <div class="pneu-select-info">
        <span class="pneu-select-num">${p.numero_identificacao}</span>
        ${p.marca_nome ? `<span class="pneu-select-marca">${p.marca_nome}</span>` : ''}
        <div class="pneu-select-badges">
          <span class="badge-condicao ${cc.cls}">${cc.label}</span>
          ${recapadoHtml}
        </div>
      </div>
      <span class="pneu-select-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </span>`;
    item.addEventListener('click', () => {
      container.querySelectorAll('.pneu-select-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      pneuSelecionado = p;
      document.getElementById('confirmarAtribuirPos').disabled = false;
      document.getElementById('atribuirPosError').textContent  = '';
    });
    container.appendChild(item);
  });

  if (pagEl) {
    renderizarPaginacaoModal(pagEl, totalPags, paginaModalObra, filtrados, (novaPag) => {
      paginaModalObra = novaPag;
      pneuSelecionado = null;
      document.getElementById('confirmarAtribuirPos').disabled = true;
      popularListaPneus(disponiveis, container, termo, marcaFiltro);
    });
  }
}

function renderizarPaginacaoModal(el, totalPags, pagAtual, todos, onMudar) {
  if (totalPags <= 1) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = '';

  const info = document.createElement('span');
  info.className = 'pag-info';
  const ini = (pagAtual - 1) * PNEUS_MODAL_POR_PAG + 1;
  const fim = Math.min(pagAtual * PNEUS_MODAL_POR_PAG, todos.length);
  info.textContent = `${ini}–${fim} de ${todos.length}`;
  el.appendChild(info);

  const btnAnt = document.createElement('button');
  btnAnt.className = 'pag-btn'; btnAnt.disabled = pagAtual === 1;
  btnAnt.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="15 18 9 12 15 6"/></svg>`;
  btnAnt.addEventListener('click', () => onMudar(pagAtual - 1));
  el.appendChild(btnAnt);

  const paginas = totalPags <= 5
    ? Array.from({ length: totalPags }, (_, i) => i + 1)
    : pagAtual <= 3 ? [1, 2, 3, 4, '...', totalPags]
    : pagAtual >= totalPags - 2 ? [1, '...', totalPags-3, totalPags-2, totalPags-1, totalPags]
    : [1, '...', pagAtual-1, pagAtual, pagAtual+1, '...', totalPags];

  paginas.forEach(p => {
    if (p === '...') {
      const sep = document.createElement('span');
      sep.className = 'pag-sep'; sep.textContent = '…';
      el.appendChild(sep);
    } else {
      const btn = document.createElement('button');
      btn.className   = `pag-btn${p === pagAtual ? ' ativo' : ''}`;
      btn.textContent = p;
      btn.addEventListener('click', () => onMudar(p));
      el.appendChild(btn);
    }
  });

  const btnProx = document.createElement('button');
  btnProx.className = 'pag-btn'; btnProx.disabled = pagAtual === totalPags;
  btnProx.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="13" height="13"><polyline points="9 18 15 12 9 6"/></svg>`;
  btnProx.addEventListener('click', () => onMudar(pagAtual + 1));
  el.appendChild(btnProx);
}

document.getElementById('confirmarAtribuirPos').addEventListener('click', async () => {
  if (!pneuSelecionado || !posicaoAlvo) return;
  const { caminhao, posicao } = posicaoAlvo;
  const btn = document.getElementById('confirmarAtribuirPos');
  setLoadingBtn(btn, true);

  try {
    if (modoTroca && posicao.pneu_id) {
      // TROCA: um único registro no histórico com os dois pneus
      await trocarPneuNoCaminhao(
        OBRA_ID, caminhao.id,
        posicao.pneu_id,           posicao.pneu_numero,
        pneuSelecionado.id,        pneuSelecionado.numero_identificacao,
        usuarioLogado.uid,         usuarioLogado.nome
      );
    } else {
      // ADIÇÃO simples
      await adicionarPneuAoCaminhao(
        OBRA_ID, caminhao.id,
        pneuSelecionado.id, pneuSelecionado.numero_identificacao,
        usuarioLogado.uid, usuarioLogado.nome
      );
    }

    // Atualiza o campo posicoes no Firestore com o pneu na posição certa
    await atualizarPosicaoNoFirestore(caminhao.id, posicao.id, {
      pneu_id:     pneuSelecionado.id,
      pneu_numero: pneuSelecionado.numero_identificacao,
    });

    fecharModal('modalAtribuirPosicao');
    mostrarToast(`Pneu ${pneuSelecionado.numero_identificacao} atribuído! ✓`, 'success');
    await recarregarDados();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao atribuir pneu.', 'error');
  } finally {
    setLoadingBtn(btn, false);
    posicaoAlvo = null; pneuSelecionado = null;
  }
});

// ═══════════════════════════════════════════════
//  MODAL: OPÇÕES DA POSIÇÃO (ocupada)
// ═══════════════════════════════════════════════

function abrirModalOpcoesPosicao(caminhao, posicao) {
  posicaoAlvo = { caminhao, posicao };
  document.getElementById('modalOpcoesVeiculoNome').textContent = caminhao.nome;
  document.getElementById('modalOpcoesPneuNum').textContent     = posicao.pneu_numero || posicao.pneu_id?.substring(0, 8) || '—';
  document.getElementById('modalOpcoesPosNome').textContent     = posicao.label;
  abrirModal('modalOpcoesPosicao');
}

// Ver no estoque
document.getElementById('btnVerPneuEstoque').addEventListener('click', () => {
  if (!posicaoAlvo?.posicao?.pneu_id) return;
  window.location.href = `estoque.html?busca=${encodeURIComponent(posicaoAlvo.posicao.pneu_numero || '')}`;
});

// Trocar pneu
document.getElementById('btnTrocarPneuPos').addEventListener('click', () => {
  if (!posicaoAlvo) return;
  abrirModalAtribuirPosicao(posicaoAlvo.caminhao, posicaoAlvo.posicao, true);
});

// Remover pneu da posição
document.getElementById('btnRemoverPneuPos').addEventListener('click', async () => {
  if (!posicaoAlvo) return;
  const { caminhao, posicao } = posicaoAlvo;
  const btn = document.getElementById('btnRemoverPneuPos');
  btn.disabled = true;
  try {
    await removerPneuDaCaminhao_posicao(caminhao, posicao);
    fecharModal('modalOpcoesPosicao');
    mostrarToast(`Pneu ${posicao.pneu_numero} removido da posição.`, 'success');
    await recarregarDados();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao remover pneu.', 'error');
  } finally {
    btn.disabled = false;
    posicaoAlvo = null;
  }
});

document.getElementById('btnHistoricoPneuObra').addEventListener('click', () => {
  if (!posicaoAlvo?.posicao?.pneu_id) return;
  const pneu = {
    id:                   posicaoAlvo.posicao.pneu_id,
    numero_identificacao: posicaoAlvo.posicao.pneu_numero || '—',
  };
  fecharModal('modalOpcoesPosicao');
  abrirModalHistoricoPneu(pneu, 'obra');
});

// ─── Helpers de posição ───────────────────────

async function removerPneuDaCaminhao_posicao(caminhao, posicao) {
  await removerPneuDoCaminhao(
    OBRA_ID, caminhao.id,
    posicao.pneu_id, posicao.pneu_numero,
    usuarioLogado.uid, usuarioLogado.nome
  );
  await atualizarPosicaoNoFirestore(caminhao.id, posicao.id, {
    pneu_id: null, pneu_numero: null,
  });
}

async function atualizarPosicaoNoFirestore(caminhaoId, posicaoId, dados) {
  const camRef  = doc(db, 'obras', OBRA_ID, 'caminhoes', caminhaoId);
  const camSnap = await getDoc(camRef);
  if (!camSnap.exists()) return;

  const camData  = camSnap.data();
  const posicoes = camData.posicoes || [];
  const novas    = posicoes.map(p =>
    p.id === posicaoId ? { ...p, ...dados } : p
  );
  await updateDoc(camRef, { posicoes: novas });

  // ── Sync posicoes na frota ──
  if (camData.frota_veiculo_id) {
    const frotaRef  = doc(db, 'veiculos', camData.frota_veiculo_id);
    const frotaSnap = await getDoc(frotaRef);
    if (frotaSnap.exists()) {
      const frotaPos = (frotaSnap.data().posicoes || []).map(p =>
        p.id === posicaoId ? { ...p, ...dados } : p
      );
      await updateDoc(frotaRef, { posicoes: frotaPos });
    }
  }
}

// ─── EDITAR NOME DA OBRA ──────────────────────

function abrirEditarNome() {
  document.getElementById('editNomeObra').value = obra.nome;
  document.getElementById('editNomeObraError').textContent = '';
  document.getElementById('editNomeObra').classList.remove('is-error');
  abrirModal('modalEditarNome');
}

document.getElementById('salvarNomeObra').addEventListener('click', async () => {
  const novoNome = document.getElementById('editNomeObra').value.trim();
  const errEl    = document.getElementById('editNomeObraError');
  const btn      = document.getElementById('salvarNomeObra');
  errEl.textContent = '';
  document.getElementById('editNomeObra').classList.remove('is-error');
  if (!novoNome) {
    document.getElementById('editNomeObra').classList.add('is-error');
    errEl.textContent = 'Nome obrigatório.'; return;
  }
  if (novoNome === obra.nome) { fecharModal('modalEditarNome'); return; }
  setLoadingBtn(btn, true);
  try {
    await atualizarObra(OBRA_ID, { nome: novoNome }, { nome: obra.nome }, usuarioLogado.uid, usuarioLogado.nome);
    obra.nome = novoNome;
    obraNome.textContent = novoNome;
    document.getElementById('finalizarNomeObra').textContent = novoNome;
    document.getElementById('arquivarNomeObra').textContent  = novoNome;
    fecharModal('modalEditarNome');
    mostrarToast('Nome atualizado! ✓', 'success');
  } catch (err) {
    mostrarToast('Erro ao atualizar nome.', 'error');
  } finally { setLoadingBtn(btn, false); }
});

// ─── FINALIZAR / ARQUIVAR ─────────────────────

document.getElementById('confirmarFinalizar').addEventListener('click', async () => {
  const btn = document.getElementById('confirmarFinalizar');
  setLoadingBtn(btn, true);
  try {
    await finalizarObra(OBRA_ID);
    fecharModal('modalFinalizar');
    mostrarToast('Obra finalizada! ✓', 'success');
    obra.status = 'finalizada';
    obra.data_finalizacao = { toDate: () => new Date() };
    renderizarHeader();
  } catch (err) {
    mostrarToast('Erro ao finalizar obra.', 'error');
  } finally { setLoadingBtn(btn, false); }
});

document.getElementById('confirmarArquivar').addEventListener('click', async () => {
  const btn = document.getElementById('confirmarArquivar');
  setLoadingBtn(btn, true);
  try {
    await arquivarObra(OBRA_ID);
    fecharModal('modalArquivar');
    mostrarToast('Obra arquivada.', 'success');
    setTimeout(() => window.location.href = 'dashboard.html', 1200);
  } catch (err) {
    mostrarToast('Erro ao arquivar obra.', 'error');
  } finally { setLoadingBtn(btn, false); }
});

// ─── HISTÓRICO ────────────────────────────────

const adicionarSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const removerSvg   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const trocaSvg     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>`;


function tipoTroca(t) {
  if (!t.pneu_saiu && t.pneu_entrou)  return 'adicao';
  if (t.pneu_saiu  && !t.pneu_entrou) return 'remocao';
  return 'troca';
}

function tempoRelativo(date) {
  const diff = Math.floor((new Date() - date) / 1000);
  if (diff < 60)     return 'agora';
  if (diff < 3600)   return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400)  return `há ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `há ${Math.floor(diff / 86400)} dias`;
  return '';
}

function inicializarFiltrosHistorico() {
  const inputBusca = document.getElementById('historicoBuscaPneu');
  if (!inputBusca) return;

  inputBusca.value = histFiltros.busca;

  inputBusca.oninput = () => {
    histFiltros.busca = inputBusca.value.trim().toLowerCase();
    histPagina = 0;
    aplicarFiltrosHistorico();
  };

  // Tabs de tipo
  document.querySelectorAll('.hist-tipo-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tipo === histFiltros.tipo);
    btn.onclick = () => {
      document.querySelectorAll('.hist-tipo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      histFiltros.tipo = btn.dataset.tipo;
      histPagina = 0;
      aplicarFiltrosHistorico();
    };
  });
}

function aplicarFiltrosHistorico() {
  const { busca, tipo } = histFiltros;

  trocasFiltradas = trocas.filter(t => {
    if (tipo && tipoTroca(t) !== tipo) return false;
    if (busca) {
      const haystack = [
        t.pneu_saiu_numero   || '',
        t.pneu_entrou_numero || '',
        t.caminhao_nome      || '',
      ].join(' ').toLowerCase();
      if (!haystack.includes(busca)) return false;
    }
    return true;
  });

  const countEl = document.getElementById('historicoCount');
  if (countEl) {
    const temFiltro = busca || tipo;
    countEl.textContent = temFiltro
      ? `${trocasFiltradas.length} de ${trocas.length}`
      : `${trocas.length} registro(s)`;
  }

  renderCardsHistorico();
}

function renderCardsHistorico() {
  const cardsEl = document.getElementById('historicoCards');
  const emptyEl = document.getElementById('historicoEmpty');
  const msgEl   = document.getElementById('historicoEmptyMsg');
  const btnMais = document.getElementById('btnMaisTrocas');
  if (!cardsEl) return;

  // Limpa apenas cards anteriores ao paginar, ou tudo ao filtrar
  if (histPagina === 0) cardsEl.innerHTML = '';

  if (trocasFiltradas.length === 0) {
    emptyEl.style.display = 'flex';
    btnMais.style.display = 'none';
    const temFiltro = histFiltros.busca || histFiltros.tipo;
    msgEl.textContent = temFiltro
      ? 'Nenhuma movimentação encontrada.'
      : 'Sem movimentações registradas nesta obra.';
    return;
  }

  emptyEl.style.display = 'none';

  const inicio = histPagina * HIST_PAGINA;
  const slice  = trocasFiltradas.slice(inicio, inicio + HIST_PAGINA);

  const tipoCfg = {
    adicao:  { cls: 'card-add',  badge: 'badge-add',  label: 'Adição',  icone: adicionarSvg,  cor: '#4CAF50' },
    remocao: { cls: 'card-rem',  badge: 'badge-rem',  label: 'Remoção', icone: removerSvg,    cor: 'var(--erro)' },
    troca:   { cls: 'card-troca',badge: 'badge-troca',label: 'Troca',   icone: trocaSvg,      cor: 'var(--accent)' },
  };

  slice.forEach((t, i) => {
    const tipo    = tipoTroca(t);
    const cfg     = tipoCfg[tipo];
    const dataObj = t.data?.toDate ? t.data.toDate() : null;
    const dataFmt = dataObj
      ? dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const horaFmt = dataObj
      ? dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '';
    const relativo = dataObj ? tempoRelativo(dataObj) : '';

    // Linha de pneus — depende do tipo
    let pneusHtml = '';
    if (tipo === 'adicao') {
      pneusHtml = `
        <div class="hcard-pneu-flow">
          <div class="hcard-pneu-box entrou">
            <span class="hcard-pneu-dir">ENTROU</span>
            <span class="hcard-pneu-num">${t.pneu_entrou_numero || '—'}</span>
          </div>
        </div>`;
    } else if (tipo === 'remocao') {
      pneusHtml = `
        <div class="hcard-pneu-flow">
          <div class="hcard-pneu-box saiu">
            <span class="hcard-pneu-dir">SAIU</span>
            <span class="hcard-pneu-num">${t.pneu_saiu_numero || '—'}</span>
          </div>
        </div>`;
    } else {
      pneusHtml = `
        <div class="hcard-pneu-flow">
          <div class="hcard-pneu-box saiu">
            <span class="hcard-pneu-dir">SAIU</span>
            <span class="hcard-pneu-num">${t.pneu_saiu_numero || '—'}</span>
          </div>
          <div class="hcard-troca-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="5" y1="12" x2="19" y2="12"/>
              <polyline points="12 5 19 12 12 19"/>
            </svg>
          </div>
          <div class="hcard-pneu-box entrou">
            <span class="hcard-pneu-dir">ENTROU</span>
            <span class="hcard-pneu-num">${t.pneu_entrou_numero || '—'}</span>
          </div>
        </div>`;
    }

    const card = document.createElement('div');
    card.className = `hcard ${cfg.cls}`;
    card.style.animationDelay = `${i * 40}ms`;
    card.innerHTML = `
      <div class="hcard-stripe"></div>
      <div class="hcard-body">
        <div class="hcard-top">
          <div class="hcard-left">
            <span class="hist-badge ${cfg.badge}">${cfg.label}</span>
            <div class="hcard-veiculo">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
                <rect x="1" y="3" width="15" height="13" rx="2"/>
                <path d="M16 8h4l3 3v5h-7V8z"/>
                <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
              </svg>
              ${(() => {
                const cam = caminhoes.find(x => x.id === t.caminhao_id);
                const tag = cam?.tipo_veiculo_tag;
                return `${tag ? `<span class="hcard-veiculo-tag">${tag}</span>` : ''}<span>${t.caminhao_nome || '—'}</span>`;
              })()}
            </div>
          </div>
          <div class="hcard-right">
            <div class="hcard-data">${dataFmt}</div>
            <div class="hcard-hora">${horaFmt}${relativo ? ' · ' + relativo : ''}</div>
          </div>
        </div>
        ${pneusHtml}
        <div class="hcard-footer">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <span>${t.usuario_nome || '—'}</span>
        </div>
      </div>`;
    cardsEl.appendChild(card);
  });

  // Botão ver mais
  const restantes = trocasFiltradas.length - (inicio + slice.length);
  if (restantes > 0) {
    btnMais.style.display = 'block';
    btnMais.textContent   = `Ver mais ${restantes} registro(s)`;
    btnMais.onclick = () => { histPagina++; renderCardsHistorico(); };
  } else {
    btnMais.style.display = 'none';
  }
}

function renderizarHistorico() {
  histPagina = 0;
  inicializarFiltrosHistorico();
  aplicarFiltrosHistorico();
}

// ─── Helpers Gerais ───────────────────────────

function estadoVazio(iconeSvg, titulo, msg) {
  const div = document.createElement('div');
  div.className = 'state-empty';
  div.innerHTML = `${iconeSvg}<h3>${titulo}</h3><p>${msg}</p>`;
  return div;
}

function abrirModal(id) {
  document.getElementById(id).style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function fecharModal(id) {
  document.getElementById(id).style.display = 'none';
  document.body.style.overflow = '';
}

document.querySelectorAll('.modal-close, .btn-cancelar[data-modal]').forEach(el => {
  el.addEventListener('click', () => {
    const id = el.dataset.modal || el.closest('.modal-overlay')?.id;
    if (id) fecharModal(id);
  });
});

document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) fecharModal(overlay.id);
  });
});

function setLoadingBtn(btn, estado) {
  btn.disabled = estado;
  const t = btn.querySelector('.btn-text');
  const l = btn.querySelector('.btn-loader');
  if (t) t.style.display = estado ? 'none' : 'flex';
  if (l) l.style.display = estado ? 'flex'  : 'none';
}

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function calcularTempo(o) {
  if (!o.data_criacao) return '—';
  const inicio = o.data_criacao.toDate ? o.data_criacao.toDate() : new Date(o.data_criacao);
  if (o.status === 'finalizada' && o.data_finalizacao) {
    const fim  = o.data_finalizacao.toDate ? o.data_finalizacao.toDate() : new Date(o.data_finalizacao);
    const dias = Math.floor((fim - inicio) / 86400000);
    return `Durou ${dias} dia(s)`;
  }
  if (o.status === 'aberta') {
    const dias = Math.floor((new Date() - inicio) / 86400000);
    return dias === 0 ? 'Criada hoje' : `Aberta há ${dias} dia(s)`;
  }
  return '—';
}

function mostrarToast(msg, tipo = 'success') {
  const toast    = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const icon     = toast.querySelector('.toast-icon');
  toast.className      = `toast ${tipo}`;
  toastMsg.textContent = msg;
  icon.textContent     = tipo === 'success' ? '✓' : '✕';
  toast.style.display  = 'flex';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

const HIST_LABELS_OBRA = {
  criado:              'Criado',
  atribuido_obra:      'Atribuído à Obra',
  removido_obra:       'Removido da Obra',
  trocado_obra:        'Troca em Obra',
  atribuido_frota:     'Atribuído à Frota',
  removido_frota:      'Removido da Frota',
  transferido:         'Transferido',
  enviado_recapagem:   'Enviado p/ Recapagem',
  retornou_recapagem:  'Retornou da Recapagem',
  inutilizado:         'Inutilizado',
  reativado:           'Reativado',
  condicao_alterada:   'Condição Alterada',
  marca_alterada:      'Marca Alterada',
};
 
function gerarDetalheHistoricoObra(ev) {
  switch (ev.tipo) {
    case 'criado':
      return `Adicionado ao estoque <span>${ev.estoque_nome || 'Campo Grande'}</span>${ev.marca_nova ? ` · <span>${ev.marca_nova}</span>` : ''}`;
    case 'atribuido_obra':
      return `Atribuído ao veículo <span>${ev.caminhao_nome || '—'}</span>${ev.caminhao_tipo ? ` <span>[${ev.caminhao_tipo}]</span>` : ''}${ev.obra_nome ? ` · Obra: <span>${ev.obra_nome}</span>` : ''}`;
    case 'removido_obra':
      return `Removido do veículo <span>${ev.caminhao_nome || '—'}</span>${ev.caminhao_tipo ? ` <span>[${ev.caminhao_tipo}]</span>` : ''}${ev.obra_nome ? ` · Obra: <span>${ev.obra_nome}</span>` : ''}`;
    case 'trocado_obra':
      return `${ev.foi_pneu_saiu ? 'Saiu do' : 'Entrou no'} veículo <span>${ev.caminhao_nome || '—'}</span>${ev.caminhao_tipo ? ` <span>[${ev.caminhao_tipo}]</span>` : ''}${ev.obra_nome ? ` · Obra: <span>${ev.obra_nome}</span>` : ''}`;
    case 'atribuido_frota':
      return `Atribuído ao veículo <span>${ev.caminhao_nome || '—'}</span>${ev.caminhao_tipo ? ` <span>[${ev.caminhao_tipo}]</span>` : ''}${ev.caminhao_placa ? ` · Placa: <span>${ev.caminhao_placa}</span>` : ''}`;
    case 'removido_frota':
      return `Removido do veículo <span>${ev.caminhao_nome || '—'}</span>${ev.caminhao_tipo ? ` <span>[${ev.caminhao_tipo}]</span>` : ''}${ev.caminhao_placa ? ` · Placa: <span>${ev.caminhao_placa}</span>` : ''}`;
    case 'transferido':
      return `De <span>${ev.estoque_origem || 'Campo Grande'}</span> → <span>${ev.estoque_destino || 'Campo Grande'}</span>`;
    case 'enviado_recapagem':
      return `Enviado para recapagem`;
    case 'retornou_recapagem':
      return `Retornou da recapagem${ev.qtd_recapagens ? ` · <span>${ev.qtd_recapagens}ª recapagem</span>` : ''}`;
    case 'inutilizado':
      return `Motivo: <span>${ev.motivo || '—'}</span>${ev.caminhao_nome ? ` · Veículo: <span>${ev.caminhao_nome}</span>` : ''}`;
    case 'reativado':
      return `Reativado — voltou ao estoque como disponível`;
    case 'condicao_alterada':
      return `<span>${ev.condicao_anterior || '—'}</span> → <span>${ev.condicao_nova || '—'}</span>`;
    case 'marca_alterada':
      return `<span>${ev.marca_anterior || 'sem marca'}</span> → <span>${ev.marca_nova || '—'}</span>`;
    default:
      return ev.tipo || '—';
  }
}
 
function criarCardHistoricoObra(ev, idx) {
  const card = document.createElement('div');
  card.className = `hpneu-card tipo-${ev.tipo || 'desconhecido'}`;
  card.style.animationDelay = `${idx * 30}ms`;
 
  const label    = HIST_LABELS_OBRA[ev.tipo] || ev.tipo || '—';
  const detalhe  = gerarDetalheHistoricoObra(ev);
  const dataObj  = ev.data?.toDate ? ev.data.toDate() : null;
  const dataFmt  = dataObj
    ? dataObj.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
 
  card.innerHTML = `
    <div class="hpneu-stripe"></div>
    <div class="hpneu-body">
      <div class="hpneu-top">
        <span class="hpneu-badge">${label}</span>
        <span class="hpneu-data">${dataFmt}</span>
      </div>
      <div class="hpneu-detalhe">${detalhe}</div>
      ${ev.usuario_nome ? `<div class="hpneu-operador">Por ${ev.usuario_nome}</div>` : ''}
    </div>`;
 
  return card;
}
 
const HIST_PNEU_POR_PAG_OBRA = 10;
 
async function abrirModalHistoricoPneu(pneu, origem = 'obra') {
  const sufixo   = origem === 'obra' ? 'Obra' : 'Frota';
  const idModal  = `modalHistoricoPneu${sufixo}`;
  const idNum    = `histPneuNumero${sufixo}`;
  const idLoad   = `histPneuLoading${sufixo}`;
  const idVazio  = `histPneuVazio${sufixo}`;
  const idLista  = `histPneuLista${sufixo}`;
 
  document.getElementById(idNum).textContent = pneu.numero_identificacao;
 
  const loading = document.getElementById(idLoad);
  const vazio   = document.getElementById(idVazio);
  const lista   = document.getElementById(idLista);
 
  loading.style.display = 'flex';
  vazio.style.display   = 'none';
  lista.style.display   = 'none';
  lista.innerHTML       = '';
 
  abrirModal(idModal);
 
  try {
    const eventos = await listarHistoricoPneu(pneu.id);
 
    loading.style.display = 'none';
 
    if (eventos.length === 0) {
      vazio.style.display = 'flex';
      return;
    }
 
    lista.style.display = 'flex';
    let exibidos = 0;
 
    function renderProximos() {
      const proximo = eventos.slice(exibidos, exibidos + HIST_PNEU_POR_PAG_OBRA);
      proximo.forEach((ev, idx) => lista.appendChild(criarCardHistoricoObra(ev, exibidos + idx)));
      exibidos += proximo.length;
 
      const btnAnt = lista.querySelector('.hpneu-ver-mais');
      if (btnAnt) btnAnt.remove();
 
      if (exibidos < eventos.length) {
        const restantes = eventos.length - exibidos;
        const btn = document.createElement('button');
        btn.className   = 'hpneu-ver-mais';
        btn.textContent = `Ver mais ${restantes} registro${restantes !== 1 ? 's' : ''}`;
        btn.addEventListener('click', renderProximos);
        lista.appendChild(btn);
      }
    }
 
    renderProximos();
 
  } catch (err) {
    console.error('Erro ao carregar histórico do pneu:', err);
    loading.style.display = 'none';
    vazio.style.display   = 'flex';
    mostrarToast('Erro ao carregar histórico.', 'error');
  }
}