// ============================================================
//  js/theme.js — Toggle de tema global (Dark / Light)
// ============================================================

const STORAGE_KEY = 'cp-theme';

function aplicarTema(tema) {
  document.documentElement.setAttribute('data-theme', tema);
  localStorage.setItem(STORAGE_KEY, tema);
}

function temaInicial() {
  const salvo = localStorage.getItem(STORAGE_KEY);
  if (salvo) return salvo;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function alternarTema() {
  const atual = document.documentElement.getAttribute('data-theme') || 'dark';
  aplicarTema(atual === 'dark' ? 'light' : 'dark');
}

// Aplica tema imediatamente (evita flash)
aplicarTema(temaInicial());

function inicializarBotoes() {
  // Suporta as duas classes usadas nas telas
  const seletores = '.btn-theme-toggle, .theme-toggle, .theme-float';

  document.querySelectorAll(seletores).forEach(btn => {
    btn.replaceWith(btn.cloneNode(true));
  });

  document.querySelectorAll(seletores).forEach(btn => {
    btn.addEventListener('click', alternarTema);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarBotoes);
} else {
  inicializarBotoes();
}

export { aplicarTema, alternarTema, temaInicial };