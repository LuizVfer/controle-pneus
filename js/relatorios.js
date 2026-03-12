// ============================================================
//  relatorios.js — Tela de relatórios
// ============================================================

import {
  observarAuth,
  getDadosUsuario,
  listarObras,
  getObra,
  listarCaminhoes,
  listarPneusDaObra,
  listarTrocas,
  logout,
} from './firebase.js';

// ─── Estado ───────────────────────────────────
let usuarioLogado = null;
let obraAtual     = null;
let todasAsObras  = [];

// ─── Elementos ────────────────────────────────
const selectObra   = document.getElementById('selectObra');
const filterStatus = document.getElementById('filterStatus');
const btnGerar     = document.getElementById('btnGerar');
const emptyState   = document.getElementById('emptyState');
const loadingState = document.getElementById('loadingState');
const relatorio    = document.getElementById('relatorio');

// ─── Auth ──────────────────────────────────────
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

// ─── Carrega obras no select ───────────────────
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
    const opt    = document.createElement('option');
    opt.value    = o.id;
    opt.textContent = `${o.nome} (${traduzirStatus(o.status)})`;
    selectObra.appendChild(opt);
  });

  btnGerar.disabled = true;
}

filterStatus.addEventListener('change', () => popularSelect(filterStatus.value));

selectObra.addEventListener('change', () => {
  btnGerar.disabled = !selectObra.value;
});

// ─── Gerar relatório ───────────────────────────
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
    obraAtual = obra;
    renderizarRelatorio(obra, caminhoes, pneus, trocas);
    mostrarEstado('relatorio');
  } catch (err) {
    console.error(err);
    mostrarEstado('empty');
    alert('Erro ao gerar relatório. Tente novamente.');
  }
});

// ─── Renderização ──────────────────────────────
function renderizarRelatorio(obra, caminhoes, pneus, trocas) {

  // ── Toolbar ──
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
    ${obra.data_finalizacao
      ? metaItem(iconCalendar(), 'Finalizada em', formatarData(obra.data_finalizacao))
      : ''}
    ${obra.criado_por_nome
      ? metaItem(iconUser(), 'Criada por', obra.criado_por_nome)
      : ''}
  `;

  // ── KPIs ──
  const emUso      = pneus.filter(p => p.status === 'em_uso').length;
  const disponiveis = pneus.filter(p => p.status === 'disponivel').length;
  const semPneu    = caminhoes.filter(c => {
    const ids = c.pneus_ids || (c.pneu_atual_id ? [c.pneu_atual_id] : []);
    return ids.length === 0;
  }).length;

  document.getElementById('relKpis').innerHTML = `
    ${kpi('Caminhões', caminhoes.length, '')}
    ${kpi('Total de Pneus', pneus.length, 'accent')}
    ${kpi('Pneus em Uso', emUso, 'accent')}
    ${kpi('Disponíveis', disponiveis, 'verde')}
    ${kpi('Trocas', trocas.length, 'azul')}
    ${kpi('Sem Pneu', semPneu, semPneu > 0 ? '' : 'verde')}
  `;

  // ── Tabela caminhões ──
  document.getElementById('countCaminhoes').textContent = caminhoes.length;
  const bodyCaminhoes = document.getElementById('bodyCaminhoes');
  bodyCaminhoes.innerHTML = '';

  if (caminhoes.length === 0) {
    bodyCaminhoes.innerHTML = `<tr><td colspan="5" class="sem-registros">Nenhum caminhão cadastrado.</td></tr>`;
  } else {
    caminhoes.forEach((c, i) => {
      const idsArr   = c.pneus_ids || (c.pneu_atual_id ? [c.pneu_atual_id] : []);
      const pneusDoC = idsArr.map(id => pneus.find(p => p.id === id)).filter(Boolean);

      const chipsHtml = pneusDoC.length > 0
        ? `<div class="pneu-chips-inline">${pneusDoC.map(p =>
            `<span class="pneu-chip-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/>
              </svg>
              ${p.numero_identificacao}
            </span>`).join('')}</div>`
        : `<span class="td-empty">Nenhum pneu</span>`;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-num">${i + 1}</td>
        <td class="td-nome">${c.nome}</td>
        <td class="td-placa">${c.placa || '<span class="td-empty">—</span>'}</td>
        <td>${chipsHtml}</td>
        <td class="td-qtd">${pneusDoC.length}</td>
      `;
      bodyCaminhoes.appendChild(tr);
    });
  }

  // ── Inventário de pneus ──
  document.getElementById('countPneus').textContent = pneus.length;
  const inv = document.getElementById('pneusInventory');
  inv.innerHTML = '';

  if (pneus.length === 0) {
    inv.innerHTML = `<p class="sem-registros" style="width:100%">Nenhum pneu cadastrado.</p>`;
  } else {
    // Ordena: em uso primeiro, depois disponíveis
    const ordenados = [...pneus].sort((a, b) => {
      if (a.status === b.status) return a.numero_identificacao.localeCompare(b.numero_identificacao);
      return a.status === 'em_uso' ? -1 : 1;
    });

    ordenados.forEach((p, idx) => {
      const caminhao = p.status === 'em_uso'
        ? caminhoes.find(c => {
            const ids = c.pneus_ids || (c.pneu_atual_id ? [c.pneu_atual_id] : []);
            return ids.includes(p.id);
          })
        : null;

      const el = document.createElement('div');
      el.className = `pneu-inv-item ${p.status}`;
      el.style.animationDelay = `${idx * 20}ms`;
      el.innerHTML = `
        <span class="pneu-inv-numero">${p.numero_identificacao}</span>
        <span class="pneu-inv-status">${p.status === 'em_uso' ? 'Em Uso' : 'Disponível'}</span>
        ${caminhao ? `<span class="pneu-inv-caminhao">↳ ${caminhao.nome}</span>` : ''}
      `;
      inv.appendChild(el);
    });
  }

  // ── Histórico de trocas ──
  document.getElementById('countTrocas').textContent = trocas.length;
  const bodyTrocas = document.getElementById('bodyTrocas');
  bodyTrocas.innerHTML = '';

  if (trocas.length === 0) {
    bodyTrocas.innerHTML = `<tr><td colspan="6" class="sem-registros">Nenhuma troca registrada.</td></tr>`;
  } else {
    // Ordena: mais recentes primeiro
    const ordenadas = [...trocas].sort((a, b) => {
      const da = a.data?.toDate?.() || new Date(0);
      const db = b.data?.toDate?.() || new Date(0);
      return db - da;
    });

    ordenadas.forEach((t, i) => {
      const movHtml = buildMovimento(t);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="td-num">${i + 1}</td>
        <td style="white-space:nowrap;font-size:12px;color:var(--texto-muted)">
          ${formatarDataHora(t.data)}
        </td>
        <td class="td-nome">${t.caminhao_nome || '—'}</td>
        <td colspan="2">${movHtml}</td>
        <td style="font-size:12px;color:var(--texto-sub)">${t.usuario_nome || '—'}</td>
      `;
      bodyTrocas.appendChild(tr);
    });
  }
}

function buildMovimento(t) {
  if (!t.pneu_saiu && t.pneu_entrou) {
    // Só adicionou
    return `<span class="troca-arrow"><span class="only-add">+ ${t.pneu_entrou_numero || t.pneu_entrou}</span></span>`;
  }
  if (t.pneu_saiu && !t.pneu_entrou) {
    // Só removeu
    const numSaiu = t.pneu_saiu_numero || t.pneu_saiu;
    return `<span class="troca-arrow"><span class="only-remove">- ${numSaiu}</span></span>`;
  }
  if (t.pneu_saiu && t.pneu_entrou) {
    // Troca
    const numSaiu   = t.pneu_saiu_numero   || t.pneu_saiu;
    const numEntrou = t.pneu_entrou_numero  || t.pneu_entrou;
    return `<span class="troca-arrow">
      <span class="saiu">${numSaiu}</span>
      <span class="arrow">→</span>
      <span class="entrou">${numEntrou}</span>
    </span>`;
  }
  return '<span style="color:var(--texto-muted)">—</span>';
}

// ─── Imprimir ──────────────────────────────────
document.getElementById('btnImprimir').addEventListener('click', () => {
  window.print();
});

// ─── Helpers de estado ────────────────────────
function mostrarEstado(estado) {
  emptyState.style.display   = estado === 'empty'    ? 'block' : 'none';
  loadingState.style.display = estado === 'loading'  ? 'flex'  : 'none';
  relatorio.style.display    = estado === 'relatorio' ? 'block' : 'none';
}

// ─── Helpers de template ──────────────────────
function kpi(label, value, color) {
  return `
    <div class="kpi-item">
      <span class="kpi-label">${label}</span>
      <span class="kpi-value ${color}">${value}</span>
    </div>
  `;
}

function metaItem(iconSvg, label, value) {
  return `
    <span class="rel-meta-item">
      ${iconSvg}
      ${label}: <strong>${value}</strong>
    </span>
  `;
}

function iconCalendar() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
    <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
  </svg>`;
}

function iconUser() {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
    <circle cx="12" cy="7" r="4"/>
  </svg>`;
}

function traduzirStatus(s) {
  return { aberta: 'Aberta', finalizada: 'Finalizada', arquivada: 'Arquivada' }[s] || s;
}

function formatarData(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR');
}

function formatarDataHora(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}