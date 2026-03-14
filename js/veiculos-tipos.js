// ============================================================
//  js/veiculos-tipos.js — Tipos de veículos e posições de pneus
//  Usado na nova-obra, obra e no diagrama visual futuro
// ============================================================

/**
 * Gera posições de eixo padrão
 * @param {number} eixo
 * @param {'simples'|'duplo'} tipo
 */
function posEixoSimples(eixo) {
  return [
    { id: `E${eixo}-ESQ`,     eixo, lado: 'esquerdo', posicao: null,      tipo: 'simples', label: `Eixo ${eixo} — Esquerdo` },
    { id: `E${eixo}-DIR`,     eixo, lado: 'direito',  posicao: null,      tipo: 'simples', label: `Eixo ${eixo} — Direito`  },
  ];
}

function posEixoDuplo(eixo) {
  return [
    { id: `E${eixo}-ESQ-EXT`, eixo, lado: 'esquerdo', posicao: 'externo', tipo: 'duplo', label: `Eixo ${eixo} — Esq Externo` },
    { id: `E${eixo}-ESQ-INT`, eixo, lado: 'esquerdo', posicao: 'interno', tipo: 'duplo', label: `Eixo ${eixo} — Esq Interno` },
    { id: `E${eixo}-DIR-INT`, eixo, lado: 'direito',  posicao: 'interno', tipo: 'duplo', label: `Eixo ${eixo} — Dir Interno` },
    { id: `E${eixo}-DIR-EXT`, eixo, lado: 'direito',  posicao: 'externo', tipo: 'duplo', label: `Eixo ${eixo} — Dir Externo` },
  ];
}

// ─────────────────────────────────────────────
//  TIPOS DE VEÍCULOS
// ─────────────────────────────────────────────

export const TIPOS_VEICULO = [
  // ── Caminhão Basculante ─────────────────────
  {
    id:        'CB-01',
    nome:      'Caminhão Basculante',
    tag:       'CB',
    qtd_pneus: 10,
    descricao: '2 dianteiros simples + 4 traseiros duplos (eixo 2) + 4 traseiros duplos (eixo 3)',
    posicoes: [
      ...posEixoSimples(1),   // 2 — dianteiro
      ...posEixoDuplo(2),     // 4 — traseiro 1
      ...posEixoDuplo(3),     // 4 — traseiro 2
    ],
  },

  // ── Caminhão Cavalo ─────────────────────────
  {
    id:        'CV-01',
    nome:      'Caminhão Cavalo',
    tag:       'CV',
    qtd_pneus: 10,
    descricao: '2 dianteiros simples + 4 traseiros duplos (eixo 2) + 4 traseiros duplos (eixo 3)',
    posicoes: [
      ...posEixoSimples(1),
      ...posEixoDuplo(2),
      ...posEixoDuplo(3),
    ],
  },

  // ── Pá Carregadeira ─────────────────────────
  {
    id:        'PC-01',
    nome:      'Pá Carregadeira',
    tag:       'PC',
    qtd_pneus: 4,
    descricao: '2 dianteiros simples + 2 traseiros simples',
    posicoes: [
      ...posEixoSimples(1),
      ...posEixoSimples(2),
    ],
  },

  // ── Moto Niveladora ─────────────────────────
  {
    id:        'MN-01',
    nome:      'Moto Niveladora',
    tag:       'MN',
    qtd_pneus: 6,
    descricao: '3 eixos simples — 2 pneus por eixo',
    posicoes: [
      ...posEixoSimples(1),
      ...posEixoSimples(2),
      ...posEixoSimples(3),
    ],
  },

  // ── Rolo Compactador ────────────────────────
  {
    id:        'RC-01',
    nome:      'Rolo Compactador',
    tag:       'RC',
    qtd_pneus: 2,
    descricao: '2 pneus traseiros simples (frente = rolo, sem pneu)',
    posicoes: [
      ...posEixoSimples(2), // eixo 2 = traseiro (eixo 1 é o rolo)
    ],
  },

  // ── Reboque Prancha 3 Eixos ─────────────────
  {
    id:        'RBP-03',
    nome:      'Reboque Prancha 3 Eixos',
    tag:       'RBP',
    qtd_pneus: 12,
    descricao: '3 eixos duplos — 4 pneus por eixo (6 cada lado)',
    posicoes: [
      ...posEixoDuplo(1),
      ...posEixoDuplo(2),
      ...posEixoDuplo(3),
    ],
  },

  // ── Reboque Prancha 4 Eixos ─────────────────
  {
    id:        'RBP-04',
    nome:      'Reboque Prancha 4 Eixos',
    tag:       'RBP',
    qtd_pneus: 16,
    descricao: '4 eixos duplos — 4 pneus por eixo (8 cada lado)',
    posicoes: [
      ...posEixoDuplo(1),
      ...posEixoDuplo(2),
      ...posEixoDuplo(3),
      ...posEixoDuplo(4),
    ],
  },

  // ── Reboque Bitrem (1 carreta) ──────────────
  {
    id:           'RBB-01',
    nome:         'Reboque Bitrem — 1 Carreta',
    tag:          'SRB',
    qtd_pneus:    8,
    descricao:    '1 carreta — 2 eixos duplos (4 pneus por eixo)',
    opcao_bitrem: '1_carreta',
    posicoes: [
      ...posEixoDuplo(1),
      ...posEixoDuplo(2),
    ],
  },

  // ── Reboque Bitrem (2 carretas) ─────────────
  {
    id:           'RBB-02',
    nome:         'Reboque Bitrem — 2 Carretas',
    tag:          'SRB',
    qtd_pneus:    16,
    descricao:    '2 carretas — 4 eixos duplos (4 pneus por eixo)',
    opcao_bitrem: '2_carretas',
    posicoes: [
      ...posEixoDuplo(1),  // carreta 1
      ...posEixoDuplo(2),
      ...posEixoDuplo(3),  // carreta 2
      ...posEixoDuplo(4),
    ],
  },

  // ── Ônibus ──────────────────────────────────
  {
    id:        'ONS-01',
    nome:      'Ônibus',
    tag:       'ONS',
    qtd_pneus: 6,
    descricao: '2 dianteiros simples + 4 traseiros duplos',
    posicoes: [
      ...posEixoSimples(1),  // 2 — dianteiro
      ...posEixoDuplo(2),    // 4 — traseiro duplo
    ],
  },
];

/**
 * Retorna um tipo de veículo pelo ID
 * @param {string} id
 */
export function getTipoVeiculo(id) {
  return TIPOS_VEICULO.find(t => t.id === id) || null;
}

/**
 * Retorna o total de pneus de um tipo
 * @param {string} id
 */
export function getQtdPneus(id) {
  return getTipoVeiculo(id)?.qtd_pneus ?? 0;
}