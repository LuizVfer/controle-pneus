# 🔧 Controle de Pneus

### Sistema de Gestão e Rastreamento de Pneus

Aplicação web para gerenciamento de pneus, veículos, estoque e movimentações de frota.

O projeto surgiu a partir de uma necessidade real de organização e controle de pneus e posteriormente foi adaptado e anonimizado para fins de portfólio.

---

## 📋 Sobre o Projeto

O **Controle de Pneus** foi desenvolvido para acompanhar o ciclo de vida completo dos pneus utilizados em uma frota.

Cada pneu possui uma identificação única e pode ser acompanhado desde sua entrada no estoque, passando pela utilização em diferentes veículos e locais de operação, até processos de recapagem ou inutilização.

O sistema também mantém históricos de movimentações, permite o gerenciamento da frota e oferece diferentes níveis de acesso aos usuários.

---

## ✨ Principais Funcionalidades

- Cadastro e gerenciamento de pneus
- Identificação automática e única para cada pneu
- Controle de condição: novo, médio ou ruim
- Controle de status do pneu
- Gerenciamento de marcas
- Gerenciamento de múltiplos estoques
- Transferência de pneus entre estoques
- Controle de recapagens
- Cadastro e gerenciamento de veículos
- Diferentes configurações de eixos e quantidade de pneus
- Associação de pneus às posições dos veículos
- Controle de locais de operação
- Histórico de trocas e movimentações
- Relatórios e indicadores
- Filtros e paginação
- Autenticação de usuários
- Controle de permissões
- Tema claro e escuro

---

## 🖼️ Screenshots

> Screenshots da aplicação serão adicionadas em breve.

<!--
Exemplo futuro:

### Dashboard
![Dashboard](docs/images/dashboard.png)

### Estoque
![Estoque](docs/images/estoque.png)

### Controle de Veículos
![Veículos](docs/images/veiculos.png)
-->

---

## 🚀 Tecnologias

| Tecnologia | Aplicação |
|---|---|
| HTML5 | Estrutura das páginas |
| CSS3 | Estilização e responsividade |
| JavaScript (ES Modules) | Lógica da aplicação |
| Firebase Firestore | Banco de dados |
| Firebase Authentication | Autenticação e controle de acesso |
| Firebase Hosting | Hospedagem |
| LocalStorage | Persistência de preferências da interface |

A aplicação utiliza uma arquitetura baseada em **Firebase como Backend as a Service (BaaS)**, sem necessidade de um servidor backend próprio.

---

## 🏗️ Arquitetura

```text
Usuário
   │
   ▼
HTML / CSS / JavaScript
   │
   ├── Firebase Authentication
   │       └── Autenticação e controle de acesso
   │
   └── Firebase Firestore
           ├── Usuários
           ├── Pneus
           ├── Marcas
           ├── Estoques
           ├── Veículos
           ├── Locais de operação
           └── Históricos
```

A interface é desenvolvida com JavaScript utilizando ES Modules, enquanto autenticação, persistência de dados e regras de acesso são gerenciadas pelo Firebase.

---

## 🗄️ Modelo de Dados

As principais entidades utilizadas no Firestore são:

| Entidade | Responsabilidade |
|---|---|
| `usuarios` | Usuários e níveis de acesso |
| `pneus` | Dados e situação atual dos pneus |
| `marcas` | Marcas cadastradas |
| `estoques` | Locais de armazenamento |
| `veiculos` | Frota cadastrada |
| `obras` | Locais de operação |
| `trocas` | Histórico de movimentações |
| `logs` | Registro de alterações |

Os históricos de movimentação são mantidos para permitir rastreabilidade das operações realizadas no sistema.

---

## 🔢 Identificação dos Pneus

Cada pneu recebe automaticamente um identificador no seguinte formato:

```text
PNEU-{ano}-{sequencial}
```

Exemplos:

```text
PNEU-26-0001
PNEU-26-0150
```

O identificador permite acompanhar individualmente cada pneu durante todo o seu ciclo de utilização.

---

## 🚛 Gestão de Frota

O sistema permite cadastrar diferentes tipos de veículos e representar suas respectivas configurações de pneus.

Entre os tipos suportados estão:

- Caminhões
- Cavalos mecânicos
- Pás carregadeiras
- Motoniveladoras
- Rolos compactadores
- Reboques
- Semirreboques
- Ônibus

Cada veículo possui um diagrama de posições que permite identificar exatamente onde cada pneu está instalado.

---

## 📦 Gestão de Estoque

O módulo de estoque permite:

- cadastrar pneus;
- consultar disponibilidade;
- filtrar por status;
- filtrar por marca;
- pesquisar pelo número de identificação;
- alterar condição;
- transferir pneus entre estoques;
- inutilizar ou reativar pneus;
- controlar envio e retorno de recapagem;
- executar transferências em lote.

Indicadores apresentam rapidamente a quantidade de pneus:

- disponíveis;
- em uso;
- inutilizáveis;
- em recapagem.

---

## 🔄 Rastreamento e Histórico

As movimentações dos pneus são registradas para permitir rastrear seu histórico.

Entre os eventos registrados estão:

- instalação em veículo;
- remoção;
- substituição;
- transferência;
- recapagem;
- mudança de condição;
- movimentação entre locais.

Isso permite consultar onde o pneu foi utilizado e quais operações foram realizadas durante seu ciclo de vida.

---

## 📊 Relatórios

O sistema possui uma área de relatórios com informações como:

- quantidade de veículos;
- quantidade de pneus;
- cobertura dos veículos;
- adições;
- trocas;
- remoções;
- inventário de pneus;
- posição dos pneus nos veículos;
- histórico de movimentações.

Os relatórios também podem ser preparados para impressão ou exportação em PDF pelo navegador.

---

## 👥 Perfis de Acesso

O sistema possui dois níveis principais de usuário:

| Funcionalidade | Usuário | Admin |
|---|:---:|:---:|
| Consultar e operar locais | ✅ | ✅ |
| Gerenciar estoque | ✅ | ✅ |
| Gerenciar frota | ✅ | ✅ |
| Gerenciar marcas | ✅ | ✅ |
| Consultar relatórios | ✅ | ✅ |
| Criar/excluir estoques | ❌ | ✅ |
| Excluir locais e veículos | ❌ | ✅ |
| Gerenciar usuários | ❌ | ✅ |

---

## 🔒 Segurança

O sistema utiliza **Firebase Authentication** para autenticação dos usuários e regras do **Firestore** para controle de acesso aos dados.

Entre as medidas implementadas estão:

- bloqueio de acesso para usuários não autenticados;
- possibilidade de desativação de usuários;
- controle de permissões administrativas;
- histórico de operações;
- inutilização lógica de pneus em vez de exclusão;
- separação entre configuração local e código versionado.

O arquivo com as configurações locais do Firebase não é versionado no repositório.

---

## 🎨 Interface

A aplicação possui suporte a:

- tema claro;
- tema escuro;
- interface responsiva;
- filtros;
- paginação;
- modais;
- indicadores de status;
- representação visual dos pneus nos veículos.

A preferência de tema é armazenada localmente no navegador.

---

## 📁 Estrutura do Projeto

```text
controle-pneus/
│
├── assets/
│   └── logo-controle-pneus.png
│
├── css/
│   ├── theme.css
│   ├── login.css
│   ├── dashboard.css
│   ├── estoque.css
│   ├── obra.css
│   ├── relatorios.css
│   ├── usuarios.css
│   └── veiculos.css
│
├── html/
│   ├── login.html
│   ├── dashboard.html
│   ├── nova-obra.html
│   ├── obra.html
│   ├── estoque.html
│   ├── veiculos.html
│   ├── relatorios.html
│   └── usuarios.html
│
├── js/
│   ├── config.example.js
│   ├── firebase.js
│   ├── veiculos-tipos.js
│   ├── theme.js
│   ├── login.js
│   ├── dashboard.js
│   ├── nova-obra.js
│   ├── obra.js
│   ├── estoque.js
│   ├── veiculos.js
│   ├── relatorios.js
│   └── usuarios.js
│
├── firebase.json
├── firestore.rules
├── .gitignore
└── README.md
```

---

## 🛠️ Executando Localmente

### 1. Clone o repositório

```bash
git clone https://github.com/LuizVfer/controle-pneus.git
```

Entre na pasta:

```bash
cd controle-pneus
```

### 2. Configure o Firebase

Crie uma cópia de:

```text
js/config.example.js
```

com o nome:

```text
js/config.js
```

Preencha o arquivo com as configurações do seu projeto Firebase.

O `config.js` não deve ser versionado.

### 3. Execute a aplicação

Você pode utilizar uma extensão como **Live Server** no VS Code.

Por exemplo:

```text
http://127.0.0.1:5500/html/login.html
```

---

## 🌐 Demonstração

Uma versão demonstrativa com dados fictícios será disponibilizada para permitir a navegação pelo sistema sem expor informações utilizadas durante o desenvolvimento original.

---

## 💡 Contexto do Desenvolvimento

Este projeto foi iniciado a partir de uma necessidade real de gerenciamento de pneus de uma frota.

Durante o desenvolvimento foi necessário transformar processos operacionais em regras de software, incluindo:

- modelagem do ciclo de vida dos pneus;
- organização dos estoques;
- representação de diferentes configurações de veículos;
- rastreamento de movimentações;
- controle de permissões;
- construção de históricos;
- criação de relatórios.

Posteriormente, o projeto foi anonimizado e adaptado para utilização como projeto de portfólio.

---

## 👨‍💻 Autor

Desenvolvido por **Luiz Fernando**.

- GitHub: [LuizVfer](https://github.com/LuizVfer)

---

## 📄 Uso

Projeto disponibilizado como parte de portfólio profissional.

Todos os direitos reservados © 2026.