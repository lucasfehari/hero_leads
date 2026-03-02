# Browze Bot — Automation Suite

**Browze Bot** é uma plataforma de automação para Instagram, WhatsApp, Google Maps e Social Media, com interface visual moderna.

---

## ⚡ Instalação Rápida (Windows)

### Opção 1 — Duplo clique (mais fácil)

1. Baixe ou clone o projeto
2. Dê duplo clique em **`INICIAR.bat`**
3. Na primeira execução: instala tudo automaticamente
4. Acesse: **http://localhost:5173**

> O `.bat` verifica/instala Node.js, instala as dependências e abre o navegador automaticamente.

---

### Opção 2 — Terminal (recomendado para desenvolvedores)

```bash
# 1. Instalar dependências (apenas na primeira vez)
npm run install:all

# 2. Iniciar servidor + interface juntos
npm run dev
```

Ou separado:
```bash
# Backend (porta 3000)
node server/index.js

# Frontend (porta 5173) — em outro terminal
cd client && npm run dev
```

---

## 📋 Requisitos do Sistema

| Requisito | Versão | Download |
|-----------|--------|---------|
| **Node.js** | v18+ (v20 recomendado) | [nodejs.org](https://nodejs.org) |
| **Visual C++ Build Tools** | 2017+ | [Baixar](https://aka.ms/vs/17/release/vs_BuildTools.exe) ¹ |
| **Windows** | 10 / 11 | — |
| **Google Chrome** | Qualquer versão | [chrome.google.com](https://www.google.com/chrome/) ² |

> ¹ **Obrigatório** para compilar `better-sqlite3`. Selecione "Desenvolvimento para Desktop com C++" durante a instalação.  
> ² Recomendado para a automação do Instagram. O Puppeteer baixa o Chromium automaticamente, mas o Chrome do sistema é mais confiável.

---

## 📁 Estrutura do Projeto

```
browze-bot/
├── INICIAR.bat          ← Inicialização com 1 clique (Windows)
├── package.json         ← Scripts raiz (npm run dev)
├── server/              ← Backend Node.js (porta 3000)
│   ├── index.js         ← Servidor Express + Socket.IO
│   ├── bot/             ← Lógica de automação Instagram
│   ├── whatsapp/        ← Módulo WhatsApp
│   ├── db/              ← Bancos SQLite
│   └── uploads/         ← Áudios enviados (gitignore)
└── client/              ← Frontend React + Vite (porta 5173)
    └── src/
        ├── App.jsx
        └── components/
```

---

## 🔧 Configuração

Copie o arquivo de exemplo e edite:

```bash
cp server/.env.example server/.env
```

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `3000` | Porta do servidor backend |

---

## 🚀 Módulos

| Módulo | Descrição |
|--------|-----------|
| **Instagram Bot** | Prospecção automática via hashtags e concorrentes |
| **WhatsApp Sender** | Envio em massa com múltiplas sessões |
| **Google Maps Extractor** | Extração de leads de estabelecimentos |
| **Social Media Scheduler** | Agendamento de posts |

---

## ⚠️ Solução de Problemas

**`better-sqlite3` falha na instalação:**
```
Instale o Visual C++ Build Tools:
https://aka.ms/vs/17/release/vs_BuildTools.exe
→ Selecione "Desenvolvimento para Desktop com C++"
→ Reinicie o terminal e execute novamente
```

**Node.js não reconhecido após instalação:**
```
Feche e reabra o terminal (ou reinicie o PC)
```

**Porta 3000 ou 5173 em uso:**
```
Feche outros programas que usam essas portas
Ou defina PORT=3001 no server/.env
```

---

## 📦 Tecnologias

- **Backend**: Node.js, Express, Socket.IO, Puppeteer, better-sqlite3
- **Frontend**: React 19, Vite, Tailwind CSS, Space Grotesk
- **Automação**: Puppeteer Extra + Stealth Plugin, whatsapp-web.js

---

*Browze Bot © 2025 — Feito com 💚*
