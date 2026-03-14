// ============================================================
//  js/veiculos.js — Frota de veículos da empresa
// ============================================================

import {
  observarAuth, getDadosUsuario, logout,
  listarVeiculosFrota, criarVeiculoFrota, atualizarVeiculoFrota,
  deletarVeiculoFrota, adicionarPneuAoVeiculoFrota,
  removerPneuDoVeiculoFrota, trocarPneuNoVeiculoFrota,
  atualizarPosicaoVeiculoFrota, listarPneusDisponiveis,
  listarMovimentacoesFrota, listarEstoques,
} from './firebase.js';

import { TIPOS_VEICULO, getTipoVeiculo } from './veiculos-tipos.js';

// ─── Estado ───────────────────────────────────
let usuarioLogado    = null;
let veiculos         = [];
let pneusDisponiveis = [];
let estoques         = []; // estoques por cidade
let estoqueAtribuir  = null; // estoque selecionado no modal de atribuir
let veiculoAlvo      = null;
let posicaoAlvo      = null;
let pneuSelecionado  = null;
let modoTroca        = false;

// Filtros
let filtroNome   = '';
let filtroTipo   = '';
let filtroStatus = '';

// ─── Elementos ────────────────────────────────
const pageLoading  = document.getElementById('pageLoading');
const mainContent  = document.getElementById('mainContent');
const userAvatar   = document.getElementById('userAvatar');
const frotaGrid    = document.getElementById('frotaGrid');
const frotaFiltros = document.getElementById('frotaFiltros');

// ─── Auth ──────────────────────────────────────
observarAuth(async (user) => {
  if (!user) { window.location.href = 'login.html'; return; }
  const dados = await getDadosUsuario(user.uid);
  if (!dados || dados.ativo === false) {
    await logout(); window.location.href = 'login.html'; return;
  }
  usuarioLogado = { ...dados, uid: user.uid };
  userAvatar.textContent = dados.nome.charAt(0).toUpperCase();
  await carregarTudo();
});

// ─── Carga inicial ─────────────────────────────
async function carregarTudo() {
  try {
    [veiculos, pneusDisponiveis, estoques] = await Promise.all([
      listarVeiculosFrota(),
      listarPneusDisponiveis(),
      listarEstoques(),
    ]);
    atualizarStats();
    inicializarFiltros();
    renderizarVeiculosFiltrados();
    pageLoading.style.display = 'none';
    mainContent.style.display = 'block';
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao carregar frota.', 'error');
  }
}

async function recarregar() {
  [veiculos, pneusDisponiveis, estoques] = await Promise.all([
    listarVeiculosFrota(),
    listarPneusDisponiveis(),
    listarEstoques(),
  ]);
  atualizarStats();
  renderizarVeiculosFiltrados();
}

// ─── Stats ─────────────────────────────────────
function atualizarStats() {
  let pneusEmUso = 0, completos = 0, incompletos = 0;
  veiculos.forEach(v => {
    const pos     = v.posicoes || [];
    const ocupadas = pos.filter(p => p.pneu_id).length;
    pneusEmUso += ocupadas;
    if (pos.length > 0 && ocupadas === pos.length) completos++;
    else if (pos.length > 0 && ocupadas < pos.length) incompletos++;
  });
  document.getElementById('statTotalVeiculos').textContent = veiculos.length;
  document.getElementById('statPneusEmUso').textContent    = pneusEmUso;
  document.getElementById('statCompletos').textContent     = completos;
  document.getElementById('statIncompletos').textContent   = incompletos;
  document.getElementById('pageSubtitle').textContent      =
    `${veiculos.length} veículo(s) na frota — ${pneusEmUso} pneu(s) em uso`;
}

// ─── Filtros ───────────────────────────────────
function criarCpSelectSimples(wrapperId, optsId, items, placeholder, onChange) {
  const wrapper  = document.getElementById(wrapperId);
  if (!wrapper) return;
  const optsEl   = document.getElementById(optsId);
  const menu     = wrapper.querySelector('.cp-select-menu');
  const btn      = wrapper.querySelector('.cp-select-btn');
  const labelEl  = wrapper.querySelector('.cp-select-label');
  let valorAtual = '';

  const fechar = () => { menu.style.display = 'none'; wrapper.classList.remove('aberto'); };
  const abrir  = () => { menu.style.display = 'block'; wrapper.classList.add('aberto'); };

  btn.onclick = (e) => { e.stopPropagation(); menu.style.display === 'none' ? abrir() : fechar(); };
  document.addEventListener('click', (e) => { if (!wrapper.contains(e.target)) fechar(); });

  function render() {
    optsEl.innerHTML = '';
    [{ value: '', label: placeholder }, ...items].forEach(item => {
      const opt = document.createElement('div');
      opt.className = 'cp-select-opt' + (valorAtual === item.value ? ' selected' : '');
      if (item.tag) {
        opt.classList.add('tipo-opt');
        opt.innerHTML = `<span class="tipo-opt-tag">${item.tag}</span><span class="tipo-opt-nome">${item.label}</span>`;
      } else {
        opt.textContent = item.label;
      }
      opt.addEventListener('click', () => {
        valorAtual      = item.value;
        labelEl.textContent = item.value
          ? (item.tag ? `${item.tag} — ${item.label}` : item.label)
          : placeholder;
        wrapper.classList.toggle('tem-valor', !!item.value);
        fechar();
        onChange(item.value);
        render();
      });
      optsEl.appendChild(opt);
    });
  }

  wrapper._reset  = () => { valorAtual = ''; labelEl.textContent = placeholder; wrapper.classList.remove('tem-valor'); render(); };
  wrapper._setVal = (v) => { const it = items.find(i => i.value === v); if (it) { valorAtual = v; labelEl.textContent = it.tag ? `${it.tag} — ${it.label}` : it.label; wrapper.classList.add('tem-valor'); render(); } };

  render();
}

function inicializarFiltros() {
  frotaFiltros.style.display = veiculos.length > 0 ? 'flex' : 'none';

  // Busca
  document.getElementById('frotaBusca').value   = filtroNome;
  document.getElementById('frotaBusca').oninput  = (e) => {
    filtroNome = e.target.value.trim().toLowerCase();
    renderizarVeiculosFiltrados();
  };

  // Dropdown tipo
  const tiposPresentes = [...new Set(veiculos.map(v => v.tipo_veiculo_id).filter(Boolean))];
  const tipoItems = tiposPresentes.map(id => {
    const t = getTipoVeiculo(id);
    return t ? { value: id, label: t.nome, tag: t.tag } : null;
  }).filter(Boolean);
  criarCpSelectSimples('cpFiltroTipo', 'cpFiltroTipoOpts', tipoItems, 'Todos os tipos',
    (val) => { filtroTipo = val; renderizarVeiculosFiltrados(); });
  if (filtroTipo) document.getElementById('cpFiltroTipo')._setVal(filtroTipo);

  // Dropdown status
  const statusItems = [
    { value: 'completo',   label: 'Completos' },
    { value: 'incompleto', label: 'Com posições vazias' },
  ];
  criarCpSelectSimples('cpFiltroStatus', 'cpFiltroStatusOpts', statusItems, 'Todos',
    (val) => { filtroStatus = val; renderizarVeiculosFiltrados(); });
  if (filtroStatus) document.getElementById('cpFiltroStatus')._setVal(filtroStatus);
}

function renderizarVeiculosFiltrados() {
  const filtrados = veiculos.filter(v => {
    if (filtroNome && !v.nome?.toLowerCase().includes(filtroNome) &&
        !v.placa?.toLowerCase().includes(filtroNome)) return false;
    if (filtroTipo && v.tipo_veiculo_id !== filtroTipo) return false;
    if (filtroStatus) {
      const pos = v.posicoes || [];
      const ocupadas = pos.filter(p => p.pneu_id).length;
      const completo  = pos.length > 0 && ocupadas === pos.length;
      if (filtroStatus === 'completo'   && !completo) return false;
      if (filtroStatus === 'incompleto' &&  completo) return false;
    }
    return true;
  });

  const temFiltro = filtroNome || filtroTipo || filtroStatus;
  const countEl   = document.getElementById('frotaCount');
  if (countEl) countEl.textContent = temFiltro
    ? `${filtrados.length} de ${veiculos.length}`
    : '';

  frotaGrid.innerHTML = '';

  if (filtrados.length === 0) {
    frotaGrid.appendChild(estadoVazio(
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="1" y="3" width="15" height="13" rx="2"/>
        <path d="M16 8h4l3 3v5h-7V8z"/>
        <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
      </svg>`,
      veiculos.length === 0 ? 'Nenhum veículo cadastrado' : 'Nenhum veículo encontrado',
      veiculos.length === 0 ? 'Clique em "Novo Veículo" para começar.' : 'Tente ajustar os filtros.'
    ));
    return;
  }

  filtrados.forEach((v, i) => criarCardVeiculo(v, i));
}

// ─── Card de veículo ───────────────────────────
function criarCardVeiculo(v, index) {
  const pos      = v.posicoes || [];
  const ocupadas = pos.filter(p => p.pneu_id).length;
  const total    = pos.length;
  const pct      = total > 0 ? Math.round((ocupadas / total) * 100) : 0;
  const completo = ocupadas === total && total > 0;

  const card = document.createElement('div');
  card.className = `veiculo-card ${completo ? 'completo' : ocupadas > 0 ? 'parcial' : ''}`;
  card.style.animationDelay = `${index * 50}ms`;

  card.innerHTML = `
    <div class="vcard-header">
      <div class="vcard-info">
        ${v.tipo_veiculo_tag ? `<span class="veiculo-tag">${v.tipo_veiculo_tag}</span>` : ''}
        <div class="vcard-nome">${v.nome}</div>
        ${v.placa ? `<div class="vcard-placa">${v.placa}</div>` : ''}
        ${v.tipo_veiculo_nome ? `<div class="vcard-tipo">${v.tipo_veiculo_nome}</div>` : ''}
        ${(() => {
          const obras = v.obras_ativas || [];
          if (obras.length === 0) return '';
          const chips = obras.map(o =>
            `<span class="vcard-obra-chip" title="${o.nome}">${o.nome}</span>`
          ).join('');
          return `<div class="vcard-obras-ativas"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>${chips}</div>`;
        })()} 
      </div>
      <div class="vcard-actions">
        <button class="btn-card-action btn-hist-veiculo" title="Histórico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
        </button>
        <button class="btn-card-action btn-edit-veiculo" title="Editar veículo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn-card-action danger btn-del-veiculo" title="Remover veículo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
          </svg>
        </button>
      </div>
    </div>
    <div class="diagrama-container" id="diag-frota-${v.id}">
      ${gerarDiagrama(v)}
    </div>
    <div class="vcard-footer">
      <div class="vcard-progresso-wrap">
        <div class="vcard-progresso">
          <div class="vcard-prog-bar" style="width:${pct}%"></div>
        </div>
        <span class="vcard-prog-texto ${completo ? 'completo' : ''}">
          ${completo ? '✓ Completo' : `${ocupadas}/${total} pneus`}
        </span>
      </div>
    </div>
  `;

  // Histórico
  card.querySelector('.btn-hist-veiculo').addEventListener('click', () => abrirModalHistorico(v));

  // Editar
  card.querySelector('.btn-edit-veiculo').addEventListener('click', () => abrirModalEditar(v));

  // Deletar
  card.querySelector('.btn-del-veiculo').addEventListener('click', () => {
    veiculoAlvo = v;
    document.getElementById('deletarVeiculoNome').textContent = v.nome;
    abrirModal('modalDeletarVeiculo');
  });

  // Cliques no diagrama
  card.querySelector('.diagrama-container').addEventListener('click', (e) => {
    const rodaEl = e.target.closest('.roda');
    if (!rodaEl) return;
    const veiculo  = veiculos.find(x => x.id === rodaEl.dataset.veiculoId);
    if (!veiculo) return;
    const posicao  = (veiculo.posicoes || []).find(p => p.id === rodaEl.dataset.posId);
    if (!posicao) return;

    if (rodaEl.classList.contains('vazio')) {
      abrirModalAtribuir(veiculo, posicao, false);
    } else {
      abrirModalOpcoesPos(veiculo, posicao);
    }
  });

  frotaGrid.appendChild(card);
}

// ─── Diagrama ──────────────────────────────────
function gerarDiagrama(v) {
  const posicoes = v.posicoes;
  if (!posicoes || posicoes.length === 0) {
    return `<div class="diagrama-sem-dados">Tipo de veículo sem diagrama configurado.</div>`;
  }

  const eixosMap = {};
  posicoes.forEach(p => {
    if (!eixosMap[p.eixo]) eixosMap[p.eixo] = [];
    eixosMap[p.eixo].push(p);
  });
  const eixoNums = Object.keys(eixosMap).map(Number).sort((a, b) => a - b);
  const temRolo  = v.tipo_veiculo_id === 'RC-01';

  const pneusAtrib = posicoes.filter(p => p.pneu_id).length;
  const totalPos   = posicoes.length;
  const pct        = totalPos > 0 ? Math.round((pneusAtrib / totalPos) * 100) : 0;

  let linhas = '';

  if (temRolo) {
    linhas += `<div class="diagrama-row">
      <div class="diagrama-lado esq"><div class="rolo-badge">ROLO</div></div>
      <div class="diagrama-centro"><div class="eixo-line"></div><span class="eixo-lbl">E1</span><div class="eixo-line"></div></div>
      <div class="diagrama-lado dir"></div>
    </div>`;
  }

  eixoNums.forEach(en => {
    const posEixo = eixosMap[en];
    const isDuplo = posEixo[0].tipo === 'duplo';
    const esq = posEixo.filter(p => p.lado === 'esquerdo').sort((a, b) => a.posicao === 'externo' ? -1 : 1);
    const dir = posEixo.filter(p => p.lado === 'direito').sort((a, b)  => a.posicao === 'interno' ? -1 : 1);

    const renderRoda = (p) => {
      const temPneu  = !!p.pneu_id;
      const numCurto = p.pneu_numero ? p.pneu_numero.split('-').pop() : '';
      return `<div
        class="roda ${temPneu ? 'ocupado' : 'vazio'}"
        data-veiculo-id="${v.id}"
        data-pos-id="${p.id}"
        title="${p.label}${temPneu ? ' — ' + p.pneu_numero : ' — Clique para atribuir'}"
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
    <div class="diagrama-wrap">
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

// ─── Modal Novo / Editar ───────────────────────

// Dropdown customizado de tipo de veículo
function iniciarCpSelectTipo(disabled = false) {
  const wrapper  = document.getElementById('cpSelectTipoVeiculo');
  const optsEl   = document.getElementById('cpSelectTipoOpts');
  const menu     = wrapper.querySelector('.cp-select-menu');
  const btn      = wrapper.querySelector('.cp-select-btn');
  const labelEl  = wrapper.querySelector('.cp-select-label');
  const searchEl = wrapper.querySelector('.cp-select-search');
  const hiddenEl = document.getElementById('novoVeiculoTipo');

  btn.disabled = disabled;
  wrapper.classList.toggle('desabilitado', disabled);

  function fechar() { menu.style.display = 'none'; wrapper.classList.remove('aberto'); }
  function abrir()  { if (disabled) return; menu.style.display = 'block'; wrapper.classList.add('aberto'); searchEl?.focus(); }

  btn.onclick = (e) => { e.stopPropagation(); menu.style.display === 'none' ? abrir() : fechar(); };
  document.addEventListener('click', (e) => { if (!wrapper.contains(e.target)) fechar(); });

  function renderOpts(filtro = '') {
    optsEl.innerHTML = '';
    // Opção vazia
    const vazio = document.createElement('div');
    vazio.className = 'cp-select-opt' + (!hiddenEl.value ? ' selected' : '');
    vazio.textContent = '— Selecione o tipo —';
    vazio.addEventListener('click', () => selecionar('', '— Selecione o tipo —'));
    optsEl.appendChild(vazio);

    TIPOS_VEICULO
      .filter(t => !filtro || t.nome.toLowerCase().includes(filtro) || t.tag.toLowerCase().includes(filtro))
      .forEach(t => {
        const opt = document.createElement('div');
        opt.className = 'cp-select-opt tipo-opt' + (hiddenEl.value === t.id ? ' selected' : '');
        opt.innerHTML = `<span class="tipo-opt-tag">${t.tag}</span><span class="tipo-opt-nome">${t.nome}</span><span class="tipo-opt-pneus">${t.qtd_pneus} pneus</span>`;
        opt.addEventListener('click', () => selecionar(t.id, t.nome));
        optsEl.appendChild(opt);
      });
  }

  function selecionar(value, label) {
    hiddenEl.value = value;
    labelEl.textContent = value
      ? `${getTipoVeiculo(value)?.tag} — ${label}`
      : '— Selecione o tipo —';
    wrapper.classList.toggle('tem-valor', !!value);
    fechar();
    document.getElementById('novoVeiculoTipoErr').textContent = '';

    const tipo = getTipoVeiculo(value);
    const box  = document.getElementById('novoVeiculoInfoBox');
    if (tipo) {
      document.getElementById('novoVeiculoInfoTag').textContent   = tipo.tag;
      document.getElementById('novoVeiculoInfoPneus').textContent = `${tipo.qtd_pneus} pneus`;
      document.getElementById('novoVeiculoInfoDesc').textContent  = tipo.descricao || '';
      box.style.display = 'flex';
    } else {
      box.style.display = 'none';
    }
    renderOpts(searchEl?.value || '');
  }

  if (searchEl) {
    searchEl.oninput  = () => renderOpts(searchEl.value.trim().toLowerCase());
    searchEl.onclick  = e => e.stopPropagation();
  }

  wrapper._reset  = () => selecionar('', '— Selecione o tipo —');
  wrapper._setVal = (id) => {
    const t = getTipoVeiculo(id);
    if (t) selecionar(id, t.nome); else selecionar('', '— Selecione o tipo —');
  };

  renderOpts();
}

// Inicia o dropdown ao carregar
iniciarCpSelectTipo(false);

document.getElementById('novoVeiculoNome').addEventListener('input', function() {
  this.value = this.value.toUpperCase();
});
document.getElementById('novoVeiculoPlaca').addEventListener('input', function() {
  this.value = this.value.toUpperCase();
});

document.getElementById('btnNovoVeiculo').addEventListener('click', () => {
  veiculoAlvo = null;
  document.getElementById('modalNovoVeiculoTitulo').textContent = 'Novo Veículo';
  document.getElementById('cpSelectTipoVeiculo')._reset();
  document.getElementById('cpSelectTipoVeiculo').classList.remove('desabilitado');
  document.getElementById('cpSelectTipoVeiculo').querySelector('.cp-select-btn').disabled = false;
  document.getElementById('novoVeiculoNome').value  = '';
  document.getElementById('novoVeiculoPlaca').value = '';
  document.getElementById('novoVeiculoInfoBox').style.display = 'none';
  document.getElementById('novoVeiculoTipoErr').textContent = '';
  document.getElementById('novoVeiculoNomeErr').textContent = '';
  abrirModal('modalNovoVeiculo');
});

function abrirModalEditar(v) {
  veiculoAlvo = v;
  document.getElementById('modalNovoVeiculoTitulo').textContent = 'Editar Veículo';
  const cpTipo = document.getElementById('cpSelectTipoVeiculo');
  if (v.tipo_veiculo_id) cpTipo._setVal(v.tipo_veiculo_id);
  cpTipo.querySelector('.cp-select-btn').disabled = true;
  cpTipo.classList.add('desabilitado');
  document.getElementById('novoVeiculoNome').value  = v.nome || '';
  document.getElementById('novoVeiculoPlaca').value = v.placa || '';

  document.getElementById('novoVeiculoTipoErr').textContent = '';
  document.getElementById('novoVeiculoNomeErr').textContent = '';
  abrirModal('modalNovoVeiculo');
}

document.getElementById('salvarNovoVeiculo').addEventListener('click', async () => {
  const tipoId = document.getElementById('novoVeiculoTipo').value;
  const nome   = document.getElementById('novoVeiculoNome').value.trim().toUpperCase();
  const placa  = document.getElementById('novoVeiculoPlaca').value.trim().toUpperCase();
  const errT   = document.getElementById('novoVeiculoTipoErr');
  const errN   = document.getElementById('novoVeiculoNomeErr');
  const btn    = document.getElementById('salvarNovoVeiculo');

  let valido = true;
  if (!tipoId && !veiculoAlvo) { errT.textContent = 'Selecione o tipo.'; valido = false; document.getElementById('cpSelectTipoVeiculo').querySelector('.cp-select-btn').classList.add('cp-select-btn-error'); }
  if (!nome)                   { errN.textContent = 'Identificação obrigatória.'; valido = false; }
  if (!valido) return;

  setLoadingBtn(btn, true);
  try {
    if (veiculoAlvo) {
      // Editar — só nome e placa
      await atualizarVeiculoFrota(veiculoAlvo.id, { nome, placa: placa || null });
      mostrarToast('Veículo atualizado! ✓', 'success');
    } else {
      const tipo = getTipoVeiculo(tipoId);
      await criarVeiculoFrota({
        nome, placa: placa || null,
        tipo_veiculo_id:   tipoId,
        tipo_veiculo_nome: tipo.nome,
        tipo_veiculo_tag:  tipo.tag,
        qtd_pneus_tipo:    tipo.qtd_pneus,
        posicoes:          tipo.posicoes,
        pneus_ids:         [],
      });
      mostrarToast(`Veículo "${nome}" criado! ✓`, 'success');
    }
    fecharModal('modalNovoVeiculo');
    await recarregar();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao salvar veículo.', 'error');
  } finally {
    setLoadingBtn(btn, false);
  }
});

// ─── Deletar veículo ───────────────────────────
document.getElementById('confirmarDeletarVeiculo').addEventListener('click', async () => {
  if (!veiculoAlvo) return;
  const btn = document.getElementById('confirmarDeletarVeiculo');
  setLoadingBtn(btn, true);
  try {
    await deletarVeiculoFrota(veiculoAlvo.id);
    fecharModal('modalDeletarVeiculo');
    mostrarToast('Veículo removido.', 'success');
    await recarregar();
  } catch (err) {
    console.error(err); mostrarToast('Erro ao remover veículo.', 'error');
  } finally {
    setLoadingBtn(btn, false); veiculoAlvo = null;
  }
});

// ─── Modal Atribuir Pneu ───────────────────────
function abrirModalAtribuir(veiculo, posicao, isTroca) {
  posicaoAlvo      = { veiculo, posicao };
  pneuSelecionado  = null;
  modoTroca        = isTroca;
  estoqueAtribuir  = null;

  document.getElementById('modalAtribuirTitulo').textContent   = isTroca ? 'Trocar Pneu' : 'Atribuir Pneu';
  document.getElementById('modalAtribuirPosLabel').textContent = posicao.label;
  document.getElementById('atribuirPosErr').textContent        = '';
  document.getElementById('atribuirEstoqueErr').textContent    = '';
  document.getElementById('confirmarAtribuirFrota').disabled   = true;
  document.getElementById('buscaPneuFrota').value              = '';

  // Mostra passo 1 (estoque), oculta passo 2 (pneus)
  document.getElementById('atribuirEstoqueStep').style.display = 'block';
  document.getElementById('atribuirPneuStep').style.display    = 'none';

  // Renderiza lista de estoques
  renderizarEstoquesAtribuir();

  fecharModal('modalOpcoesPos');
  abrirModal('modalAtribuirPos');
}

function renderizarEstoquesAtribuir() {
  const lista = document.getElementById('atribuirEstoqueLista');
  lista.innerHTML = '';

  // Campo Grande (estoque principal, id = null)
  const qtdCG = pneusDisponiveis.filter(p => !p.estoque_id).length;
  lista.appendChild(criarItemEstoqueAtribuir(null, 'Campo Grande', qtdCG));

  // Outros estoques
  estoques.forEach(e => {
    const qtd = pneusDisponiveis.filter(p => p.estoque_id === e.id).length;
    lista.appendChild(criarItemEstoqueAtribuir(e.id, e.nome, qtd));
  });
}

function criarItemEstoqueAtribuir(id, nome, qtd) {
  const item = document.createElement('div');
  item.className = 'atribuir-estoque-item';
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
    item.classList.add('sem-pneus');
    item.title = 'Nenhum pneu disponível neste estoque';
  } else {
    item.addEventListener('click', () => selecionarEstoqueAtribuir(id, nome));
  }

  return item;
}

function selecionarEstoqueAtribuir(id, nome) {
  estoqueAtribuir = { id, nome };

  // Filtra pneus do estoque selecionado
  const idsNoVeiculo = posicaoAlvo.veiculo.pneus_ids || [];
  const disponiveis  = pneusDisponiveis.filter(p => {
    if (idsNoVeiculo.includes(p.id)) return false;
    if (id === null) return !p.estoque_id;
    return p.estoque_id === id;
  });

  // Mostra passo 2
  document.getElementById('atribuirEstoqueStep').style.display    = 'none';
  document.getElementById('atribuirPneuStep').style.display       = 'block';
  document.getElementById('atribuirEstoqueNomeLabel').textContent = nome;

  popularListaPneus(disponiveis, '');

  const input = document.getElementById('buscaPneuFrota');
  input.value = '';
  input.oninput = () => {
    pneuSelecionado = null;
    document.getElementById('confirmarAtribuirFrota').disabled = true;
    popularListaPneus(disponiveis, input.value.trim().toLowerCase());
  };
}

// Botão "trocar" estoque volta ao passo 1
document.getElementById('btnTrocarEstoque').addEventListener('click', () => {
  estoqueAtribuir  = null;
  pneuSelecionado  = null;
  document.getElementById('confirmarAtribuirFrota').disabled   = true;
  document.getElementById('atribuirEstoqueStep').style.display = 'block';
  document.getElementById('atribuirPneuStep').style.display    = 'none';
  document.getElementById('buscaPneuFrota').value              = '';
});

function popularListaPneus(disponiveis, termo) {
  const container = document.getElementById('pneuFrotaLista');
  container.innerHTML = '';

  const filtrados = termo
    ? disponiveis.filter(p => p.numero_identificacao.toLowerCase().includes(termo))
    : disponiveis;

  if (filtrados.length === 0) {
    const p = document.createElement('p');
    p.className   = 'sem-pneus';
    p.textContent = disponiveis.length === 0 ? 'Nenhum pneu disponível no estoque.'
      : `Nenhum pneu encontrado para "${termo}".`;
    container.appendChild(p); return;
  }

  filtrados.forEach(p => {
    const item = document.createElement('div');
    item.className = 'pneu-select-item';
    item.innerHTML = `
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
      </span>`;
    item.addEventListener('click', () => {
      container.querySelectorAll('.pneu-select-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      pneuSelecionado = p;
      document.getElementById('confirmarAtribuirFrota').disabled = false;
      document.getElementById('atribuirPosErr').textContent      = '';
    });
    container.appendChild(item);
  });
}

document.getElementById('confirmarAtribuirFrota').addEventListener('click', async () => {
  if (!pneuSelecionado || !posicaoAlvo) return;
  const { veiculo, posicao } = posicaoAlvo;
  const btn = document.getElementById('confirmarAtribuirFrota');
  setLoadingBtn(btn, true);
  try {
    if (modoTroca && posicao.pneu_id) {
      await trocarPneuNoVeiculoFrota(
        veiculo.id,
        posicao.pneu_id, posicao.pneu_numero,
        pneuSelecionado.id, pneuSelecionado.numero_identificacao,
        usuarioLogado.uid, usuarioLogado.nome
      );
    } else {
      await adicionarPneuAoVeiculoFrota(
        veiculo.id, pneuSelecionado.id, pneuSelecionado.numero_identificacao,
        usuarioLogado.uid, usuarioLogado.nome
      );
    }
    await atualizarPosicaoVeiculoFrota(veiculo.id, posicao.id, {
      pneu_id: pneuSelecionado.id, pneu_numero: pneuSelecionado.numero_identificacao,
    });
    fecharModal('modalAtribuirPos');
    mostrarToast(`Pneu ${pneuSelecionado.numero_identificacao} atribuído! ✓`, 'success');
    await recarregar();
  } catch (err) {
    console.error(err); mostrarToast('Erro ao atribuir pneu.', 'error');
  } finally {
    setLoadingBtn(btn, false); posicaoAlvo = null; pneuSelecionado = null;
  }
});

// ─── Modal Opções Posição ──────────────────────
function abrirModalOpcoesPos(veiculo, posicao) {
  posicaoAlvo = { veiculo, posicao };
  document.getElementById('modalOpcoesVeiculoNome').textContent = veiculo.nome;
  document.getElementById('modalOpcoesPneuNum').textContent     = posicao.pneu_numero || '—';
  document.getElementById('modalOpcoesPosNome').textContent     = posicao.label;
  abrirModal('modalOpcoesPos');
}

document.getElementById('btnTrocarFrota').addEventListener('click', () => {
  if (!posicaoAlvo) return;
  abrirModalAtribuir(posicaoAlvo.veiculo, posicaoAlvo.posicao, true);
});

document.getElementById('btnRemoverFrota').addEventListener('click', async () => {
  if (!posicaoAlvo) return;
  const { veiculo, posicao } = posicaoAlvo;
  const btn = document.getElementById('btnRemoverFrota');
  btn.disabled = true;
  try {
    await removerPneuDoVeiculoFrota(
      veiculo.id, posicao.pneu_id, posicao.pneu_numero,
      usuarioLogado.uid, usuarioLogado.nome
    );
    await atualizarPosicaoVeiculoFrota(veiculo.id, posicao.id, {
      pneu_id: null, pneu_numero: null,
    });
    fecharModal('modalOpcoesPos');
    mostrarToast(`Pneu ${posicao.pneu_numero} removido.`, 'success');
    await recarregar();
  } catch (err) {
    console.error(err); mostrarToast('Erro ao remover pneu.', 'error');
  } finally {
    btn.disabled = false; posicaoAlvo = null;
  }
});

// ─── Helpers Gerais ───────────────────────────
function estadoVazio(iconeSvg, titulo, msg) {
  const div = document.createElement('div');
  div.className = 'state-empty';
  div.innerHTML = `${iconeSvg}<h3>${titulo}</h3><p>${msg}</p>`;
  return div;
}

function abrirModal(id)  { document.getElementById(id).style.display = 'flex'; document.body.style.overflow = 'hidden'; }
function fecharModal(id) { document.getElementById(id).style.display = 'none'; document.body.style.overflow = ''; }

document.querySelectorAll('.modal-close, .btn-cancelar[data-modal]').forEach(el => {
  el.addEventListener('click', () => {
    const id = el.dataset.modal || el.closest('.modal-overlay')?.id;
    if (id) fecharModal(id);
  });
});
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) fecharModal(o.id); });
});

function setLoadingBtn(btn, estado) {
  btn.disabled = estado;
  const t = btn.querySelector('.btn-text');
  const l = btn.querySelector('.btn-loader');
  if (t) t.style.display = estado ? 'none' : 'flex';
  if (l) l.style.display = estado ? 'flex'  : 'none';
}

function mostrarToast(msg, tipo = 'success') {
  const toast = document.getElementById('toast');
  const icon  = toast.querySelector('.toast-icon');
  toast.className = `toast ${tipo}`;
  document.getElementById('toastMsg').textContent = msg;
  icon.textContent = tipo === 'success' ? '✓' : '✕';
  toast.style.display = 'flex';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 4000);
}

// ─── Histórico do Veículo ──────────────────────
let histMovimentacoes   = [];
let histFiltroAtual     = '';
let histPaginaAtual     = 0;
const HIST_POR_PAGINA   = 20;

async function abrirModalHistorico(v) {
  document.getElementById('modalHistNome').textContent  = v.nome;
  document.getElementById('histModalCards').innerHTML   =
    `<div class="hist-loading"><div class="spinner"></div><p>Carregando histórico...</p></div>`;
  document.getElementById('btnMaisHistModal').style.display = 'none';
  document.getElementById('histModalCount').textContent = '';
  histFiltroAtual = '';
  histPaginaAtual = 0;

  // Reset tabs
  document.querySelectorAll('#modalHistoricoFrota .hist-tipo-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tipo === '');
    b.onclick = () => {
      document.querySelectorAll('#modalHistoricoFrota .hist-tipo-btn')
        .forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      histFiltroAtual = b.dataset.tipo;
      histPaginaAtual = 0;
      renderHistCards();
    };
  });

  abrirModal('modalHistoricoFrota');

  try {
    histMovimentacoes = await listarMovimentacoesFrota(v.id);
    renderHistCards();
  } catch(err) {
    console.error(err);
    document.getElementById('histModalCards').innerHTML =
      `<p class="hist-vazio">Erro ao carregar histórico.</p>`;
  }
}

function tipoMov(t) {
  if (!t.pneu_saiu && t.pneu_entrou) return 'adicao';
  if (t.pneu_saiu && !t.pneu_entrou) return 'remocao';
  return 'troca';
}

function renderHistCards() {
  const container = document.getElementById('histModalCards');
  const btnMais   = document.getElementById('btnMaisHistModal');
  const countEl   = document.getElementById('histModalCount');

  const filtradas = histFiltroAtual
    ? histMovimentacoes.filter(t => tipoMov(t) === histFiltroAtual)
    : [...histMovimentacoes];

  countEl.textContent = histFiltroAtual
    ? `${filtradas.length} de ${histMovimentacoes.length}`
    : `${histMovimentacoes.length} registro(s)`;

  if (histPaginaAtual === 0) container.innerHTML = '';

  if (filtradas.length === 0) {
    container.innerHTML = `<div class="hist-vazio">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36">
        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
      </svg>
      <p>Nenhuma movimentação encontrada.</p>
    </div>`;
    btnMais.style.display = 'none';
    return;
  }

  const tipoCfg = {
    adicao:  { cls: 'card-add',   badge: 'badge-add',   label: 'Adição'  },
    remocao: { cls: 'card-rem',   badge: 'badge-rem',   label: 'Remoção' },
    troca:   { cls: 'card-troca', badge: 'badge-troca', label: 'Troca'   },
  };

  const inicio = histPaginaAtual * HIST_POR_PAGINA;
  const slice  = filtradas.slice(inicio, inicio + HIST_POR_PAGINA);

  slice.forEach((t, i) => {
    const tipo    = tipoMov(t);
    const cfg     = tipoCfg[tipo];
    const dataObj = t.data?.toDate ? t.data.toDate() : null;
    const dataFmt = dataObj
      ? dataObj.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
    const horaFmt = dataObj
      ? dataObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : '';

    let pneusHtml = '';
    if (tipo === 'adicao') {
      pneusHtml = `<div class="hcard-pneu-flow">
        <div class="hcard-pneu-box entrou">
          <span class="hcard-pneu-dir">ENTROU</span>
          <span class="hcard-pneu-num">${t.pneu_entrou_numero || '—'}</span>
        </div>
      </div>`;
    } else if (tipo === 'remocao') {
      pneusHtml = `<div class="hcard-pneu-flow">
        <div class="hcard-pneu-box saiu">
          <span class="hcard-pneu-dir">SAIU</span>
          <span class="hcard-pneu-num">${t.pneu_saiu_numero || '—'}</span>
        </div>
      </div>`;
    } else {
      pneusHtml = `<div class="hcard-pneu-flow">
        <div class="hcard-pneu-box saiu">
          <span class="hcard-pneu-dir">SAIU</span>
          <span class="hcard-pneu-num">${t.pneu_saiu_numero || '—'}</span>
        </div>
        <div class="hcard-troca-arrow">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
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
    card.style.animationDelay = `${i * 25}ms`;
    card.innerHTML = `
      <div class="hcard-stripe"></div>
      <div class="hcard-body">
        <div class="hcard-top">
          <div class="hcard-left">
            <span class="hist-badge ${cfg.badge}">${cfg.label}</span>
          </div>
          <div class="hcard-right">
            <div class="hcard-data">${dataFmt}</div>
            <div class="hcard-hora">${horaFmt}</div>
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
    container.appendChild(card);
  });

  const restantes = filtradas.length - (inicio + slice.length);
  if (restantes > 0) {
    btnMais.style.display = 'block';
    btnMais.textContent   = `Ver mais ${restantes} registro(s)`;
    btnMais.onclick = () => { histPaginaAtual++; renderHistCards(); };
  } else {
    btnMais.style.display = 'none';
  }
}