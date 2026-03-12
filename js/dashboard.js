// ============================================================
//  js/dashboard.js — Lógica do Dashboard
// ============================================================

import {
  observarAuth,
  getDadosUsuario,
  listarObras,
  logout,
} from './firebase.js';

// ─── Estado da aplicação ──────────────────────
let todasObras   = [];
let statusAtivo  = 'aberta';
let usuarioLogado = null;

// ─── Elementos ────────────────────────────────
const obrasGrid    = document.getElementById('obrasGrid');
const stateLoading = document.getElementById('stateLoading');
const stateEmpty   = document.getElementById('stateEmpty');
const emptyTitle   = document.getElementById('emptyTitle');
const emptyMsg     = document.getElementById('emptyMsg');
const obrasCount   = document.getElementById('obrasCount');
const userName     = document.getElementById('userName');
const userRole     = document.getElementById('userRole');
const userAvatar   = document.getElementById('userAvatar');
const btnLogout    = document.getElementById('btnLogout');
const btnUsuarios  = document.getElementById('btnUsuarios');
const searchInput  = document.getElementById('searchInput');
const searchClear  = document.getElementById('searchClear');
const filterData   = document.getElementById('filterData');
const tabBtns      = document.querySelectorAll('.tab-btn');
const cardTemplate = document.getElementById('cardTemplate');

// ─── Verificação de autenticação ──────────────
observarAuth(async (user) => {
  if (!user) {
    window.location.href = '../html/login.html';
    return;
  }

  const dados = await getDadosUsuario(user.uid);

  if (!dados || dados.ativo === false) {
    await logout();
    window.location.href = '../html/login.html';
    return;
  }

  usuarioLogado = dados;

  // Preenche dados do usuário no navbar
  userName.textContent   = dados.nome;
  userRole.textContent   = dados.perfil === 'admin' ? 'Administrador' : 'Usuário';
  userAvatar.textContent = dados.nome.charAt(0).toUpperCase();

  // Mostra botão de usuários só pro admin
  if (dados.perfil === 'admin') {
    btnUsuarios.style.display = 'inline-flex';
  }

  // Carrega as obras
  await carregarObras(statusAtivo);
});

// ─── Logout ───────────────────────────────────
btnLogout.addEventListener('click', async () => {
  await logout();
  window.location.href = '../html/login.html';
});

// ─── Tabs de status ───────────────────────────
tabBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    statusAtivo = btn.dataset.status;
    searchInput.value = '';
    searchClear.style.display = 'none';
    await carregarObras(statusAtivo);
  });
});

// ─── Busca ────────────────────────────────────
searchInput.addEventListener('input', () => {
  const termo = searchInput.value.trim();
  searchClear.style.display = termo ? 'flex' : 'none';
  renderizarObras(filtrarEOrdenar(todasObras));
});

searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchClear.style.display = 'none';
  renderizarObras(filtrarEOrdenar(todasObras));
});

// ─── Ordenação ────────────────────────────────
filterData.addEventListener('change', () => {
  renderizarObras(filtrarEOrdenar(todasObras));
});

// ─── Funções principais ───────────────────────

async function carregarObras(status) {
  mostrarLoading(true);

  try {
    todasObras = await listarObras(status);
    renderizarObras(filtrarEOrdenar(todasObras));
  } catch (err) {
    console.error('Erro ao carregar obras:', err);
    mostrarVazio('Erro ao carregar obras', 'Verifique sua conexão e tente novamente.');
  } finally {
    mostrarLoading(false);
  }
}

function filtrarEOrdenar(obras) {
  const termo = searchInput.value.trim().toLowerCase();
  const ordem = filterData.value;

  let resultado = obras;

  // Filtro por nome
  if (termo) {
    resultado = resultado.filter(o =>
      o.nome.toLowerCase().includes(termo)
    );
  }

  // Ordenação
  resultado = [...resultado].sort((a, b) => {
    switch (ordem) {
      case 'recentes':
        return dataParaMs(b.data_criacao) - dataParaMs(a.data_criacao);
      case 'antigas':
        return dataParaMs(a.data_criacao) - dataParaMs(b.data_criacao);
      case 'az':
        return a.nome.localeCompare(b.nome);
      case 'za':
        return b.nome.localeCompare(a.nome);
      default:
        return 0;
    }
  });

  return resultado;
}

function renderizarObras(obras) {
  // Remove cards anteriores (mantém os estados)
  const cards = obrasGrid.querySelectorAll('.obra-card');
  cards.forEach(c => c.remove());

  obrasCount.textContent = `${obras.length} obra${obras.length !== 1 ? 's' : ''}`;

  if (obras.length === 0) {
    const termo = searchInput.value.trim();
    if (termo) {
      mostrarVazio(
        'Nenhuma obra encontrada',
        `Nenhum resultado para "${termo}".`
      );
    } else {
      const labels = {
        aberta:     ['Nenhuma obra em aberto', 'Clique em "Nova Obra" para começar.'],
        finalizada: ['Nenhuma obra finalizada', 'Obras finalizadas aparecerão aqui.'],
        arquivada:  ['Nenhuma obra arquivada', 'Obras deletadas são arquivadas aqui.'],
      };
      const [titulo, msg] = labels[statusAtivo] || labels.aberta;
      mostrarVazio(titulo, msg);
    }
    return;
  }

  stateEmpty.style.display = 'none';

  obras.forEach((obra, i) => {
    const card = criarCard(obra, i);
    obrasGrid.appendChild(card);
  });
}

function criarCard(obra, index) {
  const clone = cardTemplate.content.cloneNode(true);
  const card  = clone.querySelector('.obra-card');

  // Dados base
  card.dataset.id     = obra.id;
  card.dataset.status = obra.status;

  // Badge de status
  const badge = card.querySelector('.card-badge');
  const statusLabel = { aberta: 'Em aberto', finalizada: 'Finalizada', arquivada: 'Arquivada' };
  badge.textContent = statusLabel[obra.status] || obra.status;

  // Data de criação
  card.querySelector('.card-data').textContent = formatarData(obra.data_criacao);

  // Nome
  card.querySelector('.card-title').textContent = obra.nome;

  // Stats
  card.querySelector('.stat-caminhoes').textContent = obra.qtd_caminhoes ?? '—';
  card.querySelector('.stat-criador').textContent   = obra.criado_por_nome ?? '—';

  // Tempo em aberto / duração
  const tempo = calcularTempo(obra);
  card.querySelector('.card-tempo').textContent = tempo;

  // Animação escalonada
  card.style.animationDelay = `${index * 60}ms`;

  // Navegação para a obra
  card.addEventListener('click', () => {
    window.location.href = `obra.html?id=${obra.id}`;
  });

  return card;
}

// ─── Helpers de UI ────────────────────────────

function mostrarLoading(estado) {
  stateLoading.style.display = estado ? 'flex' : 'none';
  if (estado) stateEmpty.style.display = 'none';
}

function mostrarVazio(titulo, msg) {
  stateEmpty.style.display = 'flex';
  emptyTitle.textContent   = titulo;
  emptyMsg.textContent     = msg;
}

// ─── Helpers de data ──────────────────────────

function dataParaMs(timestamp) {
  if (!timestamp) return 0;
  if (timestamp.toDate) return timestamp.toDate().getTime();
  return new Date(timestamp).getTime();
}

function formatarData(timestamp) {
  if (!timestamp) return '—';
  const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function calcularTempo(obra) {
  if (!obra.data_criacao) return '';

  const inicio = obra.data_criacao.toDate ? obra.data_criacao.toDate() : new Date(obra.data_criacao);

  if (obra.status === 'finalizada' && obra.data_finalizacao) {
    const fim = obra.data_finalizacao.toDate ? obra.data_finalizacao.toDate() : new Date(obra.data_finalizacao);
    const dias = Math.floor((fim - inicio) / (1000 * 60 * 60 * 24));
    return `Durou ${dias} dia${dias !== 1 ? 's' : ''}`;
  }

  if (obra.status === 'aberta') {
    const agora = new Date();
    const dias = Math.floor((agora - inicio) / (1000 * 60 * 60 * 24));
    if (dias === 0) return 'Criada hoje';
    return `Aberta há ${dias} dia${dias !== 1 ? 's' : ''}`;
  }

  return '';
}