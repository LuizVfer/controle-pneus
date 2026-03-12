// ============================================================
//  js/obra.js — Detalhes da Obra
// ============================================================

import {
  observarAuth,
  getDadosUsuario,
  getObra,
  atualizarObra,
  finalizarObra,
  arquivarObra,
  listarCaminhoes,
  adicionarCaminhao,
  deletarCaminhao,
  atualizarCaminhao,
  listarPneusDaObra,
  listarPneusDisponiveis,
  adicionarPneuAoCaminhao,
  removerPneuDoCaminhao,
  listarTrocas,
  logout,
  db,
} from './firebase.js';

import {
  doc,
  updateDoc,
  arrayRemove,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── Estado ───────────────────────────────────
const params    = new URLSearchParams(window.location.search);
const OBRA_ID   = params.get('id');

let usuarioLogado = null;
let obra          = null;
let caminhoes     = [];
let pneus         = [];   // pneus da obra (em uso nesta obra)
let pneusDisponiveis = []; // pneus disponíveis no estoque global (para o modal)
let trocas        = [];
let pfiltro       = 'todos';      // filtro de pneus
let caminhaoAlvo  = null;         // para modais de ação
let pneuSelecionado  = null;       // legado (não usado)
let pneusSelecionados = new Set(); // seleção múltipla no modal

// ─── Elementos ────────────────────────────────
const pageLoading  = document.getElementById('pageLoading');
const mainContent  = document.getElementById('mainContent');
const userAvatar   = document.getElementById('userAvatar');

// Header
const obraStatusBadge = document.getElementById('obraStatusBadge');
const obraNome        = document.getElementById('obraNome');
const obraMeta        = document.getElementById('obraMeta');
const obraActions     = document.getElementById('obraActions');
const statCaminhoes   = document.getElementById('statCaminhoes');
const statPneus       = document.getElementById('statPneus');
const statTempo       = document.getElementById('statTempo');
const statCriador     = document.getElementById('statCriador');

// Tabs
const tabCountCaminhoes = document.getElementById('tabCountCaminhoes');
const tabCountPneus     = document.getElementById('tabCountPneus');
const tabCountTrocas    = document.getElementById('tabCountTrocas');

// Grids
const caminhoesGrid  = document.getElementById('caminhoesGrid');
const pneusLista     = document.getElementById('pneusLista');
const historicoLista = document.getElementById('historicoLista');
const infoCaminhoes  = document.getElementById('infoCaminhoes');

// Botões add
const btnAddCaminhao = document.getElementById('btnAddCaminhao');

// ─── Redireciona se não tiver id ──────────────
if (!OBRA_ID) {
  window.location.href = 'dashboard.html';
}

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
    obra      = await getObra(OBRA_ID);
    if (!obra) { window.location.href = 'dashboard.html'; return; }

    caminhoes = await listarCaminhoes(OBRA_ID);
    pneus            = await listarPneusDaObra(OBRA_ID);
    pneusDisponiveis = await listarPneusDisponiveis();
    trocas           = await listarTrocas(OBRA_ID);
    pneusDisponiveis = await listarPneusDisponiveis();

    renderizarHeader();
    renderizarCaminhoes();
    renderizarPneus();
    renderizarHistorico();

    pageLoading.style.display = 'none';
    mainContent.style.display = 'block';
  } catch (err) {
    console.error('Erro ao carregar obra:', err);
    mostrarToast('Erro ao carregar obra.', 'error');
  }
}

// ─── Header ───────────────────────────────────
function renderizarHeader() {
  const statusLabel = { aberta: 'Em aberto', finalizada: 'Finalizada', arquivada: 'Arquivada' };
  obraStatusBadge.textContent = statusLabel[obra.status] || obra.status;
  obraStatusBadge.className   = `obra-status-badge ${obra.status}`;
  obraNome.textContent        = obra.nome;

  // Meta
  const dataCriacao = obra.data_criacao?.toDate
    ? obra.data_criacao.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  obraMeta.innerHTML = `
    <span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      Criada em ${dataCriacao}
    </span>
    ${obra.data_finalizacao ? `
    <span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
      Finalizada em ${obra.data_finalizacao.toDate().toLocaleDateString('pt-BR')}
    </span>` : ''}
  `;

  // Stats
  const pneusDisponiveis = pneus.filter(p => p.status === 'disponivel').length;
  const pneusEmUso       = pneus.filter(p => p.status === 'em_uso').length;
  statCaminhoes.textContent = `${caminhoes.length} caminhão(ões)`;
  statPneus.textContent     = `${pneus.length} pneu(s) — ${pneusDisponiveis} disponíveis / ${pneusEmUso} em uso`;
  statCriador.textContent   = obra.criado_por_nome || '—';
  statTempo.textContent     = calcularTempo(obra);

  // Contadores de tabs
  tabCountCaminhoes.textContent = caminhoes.length;
  tabCountPneus.textContent     = pneus.length;
  tabCountTrocas.textContent    = trocas.length;

  // Botões de ação
  renderizarAcoesObra();
}

function renderizarAcoesObra() {
  const aberta = obra.status === 'aberta';
  obraActions.innerHTML = '';

  // Editar nome — sempre visível
  const btnEdit = criarBtnAcao('edit', `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
    Editar nome
  `);
  btnEdit.addEventListener('click', abrirEditarNome);
  obraActions.appendChild(btnEdit);

  // Finalizar — só se aberta
  if (aberta) {
    const btnFin = criarBtnAcao('finalizar', `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="20 6 9 17 4 12"/>
      </svg>
      Finalizar obra
    `);
    btnFin.addEventListener('click', () => {
      document.getElementById('finalizarNomeObra').textContent = obra.nome;
      abrirModal('modalFinalizar');
    });
    obraActions.appendChild(btnFin);
  }

  // Arquivar — se aberta ou finalizada
  if (obra.status !== 'arquivada') {
    const btnArq = criarBtnAcao('arquivar', `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="21 8 21 21 3 21 3 8"/>
        <rect x="1" y="3" width="22" height="5"/>
        <line x1="10" y1="12" x2="14" y2="12"/>
      </svg>
      Arquivar obra
    `);
    btnArq.addEventListener('click', () => {
      document.getElementById('arquivarNomeObra').textContent = obra.nome;
      abrirModal('modalArquivar');
    });
    obraActions.appendChild(btnArq);
  }

  // Bloqueia adição de caminhões/pneus se obra não está aberta
  if (!aberta) {
    btnAddCaminhao.disabled = true;
  }
}

function criarBtnAcao(cls, html) {
  const btn = document.createElement('button');
  btn.type      = 'button';
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

// ─── CAMINHÕES ────────────────────────────────

function renderizarCaminhoes() {
  caminhoesGrid.innerHTML = '';
  infoCaminhoes.textContent = `${caminhoes.length} caminhão(ões) nesta obra`;

  if (caminhoes.length === 0) {
    caminhoesGrid.appendChild(estadoVazio(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
      'Nenhum caminhão', 'Adicione caminhões a esta obra.'
    ));
    return;
  }

  caminhoes.forEach((c, i) => {
    // Suporta pneus_ids (novo) e pneu_atual_id (legado)
    const idsArr   = c.pneus_ids || (c.pneu_atual_id ? [c.pneu_atual_id] : []);
    const pneusDoC = idsArr.map(id => pneus.find(p => p.id === id)).filter(Boolean);
    caminhoesGrid.appendChild(criarCardCaminhao(c, pneusDoC, i));
  });
}

function criarCardCaminhao(c, pneusDoC, index) {
  const card    = document.createElement('div');
  card.className = 'caminhao-card';
  card.style.animationDelay = `${index * 50}ms`;
  const bloqueado = obra.status !== 'aberta';

  // Monta lista de pneus
  const pneusHtml = pneusDoC.length === 0
    ? `<div class="pneu-vazio-hint">Nenhum pneu atribuído</div>`
    : pneusDoC.map(p => `
        <div class="pneu-chip" data-pneu-id="${p.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
          </svg>
          <span>${p.numero_identificacao}</span>
          ${!bloqueado ? `
            <button class="pneu-chip-remove" data-pneu-id="${p.id}" data-pneu-num="${p.numero_identificacao}" title="Remover pneu">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>` : ''}
        </div>`).join('');

  card.innerHTML = `
    <div class="caminhao-card-top">
      <div class="caminhao-info">
        <div class="caminhao-numero">Caminhão ${index + 1}</div>
        <div class="caminhao-nome">${c.nome}</div>
        ${c.placa ? `<div class="caminhao-placa">${c.placa}</div>` : ''}
      </div>
      <div class="caminhao-card-actions">
        <button class="btn-card-action danger btn-del-caminhao" title="Remover caminhão" ${bloqueado ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="caminhao-pneus-section">
      <div class="pneus-chips-wrap" id="chips-${c.id}">
        ${pneusHtml}
      </div>
      <div class="caminhao-pneus-footer">
        <span class="pneus-count">${pneusDoC.length} pneu(s)</span>
        <button class="btn-add-pneu-caminhao" ${bloqueado ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Adicionar pneu
        </button>
      </div>
    </div>
  `;

  // Remover caminhão
  card.querySelector('.btn-del-caminhao').addEventListener('click', () => {
    caminhaoAlvo = c;
    document.getElementById('removerCaminhaoNome').textContent = c.nome;
    abrirModal('modalRemoverCaminhao');
  });

  // Adicionar pneu ao caminhão
  card.querySelector('.btn-add-pneu-caminhao').addEventListener('click', () => {
    abrirModalAtribuir(c);
  });

  // Remover pneu individual (chip)
  card.querySelectorAll('.pneu-chip-remove').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pneuId  = btn.dataset.pneuId;
      const pneuNum = btn.dataset.pneuNum;
      btn.disabled  = true;
      try {
        await removerPneuDoCaminhao(OBRA_ID, c.id, pneuId, pneuNum, usuarioLogado.uid, usuarioLogado.nome);
        mostrarToast(`Pneu ${pneuNum} removido do caminhão.`, 'success');
        await recarregarDados();
      } catch (err) {
        console.error(err);
        mostrarToast('Erro ao remover pneu.', 'error');
        btn.disabled = false;
      }
    });
  });

  return card;
}

btnAddCaminhao.addEventListener('click', () => {
  document.getElementById('addCaminhaoNome').value  = '';
  document.getElementById('addCaminhaoPlaca').value = '';
  document.getElementById('addCaminhaoNomeError').textContent = '';
  document.getElementById('addCaminhaoNome').classList.remove('is-error');
  abrirModal('modalAddCaminhao');
});

document.getElementById('salvarAddCaminhao').addEventListener('click', async () => {
  const nome  = document.getElementById('addCaminhaoNome').value.trim();
  const placa = document.getElementById('addCaminhaoPlaca').value.trim().toUpperCase();
  const errEl = document.getElementById('addCaminhaoNomeError');
  const btn   = document.getElementById('salvarAddCaminhao');

  errEl.textContent = '';
  document.getElementById('addCaminhaoNome').classList.remove('is-error');

  if (!nome) {
    document.getElementById('addCaminhaoNome').classList.add('is-error');
    errEl.textContent = 'Nome obrigatório.';
    return;
  }

  setLoadingBtn(btn, true);
  try {
    await adicionarCaminhao(OBRA_ID, { nome, placa: placa || null });
    // Atualiza contador
    await atualizarObra(OBRA_ID, { qtd_caminhoes: caminhoes.length + 1 }, { qtd_caminhoes: caminhoes.length }, usuarioLogado.uid, usuarioLogado.nome);
    fecharModal('modalAddCaminhao');
    mostrarToast(`Caminhão "${nome}" adicionado! ✓`, 'success');
    await recarregarDados();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao adicionar caminhão.', 'error');
  } finally {
    setLoadingBtn(btn, false);
  }
});

// Remover caminhão
document.getElementById('confirmarRemoverCaminhao').addEventListener('click', async () => {
  if (!caminhaoAlvo) return;
  const btn = document.getElementById('confirmarRemoverCaminhao');
  setLoadingBtn(btn, true);
  try {
    // Libera todos os pneus do caminhão
    const idsParaLiberar = caminhaoAlvo.pneus_ids || (caminhaoAlvo.pneu_atual_id ? [caminhaoAlvo.pneu_atual_id] : []);
    for (const pneuId of idsParaLiberar) {
      await updateDoc(doc(db, 'pneus', pneuId), {
        status:        'disponivel',
        caminhao_id:   null,
        // mantém obra_id_atual — pneu fica disponível na mesma obra
      });
    }
    await deletarCaminhao(OBRA_ID, caminhaoAlvo.id);
    await atualizarObra(OBRA_ID, { qtd_caminhoes: Math.max(0, caminhoes.length - 1) }, { qtd_caminhoes: caminhoes.length }, usuarioLogado.uid, usuarioLogado.nome);
    fecharModal('modalRemoverCaminhao');
    mostrarToast(`Caminhão removido.`, 'success');
    await recarregarDados();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao remover caminhão.', 'error');
  } finally {
    setLoadingBtn(btn, false);
    caminhaoAlvo = null;
  }
});

// ─── PNEUS ────────────────────────────────────

function renderizarPneus() {
  pneusLista.innerHTML = '';

  let filtrados = pneus;
  if (pfiltro === 'disponivel') filtrados = pneus.filter(p => p.status === 'disponivel');
  if (pfiltro === 'em_uso')     filtrados = pneus.filter(p => p.status === 'em_uso');

  if (filtrados.length === 0) {
    const div = estadoVazio(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>`,
      'Nenhum pneu', pfiltro === 'todos' ? 'Adicione pneus a esta obra.' : `Nenhum pneu ${pfiltro === 'disponivel' ? 'disponível' : 'em uso'}.`
    );
    div.style.gridColumn = '1 / -1';
    pneusLista.appendChild(div);
    return;
  }

  filtrados.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = `pneu-item ${p.status}`;
    item.style.animationDelay = `${i * 30}ms`;

    // Descobre em qual caminhão está (se em uso)
    const caminhaoUsando = p.status === 'em_uso'
      ? caminhoes.find(c => {
          const ids = c.pneus_ids || (c.pneu_atual_id ? [c.pneu_atual_id] : []);
          return ids.includes(p.id);
        })
      : null;

    item.innerHTML = `
      <div class="pneu-item-icone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
        </svg>
      </div>
      <div class="pneu-item-info">
        <div class="pneu-item-num">${p.numero_identificacao}</div>
        <div class="pneu-item-status">${p.status === 'disponivel' ? 'Disponível' : 'Em uso'}</div>
        ${caminhaoUsando ? `<div class="pneu-item-caminhao">↳ ${caminhaoUsando.nome}</div>` : ''}
      </div>
    `;
    pneusLista.appendChild(item);
  });
}

// Filtro de pneus
document.querySelectorAll('.pf-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pf-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    pfiltro = btn.dataset.pf;
    renderizarPneus();
  });
});



// ─── ATRIBUIR PNEUS AO CAMINHÃO (múltiplos) ──

let _disponivelCache = []; // cache local do modal

async function abrirModalAtribuir(caminhao) {
  caminhaoAlvo      = caminhao;
  pneusSelecionados = new Set();

  const subEl  = document.getElementById('modalAtribuirCaminhao');
  const errEl  = document.getElementById('atribuirPneuError');
  const lista  = document.getElementById('pneuSelectLista');
  const busca  = document.getElementById('atribuirBusca');
  const btnAll = document.getElementById('btnSelecionarTodos');

  if (subEl)  subEl.textContent  = caminhao.nome;
  if (errEl)  errEl.textContent  = '';
  if (busca)  busca.value        = '';
  if (btnAll) btnAll.textContent = 'Selecionar todos';
  lista.classList.remove('is-error');

  atualizarBtnConfirmar(0);
  abrirModal('modalAtribuirPneu');

  // Mostra loading enquanto busca pneus frescos do Firebase
  lista.innerHTML = `<div class="atribuir-loading">
    <svg class="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
      <path d="M12 2a10 10 0 1 0 10 10" stroke-linecap="round"/>
    </svg>
    <span>Carregando estoque...</span>
  </div>`;

  try {
    // Busca sempre fresco — evita mostrar pneus que já foram atribuídos em outra aba
    pneusDisponiveis = await listarPneusDisponiveis();
  } catch (e) {
    console.error(e);
  }

  const idsNoC = caminhao.pneus_ids || (caminhao.pneu_atual_id ? [caminhao.pneu_atual_id] : []);
  _disponivelCache = pneusDisponiveis.filter(p => !idsNoC.includes(p.id));

  renderizarListaAtribuir('');
}

function renderizarListaAtribuir(termoBusca) {
  const lista  = document.getElementById('pneuSelectLista');
  const errEl  = document.getElementById('atribuirPneuError');
  const btnAll = document.getElementById('btnSelecionarTodos');
  lista.classList.remove('is-error');

  const termo = termoBusca.toLowerCase().trim();
  const filtrados = termo
    ? _disponivelCache.filter(p => p.numero_identificacao.toLowerCase().includes(termo))
    : _disponivelCache;

  lista.innerHTML = '';

  if (_disponivelCache.length === 0) {
    lista.innerHTML = `
      <div class="atribuir-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
        </svg>
        <p>Nenhum pneu disponível no estoque.</p>
        <span>Adicione pneus pelo <strong>Estoque Global</strong> primeiro.</span>
      </div>`;
    if (btnAll) btnAll.style.display = 'none';
    return;
  }

  if (btnAll) btnAll.style.display = 'inline-flex';

  if (filtrados.length === 0) {
    lista.innerHTML = `<p class="sem-pneus">Nenhum resultado para "<strong>${termoBusca}</strong>".</p>`;
    return;
  }

  // Contador de resultados
  const dica = document.createElement('div');
  dica.className = 'atribuir-dica';
  dica.innerHTML = termo
    ? `<span>${filtrados.length} resultado(s)</span>`
    : `<span>${filtrados.length} pneu(s) disponível(is)</span>`;
  lista.appendChild(dica);

  filtrados.forEach(p => {
    const jaSelecionado = pneusSelecionados.has(p);
    const item = document.createElement('div');
    item.className  = `pneu-select-item${jaSelecionado ? ' selected' : ''}`;
    item.dataset.id = p.id;
    item.innerHTML  = `
      <div class="pneu-select-icone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
        </svg>
      </div>
      <span class="pneu-select-num">${p.numero_identificacao}</span>
      <span class="pneu-select-check">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </span>
    `;
    item.addEventListener('click', () => {
      if (pneusSelecionados.has(p)) {
        pneusSelecionados.delete(p);
        item.classList.remove('selected');
      } else {
        pneusSelecionados.add(p);
        item.classList.add('selected');
      }
      atualizarBtnConfirmar(pneusSelecionados.size);
      atualizarBtnTodos();
      if (errEl) errEl.textContent = '';
      lista.classList.remove('is-error');
    });
    lista.appendChild(item);
  });

  atualizarBtnTodos();
}

function atualizarBtnConfirmar(count) {
  const t = document.querySelector('#salvarAtribuirPneu .btn-text');
  if (t) t.textContent = count > 0 ? `Adicionar (${count})` : 'Adicionar';
}

function atualizarBtnTodos() {
  const btnAll = document.getElementById('btnSelecionarTodos');
  if (!btnAll) return;
  const todosSelecionados = _disponivelCache.length > 0
    && _disponivelCache.every(p => pneusSelecionados.has(p));
  btnAll.textContent = todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos';
}

// Busca dentro do modal
document.getElementById('atribuirBusca')?.addEventListener('input', (e) => {
  renderizarListaAtribuir(e.target.value);
});

// Selecionar / desmarcar todos
document.getElementById('btnSelecionarTodos')?.addEventListener('click', () => {
  const errEl = document.getElementById('atribuirPneuError');
  const todosSelecionados = _disponivelCache.every(p => pneusSelecionados.has(p));

  if (todosSelecionados) {
    pneusSelecionados.clear();
  } else {
    _disponivelCache.forEach(p => pneusSelecionados.add(p));
  }

  // Re-renderiza mantendo busca
  const busca = document.getElementById('atribuirBusca');
  renderizarListaAtribuir(busca?.value || '');
  atualizarBtnConfirmar(pneusSelecionados.size);
  if (errEl) errEl.textContent = '';
});

// Confirmar adição de múltiplos pneus ao caminhão
document.getElementById('salvarAtribuirPneu').addEventListener('click', async () => {
  const errEl = document.getElementById('atribuirPneuError');
  const lista = document.getElementById('pneuSelectLista');
  const btn   = document.getElementById('salvarAtribuirPneu');

  if (pneusSelecionados.size === 0) {
    if (errEl) errEl.textContent = 'Selecione ao menos um pneu.';
    lista.classList.add('is-error');
    return;
  }

  setLoadingBtn(btn, true);
  try {
    const arr = Array.from(pneusSelecionados);
    for (const p of arr) {
      await adicionarPneuAoCaminhao(
        OBRA_ID,
        caminhaoAlvo.id,
        p.id,
        p.numero_identificacao,
        usuarioLogado.uid,
        usuarioLogado.nome
      );
    }
    fecharModal('modalAtribuirPneu');
    const nomes = arr.map(p => p.numero_identificacao).join(', ');
    mostrarToast(`${arr.length} pneu(s) adicionado(s) ao ${caminhaoAlvo.nome}! ✓`, 'success');
    await recarregarDados();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao adicionar pneus.', 'error');
  } finally {
    setLoadingBtn(btn, false);
    pneusSelecionados = new Set();
    caminhaoAlvo      = null;
  }
});

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
    errEl.textContent = 'Nome obrigatório.';
    return;
  }
  if (novoNome === obra.nome) { fecharModal('modalEditarNome'); return; }

  setLoadingBtn(btn, true);
  try {
    await atualizarObra(
      OBRA_ID,
      { nome: novoNome },
      { nome: obra.nome },
      usuarioLogado.uid,
      usuarioLogado.nome
    );
    obra.nome = novoNome;
    obraNome.textContent = novoNome;
    document.getElementById('finalizarNomeObra').textContent = novoNome;
    document.getElementById('arquivarNomeObra').textContent  = novoNome;
    fecharModal('modalEditarNome');
    mostrarToast('Nome atualizado! ✓', 'success');
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao atualizar nome.', 'error');
  } finally {
    setLoadingBtn(btn, false);
  }
});

// ─── FINALIZAR OBRA ───────────────────────────
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
    console.error(err);
    mostrarToast('Erro ao finalizar obra.', 'error');
  } finally {
    setLoadingBtn(btn, false);
  }
});

// ─── ARQUIVAR OBRA ────────────────────────────
document.getElementById('confirmarArquivar').addEventListener('click', async () => {
  const btn = document.getElementById('confirmarArquivar');
  setLoadingBtn(btn, true);
  try {
    await arquivarObra(OBRA_ID);
    fecharModal('modalArquivar');
    mostrarToast('Obra arquivada.', 'success');
    setTimeout(() => window.location.href = 'dashboard.html', 1200);
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao arquivar obra.', 'error');
  } finally {
    setLoadingBtn(btn, false);
  }
});

// ─── HISTÓRICO ────────────────────────────────
function renderizarHistorico() {
  historicoLista.innerHTML = '';

  if (trocas.length === 0) {
    historicoLista.appendChild(estadoVazio(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
      'Sem trocas registradas', 'As trocas de pneu aparecerão aqui.'
    ));
    return;
  }

  const PAGINA_TAM = 30;
  let paginaAtual = 0;

  function renderPagina(pagina) {
    // Remove itens e botão existentes
    historicoLista.querySelectorAll('.troca-item, .btn-mais-trocas').forEach(el => el.remove());

    const inicio = pagina * PAGINA_TAM;
    const slice  = trocas.slice(0, inicio + PAGINA_TAM);

    slice.forEach((t, i) => {
      if (historicoLista.querySelector(`[data-troca-id="${t.id}"]`)) return; // evita duplicata

      const item = document.createElement('div');
      item.className = 'troca-item';
      item.dataset.trocaId = t.id;
      item.style.animationDelay = `${(i - inicio) * 30}ms`;

      const data = t.data?.toDate
        ? t.data.toDate().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : '—';

      // ── Monta linha de movimento corretamente ──
      let detalheHtml = '';
      if (!t.pneu_saiu && t.pneu_entrou) {
        // Adição pura
        detalheHtml = `
          <span class="troca-badge add">+ adicionado</span>
          <span class="troca-pneu-entrou">↓ ${t.pneu_entrou_numero || t.pneu_entrou?.substring(0,8)}</span>`;
      } else if (t.pneu_saiu && !t.pneu_entrou) {
        // Remoção pura
        const numSaiu = t.pneu_saiu_numero || resolverNumPneu(t.pneu_saiu);
        detalheHtml = `
          <span class="troca-badge rem">- removido</span>
          <span class="troca-pneu-saiu">↑ ${numSaiu}</span>`;
      } else {
        // Troca real
        const numSaiu = t.pneu_saiu_numero || resolverNumPneu(t.pneu_saiu);
        detalheHtml = `
          <span class="troca-pneu-saiu">↑ ${numSaiu}</span>
          <span class="troca-arrow">→</span>
          <span class="troca-pneu-entrou">↓ ${t.pneu_entrou_numero || '—'}</span>`;
      }

      item.innerHTML = `
        <div class="troca-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="17 1 21 5 17 9"/>
            <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
            <polyline points="7 23 3 19 7 15"/>
            <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
          </svg>
        </div>
        <div class="troca-info">
          <div class="troca-caminhao">${t.caminhao_nome || '—'}</div>
          <div class="troca-detalhe">${detalheHtml}</div>
          <div class="troca-usuario">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            ${t.usuario_nome || '—'}
          </div>
        </div>
        <div class="troca-data">${data}</div>
      `;
      historicoLista.appendChild(item);
    });

    // Botão "Ver mais" se ainda há registros
    if (trocas.length > (pagina + 1) * PAGINA_TAM) {
      const btnMais = document.createElement('button');
      btnMais.className   = 'btn-mais-trocas';
      btnMais.textContent = `Ver mais (${trocas.length - (pagina + 1) * PAGINA_TAM} restantes)`;
      btnMais.addEventListener('click', () => { paginaAtual++; renderPagina(paginaAtual); });
      historicoLista.appendChild(btnMais);
    }
  }

  renderPagina(0);
}

// Resolve o número de um pneu pelo ID (busca no array carregado)
function resolverNumPneu(pneuId) {
  if (!pneuId) return '—';
  const p = pneus.find(x => x.id === pneuId);
  return p ? p.numero_identificacao : pneuId.substring(0, 8);
}

// ─── Helpers ──────────────────────────────────

async function recarregarDados() {
  caminhoes = await listarCaminhoes(OBRA_ID);
  pneus     = await listarPneusDaObra(OBRA_ID);
  trocas    = await listarTrocas(OBRA_ID);
  obra      = await getObra(OBRA_ID);
  renderizarHeader();
  renderizarCaminhoes();
  renderizarPneus();
  renderizarHistorico();
}

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

// Fecha modais pelo botão X ou "Cancelar"
document.querySelectorAll('.modal-close, .btn-cancelar[data-modal]').forEach(el => {
  el.addEventListener('click', () => {
    const id = el.dataset.modal || el.closest('.modal-overlay')?.id;
    if (id) fecharModal(id);
  });
});

// Fecha clicando fora do modal
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
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
    const dias = Math.floor((fim - inicio) / (1000 * 60 * 60 * 24));
    return `Durou ${dias} dia(s)`;
  }
  if (o.status === 'aberta') {
    const dias = Math.floor((new Date() - inicio) / (1000 * 60 * 60 * 24));
    return dias === 0 ? 'Criada hoje' : `Aberta há ${dias} dia(s)`;
  }
  return '—';
}

function mostrarToast(msg, tipo = 'success') {
  const toast    = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const icon     = toast.querySelector('.toast-icon');
  toast.className     = `toast ${tipo}`;
  toastMsg.textContent = msg;
  icon.textContent    = tipo === 'success' ? '✓' : '✕';
  toast.style.display = 'flex';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}