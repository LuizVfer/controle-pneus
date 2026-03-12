// ============================================================
//  js/nova-obra.js — Lógica da tela Nova Obra
// ============================================================

import {
  observarAuth,
  getDadosUsuario,
  criarObra,
  adicionarCaminhao,
  logout,
} from './firebase.js';

// ─── Estado ───────────────────────────────────
let usuarioLogado = null;
let caminhoes     = []; // [{ nome, placa, idx }]
let contCaminhao  = 0;

// ─── Elementos ────────────────────────────────
const userAvatar     = document.getElementById('userAvatar');
const formNovaObra   = document.getElementById('formNovaObra');
const nomeObra       = document.getElementById('nomeObra');
const nomeObraError  = document.getElementById('nomeObraError');
const btnCriar       = document.getElementById('btnCriar');
const listaCaminhoes = document.getElementById('listaCaminhoes');
const emptyCaminhoes = document.getElementById('emptyCaminhoes');
const btnAddCaminhao = document.getElementById('btnAddCaminhao');
const tmplCaminhao   = document.getElementById('tmplCaminhao');

// Resumo
const sumNome      = document.getElementById('sumNome');
const sumCaminhoes = document.getElementById('sumCaminhoes');

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
});

// ─── Atualiza resumo lateral ──────────────────
function atualizarResumo() {
  const nome = nomeObra.value.trim();
  sumNome.textContent      = nome || '—';
  sumCaminhoes.textContent = caminhoes.length;
}

nomeObra.addEventListener('input', () => {
  nomeObraError.textContent = '';
  nomeObra.classList.remove('is-error');
  atualizarResumo();
});

// ─── CAMINHÕES ────────────────────────────────

btnAddCaminhao.addEventListener('click', () => adicionarCaminhaoUI());

function adicionarCaminhaoUI(nomeVal = '', placaVal = '') {
  const idx   = contCaminhao++;
  const clone = tmplCaminhao.content.cloneNode(true);
  const item  = clone.querySelector('.item-caminhao');

  item.dataset.idx = idx;
  item.querySelector('.item-num').textContent = caminhoes.length + 1;

  const inputNome  = item.querySelector('.campo-nome-caminhao');
  const inputPlaca = item.querySelector('.campo-placa-caminhao');
  const errNome    = item.querySelector('.erro-nome-caminhao');

  inputNome.value  = nomeVal;
  inputPlaca.value = placaVal;

  const entry = { nome: nomeVal, placa: placaVal, idx };
  caminhoes.push(entry);

  inputNome.addEventListener('input', () => {
    entry.nome = inputNome.value.trim();
    errNome.textContent = '';
    inputNome.classList.remove('is-error');
    atualizarResumo();
  });

  inputPlaca.addEventListener('input', () => {
    entry.placa = inputPlaca.value.trim().toUpperCase();
    inputPlaca.value = entry.placa;
  });

  item.querySelector('.btn-remover').addEventListener('click', () => {
    caminhoes = caminhoes.filter(c => c.idx !== idx);
    item.remove();
    renumerarCaminhoes();
    atualizarResumo();
    toggleEmptyCaminhoes();
  });

  listaCaminhoes.appendChild(item);
  toggleEmptyCaminhoes();
  atualizarResumo();

  setTimeout(() => inputNome.focus(), 50);
}

function renumerarCaminhoes() {
  listaCaminhoes.querySelectorAll('.item-num').forEach((el, i) => {
    el.textContent = i + 1;
  });
}

function toggleEmptyCaminhoes() {
  if (caminhoes.length === 0) {
    if (!listaCaminhoes.contains(emptyCaminhoes)) {
      listaCaminhoes.appendChild(emptyCaminhoes);
    }
    emptyCaminhoes.style.display = 'flex';
  } else {
    emptyCaminhoes.style.display = 'none';
  }
}

// ─── SUBMIT ───────────────────────────────────

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

  // Valida nomes dos caminhões
  listaCaminhoes.querySelectorAll('.item-caminhao').forEach((item) => {
    const inputNome = item.querySelector('.campo-nome-caminhao');
    const errNome   = item.querySelector('.erro-nome-caminhao');
    if (!inputNome.value.trim()) {
      inputNome.classList.add('is-error');
      errNome.textContent = 'Nome obrigatório.';
      valido = false;
    }
  });

  if (!valido) {
    mostrarToast('Corrija os erros antes de continuar.', 'error');
    return;
  }

  // Coleta caminhões dos inputs
  const caminhoesFinais = [];
  listaCaminhoes.querySelectorAll('.item-caminhao').forEach((item) => {
    caminhoesFinais.push({
      nome:  item.querySelector('.campo-nome-caminhao').value.trim(),
      placa: item.querySelector('.campo-placa-caminhao').value.trim().toUpperCase(),
    });
  });

  setCarregando(true);

  try {
    // 1. Cria a obra
    const obraId = await criarObra({
      nome,
      qtd_caminhoes:   caminhoesFinais.length,
      criado_por:      usuarioLogado.uid,
      criado_por_nome: usuarioLogado.nome,
    });

    // 2. Adiciona caminhões
    for (const c of caminhoesFinais) {
      await adicionarCaminhao(obraId, { nome: c.nome, placa: c.placa || null });
    }

    mostrarToast('Obra criada com sucesso! ✓', 'success');
    setTimeout(() => {
      window.location.href = `obra.html?id=${obraId}`;
    }, 800);

  } catch (err) {
    console.error('Erro ao criar obra:', err);
    mostrarToast('Erro ao criar obra. Tente novamente.', 'error');
    setCarregando(false);
  }
});

// ─── Helpers ──────────────────────────────────

function setCarregando(estado) {
  btnCriar.disabled = estado;
  btnCriar.querySelector('.btn-text').style.display   = estado ? 'none' : 'flex';
  btnCriar.querySelector('.btn-loader').style.display = estado ? 'flex' : 'none';
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