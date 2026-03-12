// ============================================================
//  estoque.js — Gerenciamento do estoque global de pneus
// ============================================================

import {
  observarAuth,
  getDadosUsuario,
  listarEstoque,
  adicionarPneusEmLote,
  inutilizarPneu,
  reativarPneu,
  logout,
} from './firebase.js';

// ─── Estado ───────────────────────────────────
let usuarioLogado = null;
let todosPneus    = [];       // cache do estoque completo
let filtroAtivo   = 'todos';
let buscaAtiva    = '';
let pneuAlvo      = null;     // pneu selecionado para ação

// ─── Elementos ────────────────────────────────
const pneusGrid    = document.getElementById('pneusGrid');
const stateLoading = document.getElementById('stateLoading');
const stateEmpty   = document.getElementById('stateEmpty');
const emptyTitle   = document.getElementById('emptyTitle');
const emptyMsg     = document.getElementById('emptyMsg');
const searchInput  = document.getElementById('searchInput');

// ─── Auth ─────────────────────────────────────
observarAuth(async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  usuarioLogado = await getDadosUsuario(user.uid);
  if (!usuarioLogado || usuarioLogado.ativo === false) {
    await logout(); window.location.href = 'login.html'; return;
  }
  document.getElementById('userAvatar').textContent =
    (usuarioLogado.nome || 'U')[0].toUpperCase();
  await carregarEstoque();
});

// ─── Carregar estoque ─────────────────────────
async function carregarEstoque() {
  mostrarEstado('loading');
  try {
    todosPneus = await listarEstoque();
    atualizarKpis();
    renderizarGrade();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao carregar estoque.', 'error');
    mostrarEstado('empty');
  }
}

// ─── KPIs ─────────────────────────────────────
function atualizarKpis() {
  document.getElementById('kpiTotal').textContent =
    todosPneus.length;
  document.getElementById('kpiDisponivel').textContent =
    todosPneus.filter(p => p.status === 'disponivel').length;
  document.getElementById('kpiEmUso').textContent =
    todosPneus.filter(p => p.status === 'em_uso').length;
  document.getElementById('kpiInutilizavel').textContent =
    todosPneus.filter(p => p.status === 'inutilizavel').length;
}

// ─── Renderizar grade ─────────────────────────
function renderizarGrade() {
  stateLoading.style.display = 'none'; // garante que o spinner some
  let lista = todosPneus;

  // Filtro por status
  if (filtroAtivo !== 'todos') {
    lista = lista.filter(p => p.status === filtroAtivo);
  }

  // Filtro por busca
  if (buscaAtiva) {
    const q = buscaAtiva.toLowerCase();
    lista = lista.filter(p =>
      p.numero_identificacao?.toLowerCase().includes(q)
    );
  }

  if (lista.length === 0) {
    pneusGrid.style.display = 'none';
    stateEmpty.style.display = 'flex';
    if (buscaAtiva) {
      emptyTitle.textContent = 'Nenhum resultado';
      emptyMsg.textContent   = `Nenhum pneu encontrado para "${buscaAtiva}".`;
    } else if (filtroAtivo !== 'todos') {
      const labels = { disponivel:'disponível', em_uso:'em uso', inutilizavel:'inutilizável' };
      emptyTitle.textContent = `Nenhum pneu ${labels[filtroAtivo]}`;
      emptyMsg.textContent   = 'Tente outro filtro.';
    } else {
      emptyTitle.textContent = 'Estoque vazio';
      emptyMsg.textContent   = 'Clique em "Adicionar Pneus" para cadastrar pneus.';
    }
    return;
  }

  stateEmpty.style.display = 'none';
  pneusGrid.style.display  = 'grid';
  pneusGrid.innerHTML      = '';

  lista.forEach((p, idx) => {
    const card = criarCardPneu(p, idx);
    pneusGrid.appendChild(card);
  });
}

// ─── Card de pneu ─────────────────────────────
function criarCardPneu(p, idx) {
  const card = document.createElement('div');
  card.className = `pneu-card ${p.status}`;
  card.style.animationDelay = `${idx * 20}ms`;

  const statusLabel = {
    disponivel:   'Disponível',
    em_uso:       'Em Uso',
    inutilizavel: 'Inutilizável',
  }[p.status] || p.status;

  // Info extra dependendo do status
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
        <span>${p.caminhao_nome || 'Caminhão desconhecido'}</span>
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

  // Botões de ação
  let acoesHtml = '';
  if (p.status === 'disponivel' || p.status === 'em_uso') {
    acoesHtml = `
      <button class="btn-pneu-action inutilizar" data-id="${p.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>
        Inutilizar
      </button>`;
  } else if (p.status === 'inutilizavel') {
    acoesHtml = `
      <button class="btn-pneu-action reativar" data-id="${p.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        Reativar
      </button>`;
  }

  card.innerHTML = `
    <div class="pneu-card-top">
      <div class="pneu-icone">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
        </svg>
      </div>
      <span class="status-badge">${statusLabel}</span>
    </div>
    <div class="pneu-numero">${p.numero_identificacao}</div>
    ${infoExtra ? `<div class="pneu-card-info">${infoExtra}</div>` : ''}
    <div class="pneu-card-actions">${acoesHtml}</div>
  `;

  // Listener inutilizar
  const btnInut = card.querySelector('.btn-pneu-action.inutilizar');
  if (btnInut) {
    btnInut.addEventListener('click', () => abrirModalInutilizar(p));
  }

  // Listener reativar
  const btnReat = card.querySelector('.btn-pneu-action.reativar');
  if (btnReat) {
    btnReat.addEventListener('click', () => abrirModalReativar(p));
  }

  return card;
}

// ─── Filtros ─────────────────────────────────
document.querySelectorAll('.ftab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.ftab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filtroAtivo = btn.dataset.filtro;
    renderizarGrade();
  });
});

searchInput.addEventListener('input', () => {
  buscaAtiva = searchInput.value.trim();
  renderizarGrade();
});

// ─── Modal: Adicionar pneus ───────────────────
const qtdInput = document.getElementById('qtdPneus');
const qtyHint  = document.getElementById('qtyHint');

function atualizarHint() {
  const v = parseInt(qtdInput.value) || 1;
  qtyHint.textContent = v === 1
    ? '1 pneu será adicionado ao estoque global'
    : `${v} pneus serão adicionados ao estoque global`;
}

document.getElementById('qtyMinus').addEventListener('click', () => {
  const v = Math.max(1, (parseInt(qtdInput.value) || 1) - 1);
  qtdInput.value = v; atualizarHint();
});
document.getElementById('qtyPlus').addEventListener('click', () => {
  const v = Math.min(200, (parseInt(qtdInput.value) || 1) + 1);
  qtdInput.value = v; atualizarHint();
});
qtdInput.addEventListener('input', atualizarHint);

document.getElementById('btnAddEstoque').addEventListener('click', () => {
  qtdInput.value = 1; atualizarHint();
  abrirModal('modalAddEstoque');
});

document.getElementById('salvarAddEstoque').addEventListener('click', async () => {
  const qtd = Math.max(1, Math.min(200, parseInt(qtdInput.value) || 1));
  const btn = document.getElementById('salvarAddEstoque');
  setLoadingBtn(btn, true, `Adicionando ${qtd}...`);
  try {
    const adicionados = await adicionarPneusEmLote(qtd);
    fecharModal('modalAddEstoque');
    mostrarToast(`${adicionados.length} pneu(s) adicionado(s) ao estoque! ✓`, 'success');
    await carregarEstoque();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao adicionar pneus. Tente novamente.', 'error');
  } finally {
    setLoadingBtn(btn, false, 'Confirmar');
  }
});

// ─── Modal: Inutilizar ────────────────────────
function abrirModalInutilizar(p) {
  pneuAlvo = p;
  document.getElementById('inutPneuNum').textContent    = p.numero_identificacao;
  document.getElementById('inutPneuStatus').textContent =
    p.status === 'em_uso' ? '⚠️ Pneu em uso — será removido do caminhão' : 'Disponível no estoque';
  document.getElementById('motivoError').textContent = '';
  document.getElementById('motivoLivreWrap').style.display = 'none';
  document.getElementById('motivoLivreInput').value = '';
  document.querySelectorAll('input[name="motivo"]').forEach(r => r.checked = false);
  abrirModal('modalInutilizar');
}

// Mostrar campo livre ao selecionar "Outro"
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

  if (!radioSelecionado) {
    errEl.textContent = 'Selecione um motivo.';
    return;
  }

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
    await carregarEstoque();
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
    await carregarEstoque();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao reativar pneu.', 'error');
  } finally {
    setLoadingBtn(btn, false, 'Reativar');
    pneuAlvo = null;
  }
});

// ─── Fechar modal por botões [data-close] ─────
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
  stateLoading.style.display = estado === 'loading' ? 'flex'  : 'none';
  pneusGrid.style.display    = estado === 'grid'    ? 'grid'  : 'none';
  stateEmpty.style.display   = estado === 'empty'   ? 'flex'  : 'none';
}

function abrirModal(id) {
  document.getElementById(id).style.display = 'flex';
}
function fecharModal(id) {
  document.getElementById(id).style.display = 'none';
}

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
  if (t && loadingText) t.textContent = loading ? loadingText : t.dataset.orig || t.textContent;
  if (t && !t.dataset.orig && loading) t.dataset.orig = t.textContent;
  if (t && !loading && t.dataset.orig) { t.textContent = t.dataset.orig; delete t.dataset.orig; }
}