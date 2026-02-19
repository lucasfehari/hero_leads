# 🤖 Marketing Automation System

Plataforma web completa para automação de marketing digital: **disparo em massa de WhatsApp**, **automação de Instagram** e **extração de leads via Google Maps** — tudo com painel de controle visual em tempo real.

---

## ✨ Funcionalidades

### 📱 Disparos WhatsApp
- Envio em massa com múltiplas mensagens por contato
- **Sistema Anti-Ban de 7 camadas:**
  - Delays gaussianos (distribuição bell-curve, simula digitação humana)
  - Warmup automático de conta (começa em 20 msgs/dia → 280/dia ao longo de 9 semanas)
  - Simulação de atividade humana entre envios
  - Validação de números antes do envio
  - Humanização de mensagens (spintax, Unicode invisível, emojis aleatórios)
  - Rate limiter inteligente (limite por hora e por dia)
  - Embaralhamento de contatos para evitar padrões
- **Opt-Out automático:** detecta palavras-chave de saída (SAIR, STOP, PARAR, etc.) e remove o contato da lista automaticamente, com resposta configurável
- **Agendamento de campanhas:** define horário de início e fim, a campanha espera/pausa automaticamente
- **Múltiplas sessões** (contas WhatsApp) com troca sem reiniciar o servidor
- Painel de saúde da sessão com barra de warmup e estatísticas em tempo real

### 🤖 Instagram Bot
- Automação de interações (curtidas, comentários, seguir)
- Configuração por perfil-alvo
- Rotação de contas automática
- Suporte a múltiplos perfis com dados isolados

### 🗺️ Extração Google Maps
- Busca de leads por categoria/localização
- Extrai: nome, telefone, website, avaliação
- Exporta para lista pronta para disparos

### 📊 Painel Web
- Interface React moderna (Tailwind CSS + glassmorphism)
- Atualizações em tempo real via WebSocket (Socket.IO)
- Log de status ao vivo durante campanhas
- Alertas de opt-out em tempo real (banner vermelho com o número e a mensagem recebida)

---

## 🗂️ Estrutura do Projeto

```
/
├── client/                  # Frontend React (Vite)
│   └── src/
│       └── components/
│           ├── WhatsAppSender.jsx     # Painel principal de disparos
│           ├── WhatsAppDashboard.jsx  # Dashboard WhatsApp
│           ├── GoogleMapsPanel.jsx    # Extração de leads
│           ├── ConfigForm.jsx         # Configurações do bot Instagram
│           └── LogViewer.jsx          # Visualizador de logs
│
├── server/                  # Backend Node.js (Express)
│   ├── index.js             # Servidor principal + rotas API
│   ├── whatsapp/
│   │   ├── index.js         # Serviço WhatsApp (sessões, opt-out)
│   │   ├── queue.js         # Fila de mensagens + agendamento
│   │   └── anti-ban.js      # Motor anti-ban de 7 camadas
│   └── bot/                 # Automação Instagram (Puppeteer)
│
├── whatsapp_sessions/       # Dados de sessão por conta
│   └── session-<nome>/
│       ├── warmup.json      # Histórico de warmup da conta
│       └── bad_numbers.json # Blacklist de números da conta
│
├── INICIAR_SISTEMA.bat      # Inicia server + client juntos
└── ABRIR_CHROME_ROBO.bat    # Abre Chrome com remote debugging
```

---

## 🚀 Como Usar

### Pré-requisitos

- [Node.js](https://nodejs.org/) v18+
- Google Chrome instalado

### Instalação

```bash
# 1. Instalar dependências do servidor
cd server
npm install

# 2. Instalar dependências do cliente
cd ../client
npm install
```

### Iniciar

**Windows (recomendado):** dê duplo clique em `INICIAR_SISTEMA.bat`

**Manualmente:**
```bash
# Terminal 1 — Servidor
cd server
node index.js

# Terminal 2 — Frontend
cd client
npm run dev
```

Acesse em: **http://localhost:5173**

---

## ⚙️ Configuração

### WhatsApp
1. Abra o painel e clique em **Conectar**
2. Escaneie o QR Code com o WhatsApp do celular
3. Aguarde o status mudar para ✅ Conectado
4. Configure a campanha e clique em **Iniciar Disparos**

### Anti-Ban
Todos os parâmetros são configuráveis no painel:
- Limites por hora e por dia
- Delays mínimo/máximo entre contatos
- Pool de emojis para humanização
- Frequência de simulação de atividade

### Opt-Out
Configure no painel **Opt-Out Automático:**
- Ativar/desativar detecção
- Ativar/desativar resposta automática
- Personalizar o texto da resposta
- Gerenciar a lista de palavras-chave

### Agendamento
Configure no painel **Agendamento:**
- Ativar e definir horário de início e fim
- A campanha espera ou pausa automaticamente fora da janela

---

## 🛠️ Stack

| Camada | Tecnologia |
|--------|-----------|
| Frontend | React 18, Vite, Tailwind CSS |
| Backend | Node.js, Express 5, Socket.IO |
| WhatsApp | whatsapp-web.js |
| Automação | Puppeteer + Stealth Plugin |
| Banco de dados | SQLite (better-sqlite3) |

---

## ⚠️ Aviso Legal

Este software é destinado a **uso profissional e responsável** de marketing. O usuário é responsável por garantir que seu uso esteja em conformidade com os Termos de Serviço do WhatsApp e com a legislação local de proteção de dados (LGPD). O projeto inclui sistema de opt-out para respeitar os usuários que não desejam receber mensagens.
