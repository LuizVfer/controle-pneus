// ============================================================
//  js/nova-obra.js — Nova Obra (seleciona veículos da frota)
// ============================================================

import {
  observarAuth,
  getDadosUsuario,
  criarObra,
  adicionarCaminhao,
  logout,
  listarVeiculosFrota,
} from './firebase.js';

import { getTipoVeiculo } from './veiculos-tipos.js';

// ─── Estado ───────────────────────────────────
let usuarioLogado    = null;
let todosVeiculos    = [];   // todos da frota
let selecionados     = new Set(); // ids selecionados
let termoBusca       = '';

// ─── Elementos ────────────────────────────────
const userAvatar      = document.getElementById('userAvatar');
const formNovaObra    = document.getElementById('formNovaObra');
const nomeObra        = document.getElementById('nomeObra');
const nomeObraError   = document.getElementById('nomeObraError');
const btnCriar        = document.getElementById('btnCriar');
const buscaFrota      = document.getElementById('buscaFrota');
const frotaLista      = document.getElementById('frotaLista');
const frotaLoading    = document.getElementById('frotaLoading');
const frotaVazia      = document.getElementById('frotaVazia');
const frotaSemResult  = document.getElementById('frotaSemResultado');
const buscaTermoEl    = document.getElementById('buscaTermoExibido');
const veiculosError   = document.getElementById('veiculosError');

// Resumo
const sumNome             = document.getElementById('sumNome');
const sumVeiculos         = document.getElementById('sumVeiculos');
const sumPneus            = document.getElementById('sumPneus');
const summaryVeiculoLista = document.getElementById('summaryVeiculoLista');
const summaryVeiculoItens = document.getElementById('summaryVeiculoItens');

// ─── Auth ──────────────────────────────────────
observarAuth(async (user) => {
  if (!user) { window.location.href = '../html/login.html'; return; }
  const dados = await getDadosUsuario(user.uid);
  if (!dados || dados.ativo === false) { await logout(); window.location.href = '../html/login.html'; return; }
  usuarioLogado = { ...dados, uid: user.uid };
  userAvatar.textContent = dados.nome.charAt(0).toUpperCase();
  await carregarFrota();
});

// ─── Carregar frota ────────────────────────────
async function carregarFrota() {
  try {
    todosVeiculos = await listarVeiculosFrota();
    frotaLoading.style.display = 'none';
    if (todosVeiculos.length === 0) {
      frotaVazia.style.display = 'flex';
    } else {
      frotaLista.style.display = 'flex';
      renderLista();
    }
  } catch (err) {
    console.error(err);
    frotaLoading.style.display = 'none';
    frotaVazia.style.display = 'flex';
  }
}

// ─── Renderizar lista de veículos ─────────────
function renderLista() {
  frotaLista.innerHTML = '';
  frotaSemResult.style.display = 'none';

  const filtrados = todosVeiculos.filter(v => {
    if (!termoBusca) return true;
    const t = termoBusca.toLowerCase();
    return (
      v.nome?.toLowerCase().includes(t) ||
      v.placa?.toLowerCase().includes(t) ||
      v.tipo_veiculo_tag?.toLowerCase().includes(t)
    );
  });

  if (filtrados.length === 0) {
    buscaTermoEl.textContent = termoBusca;
    frotaSemResult.style.display = 'flex';
    return;
  }

  filtrados.forEach((v, i) => {
    const tipo     = getTipoVeiculo(v.tipo_veiculo_id);
    const selected = selecionados.has(v.id);
    const pneusUso = (v.pneus_ids || []).length;
    const pneusMax = v.qtd_pneus_tipo || tipo?.qtd_pneus || 0;
    const pct      = pneusMax > 0 ? Math.round((pneusUso / pneusMax) * 100) : 0;

    const card = document.createElement('div');
    card.className = `frota-item${selected ? ' selecionado' : ''}`;
    card.dataset.id = v.id;
    card.style.animationDelay = `${i * 30}ms`;

    card.innerHTML = `
      <div class="frota-item-check">
        <div class="check-box${selected ? ' marcado' : ''}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
      </div>
      <div class="frota-item-info">
        <div class="frota-item-top">
          <span class="frota-item-tag">${v.tipo_veiculo_tag || '—'}</span>
          <span class="frota-item-nome">${v.nome}</span>
          ${v.placa ? `<span class="frota-item-placa">${v.placa}</span>` : ''}
        </div>
        <div class="frota-item-sub">
          <span class="frota-item-tipo">${v.tipo_veiculo_nome || '—'}</span>
          <span class="frota-item-pneus">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="11" height="11">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
            </svg>
            ${pneusUso}/${pneusMax} pneus
          </span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => toggleSelecionado(v.id));
    frotaLista.appendChild(card);
  });
}

// ─── Toggle seleção ────────────────────────────
function toggleSelecionado(id) {
  if (selecionados.has(id)) {
    selecionados.delete(id);
  } else {
    selecionados.add(id);
  }
  veiculosError.textContent = '';
  renderLista();
  atualizarResumo();
}

// ─── Resumo ────────────────────────────────────
function atualizarResumo() {
  const nome = nomeObra.value.trim();
  sumNome.textContent = nome || '—';

  const sel = todosVeiculos.filter(v => selecionados.has(v.id));
  sumVeiculos.textContent = sel.length;

  const totalPneus = sel.reduce((acc, v) => {
    const tipo = getTipoVeiculo(v.tipo_veiculo_id);
    return acc + (v.qtd_pneus_tipo || tipo?.qtd_pneus || 0);
  }, 0);
  sumPneus.textContent = totalPneus;

  if (sel.length > 0) {
    summaryVeiculoLista.style.display = 'block';
    summaryVeiculoItens.innerHTML = sel.map(v => {
      const tipo = getTipoVeiculo(v.tipo_veiculo_id);
      return `
        <div class="summary-veiculo-item">
          <span class="summary-veiculo-tag">${v.tipo_veiculo_tag || tipo?.tag || '—'}</span>
          <span class="summary-veiculo-nome">${v.nome}</span>
          <span class="summary-veiculo-pneus">${v.qtd_pneus_tipo || tipo?.qtd_pneus || 0} pneus</span>
        </div>`;
    }).join('');
  } else {
    summaryVeiculoLista.style.display = 'none';
  }
}

// ─── Busca ─────────────────────────────────────
nomeObra.addEventListener('input', () => {
  nomeObraError.textContent = '';
  nomeObra.classList.remove('is-error');
  atualizarResumo();
});

buscaFrota.addEventListener('input', () => {
  termoBusca = buscaFrota.value.trim();
  renderLista();
});

// ─── Submit ────────────────────────────────────
formNovaObra.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!usuarioLogado) return;

  let valido = true;
  const nome = nomeObra.value.trim();

  if (!nome) {
    nomeObra.classList.add('is-error');
    nomeObraError.textContent = 'Informe o nome da obra.';
    valido = false;
  }

  if (selecionados.size === 0) {
    veiculosError.textContent = 'Selecione ao menos um veículo.';
    valido = false;
  }

  if (!valido) {
    mostrarToast('Corrija os erros antes de continuar.', 'error');
    return;
  }

  const veiculosFinais = todosVeiculos.filter(v => selecionados.has(v.id));
  const totalPneus     = veiculosFinais.reduce((acc, v) => {
    const tipo = getTipoVeiculo(v.tipo_veiculo_id);
    return acc + (v.qtd_pneus_tipo || tipo?.qtd_pneus || 0);
  }, 0);

  setCarregando(true);

  try {
    const obraId = await criarObra({
      nome,
      qtd_caminhoes:   veiculosFinais.length,
      qtd_pneus:       totalPneus,
      criado_por:      usuarioLogado.uid,
      criado_por_nome: usuarioLogado.nome,
    });

    for (const v of veiculosFinais) {
      const tipo = getTipoVeiculo(v.tipo_veiculo_id);
      await adicionarCaminhao(obraId, {
        nome:              v.nome,
        placa:             v.placa || null,
        tipo_veiculo_id:   v.tipo_veiculo_id,
        tipo_veiculo_nome: v.tipo_veiculo_nome || tipo?.nome || '',
        tipo_veiculo_tag:  v.tipo_veiculo_tag  || tipo?.tag  || '',
        qtd_pneus_tipo:    v.qtd_pneus_tipo    || tipo?.qtd_pneus || 0,
        posicoes:          v.posicoes          || tipo?.posicoes  || [],
        // referência ao veículo da frota
        frota_veiculo_id:  v.id,
      });
    }

    mostrarToast('Obra criada com sucesso! ✓', 'success');
    setTimeout(() => { window.location.href = `obra.html?id=${obraId}`; }, 800);

  } catch (err) {
    console.error('Erro ao criar obra:', err);
    mostrarToast('Erro ao criar obra. Tente novamente.', 'error');
    setCarregando(false);
  }
});

// ─── Helpers ──────────────────────────────────
function setCarregando(estado) {
  btnCriar.disabled = estado;
  btnCriar.querySelector('.btn-text').style.display   = estado ? 'none'  : 'flex';
  btnCriar.querySelector('.btn-loader').style.display = estado ? 'flex'  : 'none';
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