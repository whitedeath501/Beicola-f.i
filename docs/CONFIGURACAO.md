# Configuração

## 1. Instalação
Abra o CMD dentro de `backend` e execute:

```cmd
npm install
npm start
```

Abra `http://localhost:3000`.

## 2. Administrador
Cadastre uma conta normalmente. Depois pare o servidor com `Ctrl+C` e execute:

```cmd
npm run make-admin -- seu-email@exemplo.com
```

Depois execute `npm start` novamente.

## 3. Recuperação por e-mail
Copie `.env.example` para `.env` e preencha SMTP. Sem SMTP, em desenvolvimento o link de recuperação aparece no terminal.

## Banco
Esta versão usa `sql.js`, SQLite compilado para WebAssembly. Não usa `better-sqlite3`, `node-gyp` ou Visual Studio/C++ para instalar o banco. O arquivo persistente fica em `backend/data/beicola.sqlite`.
