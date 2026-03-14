# 📋 Estado do Projeto — Controle de Pneus
> Cole este arquivo no início de uma nova conversa para retomar o desenvolvimento.

---

## Stack
HTML + CSS + JS puro + Firebase (Firestore + Auth). Sem frameworks.

## Firebase
```js
const firebaseConfig = {
  apiKey: "AIzaSyD8zs9a57gnNYI5tsACBzkE-Uk-_Bk1XJU",
  authDomain: "controle-de-pneus-79051.firebaseapp.com",
  projectId: "controle-de-pneus-79051",
  storageBucket: "controle-de-pneus-79051.firebasestorage.app",
  messagingSenderId: "682588647980",
  appId: "1:682588647980:web:3e6d58897745dc086f5789"
};
```

---

## Estrutura de Arquivos
```
controle-pneus/
├── html/
│   ├── login.html
│   ├── dashboard.html
│   ├── nova-obra.html
│   ├── obra.html          ← página principal de gerenciamento
│   ├── relatorios.html    ← relatórios por obra
│   ├── usuarios.html
│   └── estoque.html
├── css/
│   ├── theme.css
│   ├── login.css
│   ├── dashboard.css
│   ├── nova-obra.css
│   ├── obra.css
│   ├── relatorios.css
│   ├── usuarios.css
│   └── estoque.css
├── js/
│   ├── config.js           ← credenciais (no .gitignore)
│   ├── config.example.js
│   ├── firebase.js         ← todas as funções Firestore
│   ├── veiculos-tipos.js   ← tipos, posições de eixo
│   ├── theme.js
│   ├── login.js
│   ├── dashboard.js
│   ├── obra.js
│   ├── nova-obra.js
│   ├── estoque.js
│   ├── relatorios.js
│   └── usuarios.js
├── .gitignore
└── README.md
```

---

## Estrutura Firestore
```
/usuarios/{uid}
  nome, email, perfil (admin/comum), ativo, criado_em

/config/pneus_contador
  ultimo (int) — contador global de numeração

/pneus/{pneuId}
  numero_identificacao   → "ALS 26-0001"
  obra_id_atual, obra_nome
  caminhao_id, caminhao_nome
  status                 → 'disponivel' | 'em_uso' | 'inutilizavel'
  motivo_inutilizacao, data_inutilizacao, criado_em

/obras/{obraId}
  nome, status (aberta/finalizada/arquivada)
  data_criacao, data_finalizacao
  qtd_caminhoes, criado_por, criado_por_nome

  /caminhoes/{id}
    nome, placa
    tipo_veiculo_id, tipo_veiculo_nome, tipo_veiculo_tag
    qtd_pneus_tipo
    pneus_ids[]
    posicoes[]           → [{id, eixo, lado, posicao, tipo, label, pneu_id, pneu_numero}]

  /trocas/{id}           → histórico de movimentações
    caminhao_id, caminhao_nome
    pneu_saiu, pneu_saiu_numero
    pneu_entrou, pneu_entrou_numero
    data (timestamp), usuario_id, usuario_nome

  /logs/{id}             → imutável
```

---

## Numeração de Pneus
Formato: `ALS {ano2digitos}-{0001}`
- 2026 → `ALS 26-0001`
- Contador global no Firestore (`/config/pneus_contador`), não reinicia por ano
- `padStart(4)` — suporta além de 9999

---

## Tipos de Veículos (veiculos-tipos.js)
| ID | Nome | Tag | Pneus |
|---|---|---|---|
| CB-01 | Caminhão Basculante | CB-01 | 10 |
| CV-01 | Caminhão Cavalo | CV-01 | 10 |
| PC-01 | Pá Carregadeira | PC-01 | 4 |
| MN-01 | Moto Niveladora | MN-01 | 6 |
| RC-01 | Rolo Compactador | RC-01 | 2 |
| RBP-03 | Reboque Prancha 3 Eixos | RBP-01 | 12 |
| RBP-04 | Reboque Prancha 4 Eixos | RBP-01 | 16 |
| RBB-01 | Reboque Bitrem 1 Carreta | RBB-01 | 8 |
| RBB-02 | Reboque Bitrem 2 Carretas | RBB-01 | 16 |
| ONS-01 | Ônibus | ONS-01 | 6 |

---

## firebase.js — Funções principais
- `observarAuth(cb)` — listener de autenticação
- `getDadosUsuario(uid)` — busca perfil do usuário
- `listarObras()` — todas as obras
- `getObra(obraId)` — obra por id
- `atualizarObra(obraId, novo, antigo, uid, nome)` — atualiza + loga
- `finalizarObra(obraId)` — status → finalizada, libera pneus
- `arquivarObra(obraId)` — status → arquivada, libera pneus
- `listarCaminhoes(obraId)`
- `adicionarCaminhao(obraId, dados)` — dados inclui posicoes[]
- `deletarCaminhao(obraId, caminhaoId)`
- `listarPneusDaObra(obraId)`
- `listarPneusDisponiveis()`
- `adicionarPneuAoCaminhao(obraId, caminhaoId, pneuId, pneuNumero, uid, nome)`
  → grava histórico com pneu_saiu=null, pneu_entrou=pneuId
- `removerPneuDoCaminhao(obraId, caminhaoId, pneuId, pneuNumero, uid, nome)`
  → grava histórico com pneu_saiu=pneuId, pneu_entrou=null
- `trocarPneuNoCaminhao(obraId, caminhaoId, saiuId, saiuNum, entrouId, entrouNum, uid, nome)`
  → grava UM ÚNICO registro com pneu_saiu + pneu_entrou (evita 2 cards no histórico)
- `listarTrocas(obraId)` — histórico ordenado por data desc

---

## obra.js — Funcionalidades implementadas

### Diagrama de eixos (vista top-down)
- Gerado por `gerarDiagrama(caminhao)` usando `caminhao.posicoes[]`
- Rodas horizontais 52×36px, número legível horizontal
- **Roda vazia** → clique → `abrirModalAtribuirPosicao(cam, pos, false)`
- **Roda ocupada** → clique → `abrirModalOpcoesPosicao(cam, pos)`
  - Ver no estoque / Trocar pneu / Remover pneu
- Troca chama `trocarPneuNoCaminhao` (1 registro no histórico)
- Barra de progresso por veículo (ex: 3/10)

### Filtro de veículos
- Campo de busca por nome/placa
- Select de tipo (só tipos presentes na obra)
- Contador dinâmico "3 de 5"

### Histórico (aba)
- Cards individuais com stripe lateral colorida
  - Verde = adição, Vermelho = remoção, Dourado = troca
- Mostra tag do tipo do veículo (ex: `CB-01`) antes do nome
- Bloco SAIU → ENTROU com seta para trocas
- Tabs de filtro: Todos / Adições / Remoções / Trocas
- Busca por nº do pneu ou nome do veículo
- Paginação 20 por vez

### Posições (aba Pneus)
- Mostra posição exata: `↳ SCANIA 001 — Eixo 2 — Esq Externo`

---

## relatorios.js — Funcionalidades implementadas

### KPIs (9 métricas)
Veículos, Pneus na obra, Em uso, Disponíveis, Cobertura (%), Veículos completos, Adições, Trocas, Remoções

### Tabela de Veículos
- Tag do tipo (CB-01), nome + tipo do veículo
- Barra de cobertura visual por veículo (7/10)
- Chips dos pneus com tooltip da posição exata

### Inventário de pneus
- Card por pneu com status e posição exata no veículo

### Histórico de Movimentações
- Mesmos cards do obra.html (stripe + SAIU/ENTROU)
- Tag do tipo do veículo em cada card
- **5 filtros simultâneos:**
  1. Tabs de tipo (Adições / Remoções / Trocas)
  2. Busca por nº do pneu ou veículo
  3. Dropdown customizado de veículo (com busca interna)
  4. Filtro por período (data início → data fim)
  5. Dropdown customizado de operador (com busca interna)
- Botão "Limpar" aparece quando algum filtro está ativo
- Contador "X de Y registros"
- Paginação 20 por vez

### Dropdown customizado (cp-select)
- Função reutilizável `iniciarCpSelect(wrapperId, optsId, items, placeholder, onChange)`
- Fundo sólido (#1e2235 dark / #ffffff light) — sem transparência
- Campo de busca interno para filtrar opções
- Fecha ao clicar fora, seta rotaciona ao abrir

---

## Pendências / Próximos passos sugeridos
- [ ] Tela de usuários (usuarios.html/js) — revisar com nova terminologia
- [ ] Tela de estoque (estoque.html/js) — revisar
- [ ] Dashboard — atualizar stats se necessário
- [ ] Possível: relatório global (todas as obras de uma vez)
- [ ] Possível: exportar relatório como PDF direto
