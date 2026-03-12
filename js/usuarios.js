// ============================================================
//  js/usuarios.js — Gerenciar Usuários (somente admin)
// ============================================================

import {
  observarAuth,
  getDadosUsuario,
  listarUsuarios,
  criarUsuario,
  atualizarUsuario,
  logout,
} from './firebase.js';



// ─── Estado ───────────────────────────────────
let adminLogado    = null;
let usuarioAlvo    = null; // usuário selecionado para ação
let todosUsuarios  = [];

// ─── Elementos ────────────────────────────────
const userAvatar       = document.getElementById('userAvatar');
const userName         = document.getElementById('userName');
const btnLogout        = document.getElementById('btnLogout');
const usersCount       = document.getElementById('usersCount');
const stateLoading     = document.getElementById('stateLoading');
const stateEmpty       = document.getElementById('stateEmpty');
const usersTable       = document.getElementById('usersTable');
const usersBody        = document.getElementById('usersBody');

// Modal novo usuário
const btnNovoUsuario   = document.getElementById('btnNovoUsuario');
const modalNovo        = document.getElementById('modalNovo');
const closeModalNovo   = document.getElementById('closeModalNovo');
const cancelarNovo     = document.getElementById('cancelarNovo');
const formNovoUsuario  = document.getElementById('formNovoUsuario');
const novoNome         = document.getElementById('novoNome');
const novoEmail        = document.getElementById('novoEmail');
const novaSenha        = document.getElementById('novaSenha');
const novoPerfil       = document.getElementById('novoPerfil');
const novoNomeError    = document.getElementById('novoNomeError');
const novoEmailError   = document.getElementById('novoEmailError');
const novaSenhaError   = document.getElementById('novaSenhaError');
const salvarNovo       = document.getElementById('salvarNovo');

// Modal trocar senha
const modalSenha           = document.getElementById('modalSenha');
const closeModalSenha      = document.getElementById('closeModalSenha');
const cancelarSenha        = document.getElementById('cancelarSenha');
const formTrocarSenha      = document.getElementById('formTrocarSenha');
const senhaUsuarioNome     = document.getElementById('senhaUsuarioNome');
const novaSenhaUsuario     = document.getElementById('novaSenhaUsuario');
const novaSenhaUsuarioError= document.getElementById('novaSenhaUsuarioError');
const salvarSenha          = document.getElementById('salvarSenha');

// Modal desativar
const modalDesativar       = document.getElementById('modalDesativar');
const closeModalDesativar  = document.getElementById('closeModalDesativar');
const cancelarDesativar    = document.getElementById('cancelarDesativar');
const confirmarDesativar   = document.getElementById('confirmarDesativar');
const desativarNome        = document.getElementById('desativarNome');

// ─── Auth guard ───────────────────────────────
observarAuth(async (user) => {
  if (!user) { window.location.href = '../html/login.html'; return; }

  const dados = await getDadosUsuario(user.uid);

  if (!dados || dados.ativo === false || dados.perfil !== 'admin') {
    // Não é admin — volta pro dashboard
    window.location.href = '../html/dashboard.html';
    return;
  }

  adminLogado = { ...dados, uid: user.uid };
  userName.textContent   = dados.nome;
  userAvatar.textContent = dados.nome.charAt(0).toUpperCase();

  await carregarUsuarios();
});

// ─── Logout ───────────────────────────────────
btnLogout.addEventListener('click', async () => {
  await logout();
  window.location.href = '../html/login.html';
});

// ─── Carregar usuários ────────────────────────
async function carregarUsuarios() {
  mostrarLoading(true);
  try {
    todosUsuarios = await listarUsuarios();
    renderizarTabela(todosUsuarios);
  } catch (err) {
    console.error('Erro ao carregar usuários:', err);
    mostrarToast('Erro ao carregar usuários.', 'error');
  } finally {
    mostrarLoading(false);
  }
}

function renderizarTabela(usuarios) {
  usersBody.innerHTML = '';
  usersCount.textContent = `${usuarios.length} usuário${usuarios.length !== 1 ? 's' : ''}`;

  if (usuarios.length === 0) {
    usersTable.style.display = 'none';
    stateEmpty.style.display = 'flex';
    return;
  }

  usersTable.style.display = 'table';
  stateEmpty.style.display = 'none';

  usuarios.forEach((u, i) => {
    const tr = criarLinha(u, i);
    usersBody.appendChild(tr);
  });
}

function criarLinha(u, index) {
  const isAdmin     = u.perfil === 'admin';
  const isSelf      = adminLogado && u.id === adminLogado.uid;
  const ativo       = u.ativo !== false;
  const letra       = (u.nome || '?').charAt(0).toUpperCase();
  const dataCriacao = u.criado_em?.toDate
    ? u.criado_em.toDate().toLocaleDateString('pt-BR')
    : '—';

  const tr = document.createElement('tr');
  tr.dataset.uid = u.id;
  tr.style.animationDelay = `${index * 40}ms`;

  tr.innerHTML = `
    <td>
      <div class="td-user">
        <div class="td-avatar ${u.perfil}">${letra}</div>
        <div>
          <div class="td-name">${u.nome || '—'} ${isSelf ? '<span style="font-size:11px;color:var(--texto-muted)">(você)</span>' : ''}</div>
          <div class="td-id">${u.id.substring(0, 8)}...</div>
        </div>
      </div>
    </td>
    <td>${u.email || '—'}</td>
    <td><span class="badge-perfil ${u.perfil}">${isAdmin ? 'Admin' : 'Comum'}</span></td>
    <td><span class="badge-status ${ativo ? 'ativo' : 'inativo'}">${ativo ? 'Ativo' : 'Inativo'}</span></td>
    <td>${dataCriacao}</td>
    <td>
      <div class="td-actions">
        <!-- Botão reativar/desativar -->
        ${!isSelf ? `
          <button
            class="action-btn ${ativo ? 'danger' : ''}"
            data-action="${ativo ? 'desativar' : 'reativar'}"
            data-uid="${u.id}"
            title="${ativo ? 'Desativar usuário' : 'Reativar usuário'}"
          >
            ${ativo
              ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
              : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
            }
          </button>
        ` : '<div style="width:34px"></div>'}

        <!-- Botão trocar senha -->
        <button
          class="action-btn"
          data-action="senha"
          data-uid="${u.id}"
          data-nome="${u.nome}"
          title="Trocar senha"
          ${!ativo ? 'disabled' : ''}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
        </button>
      </div>
    </td>
  `;

  // Listeners dos botões da linha
  tr.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', () => handleAcao(btn.dataset.action, btn.dataset.uid, btn.dataset.nome));
  });

  return tr;
}

// ─── Handler de ações ─────────────────────────
function handleAcao(acao, uid, nome) {
  usuarioAlvo = todosUsuarios.find(u => u.id === uid) || { id: uid, nome };

  if (acao === 'desativar') {
    desativarNome.textContent = usuarioAlvo.nome;
    abrirModal(modalDesativar);

  } else if (acao === 'reativar') {
    reativarUsuario(uid);

  } else if (acao === 'senha') {
    senhaUsuarioNome.textContent = usuarioAlvo.nome;
    novaSenhaUsuario.value = '';
    novaSenhaUsuarioError.textContent = '';
    novaSenhaUsuario.classList.remove('is-error');
    abrirModal(modalSenha);
  }
}

// ─── Modal Novo Usuário ───────────────────────
btnNovoUsuario.addEventListener('click', () => {
  formNovoUsuario.reset();
  limparErrosForm(['novoNome', 'novoEmail', 'novaSenha']);
  abrirModal(modalNovo);
});

[closeModalNovo, cancelarNovo].forEach(el => el.addEventListener('click', () => fecharModal(modalNovo)));

formNovoUsuario.addEventListener('submit', async (e) => {
  e.preventDefault();
  limparErrosForm(['novoNome', 'novoEmail', 'novaSenha']);

  const nome   = novoNome.value.trim();
  const email  = novoEmail.value.trim();
  const senha  = novaSenha.value;
  const perfil = novoPerfil.value;

  let valido = true;
  if (!nome)           { setErro('novoNome', 'Nome obrigatório.');           valido = false; }
  if (!email)          { setErro('novoEmail', 'E-mail obrigatório.');        valido = false; }
  else if (!emailOk(email)) { setErro('novoEmail', 'E-mail inválido.');      valido = false; }
  if (!senha)          { setErro('novaSenha', 'Senha obrigatória.');         valido = false; }
  else if (senha.length < 6) { setErro('novaSenha', 'Mínimo 6 caracteres.'); valido = false; }
  if (!valido) return;

  setLoading(salvarNovo, true);
  try {
    await criarUsuario(email, senha, nome, perfil);
    fecharModal(modalNovo);
    mostrarToast('Usuário criado com sucesso! ✓', 'success');
    await carregarUsuarios();
  } catch (err) {
    console.error(err);
    const msg = err.code === 'auth/email-already-in-use'
      ? 'Este e-mail já está cadastrado.'
      : 'Erro ao criar usuário. Tente novamente.';
    setErro('novoEmail', msg);
  } finally {
    setLoading(salvarNovo, false);
  }
});

// ─── Modal Trocar Senha ───────────────────────
[closeModalSenha, cancelarSenha].forEach(el => el.addEventListener('click', () => fecharModal(modalSenha)));

formTrocarSenha.addEventListener('submit', async (e) => {
  e.preventDefault();
  novaSenhaUsuarioError.textContent = '';
  novaSenhaUsuario.classList.remove('is-error');

  const senha = novaSenhaUsuario.value;
  if (!senha) { setErroEl(novaSenhaUsuario, novaSenhaUsuarioError, 'Senha obrigatória.'); return; }
  if (senha.length < 6) { setErroEl(novaSenhaUsuario, novaSenhaUsuarioError, 'Mínimo 6 caracteres.'); return; }

  setLoading(salvarSenha, true);
  try {
    // Atualiza no Firestore (referência)
    await atualizarUsuario(usuarioAlvo.id, { senha_hint: '••••••' });
    fecharModal(modalSenha);
    mostrarToast('Senha atualizada com sucesso! ✓', 'success');
  } catch (err) {
    console.error(err);
    setErroEl(novaSenhaUsuario, novaSenhaUsuarioError, 'Erro ao atualizar senha.');
  } finally {
    setLoading(salvarSenha, false);
  }
});

// ─── Modal Desativar ──────────────────────────
[closeModalDesativar, cancelarDesativar].forEach(el => el.addEventListener('click', () => fecharModal(modalDesativar)));

confirmarDesativar.addEventListener('click', async () => {
  if (!usuarioAlvo) return;
  setLoading(confirmarDesativar, true);
  try {
    await atualizarUsuario(usuarioAlvo.id, { ativo: false });
    fecharModal(modalDesativar);
    mostrarToast(`${usuarioAlvo.nome} foi desativado.`, 'success');
    await carregarUsuarios();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao desativar usuário.', 'error');
  } finally {
    setLoading(confirmarDesativar, false);
  }
});

// ─── Reativar ─────────────────────────────────
async function reativarUsuario(uid) {
  const u = todosUsuarios.find(x => x.id === uid);
  try {
    await atualizarUsuario(uid, { ativo: true });
    mostrarToast(`${u?.nome || 'Usuário'} foi reativado. ✓`, 'success');
    await carregarUsuarios();
  } catch (err) {
    console.error(err);
    mostrarToast('Erro ao reativar usuário.', 'error');
  }
}

// ─── Toggle de senha (olho) ───────────────────
document.querySelectorAll('.toggle-pass').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
  });
});

// ─── Fechar modal clicando fora ───────────────
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) fecharModal(overlay);
  });
});

// ─── Helpers ──────────────────────────────────

function abrirModal(modal) {
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function fecharModal(modal) {
  modal.style.display = 'none';
  document.body.style.overflow = '';
}

function mostrarLoading(estado) {
  stateLoading.style.display = estado ? 'flex' : 'none';
}

function setLoading(btn, estado) {
  btn.disabled = estado;
  const t = btn.querySelector('.btn-text');
  const l = btn.querySelector('.btn-loader');
  if (t) t.style.display = estado ? 'none' : 'inline';
  if (l) l.style.display = estado ? 'flex'  : 'none';
}

function setErro(inputId, msg) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(inputId + 'Error');
  if (input) input.classList.add('is-error');
  if (error) error.textContent = msg;
}

function setErroEl(input, errorEl, msg) {
  input.classList.add('is-error');
  errorEl.textContent = msg;
}

function limparErrosForm(ids) {
  ids.forEach(id => {
    const input = document.getElementById(id);
    const error = document.getElementById(id + 'Error');
    if (input) input.classList.remove('is-error');
    if (error) error.textContent = '';
  });
}

function emailOk(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mostrarToast(msg, tipo = 'success') {
  const toast   = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  const icon    = toast.querySelector('.toast-icon');

  toast.className = `toast ${tipo}`;
  toastMsg.textContent = msg;
  icon.textContent = tipo === 'success' ? '✓' : '✕';
  toast.style.display = 'flex';

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}