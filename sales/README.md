# Infraestrutura de Vendas — Browze Bot

Este diretório contém toda a infraestrutura para vender o Browze Bot como produto (curso + licença de software).

---

## 📁 Estrutura

```
sales/
├── landing/           ← Landing page de vendas
│   ├── index.html
│   ├── style.css
│   └── script.js
├── license-server/    ← Servidor de licenças (Node.js)
│   ├── index.js       ← API Express
│   ├── package.json
│   └── .env.example
└── admin/             ← Painel de gestão de licenças
    └── index.html
```

---

## 🚀 Deploy do Servidor de Licenças

### Opção 1 — Railway (Recomendado, grátis no início)

1. Crie conta em [railway.app](https://railway.app)
2. Clique em "New Project" → "Deploy from GitHub"
3. Conecte o repositório e selecione a pasta `sales/license-server` como root
4. Configure as variáveis de ambiente:

```
PORT=4444
ADMIN_TOKEN=<token-secreto-forte>
CAKTO_SECRET=<seu-secret-do-cakto>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu@gmail.com
SMTP_PASS=<senha-de-app-gmail>
SERVER_URL=https://seu-projeto.railway.app
```

5. Pegue a URL pública gerada pelo Railway

### Opção 2 — Render (grátis)

1. Crie conta em [render.com](https://render.com)
2. "New Web Service" → conecte o repo
3. Root Directory: `sales/license-server`
4. Start Command: `node index.js`
5. Configure as variáveis de ambiente (mesmas acima)

---

## 🌐 Deploy da Landing Page

### Vercel (Recomendado, grátis)

```bash
# Instale a CLI do Vercel
npm i -g vercel

# Na pasta da landing
cd sales/landing
vercel --prod
```

Ou simplesmente arraste a pasta `sales/landing` para [vercel.com/new](https://vercel.com/new).

### Netlify

Arraste a pasta `sales/landing` para [netlify.com/drop](https://netlify.com/drop).

---

## 🔗 Configurar Webhook no Cakto

1. No painel do Cakto, vá em **Produto → Webhooks**
2. Adicione uma URL de webhook:
   ```
   https://SEU-SERVIDOR.railway.app/webhook/cakto
   ```
3. Selecione o evento: `purchase.approved` (ou equivalente)
4. Salve

A cada venda aprovada, o servidor irá:
- ✅ Gerar uma chave de licença única no formato `BROWZE-XXXX-XXXX-XXXX-XXXX`
- ✅ Salvar no banco SQLite
- ✅ Enviar email ao comprador com a chave

---

## 🔑 Painel Admin

Abra o arquivo `sales/admin/index.html` diretamente no navegador.

Ao logar, informe:
- **URL do servidor**: `https://SEU-SERVIDOR.railway.app`
- **Token de admin**: o valor de `ADMIN_TOKEN` do seu `.env`

No painel você pode:
- Ver estatísticas de vendas
- Listar, buscar e filtrar licenças
- Criar licenças manualmente (cortesias, bônus)
- Revogar/reativar licenças
- Deletar licenças

---

## ⚡ App Electron — Verificação de Licença

O arquivo `electron/main.js` já está configurado para:

1. **Na inicialização**: Verifica se há uma licença cacheada localmente (validade: 1 dia)
2. **Se cache expirado**: Reconecta ao servidor de licenças
3. **Se offline**: Usa o cache por até 7 dias (período de graça)
4. **Se sem licença**: Abre a tela de ativação (`electron/license.html`)

### Configurar URL do servidor no app

No `electron/main.js`, mude a variável `LICENSE_SERVER`:

```js
const LICENSE_SERVER = 'https://SEU-SERVIDOR.railway.app';
```

---

## 📧 Configurar Gmail para Envio de Emails

1. Ative a [verificação em 2 etapas](https://myaccount.google.com/security) na sua conta Google
2. Acesse [Senhas de app](https://myaccount.google.com/apppasswords)
3. Gere uma senha de app para "Email"
4. Use essa senha no campo `SMTP_PASS` do `.env`

---

## 📊 Fluxo Completo

```
Cliente → Compra no Cakto
              ↓
         Cakto dispara webhook
              ↓
         Servidor gera licença BROWZE-XXXX-XXXX
              ↓
         Email enviado ao cliente com a chave
              ↓
         Cliente baixa o app e insere a chave
              ↓
         App valida com o servidor → LIBERADO ✅
```

---

## 🛡️ Segurança

- Licenças são vinculadas ao **Machine ID** do hardware do cliente
- Máximo de 1 dispositivo por licença (configurável)
- Admin protegido por token secreto
- HTTPS obrigatório em produção

---

*Browze Bot © 2025*
