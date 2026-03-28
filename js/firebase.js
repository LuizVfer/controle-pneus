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

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

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

// Helper interno: remove obraId de todos os veículos vinculados
async function _removerObraAtivaDosVeiculos(obraId) {
  const camsSnap = await getDocs(collection(db, "obras", obraId, "caminhoes"));
  const frotaIds = [...new Set(
    camsSnap.docs.map(d => d.data().frota_veiculo_id).filter(Boolean)
  )];
  await Promise.all(frotaIds.map(async veiculoId => {
    const vSnap = await getDoc(doc(db, "veiculos", veiculoId));
    if (!vSnap.exists()) return;
    const atual = (vSnap.data().obras_ativas || []).filter(o => o.id !== obraId);
    await updateDoc(doc(db, "veiculos", veiculoId), { obras_ativas: atual });
  }));
}

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

  await _removerObraAtivaDosVeiculos(obraId);
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

  await _removerObraAtivaDosVeiculos(obraId);
}

// ─────────────────────────────────────────────
//  CAMINHÕES
// ─────────────────────────────────────────────

/** Adiciona um caminhão a uma obra */
export async function adicionarCaminhao(obraId, dados) {
  const ref = await addDoc(collection(db, "obras", obraId, "caminhoes"), {
    ...dados,
    pneus_ids: [],
    criado_em: serverTimestamp(),
  });

  // Se veio da frota, registra a obra no veículo
  if (dados.frota_veiculo_id) {
    const obraSnap = await getDoc(doc(db, "obras", obraId));
    const obraNome = obraSnap.exists() ? obraSnap.data().nome : "";
    await updateDoc(doc(db, "veiculos", dados.frota_veiculo_id), {
      obras_ativas: arrayUnion({ id: obraId, nome: obraNome }),
    }).catch(() => {});
  }

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
  const camRef  = doc(db, "obras", obraId, "caminhoes", caminhaoId);
  const camSnap = await getDoc(camRef);
  if (camSnap.exists()) {
    const cam = camSnap.data();

    // Remove obra_ativa do veículo da frota — pneus NÃO são tocados,
    // pois continuam em uso no veículo mesmo fora desta obra
    if (cam.frota_veiculo_id) {
      const vRef  = doc(db, "veiculos", cam.frota_veiculo_id);
      const vSnap = await getDoc(vRef);
      if (vSnap.exists()) {
        const obrasAtivas = (vSnap.data().obras_ativas || []).filter(o => o.id !== obraId);
        await updateDoc(vRef, { obras_ativas: obrasAtivas });
      }
    }
  }
  await deleteDoc(camRef);
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

  // Registra no histórico da obra
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

  // ── Sync frota: se o caminhão veio da frota, espelha a operação ──
  if (caminhao.frota_veiculo_id) {
    const frotaRef = doc(db, "veiculos", caminhao.frota_veiculo_id);
    const frotaSnap = await getDoc(frotaRef);
    if (frotaSnap.exists()) {
      await updateDoc(frotaRef, { pneus_ids: arrayUnion(pneuId) });
      await addDoc(collection(db, "veiculos", caminhao.frota_veiculo_id, "movimentacoes"), {
        veiculo_id: caminhao.frota_veiculo_id, veiculo_nome: frotaSnap.data().nome,
        pneu_saiu: null, pneu_saiu_numero: null,
        pneu_entrou: pneuId, pneu_entrou_numero: pneuNumero,
        data: serverTimestamp(), usuario_id: usuarioId, usuario_nome: usuarioNome,
        origem: "obra", obra_nome: obraNome,
      });
    }
  }
  await gravarHistoricoPneu(pneuId, {
    tipo:          "atribuido_obra",
    usuario_id:    usuarioId,
    usuario_nome:  usuarioNome,
    obra_id:       obraId,
    obra_nome:     obraNome,
    caminhao_id:   caminhaoId,
    caminhao_nome: caminhao.nome,
    caminhao_tipo: caminhao.tipo_veiculo_tag || null,
    caminhao_placa:caminhao.placa            || null,
    foi_pneu_saiu: false,
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

  // Registra no histórico da obra
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

  // ── Sync frota ──
  if (caminhao.frota_veiculo_id) {
    const frotaRef = doc(db, "veiculos", caminhao.frota_veiculo_id);
    const frotaSnap = await getDoc(frotaRef);
    if (frotaSnap.exists()) {
      // Remove de pneus_ids E limpa posicoes da frota
      const frotaPosClear = (frotaSnap.data().posicoes || []).map(p =>
        p.pneu_id === pneuId ? { ...p, pneu_id: null, pneu_numero: null } : p
      );
      await updateDoc(frotaRef, {
        pneus_ids: arrayRemove(pneuId),
        posicoes:  frotaPosClear,
      });
      const obraSnap = await getDoc(doc(db, "obras", obraId));
      const obraNome = obraSnap.exists() ? obraSnap.data().nome : "";
      await addDoc(collection(db, "veiculos", caminhao.frota_veiculo_id, "movimentacoes"), {
        veiculo_id: caminhao.frota_veiculo_id, veiculo_nome: frotaSnap.data().nome,
        pneu_saiu: pneuId, pneu_saiu_numero: pneuNumero,
        pneu_entrou: null, pneu_entrou_numero: null,
        data: serverTimestamp(), usuario_id: usuarioId, usuario_nome: usuarioNome,
        origem: "obra", obra_nome: obraNome,
      });
    }
  }
  await gravarHistoricoPneu(pneuId, {
    tipo:          "removido_obra",
    usuario_id:    usuarioId,
    usuario_nome:  usuarioNome,
    obra_id:       obraId,
    obra_nome:     obraNome,
    caminhao_id:   caminhaoId,
    caminhao_nome: caminhao.nome,
    caminhao_tipo: caminhao.tipo_veiculo_tag || null,
    caminhao_placa:caminhao.placa            || null,
    foi_pneu_saiu: true,
  });
}

/**
 * Troca um pneu por outro na mesma posição do caminhão.
 * Grava UM ÚNICO registro no histórico com pneu_saiu + pneu_entrou.
 */
export async function trocarPneuNoCaminhao(
  obraId, caminhaoId,
  pneuSaiuId, pneuSaiuNumero,
  pneuEntrouId, pneuEntrouNumero,
  usuarioId, usuarioNome
) {
  const caminhaoRef  = doc(db, "obras", obraId, "caminhoes", caminhaoId);
  const caminhaoSnap = await getDoc(caminhaoRef);
  const caminhao     = caminhaoSnap.data();

  const obraSnap = await getDoc(doc(db, "obras", obraId));
  const obraNome = obraSnap.exists() ? obraSnap.data().nome : "";

  // 1. Registro ÚNICO de troca no histórico
  await addDoc(collection(db, "obras", obraId, "trocas"), {
    caminhao_id:        caminhaoId,
    caminhao_nome:      caminhao.nome,
    pneu_saiu:          pneuSaiuId,
    pneu_saiu_numero:   pneuSaiuNumero,
    pneu_entrou:        pneuEntrouId,
    pneu_entrou_numero: pneuEntrouNumero,
    data:               serverTimestamp(),
    usuario_id:         usuarioId,
    usuario_nome:       usuarioNome,
  });

  // 2. Atualiza array do caminhão
  await updateDoc(caminhaoRef, {
    pneus_ids: arrayRemove(pneuSaiuId),
  });
  await updateDoc(caminhaoRef, {
    pneus_ids: arrayUnion(pneuEntrouId),
  });

  // 3. Libera pneu que saiu
  await updateDoc(doc(db, "pneus", pneuSaiuId), {
    status:        "disponivel",
    caminhao_id:   null,
    caminhao_nome: null,
    // obra_id_atual permanece — pneu ainda pertence à obra
  });

  // 4. Marca pneu que entrou como em uso
  await updateDoc(doc(db, "pneus", pneuEntrouId), {
    status:        "em_uso",
    obra_id_atual: obraId,
    obra_nome:     obraNome,
    caminhao_id:   caminhaoId,
    caminhao_nome: caminhao.nome,
  });

  // ── Sync frota ──
  if (caminhao.frota_veiculo_id) {
    const frotaRef = doc(db, "veiculos", caminhao.frota_veiculo_id);
    const frotaSnap = await getDoc(frotaRef);
    if (frotaSnap.exists()) {
      await updateDoc(frotaRef, { pneus_ids: arrayRemove(pneuSaiuId) });
      await updateDoc(frotaRef, { pneus_ids: arrayUnion(pneuEntrouId) });
      await addDoc(collection(db, "veiculos", caminhao.frota_veiculo_id, "movimentacoes"), {
        veiculo_id: caminhao.frota_veiculo_id, veiculo_nome: frotaSnap.data().nome,
        pneu_saiu: pneuSaiuId, pneu_saiu_numero: pneuSaiuNumero,
        pneu_entrou: pneuEntrouId, pneu_entrou_numero: pneuEntrouNumero,
        data: serverTimestamp(), usuario_id: usuarioId, usuario_nome: usuarioNome,
        origem: "obra", obra_nome: obraNome,
      });
    }
  }
  await gravarHistoricoPneu(pneuSaiuId, {
    tipo:          "trocado_obra",
    usuario_id:    usuarioId,
    usuario_nome:  usuarioNome,
    obra_id:       obraId,
    obra_nome:     obraNome,
    caminhao_id:   caminhaoId,
    caminhao_nome: caminhao.nome,
    caminhao_tipo: caminhao.tipo_veiculo_tag || null,
    caminhao_placa:caminhao.placa            || null,
    foi_pneu_saiu: true,
  });

  await gravarHistoricoPneu(pneuEntrouId, {
    tipo:          "trocado_obra",
    usuario_id:    usuarioId,
    usuario_nome:  usuarioNome,
    obra_id:       obraId,
    obra_nome:     obraNome,
    caminhao_id:   caminhaoId,
    caminhao_nome: caminhao.nome,
    caminhao_tipo: caminhao.tipo_veiculo_tag || null,
    caminhao_placa:caminhao.placa            || null,
    foi_pneu_saiu: false,
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
  const ano = String(new Date().getFullYear()).slice(-2);
  return `ALS ${ano}-${String(novoNum).padStart(4, "0")}`;
}

export async function adicionarPneuEstoque(estoqueId = null, estoqueNome = null, marcaId = null, marcaNome = null, usuarioId = null, usuarioNome = null) {
  const numero = await _proximoNumeroPneu();
  const ref = await addDoc(collection(db, "pneus"), {
    numero_identificacao:  numero,
    status:                "disponivel",
    condicao:              "novo",
    marca_id:              marcaId,
    marca_nome:            marcaNome,
    obra_id_atual:         null,
    caminhao_id:           null,
    motivo_inutilizacao:   null,
    data_inutilizacao:     null,
    estoque_id:            estoqueId,
    estoque_nome:          estoqueNome,
    criado_em:             serverTimestamp(),
  });
  await gravarHistoricoPneu(ref.id, {
    tipo:         "criado",
    usuario_id:   usuarioId   ?? null,
    usuario_nome: usuarioNome ?? null,
    estoque_id:   estoqueId,
    estoque_nome: estoqueNome || "Campo Grande",
    marca_nova:   marcaNome,
  });
  return { id: ref.id, numero_identificacao: numero };
}

export async function adicionarPneusEmLote(quantidade, estoqueId = null, estoqueNome = null, marcaId = null, marcaNome = null, usuarioId = null, usuarioNome = null) {
  const resultados = [];
  for (let i = 0; i < quantidade; i++) {
    resultados.push(await adicionarPneuEstoque(estoqueId, estoqueNome, marcaId, marcaNome, usuarioId, usuarioNome));
  }
  return resultados;
}

export async function atualizarMarcaPneu(pneuId, marcaId, marcaNome, usuarioId = null, usuarioNome = null, marcaAnteriorNome = null) {
  await updateDoc(doc(db, "pneus", pneuId), { marca_id: marcaId, marca_nome: marcaNome });
}

export async function atualizarCondicaoPneu(pneuId, condicao, usuarioId = null, usuarioNome = null, condicaoAnterior = null) {
  await updateDoc(doc(db, "pneus", pneuId), { condicao });
  await gravarHistoricoPneu(pneuId, {
    tipo:              "condicao_alterada",
    usuario_id:        usuarioId,
    usuario_nome:      usuarioNome,
    condicao_anterior: condicaoAnterior,
    condicao_nova:     condicao,
  });
  await gravarHistoricoPneu(pneuId, {
    tipo:           "marca_alterada",
    usuario_id:     usuarioId,
    usuario_nome:   usuarioNome,
    marca_anterior: marcaAnteriorNome,
    marca_nova:     marcaNome,
  });
}


// ─────────────────────────────────────────────
//  ESTOQUES POR CIDADE
// ─────────────────────────────────────────────

/** Lista todos os estoques */
export async function listarEstoques() {
  const snap = await getDocs(collection(db, "estoques"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** Cria um novo estoque de cidade */
export async function criarEstoque(nome, usuarioId, usuarioNome) {
  const ref = await addDoc(collection(db, "estoques"), {
    nome,
    criado_em:       serverTimestamp(),
    criado_por:      usuarioId,
    criado_por_nome: usuarioNome,
  });
  return ref.id;
}

/** Deleta um estoque (só se não tiver pneus) */
export async function deletarEstoque(estoqueId) {
  const snap = await getDocs(
    query(collection(db, "pneus"), where("estoque_id", "==", estoqueId))
  );
  if (!snap.empty) throw new Error("Estoque possui pneus — remova-os antes de deletar.");
  await deleteDoc(doc(db, "estoques", estoqueId));
}

/** Transfere um pneu de um estoque para outro */
export async function transferirPneuEstoque(pneuId, novoEstoqueId, novoEstoqueNome, usuarioId = null, usuarioNome = null, estoqueOrigemId = null, estoqueOrigemNome = null) {
  await updateDoc(doc(db, "pneus", pneuId), {
    estoque_id:   novoEstoqueId,
    estoque_nome: novoEstoqueNome,
  });
  await gravarHistoricoPneu(pneuId, {
    tipo:            "transferido",
    usuario_id:      usuarioId,
    usuario_nome:    usuarioNome,
    estoque_origem:  estoqueOrigemNome || "Campo Grande",
    estoque_destino: novoEstoqueNome   || "Campo Grande",
    estoque_id:      novoEstoqueId,
    estoque_nome:    novoEstoqueNome,
  });
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

  if (pneu.status === "em_uso" && pneu.caminhao_id) {

    if (pneu.obra_id_atual) {
      // ── Caso 1: pneu está num caminhão de OBRA ────────────────────
      const camRef   = doc(db, "obras", pneu.obra_id_atual, "caminhoes", pneu.caminhao_id);
      const camSnap  = await getDoc(camRef);
      const caminhao = camSnap.data();

      // Remove de pneus_ids e limpa posicoes[]
      await updateDoc(camRef, { pneus_ids: arrayRemove(pneuId) });
      const posicoesClear = (caminhao.posicoes || []).map(p =>
        p.pneu_id === pneuId ? { ...p, pneu_id: null, pneu_numero: null } : p
      );
      await updateDoc(camRef, { posicoes: posicoesClear });

      // Registra no histórico da obra
      await addDoc(collection(db, "obras", pneu.obra_id_atual, "trocas"), {
        caminhao_id:        pneu.caminhao_id,
        caminhao_nome:      caminhao.nome || "",
        pneu_saiu:          pneuId,
        pneu_saiu_numero:   pneu.numero_identificacao,
        pneu_entrou:        null,
        pneu_entrou_numero: null,
        motivo_saida:       `Inutilizado: ${motivo}`,
        data:               serverTimestamp(),
        usuario_id:         usuarioId,
        usuario_nome:       usuarioNome,
      });

      // Sync frota (se o caminhão da obra veio da frota)
      if (caminhao.frota_veiculo_id) {
        const frotaRef  = doc(db, "veiculos", caminhao.frota_veiculo_id);
        const frotaSnap = await getDoc(frotaRef);
        if (frotaSnap.exists()) {
          const frotaPosClear = (frotaSnap.data().posicoes || []).map(p =>
            p.pneu_id === pneuId ? { ...p, pneu_id: null, pneu_numero: null } : p
          );
          await updateDoc(frotaRef, {
            pneus_ids: arrayRemove(pneuId),
            posicoes:  frotaPosClear,
          });
          const obraSnap = await getDoc(doc(db, "obras", pneu.obra_id_atual));
          const obraNome = obraSnap.exists() ? obraSnap.data().nome : "";
          await addDoc(collection(db, "veiculos", caminhao.frota_veiculo_id, "movimentacoes"), {
            veiculo_id:         caminhao.frota_veiculo_id,
            veiculo_nome:       frotaSnap.data().nome,
            pneu_saiu:          pneuId,
            pneu_saiu_numero:   pneu.numero_identificacao,
            pneu_entrou:        null,
            pneu_entrou_numero: null,
            data:               serverTimestamp(),
            usuario_id:         usuarioId,
            usuario_nome:       usuarioNome,
            origem:             "inutilizacao",
            obra_nome:          obraNome,
          });
        }
      }

    } else {
      // ── Caso 2: pneu está num veículo da FROTA (obra_id_atual = null) ──
      const frotaRef  = doc(db, "veiculos", pneu.caminhao_id);
      const frotaSnap = await getDoc(frotaRef);
      if (frotaSnap.exists()) {
        const frotaPosClear = (frotaSnap.data().posicoes || []).map(p =>
          p.pneu_id === pneuId ? { ...p, pneu_id: null, pneu_numero: null } : p
        );
        await updateDoc(frotaRef, {
          pneus_ids: arrayRemove(pneuId),
          posicoes:  frotaPosClear,
        });
        await addDoc(collection(db, "veiculos", pneu.caminhao_id, "movimentacoes"), {
          veiculo_id:         pneu.caminhao_id,
          veiculo_nome:       frotaSnap.data().nome,
          pneu_saiu:          pneuId,
          pneu_saiu_numero:   pneu.numero_identificacao,
          pneu_entrou:        null,
          pneu_entrou_numero: null,
          motivo_saida:       `Inutilizado: ${motivo}`,
          data:               serverTimestamp(),
          usuario_id:         usuarioId,
          usuario_nome:       usuarioNome,
          origem:             "inutilizacao",
        });
      }

      // Propaga para os caminhões de obras abertas vinculadas a esta frota
      const obrasSnap = await getDocs(
        query(collection(db, "obras"), where("status", "==", "aberta"))
      );
      for (const obraDoc of obrasSnap.docs) {
        const camsSnap = await getDocs(
          query(
            collection(db, "obras", obraDoc.id, "caminhoes"),
            where("frota_veiculo_id", "==", pneu.caminhao_id)
          )
        );
        for (const camDoc of camsSnap.docs) {
          const camPosClear = (camDoc.data().posicoes || []).map(p =>
            p.pneu_id === pneuId ? { ...p, pneu_id: null, pneu_numero: null } : p
          );
          await updateDoc(camDoc.ref, {
            pneus_ids: arrayRemove(pneuId),
            posicoes:  camPosClear,
          });
          // Registra no histórico da obra
          await addDoc(collection(db, "obras", obraDoc.id, "trocas"), {
            caminhao_id:        camDoc.id,
            caminhao_nome:      camDoc.data().nome || "",
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
      }
    }
  }

  // Atualiza o status do pneu
  await updateDoc(pneuRef, {
    status:              "inutilizavel",
    motivo_inutilizacao: motivo,
    data_inutilizacao:   serverTimestamp(),
    obra_id_atual:       null,
    caminhao_id:         null,
    caminhao_nome:       null,
  });

  await gravarHistoricoPneu(pneuId, {
    tipo:          "inutilizado",
    usuario_id:    usuarioId,
    usuario_nome:  usuarioNome,
    motivo:        motivo,
    obra_id:       pneu.obra_id_atual || null,
    obra_nome:     pneu.obra_nome     || null,
    caminhao_id:   pneu.caminhao_id   || null,
    caminhao_nome: pneu.caminhao_nome || null,
    estoque_id:    pneu.estoque_id    || null,
    estoque_nome:  pneu.estoque_nome  || null,
  });
}

export async function reativarPneu(pneuId, usuarioId = null, usuarioNome = null) {
  await updateDoc(doc(db, "pneus", pneuId), {
    status:              "disponivel",
    motivo_inutilizacao: null,
    data_inutilizacao:   null,
  });
  await gravarHistoricoPneu(pneuId, {
    tipo:         "reativado",
    usuario_id:   usuarioId,
    usuario_nome: usuarioNome,
  });
}

/** Envia um pneu para recapagem (disponivel ou inutilizavel → em_recapagem) */
export async function enviarParaRecapagem(pneuId, usuarioId = null, usuarioNome = null) {
  await updateDoc(doc(db, "pneus", pneuId), {
    status:               "em_recapagem",
    data_envio_recapagem: serverTimestamp(),
    // limpa campos de inutilização caso venha desse status
    motivo_inutilizacao:  null,
    data_inutilizacao:    null,
  });
  await gravarHistoricoPneu(pneuId, {
    tipo:         "enviado_recapagem",
    usuario_id:   usuarioId,
    usuario_nome: usuarioNome,
  });
}

/** Marca que o pneu voltou da recapagem (em_recapagem → disponivel) */
export async function receberDeRecapagem(pneuId, usuarioId = null, usuarioNome = null) {
  const pneuRef  = doc(db, "pneus", pneuId);
  const pneuSnap = await getDoc(pneuRef);
  const pneu     = pneuSnap.data();
  await updateDoc(pneuRef, {
    status:                "disponivel",
    recapado:              true,
    qtd_recapagens:        (pneu.qtd_recapagens || 0) + 1,
    data_ultima_recapagem: serverTimestamp(),
    data_envio_recapagem:  null,
  });
  await gravarHistoricoPneu(pneuId, {
    tipo:           "retornou_recapagem",
    usuario_id:     usuarioId,
    usuario_nome:   usuarioNome,
    qtd_recapagens: (pneu.qtd_recapagens || 0) + 1,
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
//  FROTA — Veículos da empresa  /veiculos/{id}
// ─────────────────────────────────────────────

/**
 * Sincroniza pneus_ids e posicoes de um caminhão de obra com o veículo da frota.
 * Chamada ao abrir obra.html para garantir que pneus adicionados via frota apareçam.
 */
export async function sincronizarCaminhaoComFrota(obraId, caminhaoId) {
  const camRef  = doc(db, "obras", obraId, "caminhoes", caminhaoId);
  const camSnap = await getDoc(camRef);
  if (!camSnap.exists()) return;
  const cam = camSnap.data();
  if (!cam.frota_veiculo_id) return;

  const frotaRef  = doc(db, "veiculos", cam.frota_veiculo_id);
  const frotaSnap = await getDoc(frotaRef);
  if (!frotaSnap.exists()) return;
  const frota = frotaSnap.data();

  // Busca status de todos os pneus do union para filtrar inválidos
  const camPneus   = new Set(cam.pneus_ids   || []);
  const frotaPneus = new Set(frota.pneus_ids || []);
  const todosIds   = [...new Set([...camPneus, ...frotaPneus])];

  // Filtra pneus que não podem estar em uso (inutilizavel, em_recapagem)
  const statusValidos = new Set();
  await Promise.all(todosIds.map(async (id) => {
    const pSnap = await getDoc(doc(db, "pneus", id));
    if (pSnap.exists()) {
      const status = pSnap.data().status;
      if (status !== "inutilizavel" && status !== "em_recapagem") {
        statusValidos.add(id);
      }
    }
  }));

  const unidos = [...statusValidos];

  // Mescla posicoes: frota é a fonte de verdade, mas só para pneus válidos
  const camPosicoes   = cam.posicoes   || [];
  const frotaPosicoes = frota.posicoes || [];
  const posicoesMerge = camPosicoes.map(cp => {
    const fp = frotaPosicoes.find(p => p.id === cp.id);
    if (!fp) return cp;
    // Limpa posição se o pneu não é mais válido
    if (fp.pneu_id && !statusValidos.has(fp.pneu_id)) {
      return { ...cp, pneu_id: null, pneu_numero: null };
    }
    // Se a frota tem pneu válido na posição e o caminhão não, copia da frota
    if (fp.pneu_id && !cp.pneu_id) return { ...cp, pneu_id: fp.pneu_id, pneu_numero: fp.pneu_numero };
    // Se o caminhão tem pneu e a frota não, mantém o caminhão
    return cp;
  });

  await updateDoc(camRef,   { pneus_ids: unidos, posicoes: posicoesMerge });
  await updateDoc(frotaRef, { pneus_ids: unidos, posicoes: posicoesMerge });

  // Garante que pneus que vieram da frota (obra_id_atual=null) tenham status em_uso
  const pneusNovos = [...frotaPneus].filter(id => !camPneus.has(id) && statusValidos.has(id));
  for (const pneuId of pneusNovos) {
    const pSnap = await getDoc(doc(db, "pneus", pneuId));
    if (pSnap.exists() && pSnap.data().status === "disponivel") {
      const obraSnap = await getDoc(doc(db, "obras", obraId));
      const obraNome = obraSnap.exists() ? obraSnap.data().nome : "";
      await updateDoc(doc(db, "pneus", pneuId), {
        status:        "em_uso",
        caminhao_id:   caminhaoId,
        caminhao_nome: cam.nome,
        obra_id_atual: obraId,
        obra_nome:     obraNome,
      });
    }
  }
}

export async function criarVeiculoFrota(dados) {
  const ref = await addDoc(collection(db, "veiculos"), {
    ...dados, criado_em: serverTimestamp(),
  });
  return ref.id;
}

export async function listarVeiculosFrota() {
  const snap = await getDocs(
    query(collection(db, "veiculos"), orderBy("criado_em", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getVeiculoFrota(veiculoId) {
  const snap = await getDoc(doc(db, "veiculos", veiculoId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

export async function atualizarVeiculoFrota(veiculoId, dados) {
  await updateDoc(doc(db, "veiculos", veiculoId), dados);
}

export async function deletarVeiculoFrota(veiculoId) {
  const vSnap = await getDoc(doc(db, "veiculos", veiculoId));
  if (vSnap.exists()) {
    // Libera todos os pneus do veículo
    for (const pneuId of (vSnap.data().pneus_ids || [])) {
      await updateDoc(doc(db, "pneus", pneuId), {
        status: "disponivel", caminhao_id: null, caminhao_nome: null,
        obra_id_atual: null, obra_nome: null,
      });
    }
    // Limpa posicoes nos caminhoes de obras abertas vinculados
    const obrasSnap = await getDocs(query(collection(db, "obras"), where("status", "==", "aberta")));
    for (const obraDoc of obrasSnap.docs) {
      const camsSnap = await getDocs(
        query(collection(db, "obras", obraDoc.id, "caminhoes"),
              where("frota_veiculo_id", "==", veiculoId))
      );
      for (const camDoc of camsSnap.docs) {
        const camPosLimpas = (camDoc.data().posicoes || []).map(p =>
          ({ ...p, pneu_id: null, pneu_numero: null })
        );
        await updateDoc(camDoc.ref, { pneus_ids: [], posicoes: camPosLimpas });
      }
    }
  }
  await deleteDoc(doc(db, "veiculos", veiculoId));
}

export async function adicionarPneuAoVeiculoFrota(veiculoId, pneuId, pneuNumero, usuarioId, usuarioNome) {
  const vRef  = doc(db, "veiculos", veiculoId);
  const vSnap = await getDoc(vRef);
  const v     = vSnap.data();
  await addDoc(collection(db, "veiculos", veiculoId, "movimentacoes"), {
    veiculo_id: veiculoId, veiculo_nome: v.nome,
    pneu_saiu: null, pneu_saiu_numero: null,
    pneu_entrou: pneuId, pneu_entrou_numero: pneuNumero,
    data: serverTimestamp(), usuario_id: usuarioId, usuario_nome: usuarioNome,
  });
  await updateDoc(vRef, { pneus_ids: arrayUnion(pneuId) });
  await updateDoc(doc(db, "pneus", pneuId), {
    status: "em_uso", caminhao_id: veiculoId, caminhao_nome: v.nome,
    obra_id_atual: null, obra_nome: "Frota",
  });
  await gravarHistoricoPneu(pneuId, {
    tipo:          "atribuido_frota",
    usuario_id:    usuarioId,
    usuario_nome:  usuarioNome,
    caminhao_id:   veiculoId,
    caminhao_nome: v.nome,
    caminhao_tipo: v.tipo_veiculo_tag || null,
    caminhao_placa:v.placa            || null,
    foi_pneu_saiu: false,
  });
}

export async function removerPneuDoVeiculoFrota(veiculoId, pneuId, pneuNumero, usuarioId, usuarioNome) {
  const vRef  = doc(db, "veiculos", veiculoId);
  const vSnap = await getDoc(vRef);
  const v     = vSnap.data();

  // Limpa posicoes da frota
  const frotaPosClear = (v.posicoes || []).map(p =>
    p.pneu_id === pneuId ? { ...p, pneu_id: null, pneu_numero: null } : p
  );

  await addDoc(collection(db, "veiculos", veiculoId, "movimentacoes"), {
    veiculo_id: veiculoId, veiculo_nome: v.nome,
    pneu_saiu: pneuId, pneu_saiu_numero: pneuNumero,
    pneu_entrou: null, pneu_entrou_numero: null,
    data: serverTimestamp(), usuario_id: usuarioId, usuario_nome: usuarioNome,
  });
  await updateDoc(vRef, {
    pneus_ids: arrayRemove(pneuId),
    posicoes:  frotaPosClear,
  });
  await updateDoc(doc(db, "pneus", pneuId), {
    status: "disponivel", caminhao_id: null, caminhao_nome: null,
    obra_id_atual: null, obra_nome: null,
  });

  // Sync: limpa posicoes e pneus_ids nos caminhoes de obras vinculadas
  const obrasSnap = await getDocs(query(collection(db, "obras"), where("status", "==", "aberta")));
  for (const obraDoc of obrasSnap.docs) {
    const camsSnap = await getDocs(
      query(collection(db, "obras", obraDoc.id, "caminhoes"),
            where("frota_veiculo_id", "==", veiculoId))
    );
    for (const camDoc of camsSnap.docs) {
      const camPosicoes = (camDoc.data().posicoes || []).map(p =>
        p.pneu_id === pneuId ? { ...p, pneu_id: null, pneu_numero: null } : p
      );
      await updateDoc(camDoc.ref, {
        pneus_ids: arrayRemove(pneuId),
        posicoes:  camPosicoes,
      });
    }
  }
  await gravarHistoricoPneu(pneuId, {
    tipo:          "removido_frota",
    usuario_id:    usuarioId,
    usuario_nome:  usuarioNome,
    caminhao_id:   veiculoId,
    caminhao_nome: v.nome,
    caminhao_tipo: v.tipo_veiculo_tag || null,
    caminhao_placa:v.placa            || null,
    foi_pneu_saiu: true,
  });
}

export async function trocarPneuNoVeiculoFrota(
  veiculoId, pneuSaiuId, pneuSaiuNumero, pneuEntrouId, pneuEntrouNumero, usuarioId, usuarioNome
) {
  const vRef  = doc(db, "veiculos", veiculoId);
  const vSnap = await getDoc(vRef);
  const v     = vSnap.data();
  await addDoc(collection(db, "veiculos", veiculoId, "movimentacoes"), {
    veiculo_id: veiculoId, veiculo_nome: v.nome,
    pneu_saiu: pneuSaiuId, pneu_saiu_numero: pneuSaiuNumero,
    pneu_entrou: pneuEntrouId, pneu_entrou_numero: pneuEntrouNumero,
    data: serverTimestamp(), usuario_id: usuarioId, usuario_nome: usuarioNome,
  });
  await updateDoc(vRef, { pneus_ids: arrayRemove(pneuSaiuId) });
  await updateDoc(vRef, { pneus_ids: arrayUnion(pneuEntrouId) });
  await updateDoc(doc(db, "pneus", pneuSaiuId), {
    status: "disponivel", caminhao_id: null, caminhao_nome: null, obra_id_atual: null, obra_nome: null,
  });
  await updateDoc(doc(db, "pneus", pneuEntrouId), {
    status: "em_uso", caminhao_id: veiculoId, caminhao_nome: v.nome, obra_id_atual: null, obra_nome: "Frota",
  });

  // Sync posicoes nas obras abertas vinculadas
  const obrasSnap2 = await getDocs(query(collection(db, "obras"), where("status", "==", "aberta")));
  for (const obraDoc of obrasSnap2.docs) {
    const camsSnap = await getDocs(
      query(collection(db, "obras", obraDoc.id, "caminhoes"),
            where("frota_veiculo_id", "==", veiculoId))
    );
    for (const camDoc of camsSnap.docs) {
      const camPos = (camDoc.data().posicoes || []).map(p => {
        if (p.pneu_id === pneuSaiuId) return { ...p, pneu_id: null, pneu_numero: null };
        return p;
      });
      await updateDoc(camDoc.ref, {
        pneus_ids: arrayRemove(pneuSaiuId),
        posicoes:  camPos,
      });
      await updateDoc(camDoc.ref, { pneus_ids: arrayUnion(pneuEntrouId) });
    }
  }
  await gravarHistoricoPneu(pneuSaiuId, {
    tipo:          "removido_frota",
    usuario_id:    usuarioId,
    usuario_nome:  usuarioNome,
    caminhao_id:   veiculoId,
    caminhao_nome: v.nome,
    caminhao_tipo: v.tipo_veiculo_tag || null,
    caminhao_placa:v.placa            || null,
    foi_pneu_saiu: true,
  });
  await gravarHistoricoPneu(pneuEntrouId, {
    tipo:          "atribuido_frota",
    usuario_id:    usuarioId,
    usuario_nome:  usuarioNome,
    caminhao_id:   veiculoId,
    caminhao_nome: v.nome,
    caminhao_tipo: v.tipo_veiculo_tag || null,
    caminhao_placa:v.placa            || null,
    foi_pneu_saiu: false,
  });
}

export async function atualizarPosicaoVeiculoFrota(veiculoId, posicaoId, dados) {
  const vRef  = doc(db, "veiculos", veiculoId);
  const vSnap = await getDoc(vRef);
  if (!vSnap.exists()) return;
  const novas = (vSnap.data().posicoes || []).map(p => p.id === posicaoId ? { ...p, ...dados } : p);
  await updateDoc(vRef, { posicoes: novas });
}

export async function listarMovimentacoesFrota(veiculoId) {
  const snap = await getDocs(
    query(collection(db, "veiculos", veiculoId, "movimentacoes"), orderBy("data", "desc"))
  );
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ─────────────────────────────────────────────
//  MARCAS DE PNEUS
// ─────────────────────────────────────────────

export async function listarMarcas() {
  const snap = await getDocs(collection(db, "marcas"));
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

export async function criarMarca(nome, usuarioId, usuarioNome) {
  const ref = await addDoc(collection(db, "marcas"), {
    nome:            nome.trim(),
    criado_em:       serverTimestamp(),
    criado_por:      usuarioId,
    criado_por_nome: usuarioNome,
  });
  return ref.id;
}

export async function editarMarca(marcaId, novoNome) {
  await updateDoc(doc(db, "marcas", marcaId), {
    nome:          novoNome.trim(),
    atualizado_em: serverTimestamp(),
  });
}

export async function deletarMarca(marcaId) {
  await deleteDoc(doc(db, "marcas", marcaId));
}

// ─────────────────────────────────────────────
//  Exports de instâncias (caso precise direto)
// ─────────────────────────────────────────────
export async function gravarHistoricoPneu(pneuId, evento) {
  await addDoc(collection(db, "pneus", pneuId, "historico"), {
    tipo:              evento.tipo              ?? null,
    usuario_id:        evento.usuario_id        ?? null,
    usuario_nome:      evento.usuario_nome      ?? null,
    obra_id:           evento.obra_id           ?? null,
    obra_nome:         evento.obra_nome         ?? null,
    caminhao_id:       evento.caminhao_id       ?? null,
    caminhao_nome:     evento.caminhao_nome     ?? null,
    caminhao_tipo:     evento.caminhao_tipo     ?? null,
    caminhao_placa:    evento.caminhao_placa    ?? null,
    posicao_label:     evento.posicao_label     ?? null,
    posicao_id:        evento.posicao_id        ?? null,
    foi_pneu_saiu:     evento.foi_pneu_saiu     ?? null,
    estoque_id:        evento.estoque_id        ?? null,
    estoque_nome:      evento.estoque_nome      ?? null,
    estoque_origem:    evento.estoque_origem    ?? null,
    estoque_destino:   evento.estoque_destino   ?? null,
    condicao_anterior: evento.condicao_anterior ?? null,
    condicao_nova:     evento.condicao_nova     ?? null,
    marca_anterior:    evento.marca_anterior    ?? null,
    marca_nova:        evento.marca_nova        ?? null,
    qtd_recapagens:    evento.qtd_recapagens    ?? null,
    motivo:            evento.motivo            ?? null,
    data:              serverTimestamp(),
  });
}

export async function listarHistoricoPneu(pneuId) {
  const q = query(
    collection(db, "pneus", pneuId, "historico"),
    orderBy("data", "desc")
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export { auth, db };