# 🚛 Controle de Pneus

Sistema web para gerenciamento de pneus em obras de construção. Permite controlar o estoque global de pneus, vinculá-los a caminhões em obras específicas e rastrear todo o histórico de movimentações.

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)
![Firebase](https://img.shields.io/badge/Firebase-10.12.0-orange)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## 📋 Índice

- [Sobre o Projeto](#-sobre-o-projeto)
- [Funcionalidades](#-funcionalidades)
- [Tecnologias](#-tecnologias)
- [Estrutura de Arquivos](#-estrutura-de-arquivos)
- [Estrutura do Banco de Dados](#-estrutura-do-banco-de-dados)
- [Como Rodar Localmente](#-como-rodar-localmente)
- [Configuração do Firebase](#-configuração-do-firebase)
- [Segurança](#-segurança)
- [Telas do Sistema](#-telas-do-sistema)

---

## 📌 Sobre o Projeto

Desenvolvido para empresas de construção civil que precisam controlar pneus de caminhões distribuídos em diversas obras. O sistema centraliza o estoque de pneus, registra todas as movimentações e mantém um histórico completo por obra.

---

## ✅ Funcionalidades

### Gestão de Obras
- Criar, editar, finalizar e arquivar obras
- Adicionar múltiplos caminhões por obra
- Visualizar status em tempo real (aberta / finalizada / arquivada)
- Log imutável de todas as alterações

### Estoque Global de Pneus
- Numeração automática sequencial (`PNE-0001`, `PNE-0002`...)
- Adição em lote (até 200 pneus de uma vez)
- Status por pneu: **Disponível**, **Em Uso** ou **Inutilizável**
- Rastreamento de localização: qual obra e qual caminhão
- Inutilização com motivo (Furou, Desgaste, Dano físico, Outro)
- Reativação de pneus inutilizáveis
- Pneus liberados automaticamente ao finalizar ou arquivar uma obra

### Gestão de Caminhões
- Múltiplos pneus por caminhão
- Atribuição via modal com busca, seleção múltipla e "Selecionar todos"
- Remoção individual de pneus
- Histórico completo de adições, remoções e trocas

### Relatórios
- KPIs por obra (caminhões, pneus, trocas, sem pneu)
- Tabela de caminhões com pneus vinculados
- Inventário de pneus por obra
- Histórico de movimentações
- Exportação via impressão / PDF

### Usuários
- Perfis: **Administrador** e **Comum**
- Criar, desativar e reativar usuários
- Troca de senha pelo admin
- Usuário desativado bloqueado mesmo que autenticado

### Interface
- Tema Dark / Light com persistência
- Design responsivo
- Animações e transições suaves
- Toasts de feedback em todas as ações

---

## 🛠 Tecnologias

| Tecnologia | Uso |
|---|---|
| HTML5 + CSS3 + JavaScript (ES Modules) | Frontend |
| Firebase Authentication | Login com email/senha |
| Cloud Firestore | Banco de dados NoSQL |
| Google Fonts — Barlow / Barlow Condensed | Tipografia |
| Live Server (VS Code) | Servidor de desenvolvimento |

Sem frameworks, sem build tools — JavaScript puro com módulos nativos do browser.

---

## 📁 Estrutura de Arquivos

```
controle-pneus/
├── html/
│   ├── login.html          # Tela de login
│   ├── dashboard.html      # Lista de obras
│   ├── obra.html           # Detalhes de uma obra
│   ├── nova-obra.html      # Criar nova obra
│   ├── estoque.html        # Estoque global de pneus
│   ├── relatorios.html     # Relatórios por obra
│   └── usuarios.html       # Gerenciar usuários (admin)
├── css/
│   ├── theme.css           # Variáveis e tema global
│   ├── login.css
│   ├── dashboard.css
│   ├── obra.css
│   ├── nova-obra.css
│   ├── estoque.css
│   ├── relatorios.css
│   └── usuarios.css
├── js/
│   ├── config.example.js   # Template de configuração (copie como config.js)
│   ├── firebase.js         # Todas as funções do Firestore/Auth
│   ├── theme.js            # Toggle de tema global
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

## 🗄 Estrutura do Banco de Dados

```
Firestore
│
├── /usuarios/{uid}
│     nome, email, perfil (admin|comum), ativo, criado_em
│
├── /config/pneus_contador
│     ultimo (int) — controla a numeração automática PNE-XXXX
│
├── /pneus/{pneuId}
│     numero_identificacao, status, obra_id_atual, obra_nome,
│     caminhao_id, caminhao_nome, motivo_inutilizacao,
│     data_inutilizacao, criado_em
│
└── /obras/{obraId}
      nome, status (aberta|finalizada|arquivada),
      data_criacao, data_finalizacao, qtd_caminhoes,
      criado_por, criado_por_nome
      │
      ├── /caminhoes/{id}
      │     nome, placa, pneus_ids[]
      │
      ├── /trocas/{id}
      │     caminhao_id, caminhao_nome, pneu_saiu, pneu_entrou,
      │     data, usuario_id, usuario_nome
      │
      └── /logs/{id}  ← imutável
            campo_alterado, valor_antigo, valor_novo,
            data, usuario_id, usuario_nome
```

---

## 🚀 Como Rodar Localmente

### Pré-requisitos
- [VS Code](https://code.visualstudio.com/)
- Extensão [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) (Ritwick Dey)
- Conta no [Firebase](https://firebase.google.com/)

### Passo a passo

**1. Clone o repositório**
```bash
git clone https://github.com/seu-usuario/controle-pneus.git
cd controle-pneus
```

**2. Configure o Firebase**

Copie o arquivo de configuração de exemplo:
```bash
cp js/config.example.js js/config.js
```

Edite `js/config.js` com as credenciais do seu projeto Firebase:
```js
export const firebaseConfig = {
  apiKey:            "SUA_API_KEY",
  authDomain:        "SEU_PROJETO.firebaseapp.com",
  projectId:         "SEU_PROJETO",
  storageBucket:     "SEU_PROJETO.firebasestorage.app",
  messagingSenderId: "SEU_SENDER_ID",
  appId:             "SEU_APP_ID",
};
```

**3. Configure as Regras do Firestore**

No Console Firebase → Firestore → Regras, cole as regras do arquivo [FIRESTORE_RULES](#) ou use:
```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isAtivo() {
      return request.auth != null &&
        get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.ativo == true;
    }
    function isAdmin() {
      return isAtivo() &&
        get(/databases/$(database)/documents/usuarios/$(request.auth.uid)).data.perfil == 'admin';
    }

    match /usuarios/{uid} {
      allow read: if isAtivo();
      allow create, update, delete: if isAdmin();
      allow update: if isAtivo() && request.auth.uid == uid;
    }
    match /obras/{obraId} {
      allow read: if isAtivo();
      allow create, update: if isAtivo();
      allow delete: if isAdmin();
      match /caminhoes/{id} { allow read, write: if isAtivo(); }
      match /trocas/{id} {
        allow read, create: if isAtivo();
        allow update, delete: if false;
      }
      match /logs/{id} {
        allow read, create: if isAtivo();
        allow update, delete: if false;
      }
    }
    match /pneus/{pneuId} {
      allow read: if isAtivo();
      allow create: if isAtivo() && request.resource.data.status == 'disponivel';
      allow update: if isAtivo() && request.resource.data.status in ['disponivel','em_uso','inutilizavel'];
      allow delete: if isAdmin();
    }
    match /config/{docId} {
      allow read, write: if isAtivo();
    }
  }
}
```

**4. Crie o primeiro usuário admin**

No Console Firebase → Authentication → Users, crie manualmente um usuário. Depois no Firestore → Collection `usuarios`, crie um documento com o UID desse usuário:
```json
{
  "nome": "Seu Nome",
  "email": "seu@email.com",
  "perfil": "admin",
  "ativo": true,
  "criado_em": <timestamp>
}
```

**5. Inicie o Live Server**

No VS Code, clique com botão direito em `html/login.html` → **Open with Live Server**

Acesse: `http://127.0.0.1:5500/html/login.html`

> ⚠️ O sistema usa ES Modules — não abre diretamente pelo navegador com duplo clique. Sempre use um servidor HTTP (Live Server ou similar).

---

## 🔒 Segurança

- **Firebase App Check** — impede acesso ao Firestore fora do domínio autorizado
- **Regras do Firestore** — todas as operações validadas server-side; logs são imutáveis
- **API Key restrita** — chave configurada para aceitar apenas o domínio de produção
- **Usuário desativado** — bloqueado nas regras do Firestore mesmo que autenticado
- **`config.js` no `.gitignore`** — credenciais nunca sobem para o repositório
- **Sem `eval()` ou `innerHTML` com dados brutos** — proteção contra XSS

---

## 🖥 Telas do Sistema

| Tela | Descrição |
|---|---|
| **Login** | Autenticação com e-mail e senha |
| **Dashboard** | Grid de obras com busca, filtro e ordenação |
| **Nova Obra** | Formulário com caminhões |
| **Obra** | Caminhões, pneus em uso, histórico de movimentações |
| **Estoque** | Todos os pneus com status, localização e ações |
| **Relatórios** | Dados completos de uma obra para impressão |
| **Usuários** | Gerenciamento de usuários (somente admin) |

---

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

Desenvolvido por **[Luiz Fernando](https://github.com/LuizVfer)**
