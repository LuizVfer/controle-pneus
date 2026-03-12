// ============================================================
//  js/login.js — Lógica da tela de login
// ============================================================

import { login, observarAuth, getDadosUsuario } from '../js/firebase.js';

// ─── Elementos ────────────────────────────────
const form        = document.getElementById('loginForm');
const emailInput  = document.getElementById('email');
const senhaInput  = document.getElementById('senha');
const emailError  = document.getElementById('emailError');
const senhaError  = document.getElementById('senhaError');
const alertError  = document.getElementById('alertError');
const alertMsg    = document.getElementById('alertErrorMsg');
const btnLogin    = document.getElementById('btnLogin');
const btnText     = btnLogin.querySelector('.btn-text');
const btnLoader   = btnLogin.querySelector('.btn-loader');
const toggleSenha = document.getElementById('toggleSenha');
const iconEye     = toggleSenha.querySelector('.icon-eye');
const iconEyeOff  = toggleSenha.querySelector('.icon-eye-off');

// ─── Redireciona se já estiver logado ─────────
observarAuth(async (user) => {
  if (user) {
    window.location.href = '../html/dashboard.html';
  }
});

// ─── Mostrar / ocultar senha ──────────────────
toggleSenha.addEventListener('click', () => {
  const visivel = senhaInput.type === 'text';
  senhaInput.type = visivel ? 'password' : 'text';
  iconEye.style.display    = visivel ? 'block' : 'none';
  iconEyeOff.style.display = visivel ? 'none'  : 'block';
});

// ─── Limpar erros ao digitar ──────────────────
emailInput.addEventListener('input', () => limparErro(emailInput, emailError));
senhaInput.addEventListener('input', () => limparErro(senhaInput, senhaError));

// ─── Submit do formulário ─────────────────────
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  esconderAlerta();

  const email = emailInput.value.trim();
  const senha = senhaInput.value;

  // Validação local
  let valido = true;

  if (!email) {
    mostrarErroCampo(emailInput, emailError, 'Informe o e-mail.');
    valido = false;
  } else if (!emailValido(email)) {
    mostrarErroCampo(emailInput, emailError, 'E-mail inválido.');
    valido = false;
  }

  if (!senha) {
    mostrarErroCampo(senhaInput, senhaError, 'Informe a senha.');
    valido = false;
  } else if (senha.length < 6) {
    mostrarErroCampo(senhaInput, senhaError, 'A senha deve ter ao menos 6 caracteres.');
    valido = false;
  }

  if (!valido) return;

  // Chama o Firebase
  setCarregando(true);

  try {
    const user = await login(email, senha);

    // Verifica se o usuário está ativo no Firestore
    const dados = await getDadosUsuario(user.uid);

    if (!dados || dados.ativo === false) {
      mostrarAlerta('Sua conta está desativada. Entre em contato com o administrador.');
      await import('../js/firebase.js').then(m => m.logout());
      setCarregando(false);
      return;
    }

    // Redireciona para o dashboard
    window.location.href = '../html/dashboard.html';

  } catch (err) {
    setCarregando(false);
    mostrarAlerta(mensagemDeErro(err.code));
  }
});

// ─── Helpers ──────────────────────────────────

function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function mostrarErroCampo(input, spanErro, mensagem) {
  input.classList.add('is-error');
  spanErro.textContent = mensagem;
}

function limparErro(input, spanErro) {
  input.classList.remove('is-error');
  spanErro.textContent = '';
  esconderAlerta();
}

function mostrarAlerta(mensagem) {
  alertMsg.textContent = mensagem;
  alertError.style.display = 'flex';
  // Remove e re-adiciona a classe para reiniciar a animação de shake
  alertError.style.animation = 'none';
  alertError.offsetHeight; // reflow
  alertError.style.animation = '';
}

function esconderAlerta() {
  alertError.style.display = 'none';
}

function setCarregando(estado) {
  btnLogin.disabled = estado;
  btnText.style.display   = estado ? 'none'  : 'inline';
  btnLoader.style.display = estado ? 'flex'  : 'none';
}

function mensagemDeErro(code) {
  const erros = {
    'auth/user-not-found':       'Nenhuma conta encontrada com este e-mail.',
    'auth/wrong-password':       'Senha incorreta. Tente novamente.',
    'auth/invalid-email':        'E-mail inválido.',
    'auth/user-disabled':        'Esta conta foi desativada.',
    'auth/too-many-requests':    'Muitas tentativas. Aguarde alguns minutos.',
    'auth/network-request-failed': 'Erro de conexão. Verifique sua internet.',
    'auth/invalid-credential':   'E-mail ou senha incorretos.',
  };
  return erros[code] || 'Ocorreu um erro. Tente novamente.';
}