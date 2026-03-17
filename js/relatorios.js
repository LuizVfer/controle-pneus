// ============================================================
//  relatorios.js — Tela de relatórios (v3)
// ============================================================

import {
  observarAuth, getDadosUsuario, listarObras,
  getObra, listarCaminhoes, listarPneusDaObra, listarTrocas, logout,
  db,
} from './firebase.js';

import {
  getDoc, doc,
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

// ─── Estado ───────────────────────────────────
let usuarioLogado    = null;
let todasAsObras     = [];
let trocasCarregadas = [];
let caminhoesCarregados = [];
const HIST_PAGINA    = 20;
let histPagina       = 0;
let trocasFiltradas  = [];
let histFiltros = { tipo: '', busca: '', veiculo: '', dtIni: '', dtFim: '', usuario: '' };

// ─── Elementos ────────────────────────────────
const selectObra   = document.getElementById('selectObra');
const filterStatus = document.getElementById('filterStatus');
const btnGerar     = document.getElementById('btnGerar');
const emptyState   = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const relatorio    = document.getElementById('relatorio');

// ─── Auth ─────────────────────────────────────
observarAuth(async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  usuarioLogado = await getDadosUsuario(user.uid);
  if (!usuarioLogado || usuarioLogado.ativo === false) {
    await logout(); window.location.href = 'login.html'; return;
  }
  document.getElementById('userAvatar').textContent =
    (usuarioLogado.nome || 'U')[0].toUpperCase();
  await carregarObras();
});

// ─── Select de obras ───────────────────────────
async function carregarObras() {
  todasAsObras = await listarObras();
  popularSelect(filterStatus.value);
}

function popularSelect(filtroStatus) {
  const filtradas = filtroStatus === 'todas'
    ? todasAsObras
    : todasAsObras.filter(o => o.status === filtroStatus);

  selectObra.innerHTML = filtradas.length === 0
    ? '<option value="">— Nenhuma obra encontrada —</option>'
    : '<option value="">— Selecione uma obra —</option>';

  filtradas.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o.id;
    opt.textContent = `${o.nome} (${traduzirStatus(o.status)})`;
    selectObra.appendChild(opt);
  });
  btnGerar.disabled = true;
}

filterStatus.addEventListener('change', () => popularSelect(filterStatus.value));
selectObra.addEventListener('change', () => { btnGerar.disabled = !selectObra.value; });

// ─── Gerar ────────────────────────────────────
btnGerar.addEventListener('click', async () => {
  const obraId = selectObra.value;
  if (!obraId) return;
  mostrarEstado('loading');
  try {
    const [obra, caminhoes, pneus, trocas] = await Promise.all([
      getObra(obraId),
      listarCaminhoes(obraId),
      listarPneusDaObra(obraId),
      listarTrocas(obraId),
    ]);

    // Busca pneus inutilizados durante esta obra via histórico de trocas
    const pneusInutilizados = await buscarPneusInutilizados(trocas);

    trocasCarregadas    = trocas;
    caminhoesCarregados = caminhoes;
    renderizarRelatorio(obra, caminhoes, pneus, trocas, pneusInutilizados);
    mostrarEstado('relatorio');
  } catch (err) {
    console.error(err);
    mostrarEstado('empty');
    alert('Erro ao gerar relatório. Tente novamente.');
  }
});

// ─── Busca pneus inutilizados que passaram pela obra ──
async function buscarPneusInutilizados(trocas) {
  // Procura registros de remoção com motivo de inutilização
  const idsInut = [...new Set(
    trocas
      .filter(t => t.motivo_saida?.startsWith('Inutilizado') && t.pneu_saiu)
      .map(t => t.pneu_saiu)
  )];

  if (idsInut.length === 0) return [];

  const snaps = await Promise.all(
    idsInut.map(id => getDoc(doc(db, 'pneus', id)))
  );
  return snaps
    .filter(s => s.exists())
    .map(s => ({ id: s.id, ...s.data() }));
}

// ─── Renderização principal ────────────────────
function renderizarRelatorio(obra, caminhoes, pneus, trocas, pneusInutilizados = []) {

  document.getElementById('relGeradoEm').textContent =
    new Date().toLocaleString('pt-BR');

  // ── Cabeçalho ──
  const badge = document.getElementById('relStatusBadge');
  badge.textContent = traduzirStatus(obra.status);
  badge.className   = `rel-status-badge ${obra.status}`;
  document.getElementById('relNome').textContent = obra.nome;

  const meta = document.getElementById('relMeta');
  meta.innerHTML = `
    ${metaItem(iconCalendar(), 'Criada em', formatarData(obra.data_criacao))}
    ${obra.data_finalizacao ? metaItem(iconCalendar(), 'Finalizada em', formatarData(obra.data_finalizacao)) : ''}
    ${obra.status === 'aberta' ? metaItem(iconClock(), 'Aberta há', calcularDuracaoTexto(obra.data_criacao)) : ''}
    ${obra.criado_por_nome  ? metaItem(iconUser(), 'Criada por', obra.criado_por_nome) : ''}
  `;

  // ── KPIs ──
  let totalPosicoes = 0;
  let posOcupadas   = 0;
  caminhoes.forEach(c => {
    const pos = c.posicoes || [];
    totalPosicoes += pos.length;
    posOcupadas   += pos.filter(p => p.pneu_id).length;
  });
  const cobertura = totalPosicoes > 0
    ? Math.round((posOcupadas / totalPosicoes) * 100) : 0;

  const emUso       = pneus.filter(p => p.status === 'em_uso').length;
  const disponiveis = pneus.filter(p => p.status === 'disponivel').length;
  const veiCompl    = caminhoes.filter(c => {
    const pos = c.posicoes || [];
    return pos.length > 0 && pos.every(p => p.pneu_id);
  }).length;

  const adicionados = trocas.filter(t => !t.pneu_saiu && t.pneu_entrou).length;
  const removidos   = trocas.filter(t => t.pneu_saiu && !t.pneu_entrou).length;
  const trocasReais = trocas.filter(t => t.pneu_saiu && t.pneu_entrou).length;

  // Breakdown de condição (pneus ativos: em_uso + disponivel)
  const pneusAtivos = pneus.filter(p => p.status === 'em_uso' || p.status === 'disponivel');
  const qtdNovos  = pneusAtivos.filter(p => p.condicao === 'novo'  || !p.condicao).length;
  const qtdMedios = pneusAtivos.filter(p => p.condicao === 'medio').length;
  const qtdRuins  = pneusAtivos.filter(p => p.condicao === 'ruim').length;

  document.getElementById('relKpis').innerHTML = `
    ${kpi('Veículos', caminhoes.length, '')}
    ${kpi('Pneus na obra', pneus.length, 'accent')}
    ${kpi('Em uso', emUso, 'accent')}
    ${kpi('Disponíveis', disponiveis, 'verde')}
    ${kpi('Cobertura', cobertura + '%', cobertura === 100 ? 'verde' : 'accent')}
    ${kpi('Veíc. completos', veiCompl + '/' + caminhoes.length, veiCompl === caminhoes.length ? 'verde' : '')}
    ${kpi('Adições', adicionados, '')}
    ${kpi('Trocas', trocasReais, '')}
    ${kpi('Remoções', removidos, removidos > 0 ? 'vermelho' : '')}
    ${kpi('Inutilizados', pneusInutilizados.length, pneusInutilizados.length > 0 ? 'vermelho' : '')}
    ${kpiCondicao(qtdNovos, qtdMedios, qtdRuins)}
  `;

  // ── Tabela de Veículos ──
  document.getElementById('countCaminhoes').textContent = caminhoes.length;
  const tbody = document.getElementById('bodyCaminhoes');
  tbody.innerHTML = '';

  if (caminhoes.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="sem-registros">Nenhum veículo cadastrado.</td></tr>`;
  } else {
    caminhoes.forEach((c, i) => {
      const posicoes = c.posicoes || [];
      const totalPos = posicoes.length;
      const ocupadas = posicoes.filter(p => p.pneu_id).length;
      const pct      = totalPos > 0 ? Math.round((ocupadas / totalPos) * 100) : 0;
      const completo = ocupadas === totalPos && totalPos > 0;

      const chipsHtml = ocupadas > 0
        ? `<div class="pneu-chips-inline">${posicoes.filter(p => p.pneu_id).map(p =>
            `<span class="pneu-chip-sm" title="${p.label}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
              </svg>
              ${p.pneu_numero || '—'}
            </span>`).join('')}</div>`
        : `<span class="td-empty">Nenhum pneu</span>`;

      const coberturaCel = `
        <div class="cobertura-cell">
          <div class="cobertura-bar-wrap">
            <div class="cobertura-bar" style="width:${pct}%"></div>
          </div>
          <span class="cobertura-pct ${completo ? 'completo' : ''}">${ocupadas}/${totalPos}</span>
        </div>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-num">${i + 1}</td>
        <td>${c.tipo_veiculo_tag
          ? `<span class="rel-veiculo-tag">${c.tipo_veiculo_tag}</span>`
          : '<span class="td-empty">—</span>'}</td>
        <td class="td-nome">
          <div>${c.nome}</div>
          ${c.tipo_veiculo_nome ? `<div class="td-sub">${c.tipo_veiculo_nome}</div>` : ''}
        </td>
        <td class="td-placa">${c.placa || '<span class="td-empty">—</span>'}</td>
        <td>${coberturaCel}</td>
        <td>${chipsHtml}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ── Inventário de Pneus ──
  const totalInventario = pneus.length + pneusInutilizados.length;
  document.getElementById('countPneus').textContent = totalInventario;
  const inv = document.getElementById('pneusInventory');
  inv.innerHTML = '';

  if (pneus.length === 0 && pneusInutilizados.length === 0) {
    inv.innerHTML = `<p class="sem-registros" style="width:100%">Nenhum pneu cadastrado.</p>`;
  } else {

    // ── Pneus ativos (em_uso + disponivel) ──
    if (pneus.length > 0) {
      const ordenados = [...pneus].sort((a, b) => {
        if (a.status === b.status)
          return a.numero_identificacao.localeCompare(b.numero_identificacao);
        return a.status === 'em_uso' ? -1 : 1;
      });

      ordenados.forEach((p, idx) => {
        const cam = p.status === 'em_uso'
          ? caminhoes.find(c => (c.pneus_ids || []).includes(p.id))
          : null;
        const posLabel = cam
          ? (cam.posicoes || []).find(x => x.pneu_id === p.id)?.label || ''
          : '';

        inv.appendChild(criarCardInventario(p, cam, posLabel, idx));
      });
    }

    // ── Pneus inutilizados durante a obra ──
    if (pneusInutilizados.length > 0) {
      // Separador
      const sep = document.createElement('div');
      sep.className = 'inv-separador';
      sep.innerHTML = `
        <div class="inv-sep-linha"></div>
        <span class="inv-sep-label">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="13" height="13">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          Inutilizados durante a obra (${pneusInutilizados.length})
        </span>
        <div class="inv-sep-linha"></div>
      `;
      inv.appendChild(sep);

      pneusInutilizados.forEach((p, idx) => {
        // Busca o motivo no histórico de trocas
        const trocaInut = trocasCarregadas.find(
          t => t.pneu_saiu === p.id && t.motivo_saida?.startsWith('Inutilizado')
        );
        const motivo = trocaInut
          ? trocaInut.motivo_saida.replace('Inutilizado: ', '')
          : (p.motivo_inutilizacao || '—');
        const camNome = trocaInut?.caminhao_nome || null;

        inv.appendChild(criarCardInutilizado(p, motivo, camNome, idx));
      });
    }
  }

  // ── Histórico ──
  document.getElementById('countTrocas').textContent = trocas.length;
  histFiltros = { tipo: '', busca: '', veiculo: '', dtIni: '', dtFim: '', usuario: '' };
  histPagina  = 0;
  inicializarFiltrosHistoricoRel(trocas, caminhoes);
  aplicarFiltrosHistoricoRel();
}

// ─── Card de inventário ativo (em_uso / disponivel) ──
function criarCardInventario(p, cam, posLabel, idx) {
  const el = document.createElement('div');
  el.className = `pneu-inv-item ${p.status}`;
  el.style.animationDelay = `${idx * 15}ms`;

  const condicao   = p.condicao || 'novo';
  const condicaoLabel = { novo: 'Novo', medio: 'Médio', ruim: 'Ruim' }[condicao] || 'Novo';
  const statusLabel   = p.status === 'em_uso' ? 'Em uso' : 'Disponível';

  el.innerHTML = `
    <div class="pneu-inv-icone">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
      </svg>
    </div>
    <div class="pneu-inv-info">
      <div class="pneu-inv-topo">
        <span class="pneu-inv-numero">${p.numero_identificacao}</span>
        <span class="pneu-inv-status">${statusLabel}</span>
      </div>
      <div class="pneu-inv-badges">
        <span class="inv-badge-condicao inv-cond-${condicao}">${condicaoLabel}</span>
        ${p.marca_nome ? `<span class="inv-badge-marca">${p.marca_nome}</span>` : ''}
        ${p.recapado   ? `<span class="inv-badge-recapado">Recapado${p.qtd_recapagens > 1 ? ' ×' + p.qtd_recapagens : ''}</span>` : ''}
      </div>
      ${cam ? `<span class="pneu-inv-caminhao">↳ ${cam.nome}${posLabel ? ' — ' + posLabel : ''}</span>` : ''}
    </div>`;

  return el;
}

// ─── Card de pneu inutilizado ─────────────────
function criarCardInutilizado(p, motivo, camNome, idx) {
  const el = document.createElement('div');
  el.className = 'pneu-inv-item inutilizavel';
  el.style.animationDelay = `${idx * 15}ms`;

  const dataInut = p.data_inutilizacao
    ? (p.data_inutilizacao.toDate
        ? p.data_inutilizacao.toDate().toLocaleDateString('pt-BR')
        : new Date(p.data_inutilizacao).toLocaleDateString('pt-BR'))
    : null;

  el.innerHTML = `
    <div class="pneu-inv-icone">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
      </svg>
    </div>
    <div class="pneu-inv-info">
      <div class="pneu-inv-topo">
        <span class="pneu-inv-numero">${p.numero_identificacao}</span>
        <span class="pneu-inv-status">Inutilizado</span>
      </div>
      <div class="pneu-inv-badges">
        ${p.marca_nome ? `<span class="inv-badge-marca">${p.marca_nome}</span>` : ''}
        ${p.recapado   ? `<span class="inv-badge-recapado">Recapado${p.qtd_recapagens > 1 ? ' ×' + p.qtd_recapagens : ''}</span>` : ''}
      </div>
      <span class="pneu-inv-motivo">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/>
        </svg>
        ${motivo}${dataInut ? ` — ${dataInut}` : ''}
      </span>
      ${camNome ? `<span class="pneu-inv-caminhao">↳ ${camNome}</span>` : ''}
    </div>`;

  return el;
}

// ─── Cards do histórico ───────────────────────
function tipoTroca(t) {
  if (t.tipo_evento === 'veiculo_adicionado') return 'veiculo_add';
  if (t.tipo_evento === 'veiculo_removido')   return 'veiculo_rem';
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

// ─── Dropdown customizado (cp-select) ─────────
function iniciarCpSelect(wrapperId, optsId, items, placeholder, onChange) {
  const wrapper  = document.getElementById(wrapperId);
  const optsEl   = document.getElementById(optsId);
  const menu     = wrapper.querySelector('.cp-select-menu');
  const btn      = wrapper.querySelector('.cp-select-btn');
  const labelEl  = wrapper.querySelector('.cp-select-label');
  const searchEl = wrapper.querySelector('.cp-select-search');
  let valorAtual = '';

  function fechar() { menu.style.display = 'none'; wrapper.classList.remove('aberto'); }
  function abrir()  { menu.style.display = 'block'; wrapper.classList.add('aberto'); searchEl?.focus(); }

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.style.display === 'none' ? abrir() : fechar();
  });

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) fechar();
  });

  function renderOpts(filtro = '') {
    optsEl.innerHTML = '';
    const todos = document.createElement('div');
    todos.className = 'cp-select-opt' + (valorAtual === '' ? ' selected' : '');
    todos.textContent = placeholder;
    todos.dataset.value = '';
    todos.addEventListener('click', () => selecionar('', placeholder));
    optsEl.appendChild(todos);

    const filtrados = filtro
      ? items.filter(i => i.label.toLowerCase().includes(filtro.toLowerCase()))
      : items;

    filtrados.forEach(item => {
      const opt = document.createElement('div');
      opt.className = 'cp-select-opt' + (valorAtual === item.value ? ' selected' : '');
      opt.textContent = item.label;
      opt.dataset.value = item.value;
      opt.addEventListener('click', () => selecionar(item.value, item.label));
      optsEl.appendChild(opt);
    });
  }

  function selecionar(value, label) {
    valorAtual = value;
    labelEl.textContent = value ? label : placeholder;
    wrapper.classList.toggle('tem-valor', !!value);
    fechar();
    onChange(value);
    renderOpts(searchEl?.value || '');
  }

  if (searchEl) {
    searchEl.addEventListener('input', () => renderOpts(searchEl.value));
    searchEl.addEventListener('click', e => e.stopPropagation());
  }

  wrapper._reset    = () => selecionar('', placeholder);
  wrapper._getValor = () => valorAtual;

  renderOpts();
}

function inicializarFiltrosHistoricoRel(trocas, caminhoes) {
  document.querySelectorAll('.hist-tipo-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tipo === '');
    btn.onclick = () => {
      document.querySelectorAll('.hist-tipo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      histFiltros.tipo = btn.dataset.tipo;
      histPagina = 0;
      aplicarFiltrosHistoricoRel();
    };
  });

  const veiculoItems = caminhoes.map(c => ({ value: c.id, label: c.nome }));
  iniciarCpSelect('cpSelectVeiculo', 'cpSelectVeiculoOpts', veiculoItems, 'Todos os veículos',
    (val) => { histFiltros.veiculo = val; histPagina = 0; aplicarFiltrosHistoricoRel(); });

  const usuarioItems = [...new Map(
    trocas.filter(t => t.usuario_id).map(t => [t.usuario_id, t.usuario_nome])
  ).entries()].map(([id, nome]) => ({ value: id, label: nome || id }));
  iniciarCpSelect('cpSelectUsuario', 'cpSelectUsuarioOpts', usuarioItems, 'Todos os operadores',
    (val) => { histFiltros.usuario = val; histPagina = 0; aplicarFiltrosHistoricoRel(); });

  const inputBusca = document.getElementById('relHistBusca');
  if (inputBusca) {
    inputBusca.oninput = () => {
      histFiltros.busca = inputBusca.value.trim().toLowerCase();
      histPagina = 0;
      aplicarFiltrosHistoricoRel();
    };
  }

  const dtIni = document.getElementById('relHistDtIni');
  const dtFim = document.getElementById('relHistDtFim');
  if (dtIni) dtIni.onchange = () => { histFiltros.dtIni = dtIni.value; histPagina = 0; aplicarFiltrosHistoricoRel(); };
  if (dtFim) dtFim.onchange = () => { histFiltros.dtFim = dtFim.value; histPagina = 0; aplicarFiltrosHistoricoRel(); };

  const btnLimpar = document.getElementById('relHistLimpar');
  if (btnLimpar) {
    btnLimpar.onclick = () => {
      histFiltros = { tipo: '', busca: '', veiculo: '', dtIni: '', dtFim: '', usuario: '' };
      histPagina  = 0;
      if (inputBusca) inputBusca.value = '';
      if (dtIni)      dtIni.value = '';
      if (dtFim)      dtFim.value = '';
      document.querySelectorAll('.hist-tipo-btn').forEach(b => b.classList.toggle('active', b.dataset.tipo === ''));
      document.getElementById('cpSelectVeiculo')?._reset();
      document.getElementById('cpSelectUsuario')?._reset();
      aplicarFiltrosHistoricoRel();
    };
  }
}

function aplicarFiltrosHistoricoRel() {
  const { tipo, busca, veiculo, dtIni, dtFim, usuario } = histFiltros;
  const temFiltro = tipo || busca || veiculo || dtIni || dtFim || usuario;

  const btnLimpar = document.getElementById('relHistLimpar');
  if (btnLimpar) btnLimpar.style.display = temFiltro ? 'flex' : 'none';

  trocasFiltradas = trocasCarregadas.filter(t => {
    if (tipo    && tipoTroca(t) !== tipo)     return false;
    if (veiculo && t.caminhao_id !== veiculo) return false;
    if (usuario && t.usuario_id !== usuario)  return false;
    if (busca) {
      const hay = [t.pneu_saiu_numero||'', t.pneu_entrou_numero||'', t.caminhao_nome||'', t.caminhao_tag||''].join(' ').toLowerCase();
      if (!hay.includes(busca)) return false;
    }
    if (dtIni || dtFim) {
      const dataT = t.data?.toDate?.();
      if (!dataT) return false;
      const dStr = dataT.toISOString().split('T')[0];
      if (dtIni && dStr < dtIni) return false;
      if (dtFim && dStr > dtFim) return false;
    }
    return true;
  });

  trocasFiltradas.sort((a, b) => {
    const da = a.data?.toDate?.() || new Date(0);
    const db_ = b.data?.toDate?.() || new Date(0);
    return db_ - da;
  });

  const countEl = document.getElementById('relHistCount');
  if (countEl) {
    countEl.textContent = temFiltro
      ? `${trocasFiltradas.length} de ${trocasCarregadas.length}`
      : `${trocasCarregadas.length} registro(s)`;
  }

  histPagina = 0;
  renderHistoricoCards();
}

function renderHistoricoCards() {
  const cardsEl = document.getElementById('relHistCards');
  const btnMais = document.getElementById('btnMaisHist');
  if (!cardsEl) return;

  if (histPagina === 0) cardsEl.innerHTML = '';

  if (trocasFiltradas.length === 0) {
    cardsEl.innerHTML = `
      <div class="rel-hist-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        <p>Nenhuma movimentação encontrada.</p>
      </div>`;
    btnMais.style.display = 'none';
    return;
  }

  const tipoCfg = {
    adicao:      { cls: 'card-add',         badge: 'badge-add',         label: 'Adição'           },
    remocao:     { cls: 'card-rem',         badge: 'badge-rem',         label: 'Remoção'          },
    troca:       { cls: 'card-troca',       badge: 'badge-troca',       label: 'Troca'            },
    veiculo_add: { cls: 'card-veiculo-add', badge: 'badge-veiculo-add', label: 'Veíc. Adicionado' },
    veiculo_rem: { cls: 'card-veiculo-rem', badge: 'badge-veiculo-rem', label: 'Veíc. Removido'   },
  };

  const inicio = histPagina * HIST_PAGINA;
  const slice  = trocasFiltradas.slice(inicio, inicio + HIST_PAGINA);

  slice.forEach((t, i) => {
    const tipo    = tipoTroca(t);
    const cfg     = tipoCfg[tipo] || tipoCfg.troca;
    const dataObj = t.data?.toDate ? t.data.toDate() : null;
    const dataFmt = dataObj
      ? dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const horaFmt  = dataObj
      ? dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '';
    const relativo = dataObj ? tempoRelativo(dataObj) : '';

    let pneusHtml = '';
    if (tipo === 'veiculo_add' || tipo === 'veiculo_rem') {
      const tagHtml = t.caminhao_tag ? `<span class="hcard-veiculo-tag" style="margin-right:6px">${t.caminhao_tag}</span>` : '';
      pneusHtml = `<div class="hcard-pneu-flow">
        <div class="hcard-pneu-box ${tipo === 'veiculo_add' ? 'entrou' : 'saiu'}" style="flex:1">
          <span class="hcard-pneu-dir">${tipo === 'veiculo_add' ? 'ADICIONADO' : 'REMOVIDO'}</span>
          <span class="hcard-pneu-num" style="font-size:14px">${tagHtml}${t.caminhao_nome || '—'}</span>
        </div>
      </div>`;
    } else if (tipo === 'adicao') {
      pneusHtml = `<div class="hcard-pneu-flow">
        <div class="hcard-pneu-box entrou">
          <span class="hcard-pneu-dir">ENTROU</span>
          <span class="hcard-pneu-num">${t.pneu_entrou_numero || '—'}</span>
        </div>
      </div>`;
    } else if (tipo === 'remocao') {
      const motivoHtml = t.motivo_saida
        ? `<span class="hcard-motivo">${t.motivo_saida}</span>` : '';
      pneusHtml = `<div class="hcard-pneu-flow">
        <div class="hcard-pneu-box saiu">
          <span class="hcard-pneu-dir">SAIU</span>
          <span class="hcard-pneu-num">${t.pneu_saiu_numero || '—'}</span>
        </div>
        ${motivoHtml}
      </div>`;
    } else {
      pneusHtml = `<div class="hcard-pneu-flow">
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
    card.style.animationDelay = `${i * 30}ms`;
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
                const cam = caminhoesCarregados.find(x => x.id === t.caminhao_id);
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

  const restantes = trocasFiltradas.length - (inicio + slice.length);
  if (restantes > 0) {
    btnMais.style.display = 'block';
    btnMais.textContent   = `Ver mais ${restantes} registro(s)`;
    btnMais.onclick = () => { histPagina++; renderHistoricoCards(); };
  } else {
    btnMais.style.display = 'none';
  }
}

// ─── Imprimir ─────────────────────────────────
document.getElementById('btnImprimir').addEventListener('click', () => window.print());

// ─── Helpers ──────────────────────────────────
function mostrarEstado(estado) {
  emptyState.style.display   = estado === 'empty'     ? 'block' : 'none';
  loadingState.style.display = estado === 'loading'   ? 'flex'  : 'none';
  relatorio.style.display    = estado === 'relatorio' ? 'block' : 'none';
}

function kpi(label, value, color) {
  return `<div class="kpi-item">
    <span class="kpi-label">${label}</span>
    <span class="kpi-value ${color}">${value}</span>
  </div>`;
}

function kpiCondicao(novos, medios, ruins) {
  return `<div class="kpi-item kpi-condicao">
    <span class="kpi-label">Condição</span>
    <div class="kpi-cond-row">
      <span class="kpi-cond-badge cond-novo" title="Novos">${novos} <small>N</small></span>
      <span class="kpi-cond-badge cond-medio" title="Médios">${medios} <small>M</small></span>
      <span class="kpi-cond-badge cond-ruim" title="Ruins">${ruins} <small>R</small></span>
    </div>
  </div>`;
}

function metaItem(iconSvg, label, value) {
  return `<span class="rel-meta-item">${iconSvg}${label}: <strong>${value}</strong></span>`;
}

function iconCalendar() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`;
}

function iconClock() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12 6 12 12 16 14"/>
  </svg>`;
}

function iconUser() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>`;
}

function traduzirStatus(s) {
  return { aberta: 'Aberta', finalizada: 'Finalizada', arquivada: 'Arquivada' }[s] || s;
}

function formatarData(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function calcularDuracaoTexto(ts) {
  if (!ts) return '—';
  const inicio = ts.toDate ? ts.toDate() : new Date(ts);
  const agora  = new Date();
  const dias   = Math.floor((agora - inicio) / (1000 * 60 * 60 * 24));
  if (dias === 0) return 'hoje';
  return `${dias} dia${dias !== 1 ? 's' : ''}`;
}