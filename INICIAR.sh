#!/bin/bash
# Script de inicialização para macOS e Linux

echo "========================================"
echo "      Browze Bot — Automation Suite     "
echo "========================================"
echo ""

# Verifica se o Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "[ERRO] Node.js não encontrado. Por favor, instale o Node.js v18 ou superior."
    echo "Baixe em: https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v)
echo "[OK] Node.js encontrado: $NODE_VERSION"

# Verifica se o NPM está instalado
if ! command -v npm &> /dev/null; then
    echo "[ERRO] npm não encontrado."
    exit 1
fi

# Instala dependências globais e locais se necessário
if [ ! -d "node_modules" ] || [ ! -d "server/node_modules" ] || [ ! -d "client/node_modules" ]; then
    echo "[*] Instalando dependências (Isso pode levar alguns minutos na primeira vez)..."
    
    # Instala no raiz
    npm install
    
    # Instala no server e client
    npm run install:all
    
    if [ $? -ne 0 ]; then
        echo "[ERRO] Falha ao instalar dependências. Verifique se possui os compiladores necessários instalados (ex: build-essential no Linux ou Xcode no Mac)."
        exit 1
    fi
    echo "[OK] Dependências instaladas com sucesso!"
else
    echo "[OK] Dependências já instaladas."
fi

# Cria o .env se não existir
if [ ! -f "server/.env" ]; then
    if [ -f "server/.env.example" ]; then
        cp server/.env.example server/.env
        echo "[OK] Arquivo .env criado a partir do .env.example"
    fi
fi

# Libera a porta 3000
echo "[*] Verificando porta 3000 (Backend)..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "[!] Porta 3000 em uso. Encerrando o processo antigo..."
    kill -9 $(lsof -Pi :3000 -sTCP:LISTEN -t)
    sleep 1
fi
echo "[OK] Porta 3000 livre."

# Libera a porta 5173
echo "[*] Verificando porta 5173 (Frontend)..."
if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null ; then
    echo "[!] Porta 5173 em uso. Encerrando o processo antigo..."
    kill -9 $(lsof -Pi :5173 -sTCP:LISTEN -t)
    sleep 1
fi
echo "[OK] Porta 5173 livre."

# Inicia o aplicativo em modo de desenvolvimento
echo ""
echo "[*] Iniciando o Browze Bot..."
echo ""
npm run dev
