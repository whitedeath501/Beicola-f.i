# Beiçola F.I. — Área Pessoal v2

Versão corrigida para Node.js 24.16.0.

A versão anterior usava `better-sqlite3@11`, que no Node 24 pode tentar compilação nativa. Esta versão usa `sql.js`, que não depende de Visual Studio/C++ para a instalação.

## Requisitos
Node.js 22.5+ (testado como alvo para Node 24).

## Instalação no Windows
1. Extraia o ZIP.
2. Abra o **Prompt de Comando (CMD)**.
3. Entre em `backend`.
4. Execute:

```cmd
npm install
npm start
```

5. Abra `http://localhost:3000`.

## Primeiro administrador
Crie uma conta no site, pare o servidor com `Ctrl+C` e execute:

```cmd
npm run make-admin -- seu-email@exemplo.com
```

Depois execute `npm start` novamente.

## O que mudou
- Removido `better-sqlite3`.
- Removida a necessidade de `node-gyp`/Visual Studio para o banco.
- Mantidos login, cadastro, sessão, recuperação de senha, troca de senha, enquetes, votos, partidas, avisos, escalação e administração.


## Correção v2.1
Ajustado o binding de parâmetros nomeados do sql.js para o cadastro e demais operações do banco.
