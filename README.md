# 🔧 Controle de Pneus
**Sistema de Gestão de Frota e Estoque de Pneus**  

---

## 📋 Visão Geral

O **Controle de Pneus ALS** é um sistema web desenvolvido para gerenciar o ciclo de vida completo dos pneus utilizados nas obras da empresa. O sistema permite rastrear cada pneu individualmente, desde sua entrada no estoque até sua inutilização, passando por todas as obras e veículos em que foi utilizado.

---

## 🚀 Tecnologias

| Tecnologia | Uso |
|---|---|
| HTML5 + CSS3 + JavaScript (ES Modules) | Interface e lógica do cliente |
| Firebase Firestore | Banco de dados em tempo real |
| Firebase Authentication | Autenticação de usuários |
| Firebase Hosting | Hospedagem do sistema |

> Projeto 100% frontend — sem backend próprio, sem frameworks JS.

---

## 🌐 Acesso

| Ambiente | URL |
|---|---|
| Produção | https://controle-de-pneus-79051.web.app |
| Firebase Console | https://console.firebase.google.com/project/controle-de-pneus-79051 |

---

## 📁 Estrutura de Arquivos

```
controle-pneus/
├── html/
│   ├── login.html          ← Tela de login
│   ├── dashboard.html      ← Página inicial com lista de obras
│   ├── nova-obra.html      ← Criação de nova obra
│   ├── obra.html           ← Gerenciamento de uma obra
│   ├── estoque.html        ← Gerenciamento do estoque de pneus
│   ├── veiculos.html       ← Gerenciamento da frota de veículos
│   ├── relatorios.html     ← Relatórios detalhados por obra
│   └── usuarios.html       ← Gerenciamento de usuários (admin)
│
├── css/
│   ├── theme.css           ← Variáveis globais e tema claro/escuro
│   ├── login.css
│   ├── dashboard.css
│   ├── nova-obra.css
│   ├── obra.css
│   ├── estoque.css
│   ├── veiculos.css
│   ├── relatorios.css
│   └── usuarios.css
│
├── js/
│   ├── config.js           ← Credenciais Firebase (não versionado)
│   ├── config.example.js   ← Modelo de configuração
│   ├── firebase.js         ← Todas as funções de banco de dados
│   ├── veiculos-tipos.js   ← Definição dos tipos de veículos e eixos
│   ├── theme.js            ← Alternância de tema claro/escuro
│   ├── login.js
│   ├── dashboard.js
│   ├── nova-obra.js
│   ├── obra.js
│   ├── estoque.js
│   ├── veiculos.js
│   ├── relatorios.js
│   └── usuarios.js
│
├── assets/
│   └── logo-als.png
│
├── firebase.json           ← Configuração do Firebase Hosting
├── firestore.rules         ← Regras de segurança do Firestore
├── .gitignore
└── README.md
```

---

## 🗄️ Estrutura do Banco de Dados (Firestore)

### `/usuarios/{uid}`
| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Nome completo |
| `email` | string | E-mail de acesso |
| `perfil` | string | `admin` ou `comum` |
| `ativo` | boolean | Se o usuário pode fazer login |
| `criado_em` | timestamp | Data de criação |

---

### `/config/pneus_contador`
| Campo | Tipo | Descrição |
|---|---|---|
| `ultimo` | number | Último número gerado |

---

### `/pneus/{pneuId}`
| Campo | Tipo | Descrição |
|---|---|---|
| `numero_identificacao` | string | Ex: `ALS 26-0001` |
| `status` | string | `disponivel`, `em_uso`, `inutilizavel`, `em_recapagem` |
| `condicao` | string | `novo`, `medio`, `ruim` |
| `marca_id` | string | ID da marca do pneu |
| `marca_nome` | string | Nome da marca do pneu |
| `obra_id_atual` | string | ID da obra onde está (ou `null`) |
| `caminhao_id` | string | ID do veículo onde está (ou `null`) |
| `estoque_id` | string | ID do estoque por cidade (ou `null` = Campo Grande) |
| `estoque_nome` | string | Nome do estoque |
| `motivo_inutilizacao` | string | Motivo ao inutilizar |
| `data_inutilizacao` | timestamp | Data de inutilização |
| `recapado` | boolean | Se já foi recapado ao menos uma vez |
| `qtd_recapagens` | number | Quantidade de recapagens realizadas |
| `criado_em` | timestamp | Data de criação |

---

### `/marcas/{marcaId}`
| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Nome da marca (ex: Bridgestone) |
| `criado_em` | timestamp | Data de criação |
| `criado_por` | string | UID do criador |
| `criado_por_nome` | string | Nome do criador |
| `atualizado_em` | timestamp | Data da última edição |

---

### `/estoques/{estoqueId}`
| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Nome da cidade/estoque |
| `criado_em` | timestamp | Data de criação |
| `criado_por` | string | UID do criador |
| `criado_por_nome` | string | Nome do criador |

---

### `/obras/{obraId}`
| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Nome da obra |
| `status` | string | `aberta`, `finalizada`, `arquivada` |
| `data_criacao` | timestamp | Data de criação |
| `data_finalizacao` | timestamp | Data de finalização |
| `criado_por` | string | UID do criador |

#### Subcoleção `/obras/{obraId}/caminhoes/{caminhaoId}`
| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Nome do veículo |
| `placa` | string | Placa (opcional) |
| `tipo_veiculo_id` | string | ID do tipo (ex: `CB-01`) |
| `tipo_veiculo_tag` | string | Tag curta |
| `qtd_pneus_tipo` | number | Total de pneus do tipo |
| `posicoes` | array | Diagrama de posições com pneus |

#### Subcoleção `/obras/{obraId}/trocas/{trocaId}` *(imutável)*
| Campo | Tipo | Descrição |
|---|---|---|
| `tipo_evento` | string | `veiculo_adicionado`, `veiculo_removido` ou vazio |
| `caminhao_nome` | string | Nome do veículo |
| `pneu_saiu_numero` | string | Número do pneu que saiu |
| `pneu_entrou_numero` | string | Número do pneu que entrou |
| `data` | timestamp | Data/hora |
| `usuario_nome` | string | Nome do operador |

#### Subcoleção `/obras/{obraId}/logs/{logId}` *(imutável)*
Registro de alterações nos dados da obra.

---

### `/veiculos/{veiculoId}`
| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | string | Nome do veículo |
| `placa` | string | Placa (opcional) |
| `tipo_veiculo_id` | string | ID do tipo |
| `tipo_veiculo_tag` | string | Tag curta |
| `qtd_pneus_tipo` | number | Total de pneus do tipo |
| `posicoes` | array | Diagrama de posições |
| `criado_em` | timestamp | Data de criação |

#### Subcoleção `/veiculos/{veiculoId}/movimentacoes/{movId}` *(imutável)*
Histórico de movimentações de pneus no veículo da frota.

---

## 🔢 Numeração de Pneus

```
ALS {ano2digitos}-{sequencial4digitos}
```

**Exemplos:**
- `ALS 26-0001` — primeiro pneu de 2026
- `ALS 26-0150` — centésimo quinquagésimo pneu

O contador é global, não reinicia por ano, e suporta além de 9999.

---

## 🚛 Tipos de Veículos

| ID | Nome | Tag | Pneus | Configuração |
|---|---|---|---|---|
| `CB-01` | Caminhão Basculante | CB | 10 | 2 simples + 4 duplos + 4 duplos |
| `CV-01` | Caminhão Cavalo | CV | 10 | 2 simples + 4 duplos + 4 duplos |
| `PC-01` | Pá Carregadeira | PC | 4 | 2 simples + 2 simples |
| `MN-01` | Moto Niveladora | MN | 6 | 3 eixos simples |
| `RC-01` | Rolo Compactador | RC | 2 | 2 traseiros simples |
| `RBP-03` | Reboque Prancha 3 Eixos | RBP | 12 | 3 eixos duplos |
| `RBP-04` | Reboque Prancha 4 Eixos | RBP | 16 | 4 eixos duplos |
| `RBB-01` | Reboque Bitrem — 1 Carreta | SRB | 8 | 2 eixos duplos |
| `RBB-02` | Reboque Bitrem — 2 Carretas | SRB | 16 | 4 eixos duplos |
| `SRC-03` | Semi Reboque Carroceria | SRC | 12 | 3 eixos duplos |
| `ONS-01` | Ônibus | ONS | 6 | 2 simples + 4 duplos |

---

## 🖥️ Telas do Sistema

### Login (`login.html`)
- Autenticação com e-mail e senha via Firebase Auth
- Verificação de usuário ativo no Firestore
- Suporte a tema claro/escuro

---

### Dashboard (`dashboard.html`)
- Lista todas as obras com filtro por status (Abertas / Finalizadas / Arquivadas)
- Busca por nome da obra
- Ordenação por data ou nome
- Acesso rápido ao Estoque, Frota, Relatórios e Usuários
- Rodapé sempre fixo na base da tela, em qualquer tamanho de dispositivo

---

### Nova Obra (`nova-obra.html`)
- Formulário de criação de obra com nome
- Seleção de veículos da frota para vincular
- Resumo lateral com contagem de veículos e pneus

---

### Obra (`obra.html`)

**Aba Veículos:**
- Diagrama de eixos com posições coloridas por condição:
  - 🟢 Verde — Novo | 🟡 Amarelo — Médio | 🔴 Vermelho — Ruim | 🔵 Azul — Recapado
- Clique em posição vazia → atribuir pneu
- Clique em posição ocupada → trocar / remover
- Modal de atribuição com filtro por número e por marca
- Lista paginada (10 por página) ordenada do mais novo ao mais antigo
- Marca exibida em cada item da lista

**Aba Histórico:**
- Cards com stripe colorida por tipo de evento
- Filtros por tipo, busca, período e operador
- Paginação de 20 por vez

---

### Estoque (`estoque.html`)
- Tabs por estoque (Campo Grande + cidades)
- KPIs: Total, Disponível, Em Uso, Inutilizável, Em Recapagem
- **Filtro por status** + **filtro por marca** + **busca por número**
- **Paginação de 24 pneus por página** com numeração, setas e contador
- **Marca obrigatória** ao criar pneus — select com marcas cadastradas
- **Chip de marca** clicável no card para trocar a marca
- **Condição** (badge clicável): Novo / Médio / Ruim
- Inutilizar, Reativar, Transferir entre estoques
- Recapagem — fluxo completo (enviar / receber)
- Seleção múltipla para transferência em lote
- **Gerenciamento de marcas** (botão "Marcas"):
  - Criar nova marca
  - Editar inline
  - Deletar com confirmação
- Criação e exclusão de estoques por cidade (admin)

---

### Veículos (`veiculos.html`)
- Cadastro de veículos com tipo, nome e placa
- Diagrama de eixos colorido por condição do pneu
- Atribuir / Trocar / Remover pneus
- Modal de atribuição com filtro por número e por marca
- Marca visível em cada item da lista
- **Paginação de 10 veículos por página**
- Filtros por nome, tipo e status — atualiza automaticamente ao adicionar novo veículo
- Histórico de movimentações do veículo

---

### Relatórios (`relatorios.html`)
- KPIs: Veículos, Pneus, Cobertura %, Adições, Trocas, Remoções
- Tabela de veículos com barra de cobertura e chips de pneus
- Inventário de pneus com posição exata
- Histórico com 5 filtros simultâneos
- Botão Imprimir / PDF

---

### Usuários (`usuarios.html`) *(somente admin)*
- Listar, criar, desativar/reativar e alterar senha de usuários

---

## 👥 Perfis de Acesso

| Ação | Comum | Admin |
|---|---|---|
| Ver e operar obras | ✅ | ✅ |
| Gerenciar estoque | ✅ | ✅ |
| Gerenciar frota | ✅ | ✅ |
| Gerenciar marcas | ✅ | ✅ |
| Ver relatórios | ✅ | ✅ |
| Criar/deletar estoque por cidade | ❌ | ✅ |
| Deletar obra / veículo | ❌ | ✅ |
| Gerenciar usuários | ❌ | ✅ |

---

## 🔒 Segurança

- Usuários não autenticados: **acesso zero**
- Usuários com `ativo: false`: **acesso zero**
- Históricos (`trocas`, `logs`, `movimentacoes`): **somente leitura e criação**
- Pneus: **nunca deletados** — apenas inutilizados por campo
- API Key Firebase restrita por domínio

---

## 🎨 Tema

Suporte a **tema claro e escuro**. Preferência salva no `localStorage`.

---

## 🛠️ Desenvolvimento Local

1. Clone o repositório
2. Copie `js/config.example.js` para `js/config.js` e preencha as credenciais
3. Abra no VS Code e clique em **Go Live** (porta 5500)
4. Acesse `http://127.0.0.1:5500/html/login.html`

---

## 🚀 Deploy

```bash
npm install -g firebase-tools
firebase login
firebase deploy
```

---

## 📦 Histórico de Versões

### v1.1.0 — Mar/2026

**Novas funcionalidades:**
- Sistema completo de marcas de pneus (cadastrar, editar, deletar)
- Marca obrigatória ao adicionar pneus ao estoque
- Chip de marca clicável no card para troca rápida
- Filtro por marca no estoque
- Marca exibida e filtrável nos modais de atribuir pneu (obra e veículos)
- Paginação no estoque — 24 pneus por página
- Paginação nos modais de atribuir pneu — 10 por página
- Paginação na frota — 10 veículos por página
- Novo tipo de veículo: Semi Reboque Carroceria (SRC-03) — 3 eixos, 12 pneus
- Filtro da frota atualiza automaticamente ao adicionar novo veículo
- Rodapé do dashboard fixo na base da tela em qualquer dispositivo

**Correções:**
- Modais do estoque fecham corretamente via X e Cancelar
- Estoque atualiza automaticamente após todas as ações
- Correção de temporal dead zone no `toastTimer`
- `listarMarcas` e `listarEstoques` sem `orderBy` para evitar erro de índice

### v1.0.0 — Mar/2026
- Lançamento inicial do sistema

---

## 📄 Licença

Sistema de uso interno exclusivo — **Andre L dos Santos Ltda**.  
Todos os direitos reservados © 2026.
