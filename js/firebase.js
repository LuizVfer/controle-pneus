// ============================================================
//  firebase.js — Configuração e funções centrais do sistema
// ============================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  createUserWithEmailAndPassword,
  deleteUser,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  arrayUnion,
  arrayRemove,
  limit as fsLimit,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ─────────────────────────────────────────────
//  Inicialização
// ─────────────────────────────────────────────

import { firebaseConfig } from './config.js';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// App secundário — usado APENAS para criar novos usuários
// sem derrubar a sessão do admin logado
const appSecundario = initializeApp(firebaseConfig, 'criacao-usuario');
const authSecundario = getAuth(appSecundario);

// ─────────────────────────────────────────────
//  AUTENTICAÇÃO
// ─────────────────────────────────────────────

/** Faz login com email e senha */
export async function login(email, senha) {
  const cred = await signInWithEmailAndPassword(auth, email, senha);
  return cred.user;
}

/** Faz logout */
export async function logout() {
  await signOut(auth);
}

/**
 * Observa o estado de autenticação.
 * Chame no início de cada página para proteger rotas.
 * @param {(user: object|null) => void} callback
 */
export function observarAuth(callback) {
  onAuthStateChanged(auth, callback);
}

/** Retorna o usuário autenticado no momento */
export function usuarioAtual() {
  return auth.currentUser;
}

// ─────────────────────────────────────────────
//  USUÁRIOS
// ─────────────────────────────────────────────

/** Busca os dados do usuário no Firestore pelo UID */
export async function getDadosUsuario(uid) {
  const snap = await getDoc(doc(db, "usuarios", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** Lista todos os usuários (somente admin deve chamar) */
export async function listarUsuarios() {
  const snap = await getDocs(collection(db, "usuarios"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * Cria um novo usuário no Auth e salva no Firestore.
 * @param {string} email
 * @param {string} senha
 * @param {string} nome
 * @param {'admin'|'comum'} perfil
 */
export async function criarUsuario(email, senha, nome, perfil = "comum") {
  // Usa o app SECUNDÁRIO para não derrubar a sessão do admin
  const cred = await createUserWithEmailAndPassword(authSecundario, email, senha);
  const uid = cred.user.uid;

  // Salva dados no Firestore usando o app principal (auth do admin)
  await setDoc(doc(db, "usuarios", uid), {
    nome,
    email,
    perfil,
    ativo: true,
    criado_em: serverTimestamp(),
  });

  // Desloga do app secundário imediatamente (limpa a sessão temporária)
  await signOut(authSecundario);

  return { uid, nome, email, perfil };
}

/**
 * Troca a senha de outro usuário (fluxo admin via re-autenticação não é necessário,
 * pois o admin gerencia pelo backend. Aqui atualizamos apenas o campo no Firestore
 * como referência — a troca real de senha exige o SDK Admin no backend).
 * Para uso direto no frontend, esta função troca a senha do usuário LOGADO.
 */
export async function trocarMinhaSenha(novaSenha) {
  await updatePassword(auth.currentUser, novaSenha);
}

/** Atualiza dados de um usuário no Firestore */
export async function atualizarUsuario(uid, dados) {
  await updateDoc(doc(db, "usuarios", uid), dados);
}

/** Desativa (soft delete) um usuário */
export async function deletarUsuario(uid) {
  await updateDoc(doc(db, "usuarios", uid), { ativo: false });
}

// ─────────────────────────────────────────────
//  OBRAS
// ─────────────────────────────────────────────

/**
 * Cria uma nova obra.
 * @param {object} dados - { nome, qtd_caminhoes, qtd_pneus, criado_por }
 */
export async function criarObra(dados) {
  const ref = await addDoc(collection(db, "obras"), {
    ...dados,
    status: "aberta",
    data_criacao: serverTimestamp(),
    data_finalizacao: null,
  });
  return ref.id;
}

/** Lista obras por status: 'aberta' | 'finalizada' | 'arquivada' */
export async function listarObras(status = "aberta") {
  const q = query(
    collection(db, "obras"),
    where("status", "==", status),
    orderBy("data_criacao", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Busca uma obra pelo ID */
export async function getObra(obraId) {
  const snap = await getDoc(doc(db, "obras", obraId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Atualiza campos de uma obra e registra log da alteração.
 * @param {string} obraId
 * @param {object} dadosNovos - campos que mudaram
 * @param {object} dadosAntigos - valores anteriores dos mesmos campos
 * @param {string} usuarioId
 * @param {string} usuarioNome
 */
export async function atualizarObra(obraId, dadosNovos, dadosAntigos, usuarioId, usuarioNome) {
  await updateDoc(doc(db, "obras", obraId), dadosNovos);

  for (const campo of Object.keys(dadosNovos)) {
    await addDoc(collection(db, "obras", obraId, "logs"), {
      campo_alterado: campo,
      valor_antigo: dadosAntigos[campo] ?? null,
      valor_novo: dadosNovos[campo],
      data: serverTimestamp(),
      usuario_id: usuarioId,
      usuario_nome: usuarioNome,
    });
  }
}

/** Finaliza uma obra */
export async function finalizarObra(obraId) {
  // Libera todos os pneus em uso nesta obra de volta ao estoque
  const pneusQ = query(collection(db, "pneus"), where("obra_id_atual", "==", obraId));
  const pneusSnap = await getDocs(pneusQ);
  const liberacoes = pneusSnap.docs.map(d =>
    updateDoc(d.ref, {
      status:        "disponivel",
      obra_id_atual: null,
      obra_nome:     null,
      caminhao_id:   null,
      caminhao_nome: null,
    })
  );
  await Promise.all(liberacoes);

  await updateDoc(doc(db, "obras", obraId), {
    status: "finalizada",
    data_finalizacao: serverTimestamp(),
  });
}

/** Arquiva (soft delete) uma obra */
export async function arquivarObra(obraId) {
  // Libera todos os pneus em uso nesta obra de volta ao estoque
  const pneusQ = query(collection(db, "pneus"), where("obra_id_atual", "==", obraId));
  const pneusSnap = await getDocs(pneusQ);
  const liberacoes = pneusSnap.docs.map(d =>
    updateDoc(d.ref, {
      status:        "disponivel",
      obra_id_atual: null,
      obra_nome:     null,
      caminhao_id:   null,
      caminhao_nome: null,
    })
  );
  await Promise.all(liberacoes);

  await updateDoc(doc(db, "obras", obraId), {
    status: "arquivada",
    data_arquivamento: serverTimestamp(),
  });
}

// ─────────────────────────────────────────────
//  CAMINHÕES
// ─────────────────────────────────────────────

/** Adiciona um caminhão a uma obra */
export async function adicionarCaminhao(obraId, dados) {
  const ref = await addDoc(collection(db, "obras", obraId, "caminhoes"), {
    ...dados,
    pneus_ids: [],   // array de IDs — suporta múltiplos pneus por caminhão
    criado_em: serverTimestamp(),
  });
  return ref.id;
}

/** Lista caminhões de uma obra */
export async function listarCaminhoes(obraId) {
  const snap = await getDocs(collection(db, "obras", obraId, "caminhoes"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Atualiza dados de um caminhão */
export async function atualizarCaminhao(obraId, caminhaoId, dados) {
  await updateDoc(doc(db, "obras", obraId, "caminhoes", caminhaoId), dados);
}

/** Remove um caminhão */
export async function deletarCaminhao(obraId, caminhaoId) {
  await deleteDoc(doc(db, "obras", obraId, "caminhoes", caminhaoId));
}

// ─────────────────────────────────────────────
//  PNEUS
// ─────────────────────────────────────────────

/** Adiciona um pneu (identificação global, pode ser transferido entre obras) */
export async function adicionarPneu(numero_identificacao, obraId) {
  // Verifica se o número já existe
  const q = query(
    collection(db, "pneus"),
    where("numero_identificacao", "==", numero_identificacao)
  );
  const snap = await getDocs(q);
  if (!snap.empty) throw new Error(`Pneu ${numero_identificacao} já está cadastrado.`);

  const ref = await addDoc(collection(db, "pneus"), {
    numero_identificacao,
    obra_id_atual: obraId,
    status: "disponivel", // 'disponivel' | 'em_uso'
    criado_em: serverTimestamp(),
  });
  return ref.id;
}

/** Lista pneus de uma obra específica */
export async function listarPneusDaObra(obraId) {
  const q = query(collection(db, "pneus"), where("obra_id_atual", "==", obraId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Busca um pneu pelo número de identificação */
export async function getPneuPorNumero(numero_identificacao) {
  const q = query(
    collection(db, "pneus"),
    where("numero_identificacao", "==", numero_identificacao)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/**
 * Adiciona um pneu ao array de pneus de um caminhão.
 * Registra o evento no histórico de trocas.
 */
export async function adicionarPneuAoCaminhao(obraId, caminhaoId, pneuId, pneuNumero, usuarioId, usuarioNome) {
  const caminhaoRef  = doc(db, "obras", obraId, "caminhoes", caminhaoId);
  const caminhaoSnap = await getDoc(caminhaoRef);
  const caminhao     = caminhaoSnap.data();

  // Registra no histórico
  await addDoc(collection(db, "obras", obraId, "trocas"), {
    caminhao_id:        caminhaoId,
    caminhao_nome:      caminhao.nome,
    pneu_saiu:          null,
    pneu_entrou:        pneuId,
    pneu_entrou_numero: pneuNumero,
    data:               serverTimestamp(),
    usuario_id:         usuarioId,
    usuario_nome:       usuarioNome,
  });

  // Adiciona ao array do caminhão
  await updateDoc(caminhaoRef, { pneus_ids: arrayUnion(pneuId) });

  // Busca o nome da obra para armazenar no pneu
  const obraSnap = await getDoc(doc(db, "obras", obraId));
  const obraNome = obraSnap.exists() ? obraSnap.data().nome : "";

  // Marca pneu como em uso — guarda localização completa
  await updateDoc(doc(db, "pneus", pneuId), {
    status:        "em_uso",
    obra_id_atual: obraId,
    obra_nome:     obraNome,
    caminhao_id:   caminhaoId,
    caminhao_nome: caminhao.nome,
  });
}

/**
 * Remove um pneu específico do caminhão (libera para uso).
 * Registra o evento no histórico de trocas.
 */
export async function removerPneuDoCaminhao(obraId, caminhaoId, pneuId, pneuNumero, usuarioId, usuarioNome) {
  const caminhaoRef  = doc(db, "obras", obraId, "caminhoes", caminhaoId);
  const caminhaoSnap = await getDoc(caminhaoRef);
  const caminhao     = caminhaoSnap.data();

  // Registra no histórico
  await addDoc(collection(db, "obras", obraId, "trocas"), {
    caminhao_id:        caminhaoId,
    caminhao_nome:      caminhao.nome,
    pneu_saiu:          pneuId,
    pneu_saiu_numero:   pneuNumero,
    pneu_entrou:        null,
    pneu_entrou_numero: null,
    data:               serverTimestamp(),
    usuario_id:         usuarioId,
    usuario_nome:       usuarioNome,
  });

  // Remove do array do caminhão
  await updateDoc(caminhaoRef, { pneus_ids: arrayRemove(pneuId) });

  // Libera o pneu — mantém na obra mas marca disponível
  await updateDoc(doc(db, "pneus", pneuId), {
    status:      "disponivel",
    caminhao_id: null,
    // obra_id_atual permanece — pneu ainda pertence à obra
  });
}

/** Mantido para compatibilidade com código legado (redireciona para adicionarPneuAoCaminhao) */
export async function atribuirPneu(obraId, caminhaoId, pneuNovoId, pneuNovoNumero, usuarioId, usuarioNome) {
  return adicionarPneuAoCaminhao(obraId, caminhaoId, pneuNovoId, pneuNovoNumero, usuarioId, usuarioNome);
}


// ─────────────────────────────────────────────
//  ESTOQUE GLOBAL DE PNEUS
//  status: 'disponivel' | 'em_uso' | 'inutilizavel'
// ─────────────────────────────────────────────

async function _proximoNumeroPneu() {
  const contRef = doc(db, "config", "pneus_contador");
  const novoNum = await runTransaction(db, async (t) => {
    const snap = await t.get(contRef);
    const atual = snap.exists() ? (snap.data().ultimo || 0) : 0;
    const novo  = atual + 1;
    t.set(contRef, { ultimo: novo }, { merge: true });
    return novo;
  });
  return `PNE-${String(novoNum).padStart(4, "0")}`;
}

export async function adicionarPneuEstoque() {
  const numero = await _proximoNumeroPneu();
  const ref = await addDoc(collection(db, "pneus"), {
    numero_identificacao:  numero,
    status:                "disponivel",
    obra_id_atual:         null,
    caminhao_id:           null,
    motivo_inutilizacao:   null,
    data_inutilizacao:     null,
    criado_em:             serverTimestamp(),
  });
  return { id: ref.id, numero_identificacao: numero };
}

export async function adicionarPneusEmLote(quantidade) {
  const resultados = [];
  for (let i = 0; i < quantidade; i++) {
    resultados.push(await adicionarPneuEstoque());
  }
  return resultados;
}

export async function listarEstoque() {
  const snap = await getDocs(query(collection(db, "pneus"), orderBy("criado_em", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function listarPneusDisponiveis() {
  const q = query(collection(db, "pneus"), where("status", "==", "disponivel"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function inutilizarPneu(pneuId, motivo, usuarioId, usuarioNome) {
  const pneuRef  = doc(db, "pneus", pneuId);
  const pneuSnap = await getDoc(pneuRef);
  const pneu     = pneuSnap.data();

  if (pneu.status === "em_uso" && pneu.caminhao_id && pneu.obra_id_atual) {
    const camRef = doc(db, "obras", pneu.obra_id_atual, "caminhoes", pneu.caminhao_id);
    await updateDoc(camRef, { pneus_ids: arrayRemove(pneuId) });
    await addDoc(collection(db, "obras", pneu.obra_id_atual, "trocas"), {
      caminhao_id:        pneu.caminhao_id,
      caminhao_nome:      "",
      pneu_saiu:          pneuId,
      pneu_saiu_numero:   pneu.numero_identificacao,
      pneu_entrou:        null,
      pneu_entrou_numero: null,
      motivo_saida:       `Inutilizado: ${motivo}`,
      data:               serverTimestamp(),
      usuario_id:         usuarioId,
      usuario_nome:       usuarioNome,
    });
  }

  await updateDoc(pneuRef, {
    status:              "inutilizavel",
    motivo_inutilizacao: motivo,
    data_inutilizacao:   serverTimestamp(),
    obra_id_atual:       null,
    caminhao_id:         null,
  });
}

export async function reativarPneu(pneuId) {
  await updateDoc(doc(db, "pneus", pneuId), {
    status:              "disponivel",
    motivo_inutilizacao: null,
    data_inutilizacao:   null,
  });
}

// ─────────────────────────────────────────────
//  TRANSFERÊNCIA DE PNEU ENTRE OBRAS
// ─────────────────────────────────────────────

/** Transfere um pneu para outra obra */
export async function transferirPneu(pneuId, novaObraId) {
  await updateDoc(doc(db, "pneus", pneuId), {
    obra_id_atual: novaObraId,
    status: "disponivel",
  });
}

// ─────────────────────────────────────────────
//  HISTÓRICO / LOGS
// ─────────────────────────────────────────────

/** Lista todas as trocas de pneu de uma obra */
export async function listarTrocas(obraId, maximo = 500) {
  // Limita a 500 registros por padrão — evita travamento em obras antigas
  const q = query(
    collection(db, "obras", obraId, "trocas"),
    orderBy("data", "desc"),
    fsLimit(maximo)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Lista o log de alterações de uma obra */
export async function listarLogs(obraId) {
  const q = query(
    collection(db, "obras", obraId, "logs"),
    orderBy("data", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────
//  RELATÓRIO COMPLETO DE UMA OBRA
// ─────────────────────────────────────────────

/**
 * Gera um objeto completo com todos os dados de uma obra para relatório.
 */
export async function gerarRelatorio(obraId) {
  const obra = await getObra(obraId);
  if (!obra) throw new Error("Obra não encontrada.");

  const caminhoes = await listarCaminhoes(obraId);
  const pneus = await listarPneusDaObra(obraId);
  const trocas = await listarTrocas(obraId);
  const logs = await listarLogs(obraId);

  // Calcula tempo em aberto
  let tempoEmAberto = null;
  if (obra.data_criacao && obra.data_finalizacao) {
    const inicio = obra.data_criacao.toDate();
    const fim = obra.data_finalizacao.toDate();
    const diffMs = fim - inicio;
    const dias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    tempoEmAberto = `${dias} dia(s) e ${horas} hora(s)`;
  }

  return {
    obra,
    caminhoes,
    pneus,
    trocas,
    logs,
    tempoEmAberto,
    totalCaminhoes: caminhoes.length,
    totalPneus: pneus.length,
    totalTrocas: trocas.length,
  };
}

// ─────────────────────────────────────────────
//  Exports de instâncias (caso precise direto)
// ─────────────────────────────────────────────

export { auth, db };