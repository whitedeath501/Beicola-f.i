const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const nodemailer = require("nodemailer");
const initSqlJs = require("sql.js");
require("dotenv").config();

const app = express();

const PORT = Number(process.env.PORT || 3000);
const FRONTEND_URL = (process.env.FRONTEND_URL || "").replace(/\/$/, "");

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "beicola.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(express.json({ limit: "200kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* =========================================================
   BANCO DE DADOS
========================================================= */

let db;

async function initDatabase() {
  const SQL = await initSqlJs({
    locateFile: (file) =>
      path.join(__dirname, "node_modules", "sql.js", "dist", file)
  });

  if (fs.existsSync(DB_FILE)) {
    const file = fs.readFileSync(DB_FILE);
    db = new SQL.Database(file);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    PRAGMA foreign_keys = ON;

    /* =====================================================
       USUÁRIOS
    ===================================================== */

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    /* =====================================================
       SESSÕES
    ===================================================== */

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    );

    /* =====================================================
       RECUPERAÇÃO DE SENHA
    ===================================================== */

    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    );

    /* =====================================================
       ENQUETES
    ===================================================== */

    CREATE TABLE IF NOT EXISTS polls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      multiple_choice INTEGER NOT NULL DEFAULT 0,
      closes_at TEXT,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by)
        REFERENCES users(id)
    );

    /* =====================================================
       VOTOS
    ===================================================== */

    CREATE TABLE IF NOT EXISTS votes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      poll_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      option_index INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (poll_id)
        REFERENCES polls(id)
        ON DELETE CASCADE,
      FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    );

    /* =====================================================
       JOGOS
    ===================================================== */

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      opponent TEXT NOT NULL,
      match_date TEXT NOT NULL,
      location TEXT,
      result TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    /* =====================================================
       AVISOS
    ===================================================== */

    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      created_by INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by)
        REFERENCES users(id)
    );

    /* =====================================================
       ESCALAÇÃO ANTIGA
       Mantida para não quebrar seu sistema atual.
    ===================================================== */

    CREATE TABLE IF NOT EXISTS lineup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_name TEXT NOT NULL,
      position TEXT,
      status TEXT DEFAULT 'reserva',
      number TEXT,
      notes TEXT
    );

    /* =====================================================
       JOGADORES
    ===================================================== */

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      /*
       * user_id permite transformar um membro
       * existente em jogador.
       */
      user_id INTEGER UNIQUE,

      name TEXT NOT NULL,

      /*
       * Número da camisa.
       * Pode ficar NULL enquanto não definido.
       */
      number INTEGER UNIQUE,

      /*
       * Exemplo:
       * goleiro
       * fixo
       * ala direito
       * ala esquerdo
       * pivô
       */
      primary_position TEXT NOT NULL,

      /*
       * JSON:
       * ["ala direito", "fixo"]
       */
      secondary_positions TEXT NOT NULL DEFAULT '[]',

      /*
       * disponivel
       * duvida
       * lesionado
       * suspenso
       * inativo
       */
      status TEXT NOT NULL DEFAULT 'disponivel',

      /*
       * Instruções gerais do jogador.
       */
      instructions TEXT NOT NULL DEFAULT '',

      /*
       * Apenas um jogador pode ser capitão.
       */
      is_captain INTEGER NOT NULL DEFAULT 0,

      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

      FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
    );

    /* =====================================================
       FUNÇÕES DOS JOGADORES
    ===================================================== */

    CREATE TABLE IF NOT EXISTS player_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      player_id INTEGER NOT NULL,

      /*
       * penalty
       * free_kick
       */
      role TEXT NOT NULL,

      /*
       * 1 = primeiro
       * 2 = segundo
       * etc.
       */
      priority INTEGER NOT NULL DEFAULT 1,

      UNIQUE(player_id, role, priority),

      FOREIGN KEY (player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
    );

    /* =====================================================
       ESCALAÇÃO ESPECÍFICA POR JOGO
    ===================================================== */

    CREATE TABLE IF NOT EXISTS match_lineup (
      id INTEGER PRIMARY KEY AUTOINCREMENT,

      match_id INTEGER NOT NULL,

      player_id INTEGER NOT NULL,

      /*
       * Posição que ele vai ocupar naquele jogo.
       */
      position TEXT NOT NULL,

      /*
       * 1 = titular
       * 0 = reserva
       */
      starter INTEGER NOT NULL DEFAULT 0,

      /*
       * Instrução específica para aquela partida.
       */
      instructions TEXT NOT NULL DEFAULT '',

      UNIQUE(match_id, player_id),

      FOREIGN KEY (match_id)
        REFERENCES matches(id)
        ON DELETE CASCADE,

      FOREIGN KEY (player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
    );
  `);

  saveDb();
}

function saveDb() {
  const data = db.export();

  fs.writeFileSync(
    DB_FILE,
    Buffer.from(data)
  );
}

/* =========================================================
   E-MAIL
========================================================= */

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === "true",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

async function enviarEmailRecuperacao(email, token) {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    throw new Error(
      "SMTP não está configurado."
    );
  }

  const baseUrl =
    FRONTEND_URL ||
    `http://localhost:${PORT}`;

  const link =
    `${baseUrl}/pages/reset-password.html?token=` +
    encodeURIComponent(token);

  await transporter.sendMail({
    from:
      process.env.MAIL_FROM ||
      process.env.SMTP_USER,

    to: email,

    subject:
      "Recuperação de senha — Beiçola F.I.",

    text:
      `Olá!\n\n` +
      `Recebemos uma solicitação para redefinir sua senha do Beiçola F.I.\n\n` +
      `Acesse o link abaixo para criar uma nova senha:\n\n` +
      `${link}\n\n` +
      `Este link é temporário e pode ser usado apenas uma vez.\n\n` +
      `Se você não solicitou a recuperação da senha, ignore este e-mail.\n\n` +
      `Beiçola F.I.`
  });
}

/* =========================================================
   RATE LIMITS
========================================================= */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Muitas tentativas. Aguarde alguns minutos e tente novamente."
  }
});

const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Muitas tentativas de cadastro. Aguarde alguns minutos."
  }
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Muitas solicitações. Aguarde alguns minutos."
  }
});

const setupAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      "Muitas tentativas de configuração."
  }
});

/* =========================================================
   FUNÇÕES AUXILIARES
========================================================= */

function getUserById(id) {
  const result = db.exec(
    `
      SELECT
        id,
        name,
        email,
        role,
        created_at
      FROM users
      WHERE id = ?
    `,
    [id]
  );

  if (
    !result.length ||
    !result[0].values.length
  ) {
    return null;
  }

  return rowToObject(result[0]);
}

function getUserByEmail(email) {
  const result = db.exec(
    `
      SELECT *
      FROM users
      WHERE LOWER(email) = LOWER(?)
    `,
    [email]
  );

  if (
    !result.length ||
    !result[0].values.length
  ) {
    return null;
  }

  return rowToObject(result[0]);
}

function rowToObject(result) {
  const columns = result.columns;
  const values = result.values[0];

  const obj = {};

  columns.forEach(
    (column, index) => {
      obj[column] = values[index];
    }
  );

  return obj;
}

function getRows(
  sql,
  params = []
) {
  const result = db.exec(
    sql,
    params
  );

  if (!result.length) {
    return [];
  }

  const columns =
    result[0].columns;

  return result[0].values.map(
    (values) => {
      const obj = {};

      columns.forEach(
        (column, index) => {
          obj[column] =
            values[index];
        }
      );

      return obj;
    }
  );
}

function getOne(
  sql,
  params = []
) {
  const rows = getRows(
    sql,
    params
  );

  return rows.length
    ? rows[0]
    : null;
}

function randomToken(
  bytes = 32
) {
  return crypto
    .randomBytes(bytes)
    .toString("hex");
}

function hashToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

function adminCount() {
  const row = getOne(
    `
      SELECT COUNT(*) AS count
      FROM users
      WHERE role = 'admin'
    `
  );

  return Number(
    row?.count || 0
  );
}

function setupAdminKeyValid(
  key
) {
  const configuredKey =
    process.env.ADMIN_SETUP_KEY;

  if (!configuredKey) {
    return false;
  }

  if (
    !key ||
    typeof key !== "string"
  ) {
    return false;
  }

  /*
   * timingSafeEqual exige buffers
   * com o mesmo tamanho.
   */
  if (
    key.length !==
    configuredKey.length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(key),
    Buffer.from(configuredKey)
  );
}

function normalizeStatus(status) {
  const allowed = [
    "disponivel",
    "duvida",
    "lesionado",
    "suspenso",
    "inativo"
  ];

  return allowed.includes(status)
    ? status
    : "disponivel";
}

function normalizePosition(position) {
  const allowed = [
    "goleiro",
    "fixo",
    "ala direito",
    "ala esquerdo",
    "pivô"
  ];

  return allowed.includes(
    String(position).toLowerCase()
  );
}

/* =========================================================
   AUTENTICAÇÃO
========================================================= */

async function authMiddleware(
  req,
  res,
  next
) {
  try {
    const sessionId =
      req.cookies.beicola_session;

    if (!sessionId) {
      req.user = null;
      return next();
    }

    const session = getOne(
      `
        SELECT
          s.id,
          s.user_id,
          s.expires_at,
          u.name,
          u.email,
          u.role
        FROM sessions s
        JOIN users u
          ON u.id = s.user_id
        WHERE s.id = ?
      `,
      [sessionId]
    );

    if (!session) {
      req.user = null;
      return next();
    }

    if (
      Number(session.expires_at) <
      Date.now()
    ) {
      db.run(
        `
          DELETE FROM sessions
          WHERE id = ?
        `,
        [sessionId]
      );

      saveDb();

      res.clearCookie(
        "beicola_session"
      );

      req.user = null;

      return next();
    }

    req.user = {
      id: session.user_id,
      name: session.name,
      email: session.email,
      role: session.role
    };

    next();
  } catch (error) {
    console.error(
      "Erro na autenticação:",
      error
    );

    req.user = null;

    next();
  }
}

function requireAuth(
  req,
  res,
  next
) {
  if (!req.user) {
    return res.status(401).json({
      error:
        "Você precisa estar logado."
    });
  }

  next();
}

function requireAdmin(
  req,
  res,
  next
) {
  if (!req.user) {
    return res.status(401).json({
      error:
        "Você precisa estar logado."
    });
  }

  if (
    req.user.role !== "admin"
  ) {
    return res.status(403).json({
      error:
        "Acesso permitido apenas para administradores."
    });
  }

  next();
}

app.use(authMiddleware);

/* =========================================================
   API — STATUS
========================================================= */

app.get(
  "/api/health",
  (req, res) => {
    res.json({
      ok: true,
      service:
        "Beiçola F.I."
    });
  }
);

/* =========================================================
   API — USUÁRIO ATUAL
========================================================= */

app.get(
  "/api/me",
  (req, res) => {
    if (!req.user) {
      return res.json({
        authenticated: false
      });
    }

    res.json({
      authenticated: true,
      user: req.user
    });
  }
);

/* =========================================================
   API — CADASTRO
========================================================= */

app.post(
  "/api/register",
  registerLimiter,
  async (req, res) => {
    try {
      const name =
        String(
          req.body.name || ""
        ).trim();

      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();

      const password =
        String(
          req.body.password || ""
        );

      if (
        !name ||
        !email ||
        !password
      ) {
        return res.status(400).json({
          error:
            "Preencha nome, e-mail e senha."
        });
      }

      if (name.length < 2) {
        return res.status(400).json({
          error:
            "Digite um nome válido."
        });
      }

      if (
        password.length < 8
      ) {
        return res.status(400).json({
          error:
            "A senha deve ter pelo menos 8 caracteres."
        });
      }

      const existing =
        getUserByEmail(
          email
        );

      if (existing) {
        return res.status(409).json({
          error:
            "Este e-mail já está cadastrado."
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      db.run(
        `
          INSERT INTO users
          (
            name,
            email,
            password_hash,
            role
          )
          VALUES (?, ?, ?, 'member')
        `,
        [
          name,
          email,
          passwordHash
        ]
      );

      saveDb();

      res.status(201).json({
        message:
          "Conta criada com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro no cadastro:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível criar a conta."
      });
    }
  }
);

/* =========================================================
   API — LOGIN
========================================================= */

app.post(
  "/api/login",
  loginLimiter,
  async (req, res) => {
    try {
      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();

      const password =
        String(
          req.body.password || ""
        );

      if (
        !email ||
        !password
      ) {
        return res.status(400).json({
          error:
            "Informe e-mail e senha."
        });
      }

      const user =
        getUserByEmail(
          email
        );

      if (!user) {
        return res.status(401).json({
          error:
            "E-mail ou senha incorretos."
        });
      }

      const validPassword =
        await bcrypt.compare(
          password,
          user.password_hash
        );

      if (!validPassword) {
        return res.status(401).json({
          error:
            "E-mail ou senha incorretos."
        });
      }

      const sessionId =
        randomToken(32);

      const expiresAt =
        Date.now() +
        7 *
          24 *
          60 *
          60 *
          1000;

      db.run(
        `
          INSERT INTO sessions
          (
            id,
            user_id,
            expires_at
          )
          VALUES (?, ?, ?)
        `,
        [
          sessionId,
          user.id,
          expiresAt
        ]
      );

      saveDb();

      res.cookie(
        "beicola_session",
        sessionId,
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV ===
            "production",
          sameSite: "lax",
          maxAge:
            7 *
            24 *
            60 *
            60 *
            1000,
          path: "/"
        }
      );

      res.json({
        message:
          "Login realizado com sucesso.",

        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role
        }
      });
    } catch (error) {
      console.error(
        "Erro no login:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível realizar o login."
      });
    }
  }
);

/* =========================================================
   API — LOGOUT
========================================================= */

app.post(
  "/api/logout",
  requireAuth,
  (req, res) => {
    const sessionId =
      req.cookies.beicola_session;

    if (sessionId) {
      db.run(
        `
          DELETE FROM sessions
          WHERE id = ?
        `,
        [sessionId]
      );

      saveDb();
    }

    res.clearCookie(
      "beicola_session"
    );

    res.json({
      message:
        "Logout realizado com sucesso."
    });
  }
);

/* =========================================================
   API — CONFIGURAÇÃO DO PRIMEIRO ADMIN
========================================================= */

app.get(
  "/api/setup-admin/status",
  (req, res) => {
    res.json({
      available:
        adminCount() === 0 &&
        Boolean(
          process.env.ADMIN_SETUP_KEY
        )
    });
  }
);

app.post(
  "/api/setup-admin",
  setupAdminLimiter,
  async (req, res) => {
    try {
      if (
        adminCount() > 0
      ) {
        return res.status(403).json({
          error:
            "A configuração inicial já foi concluída."
        });
      }

      const setupKey =
        String(
          req.body.key || ""
        );

      const name =
        String(
          req.body.name || ""
        ).trim();

      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();

      const password =
        String(
          req.body.password || ""
        );

      if (
        !setupAdminKeyValid(
          setupKey
        )
      ) {
        return res.status(403).json({
          error:
            "Chave de configuração inválida."
        });
      }

      if (
        !name ||
        !email ||
        !password
      ) {
        return res.status(400).json({
          error:
            "Preencha todos os campos."
        });
      }

      if (
        password.length < 8
      ) {
        return res.status(400).json({
          error:
            "A senha deve ter pelo menos 8 caracteres."
        });
      }

      const existing =
        getUserByEmail(
          email
        );

      if (existing) {
        return res.status(409).json({
          error:
            "Este e-mail já está cadastrado."
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      db.run(
        `
          INSERT INTO users
          (
            name,
            email,
            password_hash,
            role
          )
          VALUES (?, ?, ?, 'admin')
        `,
        [
          name,
          email,
          passwordHash
        ]
      );

      saveDb();

      res.status(201).json({
        message:
          "Administrador criado com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao criar administrador:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível criar o administrador."
      });
    }
  }
);

/* =========================================================
   API — RECUPERAÇÃO DE SENHA
========================================================= */

app.post(
  "/api/forgot-password",
  forgotPasswordLimiter,
  async (req, res) => {
    try {
      const email =
        String(
          req.body.email || ""
        )
          .trim()
          .toLowerCase();

      if (!email) {
        return res.status(400).json({
          error:
            "Informe seu e-mail."
        });
      }

      const user =
        getUserByEmail(
          email
        );

      const genericResponse = {
        message:
          "Se o e-mail estiver cadastrado, você receberá as instruções para recuperar sua senha."
      };

      if (!user) {
        return res.json(
          genericResponse
        );
      }

      db.run(
        `
          DELETE FROM password_resets
          WHERE user_id = ?
        `,
        [user.id]
      );

      const token =
        randomToken(32);

      const tokenHash =
        hashToken(token);

      const expiresAt =
        Date.now() +
        30 *
          60 *
          1000;

      db.run(
        `
          INSERT INTO password_resets
          (
            user_id,
            token_hash,
            expires_at,
            used
          )
          VALUES (?, ?, ?, 0)
        `,
        [
          user.id,
          tokenHash,
          expiresAt
        ]
      );

      saveDb();

      await enviarEmailRecuperacao(
        user.email,
        token
      );

      res.json(
        genericResponse
      );
    } catch (error) {
      console.error(
        "Erro na recuperação de senha:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível enviar o e-mail de recuperação."
      });
    }
  }
);

/* =========================================================
   API — RESET DA SENHA
========================================================= */

app.post(
  "/api/reset-password",
  async (req, res) => {
    try {
      const token =
        String(
          req.body.token || ""
        );

      const password =
        String(
          req.body.password || ""
        );

      if (
        !token ||
        !password
      ) {
        return res.status(400).json({
          error:
            "Token e nova senha são obrigatórios."
        });
      }

      if (
        password.length < 8
      ) {
        return res.status(400).json({
          error:
            "A senha deve ter pelo menos 8 caracteres."
        });
      }

      const tokenHash =
        hashToken(token);

      const reset =
        getOne(
          `
            SELECT
              id,
              user_id,
              expires_at,
              used
            FROM password_resets
            WHERE token_hash = ?
          `,
          [tokenHash]
        );

      if (!reset) {
        return res.status(400).json({
          error:
            "O link de recuperação é inválido."
        });
      }

      if (
        Number(reset.used) ===
        1
      ) {
        return res.status(400).json({
          error:
            "Este link de recuperação já foi utilizado."
        });
      }

      if (
        Number(reset.expires_at) <
        Date.now()
      ) {
        return res.status(400).json({
          error:
            "Este link de recuperação expirou. Solicite um novo."
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      db.run(
        `
          UPDATE users
          SET password_hash = ?
          WHERE id = ?
        `,
        [
          passwordHash,
          reset.user_id
        ]
      );

      db.run(
        `
          UPDATE password_resets
          SET used = 1
          WHERE id = ?
        `,
        [reset.id]
      );

      db.run(
        `
          DELETE FROM sessions
          WHERE user_id = ?
        `,
        [reset.user_id]
      );

      saveDb();

      res.json({
        message:
          "Senha alterada com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao redefinir senha:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível alterar a senha."
      });
    }
  }
);

/* =========================================================
   API — ALTERAR SENHA LOGADO
========================================================= */

app.post(
  "/api/change-password",
  requireAuth,
  async (req, res) => {
    try {
      const currentPassword =
        String(
          req.body.currentPassword ||
            ""
        );

      const newPassword =
        String(
          req.body.newPassword ||
            ""
        );

      if (
        !currentPassword ||
        !newPassword
      ) {
        return res.status(400).json({
          error:
            "Informe a senha atual e a nova senha."
        });
      }

      if (
        newPassword.length < 8
      ) {
        return res.status(400).json({
          error:
            "A nova senha deve ter pelo menos 8 caracteres."
        });
      }

      const user =
        db.exec(
          `
            SELECT *
            FROM users
            WHERE id = ?
          `,
          [req.user.id]
        );

      if (
        !user.length ||
        !user[0].values.length
      ) {
        return res.status(404).json({
          error:
            "Usuário não encontrado."
        });
      }

      const columns =
        user[0].columns;

      const values =
        user[0].values[0];

      const userData = {};

      columns.forEach(
        (column, index) => {
          userData[column] =
            values[index];
        }
      );

      const valid =
        await bcrypt.compare(
          currentPassword,
          userData.password_hash
        );

      if (!valid) {
        return res.status(401).json({
          error:
            "A senha atual está incorreta."
        });
      }

      const passwordHash =
        await bcrypt.hash(
          newPassword,
          12
        );

      db.run(
        `
          UPDATE users
          SET password_hash = ?
          WHERE id = ?
        `,
        [
          passwordHash,
          req.user.id
        ]
      );

      db.run(
        `
          DELETE FROM sessions
          WHERE user_id = ?
        `,
        [req.user.id]
      );

      saveDb();

      res.clearCookie(
        "beicola_session"
      );

      res.json({
        message:
          "Senha alterada com sucesso. Faça login novamente."
      });
    } catch (error) {
      console.error(
        "Erro ao alterar senha:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível alterar sua senha."
      });
    }
  }
);

/* =========================================================
   API — PERFIL
========================================================= */

app.get(
  "/api/profile",
  requireAuth,
  (req, res) => {
    const user =
      getOne(
        `
          SELECT
            id,
            name,
            email,
            role,
            created_at
          FROM users
          WHERE id = ?
        `,
        [req.user.id]
      );

    if (!user) {
      return res.status(404).json({
        error:
          "Usuário não encontrado."
      });
    }

    res.json({
      user
    });
  }
);

app.put(
  "/api/profile",
  requireAuth,
  (req, res) => {
    try {
      const name =
        String(
          req.body.name || ""
        ).trim();

      if (
        !name ||
        name.length < 2
      ) {
        return res.status(400).json({
          error:
            "Informe um nome válido."
        });
      }

      db.run(
        `
          UPDATE users
          SET name = ?
          WHERE id = ?
        `,
        [
          name,
          req.user.id
        ]
      );

      saveDb();

      res.json({
        message:
          "Perfil atualizado com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao atualizar perfil:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível atualizar o perfil."
      });
    }
  }
);

/* =========================================================
   API — MEMBROS
========================================================= */

app.get(
  "/api/members",
  requireAuth,
  (req, res) => {
    const members =
      getRows(
        `
          SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            u.created_at,

            CASE
              WHEN p.id IS NULL
              THEN 0
              ELSE 1
            END AS is_player,

            p.id AS player_id

          FROM users u

          LEFT JOIN players p
            ON p.user_id = u.id

          ORDER BY u.name ASC
        `
      );

    res.json({
      members
    });
  }
);

/* =========================================================
   API — JOGADORES
========================================================= */

/* LISTAR JOGADORES */

app.get(
  "/api/players",
  requireAuth,
  (req, res) => {
    try {
      const players =
        getRows(
          `
            SELECT
              p.id,
              p.user_id,
              p.name,
              p.number,
              p.primary_position,
              p.secondary_positions,
              p.status,
              p.instructions,
              p.is_captain,
              p.created_at,
              p.updated_at,
              u.email

            FROM players p

            LEFT JOIN users u
              ON u.id = p.user_id

            ORDER BY
              CASE
                WHEN p.number IS NULL
                THEN 999
                ELSE p.number
              END,
              p.name ASC
          `
        );

      res.json({
        players:
          players.map(
            (player) => ({
              ...player,

              secondary_positions:
                JSON.parse(
                  player.secondary_positions ||
                    "[]"
                ),

              is_captain:
                Boolean(
                  player.is_captain
                )
            })
          )
      });
    } catch (error) {
      console.error(
        "Erro ao listar jogadores:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar os jogadores."
      });
    }
  }
);

/* BUSCAR UM JOGADOR */

app.get(
  "/api/players/:id",
  requireAuth,
  (req, res) => {
    try {
      const id =
        Number(req.params.id);

      const player =
        getOne(
          `
            SELECT
              p.*,
              u.email
            FROM players p
            LEFT JOIN users u
              ON u.id = p.user_id
            WHERE p.id = ?
          `,
          [id]
        );

      if (!player) {
        return res.status(404).json({
          error:
            "Jogador não encontrado."
        });
      }

      player.secondary_positions =
        JSON.parse(
          player.secondary_positions ||
            "[]"
        );

      player.is_captain =
        Boolean(
          player.is_captain
        );

      res.json({
        player
      });
    } catch (error) {
      console.error(
        "Erro ao buscar jogador:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar o jogador."
      });
    }
  }
);

/* TRANSFORMAR MEMBRO EM JOGADOR */

app.post(
  "/api/players/from-member/:userId",
  requireAdmin,
  (req, res) => {
    try {
      const userId =
        Number(
          req.params.userId
        );

      const user =
        getOne(
          `
            SELECT
              id,
              name,
              email
            FROM users
            WHERE id = ?
          `,
          [userId]
        );

      if (!user) {
        return res.status(404).json({
          error:
            "Membro não encontrado."
        });
      }

      const alreadyPlayer =
        getOne(
          `
            SELECT id
            FROM players
            WHERE user_id = ?
          `,
          [userId]
        );

      if (alreadyPlayer) {
        return res.status(409).json({
          error:
            "Este membro já é um jogador."
        });
      }

      db.run(
        `
          INSERT INTO players
          (
            user_id,
            name,
            primary_position
          )
          VALUES (?, ?, ?)
        `,
        [
          user.id,
          user.name,
          "Não definida"
        ]
      );

      saveDb();

      const created =
        getOne(
          `
            SELECT
              last_insert_rowid()
              AS id
          `
        );

      res.status(201).json({
        message:
          "Membro transformado em jogador.",

        player_id:
          Number(
            created.id
          )
      });
    } catch (error) {
      console.error(
        "Erro ao transformar membro em jogador:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível transformar o membro em jogador."
      });
    }
  }
);

/* CRIAR JOGADOR */

app.post(
  "/api/players",
  requireAdmin,
  (req, res) => {
    try {
      const name =
        String(
          req.body.name || ""
        ).trim();

      const number =
        req.body.number ===
          null ||
        req.body.number ===
          undefined ||
        req.body.number === ""
          ? null
          : Number(
              req.body.number
            );

      const primaryPosition =
        String(
          req.body.primary_position ||
            ""
        ).trim();

      const secondaryPositions =
        Array.isArray(
          req.body.secondary_positions
        )
          ? req.body
              .secondary_positions
          : [];

      const status =
        normalizeStatus(
          String(
            req.body.status ||
              "disponivel"
          ).trim()
        );

      const instructions =
        String(
          req.body.instructions ||
            ""
        ).trim();

      const userId =
        req.body.user_id ===
          null ||
        req.body.user_id ===
          undefined ||
        req.body.user_id === ""
          ? null
          : Number(
              req.body.user_id
            );

      if (!name) {
        return res.status(400).json({
          error:
            "Informe o nome do jogador."
        });
      }

      if (!primaryPosition) {
        return res.status(400).json({
          error:
            "Informe a posição principal."
        });
      }

      if (
        number !== null &&
        (
          !Number.isInteger(
            number
          ) ||
          number < 0 ||
          number > 99
        )
      ) {
        return res.status(400).json({
          error:
            "O número da camisa deve estar entre 0 e 99."
        });
      }

      if (
        number !== null
      ) {
        const usedNumber =
          getOne(
            `
              SELECT id
              FROM players
              WHERE number = ?
            `,
            [number]
          );

        if (usedNumber) {
          return res.status(409).json({
            error:
              "Este número de camisa já está sendo usado."
          });
        }
      }

      if (
        userId !== null
      ) {
        const member =
          getOne(
            `
              SELECT id
              FROM users
              WHERE id = ?
            `,
            [userId]
          );

        if (!member) {
          return res.status(404).json({
            error:
              "Membro não encontrado."
          });
        }

        const linked =
          getOne(
            `
              SELECT id
              FROM players
              WHERE user_id = ?
            `,
            [userId]
          );

        if (linked) {
          return res.status(409).json({
            error:
              "Este membro já está cadastrado como jogador."
          });
        }
      }

      db.run(
        `
          INSERT INTO players
          (
            user_id,
            name,
            number,
            primary_position,
            secondary_positions,
            status,
            instructions
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          userId,
          name,
          number,
          primaryPosition,
          JSON.stringify(
            secondaryPositions
          ),
          status,
          instructions
        ]
      );

      saveDb();

      res.status(201).json({
        message:
          "Jogador criado com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao criar jogador:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível criar o jogador."
      });
    }
  }
);

/* EDITAR JOGADOR */

app.put(
  "/api/players/:id",
  requireAdmin,
  (req, res) => {
    try {
      const playerId =
        Number(
          req.params.id
        );

      const player =
        getOne(
          `
            SELECT *
            FROM players
            WHERE id = ?
          `,
          [playerId]
        );

      if (!player) {
        return res.status(404).json({
          error:
            "Jogador não encontrado."
        });
      }

      const name =
        req.body.name !==
        undefined
          ? String(
              req.body.name
            ).trim()
          : player.name;

      const number =
        req.body.number !==
        undefined
          ? (
              req.body.number ===
                "" ||
              req.body.number ===
                null
                ? null
                : Number(
                    req.body.number
                  )
            )
          : player.number;

      const primaryPosition =
        req.body.primary_position !==
        undefined
          ? String(
              req.body.primary_position
            ).trim()
          : player.primary_position;

      const secondaryPositions =
        req.body.secondary_positions !==
        undefined
          ? req.body
              .secondary_positions
          : JSON.parse(
              player.secondary_positions ||
                "[]"
            );

      const status =
        req.body.status !==
        undefined
          ? normalizeStatus(
              String(
                req.body.status
              ).trim()
            )
          : player.status;

      const instructions =
        req.body.instructions !==
        undefined
          ? String(
              req.body.instructions
            ).trim()
          : player.instructions;

      if (!name) {
        return res.status(400).json({
          error:
            "O nome do jogador é obrigatório."
        });
      }

      if (!primaryPosition) {
        return res.status(400).json({
          error:
            "A posição principal é obrigatória."
        });
      }

      if (
        number !== null &&
        (
          !Number.isInteger(
            number
          ) ||
          number < 0 ||
          number > 99
        )
      ) {
        return res.status(400).json({
          error:
            "O número deve estar entre 0 e 99."
        });
      }

      if (
        number !== null
      ) {
        const numberUsed =
          getOne(
            `
              SELECT id
              FROM players
              WHERE number = ?
              AND id != ?
            `,
            [
              number,
              playerId
            ]
          );

        if (numberUsed) {
          return res.status(409).json({
            error:
              "Este número já pertence a outro jogador."
          });
        }
      }

      db.run(
        `
          UPDATE players
          SET
            name = ?,
            number = ?,
            primary_position = ?,
            secondary_positions = ?,
            status = ?,
            instructions = ?,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          name,
          number,
          primaryPosition,
          JSON.stringify(
            secondaryPositions
          ),
          status,
          instructions,
          playerId
        ]
      );

      saveDb();

      res.json({
        message:
          "Jogador atualizado com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao editar jogador:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível editar o jogador."
      });
    }
  }
);

/* EXCLUIR JOGADOR */

app.delete(
  "/api/players/:id",
  requireAdmin,
  (req, res) => {
    try {
      const playerId =
        Number(
          req.params.id
        );

      const player =
        getOne(
          `
            SELECT id
            FROM players
            WHERE id = ?
          `,
          [playerId]
        );

      if (!player) {
        return res.status(404).json({
          error:
            "Jogador não encontrado."
        });
      }

      db.run(
        `
          DELETE FROM players
          WHERE id = ?
        `,
        [playerId]
      );

      saveDb();

      res.json({
        message:
          "Jogador removido com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao excluir jogador:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível excluir o jogador."
      });
    }
  }
);

/* =========================================================
   API — CAPITÃO
========================================================= */

app.put(
  "/api/players/:id/captain",
  requireAdmin,
  (req, res) => {
    try {
      const playerId =
        Number(
          req.params.id
        );

      const player =
        getOne(
          `
            SELECT id
            FROM players
            WHERE id = ?
          `,
          [playerId]
        );

      if (!player) {
        return res.status(404).json({
          error:
            "Jogador não encontrado."
        });
      }

      /*
       * Remove o capitão atual.
       */
      db.run(`
        UPDATE players
        SET is_captain = 0
      `);

      /*
       * Define o novo capitão.
       */
      db.run(
        `
          UPDATE players
          SET
            is_captain = 1,
            updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [playerId]
      );

      saveDb();

      res.json({
        message:
          "Capitão definido com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao definir capitão:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível definir o capitão."
      });
    }
  }
);

/* REMOVER CAPITÃO */

app.delete(
  "/api/players/captain",
  requireAdmin,
  (req, res) => {
    try {
      db.run(`
        UPDATE players
        SET is_captain = 0
      `);

      saveDb();

      res.json({
        message:
          "Capitão removido."
      });
    } catch (error) {
      console.error(
        "Erro ao remover capitão:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível remover o capitão."
      });
    }
  }
);

/* =========================================================
   API — BATEDORES DE FALTA E PÊNALTI
========================================================= */

app.put(
  "/api/player-roles/:role",
  requireAdmin,
  (req, res) => {
    try {
      const role =
        String(
          req.params.role
        ).trim();

      if (
        ![
          "penalty",
          "free_kick"
        ].includes(role)
      ) {
        return res.status(400).json({
          error:
            "Função inválida."
        });
      }

      if (
        !Array.isArray(
          req.body.players
        )
      ) {
        return res.status(400).json({
          error:
            "Informe os jogadores."
        });
      }

      db.run(
        `
          DELETE FROM player_roles
          WHERE role = ?
        `,
        [role]
      );

      const players = [
        ...new Set(
          req.body.players
            .map(Number)
            .filter(
              (id) =>
                Number.isInteger(id)
            )
        )
      ];

      for (
        let i = 0;
        i < players.length;
        i++
      ) {
        const player =
          getOne(
            `
              SELECT id
              FROM players
              WHERE id = ?
            `,
            [players[i]]
          );

        if (!player) {
          continue;
        }

        db.run(
          `
            INSERT INTO player_roles
            (
              player_id,
              role,
              priority
            )
            VALUES (?, ?, ?)
          `,
          [
            players[i],
            role,
            i + 1
          ]
        );
      }

      saveDb();

      res.json({
        message:
          "Batedores atualizados com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao atualizar batedores:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível atualizar os batedores."
      });
    }
  }
);

/* LISTAR BATEDORES */

app.get(
  "/api/player-roles",
  requireAuth,
  (req, res) => {
    try {
      const roles =
        getRows(
          `
            SELECT
              pr.id,
              pr.player_id,
              pr.role,
              pr.priority,
              p.name,
              p.number,
              p.primary_position
            FROM player_roles pr
            JOIN players p
              ON p.id = pr.player_id
            ORDER BY
              pr.role,
              pr.priority
          `
        );

      res.json({
        roles
      });
    } catch (error) {
      console.error(
        "Erro ao carregar batedores:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar os batedores."
      });
    }
  }
);

/* =========================================================
   API — ENQUETES
========================================================= */

app.get(
  "/api/polls",
  requireAuth,
  (req, res) => {
    const polls =
      getRows(
        `
          SELECT
            p.id,
            p.question,
            p.options_json,
            p.multiple_choice,
            p.closes_at,
            p.created_at,
            p.created_by,
            u.name AS creator_name

          FROM polls p

          LEFT JOIN users u
            ON u.id = p.created_by

          ORDER BY
            p.created_at DESC
        `
      );

    const result =
      polls.map(
        (poll) => {
          let options = [];

          try {
            options =
              JSON.parse(
                poll.options_json
              );
          } catch {
            options = [];
          }

          const votes =
            getRows(
              `
                SELECT
                  option_index,
                  COUNT(*) AS count
                FROM votes
                WHERE poll_id = ?
                GROUP BY option_index
              `,
              [poll.id]
            );

          const myVotes =
            getRows(
              `
                SELECT option_index
                FROM votes
                WHERE poll_id = ?
                AND user_id = ?
              `,
              [
                poll.id,
                req.user.id
              ]
            ).map(
              (vote) =>
                Number(
                  vote.option_index
                )
            );

          const totalVotes =
            votes.reduce(
              (
                sum,
                vote
              ) =>
                sum +
                Number(
                  vote.count
                ),
              0
            );

          const voteCounts =
            {};

          votes.forEach(
            (vote) => {
              voteCounts[
                vote.option_index
              ] =
                Number(
                  vote.count
                );
            }
          );

          return {
            id: poll.id,
            question:
              poll.question,
            options,
            multiple_choice:
              Boolean(
                poll.multiple_choice
              ),
            closes_at:
              poll.closes_at,
            created_at:
              poll.created_at,
            creator_name:
              poll.creator_name ||
              "Administrador",
            total_votes:
              totalVotes,
            vote_counts:
              voteCounts,
            my_votes:
              myVotes,
            closed:
              poll.closes_at &&
              new Date(
                poll.closes_at
              ).getTime() <=
                Date.now()
          };
        }
      );

    res.json({
      polls: result
    });
  }
);

app.post(
  "/api/polls",
  requireAdmin,
  (req, res) => {
    try {
      const question =
        String(
          req.body.question || ""
        ).trim();

      const options =
        Array.isArray(
          req.body.options
        )
          ? req.body.options
              .map(
                (option) =>
                  String(
                    option
                  ).trim()
              )
              .filter(Boolean)
          : [];

      const multipleChoice =
        Boolean(
          req.body.multiple_choice
        );

      const closesAt =
        req.body.closes_at
          ? String(
              req.body.closes_at
            )
          : null;

      if (!question) {
        return res.status(400).json({
          error:
            "Informe a pergunta da enquete."
        });
      }

      if (
        options.length < 2
      ) {
        return res.status(400).json({
          error:
            "A enquete precisa ter pelo menos duas opções."
        });
      }

      db.run(
        `
          INSERT INTO polls
          (
            question,
            options_json,
            multiple_choice,
            closes_at,
            created_by
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          question,
          JSON.stringify(
            options
          ),
          multipleChoice
            ? 1
            : 0,
          closesAt,
          req.user.id
        ]
      );

      saveDb();

      res.status(201).json({
        message:
          "Enquete criada com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao criar enquete:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível criar a enquete."
      });
    }
  }
);

app.post(
  "/api/polls/:id/vote",
  requireAuth,
  (req, res) => {
    try {
      const pollId =
        Number(
          req.params.id
        );

      const selectedOptions =
        Array.isArray(
          req.body.options
        )
          ? req.body.options.map(
              Number
            )
          : [];

      if (
        !selectedOptions.length
      ) {
        return res.status(400).json({
          error:
            "Selecione pelo menos uma opção."
        });
      }

      const poll =
        getOne(
          `
            SELECT *
            FROM polls
            WHERE id = ?
          `,
          [pollId]
        );

      if (!poll) {
        return res.status(404).json({
          error:
            "Enquete não encontrada."
        });
      }

      if (
        poll.closes_at &&
        new Date(
          poll.closes_at
        ).getTime() <=
          Date.now()
      ) {
        return res.status(400).json({
          error:
            "Esta enquete já foi encerrada."
        });
      }

      const options =
        JSON.parse(
          poll.options_json
        );

      const validOptions =
        selectedOptions.every(
          (index) =>
            Number.isInteger(
              index
            ) &&
            index >= 0 &&
            index < options.length
        );

      if (!validOptions) {
        return res.status(400).json({
          error:
            "Uma ou mais opções são inválidas."
        });
      }

      if (
        !poll.multiple_choice &&
        selectedOptions.length !==
          1
      ) {
        return res.status(400).json({
          error:
            "Esta enquete permite apenas uma opção."
        });
      }

      const existingVote =
        getOne(
          `
            SELECT id
            FROM votes
            WHERE poll_id = ?
            AND user_id = ?
            LIMIT 1
          `,
          [
            pollId,
            req.user.id
          ]
        );

      if (existingVote) {
        return res.status(409).json({
          error:
            "Você já votou nesta enquete."
        });
      }

      for (
        const optionIndex of
          selectedOptions
      ) {
        db.run(
          `
            INSERT INTO votes
            (
              poll_id,
              user_id,
              option_index
            )
            VALUES (?, ?, ?)
          `,
          [
            pollId,
            req.user.id,
            optionIndex
          ]
        );
      }

      saveDb();

      res.json({
        message:
          "Voto registrado com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao votar:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível registrar o voto."
      });
    }
  }
);

app.delete(
  "/api/polls/:id",
  requireAdmin,
  (req, res) => {
    try {
      const pollId =
        Number(
          req.params.id
        );

      const poll =
        getOne(
          `
            SELECT id
            FROM polls
            WHERE id = ?
          `,
          [pollId]
        );

      if (!poll) {
        return res.status(404).json({
          error:
            "Enquete não encontrada."
        });
      }

      db.run(
        `
          DELETE FROM polls
          WHERE id = ?
        `,
        [pollId]
      );

      saveDb();

      res.json({
        message:
          "Enquete excluída com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao excluir enquete:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível excluir a enquete."
      });
    }
  }
);

/* =========================================================
   API — JOGOS
========================================================= */

app.get(
  "/api/matches",
  requireAuth,
  (req, res) => {
    const matches =
      getRows(
        `
          SELECT *
          FROM matches
          ORDER BY
            match_date ASC
        `
      );

    res.json({
      matches
    });
  }
);

app.post(
  "/api/matches",
  requireAdmin,
  (req, res) => {
    try {
      const opponent =
        String(
          req.body.opponent || ""
        ).trim();

      const matchDate =
        String(
          req.body.match_date ||
            ""
        ).trim();

      const location =
        String(
          req.body.location || ""
        ).trim();

      const result =
        String(
          req.body.result || ""
        ).trim();

      const notes =
        String(
          req.body.notes || ""
        ).trim();

      if (
        !opponent ||
        !matchDate
      ) {
        return res.status(400).json({
          error:
            "Informe adversário e data."
        });
      }

      db.run(
        `
          INSERT INTO matches
          (
            opponent,
            match_date,
            location,
            result,
            notes
          )
          VALUES (?, ?, ?, ?, ?)
        `,
        [
          opponent,
          matchDate,
          location,
          result,
          notes
        ]
      );

      saveDb();

      res.status(201).json({
        message:
          "Jogo adicionado com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao adicionar jogo:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível adicionar o jogo."
      });
    }
  }
);

app.delete(
  "/api/matches/:id",
  requireAdmin,
  (req, res) => {
    try {
      const id =
        Number(
          req.params.id
        );

      db.run(
        `
          DELETE FROM matches
          WHERE id = ?
        `,
        [id]
      );

      saveDb();

      res.json({
        message:
          "Jogo removido com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao remover jogo:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível remover o jogo."
      });
    }
  }
);

/* =========================================================
   API — ESCALAÇÃO POR PARTIDA
========================================================= */

app.put(
  "/api/matches/:matchId/lineup",
  requireAdmin,
  (req, res) => {
    try {
      const matchId =
        Number(
          req.params.matchId
        );

      const match =
        getOne(
          `
            SELECT id
            FROM matches
            WHERE id = ?
          `,
          [matchId]
        );

      if (!match) {
        return res.status(404).json({
          error:
            "Jogo não encontrado."
        });
      }

      if (
        !Array.isArray(
          req.body.lineup
        )
      ) {
        return res.status(400).json({
          error:
            "A escalação precisa ser uma lista."
        });
      }

      /*
       * Limpa a escalação anterior
       * daquele jogo.
       */
      db.run(
        `
          DELETE FROM match_lineup
          WHERE match_id = ?
        `,
        [matchId]
      );

      const starters =
        req.body.lineup.filter(
          (item) =>
            item.starter
        );

      /*
       * Futsal possui cinco titulares.
       */
      if (
        starters.length > 5
      ) {
        return res.status(400).json({
          error:
            "Uma escalação de futsal pode ter no máximo 5 titulares."
        });
      }

      for (
        const item of
          req.body.lineup
      ) {
        const playerId =
          Number(
            item.player_id
          );

        const position =
          String(
            item.position || ""
          ).trim();

        const starter =
          item.starter
            ? 1
            : 0;

        const instructions =
          String(
            item.instructions ||
              ""
          ).trim();

        if (
          !Number.isInteger(
            playerId
          ) ||
          !position
        ) {
          continue;
        }

        const player =
          getOne(
            `
              SELECT id
              FROM players
              WHERE id = ?
            `,
            [playerId]
          );

        if (!player) {
          continue;
        }

        db.run(
          `
            INSERT INTO match_lineup
            (
              match_id,
              player_id,
              position,
              starter,
              instructions
            )
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            matchId,
            playerId,
            position,
            starter,
            instructions
          ]
        );
      }

      saveDb();

      res.json({
        message:
          "Escalação salva com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao salvar escalação:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível salvar a escalação."
      });
    }
  }
);

app.get(
  "/api/matches/:matchId/lineup",
  requireAuth,
  (req, res) => {
    try {
      const matchId =
        Number(
          req.params.matchId
        );

      const lineup =
        getRows(
          `
            SELECT
              ml.id,
              ml.match_id,
              ml.player_id,
              ml.position,
              ml.starter,
              ml.instructions,

              p.name,
              p.number,
              p.primary_position,
              p.status,
              p.is_captain

            FROM match_lineup ml

            JOIN players p
              ON p.id =
                ml.player_id

            WHERE ml.match_id = ?

            ORDER BY
              ml.starter DESC,
              ml.position,
              p.name
          `,
          [matchId]
        );

      res.json({
        lineup
      });
    } catch (error) {
      console.error(
        "Erro ao carregar escalação:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível carregar a escalação."
      });
    }
  }
);

/* =========================================================
   API — AVISOS / NOTÍCIAS
========================================================= */

app.get(
  "/api/announcements",
  requireAuth,
  (req, res) => {
    const announcements =
      getRows(
        `
          SELECT
            a.id,
            a.title,
            a.content,
            a.created_at,
            a.created_by,
            u.name AS creator_name

          FROM announcements a

          LEFT JOIN users u
            ON u.id =
              a.created_by

          ORDER BY
            a.created_at DESC
        `
      );

    res.json({
      announcements
    });
  }
);

app.post(
  "/api/announcements",
  requireAdmin,
  (req, res) => {
    try {
      const title =
        String(
          req.body.title || ""
        ).trim();

      const content =
        String(
          req.body.content || ""
        ).trim();

      if (
        !title ||
        !content
      ) {
        return res.status(400).json({
          error:
            "Informe título e conteúdo."
        });
      }

      db.run(
        `
          INSERT INTO announcements
          (
            title,
            content,
            created_by
          )
          VALUES (?, ?, ?)
        `,
        [
          title,
          content,
          req.user.id
        ]
      );

      saveDb();

      res.status(201).json({
        message:
          "Aviso publicado com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao publicar aviso:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível publicar o aviso."
      });
    }
  }
);

app.delete(
  "/api/announcements/:id",
  requireAdmin,
  (req, res) => {
    try {
      const id =
        Number(
          req.params.id
        );

      db.run(
        `
          DELETE FROM announcements
          WHERE id = ?
        `,
        [id]
      );

      saveDb();

      res.json({
        message:
          "Aviso removido com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao remover aviso:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível remover o aviso."
      });
    }
  }
);

/* =========================================================
   API — ESCALAÇÃO ANTIGA
========================================================= */

app.get(
  "/api/lineup",
  requireAuth,
  (req, res) => {
    const lineup =
      getRows(
        `
          SELECT *
          FROM lineup

          ORDER BY
            CASE
              WHEN status =
                'titular'
              THEN 0
              ELSE 1
            END,

            id ASC
        `
      );

    res.json({
      lineup
    });
  }
);

app.put(
  "/api/lineup",
  requireAdmin,
  (req, res) => {
    try {
      if (
        !Array.isArray(
          req.body.lineup
        )
      ) {
        return res.status(400).json({
          error:
            "A escalação precisa ser uma lista."
        });
      }

      db.run(
        `DELETE FROM lineup`
      );

      for (
        const player of
          req.body.lineup
      ) {
        const playerName =
          String(
            player.player_name ||
              ""
          ).trim();

        if (!playerName) {
          continue;
        }

        const position =
          String(
            player.position ||
              ""
          ).trim();

        const status =
          String(
            player.status ||
              "reserva"
          ).trim();

        const number =
          String(
            player.number ||
              ""
          ).trim();

        const notes =
          String(
            player.notes ||
              ""
          ).trim();

        db.run(
          `
            INSERT INTO lineup
            (
              player_name,
              position,
              status,
              number,
              notes
            )
            VALUES (?, ?, ?, ?, ?)
          `,
          [
            playerName,
            position,
            status,
            number,
            notes
          ]
        );
      }

      saveDb();

      res.json({
        message:
          "Escalação atualizada com sucesso."
      });
    } catch (error) {
      console.error(
        "Erro ao atualizar escalação:",
        error
      );

      res.status(500).json({
        error:
          "Não foi possível atualizar a escalação."
      });
    }
  }
);

/* =========================================================
   ARQUIVOS DO FRONTEND
========================================================= */

app.use(
  express.static(
    FRONTEND_DIR
  )
);

/*
 * Permite acessar páginas HTML
 * diretamente.
 *
 * A API continua protegida
 * pelas rotas acima.
 */
app.get(
  "*",
  (req, res, next) => {
    if (
      req.path.startsWith(
        "/api/"
      )
    ) {
      return next();
    }

    res.sendFile(
      path.join(
        FRONTEND_DIR,
        "index.html"
      )
    );
  }
);

/* =========================================================
   TRATAMENTO DE ERROS
========================================================= */

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(
      "Erro interno:",
      err
    );

    res.status(500).json({
      error:
        "Ocorreu um erro interno no servidor."
    });
  }
);

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

initDatabase()
  .then(() => {
    app.listen(
      PORT,
      "0.0.0.0",
      () => {
        console.log(
          `Beiçola F.I. rodando em http://localhost:${PORT}`
        );
      }
    );
  })
  .catch(
    (error) => {
      console.error(
        "Erro ao iniciar banco de dados:",
        error
      );

      process.exit(1);
    }
  );
