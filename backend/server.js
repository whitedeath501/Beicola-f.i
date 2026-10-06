const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const initSqlJs = require('sql.js');

require('dotenv').config({
  path: path.join(__dirname, '.env')
});

const PORT = Number(process.env.PORT || 3000);

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'beicola.sqlite');
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

fs.mkdirSync(DATA_DIR, { recursive: true });

let SQL;
let db;

function saveDb() {
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}

function paramsObject(params) {
  const out = {};

  for (const [key, value] of Object.entries(params || {})) {
    out[
      key.startsWith(':') ||
      key.startsWith('$') ||
      key.startsWith('@')
        ? key
        : ':' + key
    ] = value;
  }

  return out;
}

function run(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(paramsObject(params));
  stmt.step();
  stmt.free();
  saveDb();
}

function get(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(paramsObject(params));

  const row = stmt.step()
    ? stmt.getAsObject()
    : null;

  stmt.free();

  return row;
}

function all(sql, params = {}) {
  const stmt = db.prepare(sql);
  stmt.bind(paramsObject(params));

  const rows = [];

  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }

  stmt.free();

  return rows;
}

function scalar(sql, params = {}) {
  const row = get(sql, params);
  return row ? Object.values(row)[0] : undefined;
}

function now() {
  return new Date().toISOString();
}

function id(bytes = 24) {
  return crypto.randomBytes(bytes).toString('hex');
}

function hash(value) {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex');
}

function publicUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    created_at: user.created_at
  };
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function adminCount() {
  return Number(
    scalar("SELECT COUNT(*) FROM users WHERE role='admin'") || 0
  );
}

function setupAdminKeyValid(value) {
  const configured = String(
    process.env.ADMIN_SETUP_KEY || ''
  );

  const provided = String(value || '');

  if (!configured || !provided) {
    return false;
  }

  const a = Buffer.from(configured);
  const b = Buffer.from(provided);

  if (a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7
  };
}

function transporter() {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  ) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE) === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function init() {
  SQL = await initSqlJs({
    locateFile: file =>
      path.join(
        __dirname,
        'node_modules',
        'sql.js',
        'dist',
        file
      )
  });

  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(
      fs.readFileSync(DB_FILE)
    );
  } else {
    db = new SQL.Database();
  }

  db.run(`
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS users(
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions(
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_resets(
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS polls(
      id TEXT PRIMARY KEY,
      question TEXT NOT NULL,
      options_json TEXT NOT NULL,
      multiple INTEGER NOT NULL DEFAULT 0,
      closes_at TEXT,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      closed INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY(created_by)
        REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS votes(
      id TEXT PRIMARY KEY,
      poll_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      option_indexes_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(poll_id,user_id),
      FOREIGN KEY(poll_id)
        REFERENCES polls(id)
        ON DELETE CASCADE,
      FOREIGN KEY(user_id)
        REFERENCES users(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS matches(
      id TEXT PRIMARY KEY,
      opponent TEXT NOT NULL,
      date TEXT NOT NULL,
      time TEXT,
      location TEXT,
      result TEXT,
      status TEXT NOT NULL DEFAULT 'agendada',
      notes TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS announcements(
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(created_by)
        REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS lineup(
      id TEXT PRIMARY KEY,
      player_name TEXT NOT NULL,
      position TEXT,
      starter INTEGER NOT NULL DEFAULT 0,
      injured INTEGER NOT NULL DEFAULT 0,
      number TEXT,
      notes TEXT,
      updated_at TEXT NOT NULL
    );
  `);

  saveDb();
}

const app = express();

app.use(
  helmet({
    contentSecurityPolicy: false
  })
);

app.use(
  express.json({
    limit: '1mb'
  })
);

app.use(cookieParser());

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
  })
);

app.use(express.static(FRONTEND_DIR));

/*
  RATE LIMIT ESPECÍFICO PARA A CONFIGURAÇÃO
  DO PRIMEIRO ADMINISTRADOR.
*/
const setupAdminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error:
      'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  }
});

function auth(req, res, next) {
  const sessionId =
    req.cookies.beicola_session;

  if (!sessionId) {
    return res
      .status(401)
      .json({
        error: 'Não autenticado.'
      });
  }

  const session = get(
    `
      SELECT *
      FROM sessions
      WHERE id=:id
      AND expires_at>:now
    `,
    {
      id: sessionId,
      now: now()
    }
  );

  if (!session) {
    res.clearCookie(
      'beicola_session'
    );

    return res
      .status(401)
      .json({
        error: 'Sessão expirada.'
      });
  }

  const user = get(
    `
      SELECT
        id,
        name,
        email,
        role,
        created_at
      FROM users
      WHERE id=:id
    `,
    {
      id: session.user_id
    }
  );

  if (!user) {
    return res
      .status(401)
      .json({
        error: 'Usuário não encontrado.'
      });
  }

  req.user = user;

  next();
}

function admin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res
      .status(403)
      .json({
        error:
          'Acesso de administrador necessário.'
      });
  }

  next();
}

/* =========================
   HEALTH
========================= */

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    node: process.version,
    database: 'SQLite via sql.js',
    setupAdminAvailable:
      adminCount() === 0 &&
      !!process.env.ADMIN_SETUP_KEY
  });
});

/* =========================
   PRIMEIRO ADMIN
========================= */

app.get(
  '/api/setup-admin/status',
  (req, res) => {
    res.json({
      available:
        adminCount() === 0 &&
        !!process.env.ADMIN_SETUP_KEY
    });
  }
);

app.post(
  '/api/setup-admin',
  setupAdminLimiter,
  async (req, res) => {
    try {
      /*
        Se já existe administrador,
        esta função fica bloqueada.
      */
      if (adminCount() > 0) {
        return res
          .status(409)
          .json({
            error:
              'A configuração do primeiro administrador já foi concluída.'
          });
      }

      if (!process.env.ADMIN_SETUP_KEY) {
        return res
          .status(503)
          .json({
            error:
              'A chave de configuração do administrador ainda não foi configurada no servidor.'
          });
      }

      if (
        !setupAdminKeyValid(
          req.body?.setupKey
        )
      ) {
        return res
          .status(403)
          .json({
            error:
              'Chave de configuração inválida.'
          });
      }

      const name =
        String(
          req.body?.name || ''
        ).trim();

      const email =
        String(
          req.body?.email || ''
        )
          .toLowerCase()
          .trim();

      const password =
        String(
          req.body?.password || ''
        );

      if (
        name.length < 2 ||
        !validEmail(email) ||
        password.length < 8
      ) {
        return res
          .status(400)
          .json({
            error:
              'Nome, e-mail válido e senha de pelo menos 8 caracteres são necessários.'
          });
      }

      const existing = get(
        `
          SELECT id
          FROM users
          WHERE email=:email
        `,
        {
          email
        }
      );

      if (existing) {
        return res
          .status(409)
          .json({
            error:
              'Este e-mail já está cadastrado. Entre normalmente.'
          });
      }

      const user = {
        id: id(),
        name,
        email,
        password_hash:
          await bcrypt.hash(
            password,
            12
          ),
        role: 'admin',
        created_at: now()
      };

      run(
        `
          INSERT INTO users(
            id,
            name,
            email,
            password_hash,
            role,
            created_at
          )
          VALUES(
            :id,
            :name,
            :email,
            :password_hash,
            :role,
            :created_at
          )
        `,
        user
      );

      res
        .status(201)
        .json({
          message:
            'Administrador criado com sucesso. Agora entre normalmente.',
          user: publicUser(user)
        });

    } catch (error) {
      console.error(
        'Erro setup-admin:',
        error
      );

      res
        .status(500)
        .json({
          error:
            'Não foi possível criar o administrador.'
        });
    }
  }
);

/* =========================
   CONTAS
========================= */

app.post(
  '/api/register',
  async (req, res) => {
    try {
      const {
        name,
        email,
        password
      } = req.body || {};

      if (
        !name ||
        name.trim().length < 2 ||
        !validEmail(email) ||
        !password ||
        password.length < 8
      ) {
        return res
          .status(400)
          .json({
            error:
              'Nome, e-mail válido e senha de pelo menos 8 caracteres são necessários.'
          });
      }

      const normalizedEmail =
        email.toLowerCase().trim();

      const exists = get(
        `
          SELECT id
          FROM users
          WHERE email=:email
        `,
        {
          email: normalizedEmail
        }
      );

      if (exists) {
        return res
          .status(409)
          .json({
            error:
              'Este e-mail já está cadastrado.'
          });
      }

      const user = {
        id: id(),
        name: name.trim(),
        email: normalizedEmail,
        password_hash:
          await bcrypt.hash(
            password,
            12
          ),
        role: 'member',
        created_at: now()
      };

      run(
        `
          INSERT INTO users(
            id,
            name,
            email,
            password_hash,
            role,
            created_at
          )
          VALUES(
            :id,
            :name,
            :email,
            :password_hash,
            :role,
            :created_at
          )
        `,
        user
      );

      res
        .status(201)
        .json({
          user: publicUser(user)
        });

    } catch (error) {
      console.error(error);

      res
        .status(500)
        .json({
          error:
            'Erro ao cadastrar.'
        });
    }
  }
);

app.post(
  '/api/login',
  async (req, res) => {
    const {
      email,
      password
    } = req.body || {};

    const user = get(
      `
        SELECT *
        FROM users
        WHERE email=:email
      `,
      {
        email:
          String(
            email || ''
          )
            .toLowerCase()
            .trim()
      }
    );

    if (
      !user ||
      !(await bcrypt.compare(
        String(password || ''),
        user.password_hash
      ))
    ) {
      return res
        .status(401)
        .json({
          error:
            'E-mail ou senha incorretos.'
        });
    }

    const sessionId = id(32);

    run(
      `
        INSERT INTO sessions(
          id,
          user_id,
          expires_at,
          created_at
        )
        VALUES(
          :id,
          :user_id,
          :expires_at,
          :created_at
        )
      `,
      {
        id: sessionId,
        user_id: user.id,
        expires_at:
          new Date(
            Date.now() +
            7 * 864e5
          ).toISOString(),
        created_at: now()
      }
    );

    res
      .cookie(
        'beicola_session',
        sessionId,
        cookieOptions()
      )
      .json({
        user: publicUser(user)
      });
  }
);

app.post(
  '/api/logout',
  auth,
  (req, res) => {
    run(
      `
        DELETE FROM sessions
        WHERE id=:id
      `,
      {
        id:
          req.cookies
            .beicola_session
      }
    );

    res.clearCookie(
      'beicola_session'
    );

    res.json({
      ok: true
    });
  }
);

app.get(
  '/api/me',
  auth,
  (req, res) => {
    res.json({
      user: req.user
    });
  }
);

/* =========================
   SENHA
========================= */

app.post(
  '/api/change-password',
  auth,
  async (req, res) => {
    const {
      currentPassword,
      newPassword
    } = req.body || {};

    const user = get(
      `
        SELECT *
        FROM users
        WHERE id=:id
      `,
      {
        id: req.user.id
      }
    );

    if (
      !await bcrypt.compare(
        String(
          currentPassword || ''
        ),
        user.password_hash
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'Senha atual incorreta.'
        });
    }

    if (
      !newPassword ||
      newPassword.length < 8
    ) {
      return res
        .status(400)
        .json({
          error:
            'A nova senha precisa ter pelo menos 8 caracteres.'
        });
    }

    run(
      `
        UPDATE users
        SET password_hash=:p
        WHERE id=:id
      `,
      {
        p:
          await bcrypt.hash(
            newPassword,
            12
          ),
        id: req.user.id
      }
    );

    run(
      `
        DELETE FROM sessions
        WHERE user_id=:id
      `,
      {
        id: req.user.id
      }
    );

    res.clearCookie(
      'beicola_session'
    );

    res.json({
      ok: true,
      message:
        'Senha alterada. Faça login novamente.'
    });
  }
);

app.post(
  '/api/forgot-password',
  async (req, res) => {
    const email =
      String(
        req.body?.email || ''
      )
        .toLowerCase()
        .trim();

    const user = get(
      `
        SELECT *
        FROM users
        WHERE email=:email
      `,
      {
        email
      }
    );

    const generic = {
      message:
        'Se o e-mail estiver cadastrado, as instruções de recuperação foram preparadas.'
    };

    if (!user) {
      return res.json(generic);
    }

    const rawToken = id(32);

    const tokenHash =
      hash(rawToken);

    const expires =
      new Date(
        Date.now() +
        15 * 60 * 1000
      ).toISOString();

    run(
      `
        DELETE FROM password_resets
        WHERE user_id=:id
      `,
      {
        id: user.id
      }
    );

    run(
      `
        INSERT INTO password_resets(
          id,
          user_id,
          token_hash,
          expires_at,
          used,
          created_at
        )
        VALUES(
          :id,
          :uid,
          :th,
          :exp,
          0,
          :created
        )
      `,
      {
        id: id(),
        uid: user.id,
        th: tokenHash,
        exp: expires,
        created: now()
      }
    );

    const url =
      `${process.env.FRONTEND_URL || `http://localhost:${PORT}`}` +
      `/pages/reset-password.html?token=${rawToken}`;

    const mailer =
      transporter();

    if (mailer) {
      await mailer.sendMail({
        from:
          process.env.MAIL_FROM,
        to: user.email,
        subject:
          'Recuperação de senha — Beiçola F.I.',
        text:
          `Olá, ${user.name}. ` +
          `Use este link para criar uma nova senha ` +
          `(válido por 15 minutos): ${url}`
      });
    } else if (
      process.env.NODE_ENV !==
      'production'
    ) {
      console.log(
        '\n[RECUPERAÇÃO DE SENHA - DESENVOLVIMENTO]\n' +
        url +
        '\n'
      );
    }

    res.json(generic);
  }
);

app.post(
  '/api/reset-password',
  async (req, res) => {
    const {
      token,
      newPassword
    } = req.body || {};

    if (
      !token ||
      !newPassword ||
      newPassword.length < 8
    ) {
      return res
        .status(400)
        .json({
          error:
            'Token e nova senha são necessários; mínimo de 8 caracteres.'
        });
    }

    const reset = get(
      `
        SELECT *
        FROM password_resets
        WHERE token_hash=:h
        AND used=0
        AND expires_at>:now
      `,
      {
        h: hash(token),
        now: now()
      }
    );

    if (!reset) {
      return res
        .status(400)
        .json({
          error:
            'Token inválido ou expirado.'
        });
    }

    run(
      `
        UPDATE users
        SET password_hash=:p
        WHERE id=:id
      `,
      {
        p:
          await bcrypt.hash(
            newPassword,
            12
          ),
        id: reset.user_id
      }
    );

    run(
      `
        UPDATE password_resets
        SET used=1
        WHERE id=:id
      `,
      {
        id: reset.id
      }
    );

    run(
      `
        DELETE FROM sessions
        WHERE user_id=:id
      `,
      {
        id: reset.user_id
      }
    );

    res.json({
      ok: true,
      message:
        'Senha redefinida. Agora faça login.'
    });
  }
);

/* =========================
   PERFIL
========================= */

app.get(
  '/api/profile',
  auth,
  (req, res) => {
    res.json({
      user: req.user
    });
  }
);

app.put(
  '/api/profile',
  auth,
  (req, res) => {
    const name =
      String(
        req.body?.name || ''
      ).trim();

    if (name.length < 2) {
      return res
        .status(400)
        .json({
          error:
            'Nome inválido.'
        });
    }

    run(
      `
        UPDATE users
        SET name=:name
        WHERE id=:id
      `,
      {
        name,
        id: req.user.id
      }
    );

    res.json({
      user: publicUser(
        get(
          'SELECT * FROM users WHERE id=:id',
          {
            id: req.user.id
          }
        )
      )
    });
  }
);

/* =========================
   ENQUETES
========================= */

app.get(
  '/api/polls',
  auth,
  (req, res) => {
    const polls =
      all(
        `
          SELECT *
          FROM polls
          ORDER BY created_at DESC
        `
      ).map(poll => {
        const vote =
          get(
            `
              SELECT option_indexes_json
              FROM votes
              WHERE poll_id=:pid
              AND user_id=:uid
            `,
            {
              pid: poll.id,
              uid: req.user.id
            }
          );

        return {
          ...poll,
          options:
            JSON.parse(
              poll.options_json
            ),
          multiple:
            !!poll.multiple,
          closed:
            !!poll.closed,
          hasVoted:
            !!vote
        };
      });

    res.json({
      polls
    });
  }
);

app.post(
  '/api/polls',
  auth,
  admin,
  (req, res) => {
    const {
      question,
      options,
      multiple,
      closesAt
    } = req.body || {};

    if (
      !question ||
      !Array.isArray(options) ||
      options.length < 2 ||
      options.some(
        option =>
          !String(
            option
          ).trim()
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'Informe a pergunta e pelo menos duas opções.'
        });
    }

    const poll = {
      id: id(),
      question:
        question.trim(),
      options_json:
        JSON.stringify(
          options.map(
            option =>
              String(
                option
              ).trim()
          )
        ),
      multiple:
        multiple ? 1 : 0,
      closes_at:
        closesAt || null,
      created_by:
        req.user.id,
      created_at: now()
    };

    run(
      `
        INSERT INTO polls(
          id,
          question,
          options_json,
          multiple,
          closes_at,
          created_by,
          created_at,
          closed
        )
        VALUES(
          :id,
          :question,
          :options_json,
          :multiple,
          :closes_at,
          :created_by,
          :created_at,
          0
        )
      `,
      poll
    );

    res
      .status(201)
      .json({
        poll: {
          ...poll,
          options
        }
      });
  }
);

app.post(
  '/api/polls/:id/vote',
  auth,
  (req, res) => {
    const poll =
      get(
        'SELECT * FROM polls WHERE id=:id',
        {
          id: req.params.id
        }
      );

    if (!poll) {
      return res
        .status(404)
        .json({
          error:
            'Enquete não encontrada.'
        });
    }

    if (
      poll.closed ||
      (
        poll.closes_at &&
        new Date(
          poll.closes_at
        ) <= new Date()
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'Esta enquete está encerrada.'
        });
    }

    const choices =
      Array.isArray(
        req.body?.options
      )
        ? req.body.options.map(
            Number
          )
        : [];

    const options =
      JSON.parse(
        poll.options_json
      );

    const unique =
      [...new Set(choices)];

    if (
      !unique.length ||
      unique.some(
        index =>
          index < 0 ||
          index >= options.length
      ) ||
      (
        poll.multiple === 0 &&
        unique.length !== 1
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'Opção inválida.'
        });
    }

    if (
      get(
        `
          SELECT id
          FROM votes
          WHERE poll_id=:p
          AND user_id=:u
        `,
        {
          p: poll.id,
          u: req.user.id
        }
      )
    ) {
      return res
        .status(409)
        .json({
          error:
            'Você já votou nesta enquete.'
        });
    }

    run(
      `
        INSERT INTO votes(
          id,
          poll_id,
          user_id,
          option_indexes_json,
          created_at
        )
        VALUES(
          :id,
          :p,
          :u,
          :o,
          :c
        )
      `,
      {
        id: id(),
        p: poll.id,
        u: req.user.id,
        o: JSON.stringify(
          unique
        ),
        c: now()
      }
    );

    res.json({
      ok: true
    });
  }
);

app.get(
  '/api/polls/:id/results',
  auth,
  (req, res) => {
    const poll =
      get(
        'SELECT * FROM polls WHERE id=:id',
        {
          id: req.params.id
        }
      );

    if (!poll) {
      return res
        .status(404)
        .json({
          error:
            'Enquete não encontrada.'
        });
    }

    const options =
      JSON.parse(
        poll.options_json
      );

    const counts =
      options.map(label => ({
        label,
        count: 0
      }));

    const votes =
      all(
        `
          SELECT option_indexes_json
          FROM votes
          WHERE poll_id=:p
        `,
        {
          p: poll.id
        }
      );

    for (const vote of votes) {
      for (
        const index of
        JSON.parse(
          vote.option_indexes_json
        )
      ) {
        if (counts[index]) {
          counts[index].count++;
        }
      }
    }

    res.json({
      question:
        poll.question,
      results: counts,
      total:
        votes.length
    });
  }
);

app.post(
  '/api/polls/:id/close',
  auth,
  admin,
  (req, res) => {
    run(
      `
        UPDATE polls
        SET closed=1
        WHERE id=:id
      `,
      {
        id: req.params.id
      }
    );

    res.json({
      ok: true
    });
  }
);

/* =========================
   PARTIDAS
========================= */

app.get(
  '/api/matches',
  auth,
  (req, res) => {
    res.json({
      matches:
        all(
          `
            SELECT *
            FROM matches
            ORDER BY date ASC,time ASC
          `
        )
    });
  }
);

app.post(
  '/api/matches',
  auth,
  admin,
  (req, res) => {
    const {
      opponent,
      date,
      time,
      location,
      result,
      status,
      notes
    } = req.body || {};

    if (
      !opponent ||
      !date
    ) {
      return res
        .status(400)
        .json({
          error:
            'Adversário e data são obrigatórios.'
        });
    }

    const match = {
      id: id(),
      opponent,
      date,
      time: time || '',
      location:
        location || '',
      result:
        result || '',
      status:
        status || 'agendada',
      notes:
        notes || '',
      created_at: now()
    };

    run(
      `
        INSERT INTO matches(
          id,
          opponent,
          date,
          time,
          location,
          result,
          status,
          notes,
          created_at
        )
        VALUES(
          :id,
          :opponent,
          :date,
          :time,
          :location,
          :result,
          :status,
          :notes,
          :created_at
        )
      `,
      match
    );

    res
      .status(201)
      .json({
        match
      });
  }
);

app.put(
  '/api/matches/:id',
  auth,
  admin,
  (req, res) => {
    const old =
      get(
        'SELECT * FROM matches WHERE id=:id',
        {
          id: req.params.id
        }
      );

    if (!old) {
      return res
        .status(404)
        .json({
          error:
            'Partida não encontrada.'
        });
    }

    const match = {
      ...old,
      ...req.body,
      id: req.params.id
    };

    run(
      `
        UPDATE matches
        SET
          opponent=:opponent,
          date=:date,
          time=:time,
          location=:location,
          result=:result,
          status=:status,
          notes=:notes
        WHERE id=:id
      `,
      match
    );

    res.json({
      match
    });
  }
);

app.delete(
  '/api/matches/:id',
  auth,
  admin,
  (req, res) => {
    run(
      `
        DELETE FROM matches
        WHERE id=:id
      `,
      {
        id: req.params.id
      }
    );

    res.json({
      ok: true
    });
  }
);

/* =========================
   AVISOS
========================= */

app.get(
  '/api/announcements',
  auth,
  (req, res) => {
    res.json({
      announcements:
        all(
          `
            SELECT
              a.*,
              u.name AS author
            FROM announcements a
            JOIN users u
              ON u.id=a.created_by
            ORDER BY a.created_at DESC
          `
        )
    });
  }
);

app.post(
  '/api/announcements',
  auth,
  admin,
  (req, res) => {
    const {
      title,
      body
    } = req.body || {};

    if (!title || !body) {
      return res
        .status(400)
        .json({
          error:
            'Título e texto são obrigatórios.'
        });
    }

    const announcement = {
      id: id(),
      title:
        title.trim(),
      body:
        body.trim(),
      created_by:
        req.user.id,
      created_at: now()
    };

    run(
      `
        INSERT INTO announcements(
          id,
          title,
          body,
          created_by,
          created_at
        )
        VALUES(
          :id,
          :title,
          :body,
          :created_by,
          :created_at
        )
      `,
      announcement
    );

    res
      .status(201)
      .json({
        announcement
      });
  }
);

/* =========================
   ESCALAÇÃO
========================= */

app.get(
  '/api/lineup',
  auth,
  (req, res) => {
    res.json({
      lineup:
        all(
          `
            SELECT *
            FROM lineup
            ORDER BY
              starter DESC,
              number ASC,
              player_name ASC
          `
        )
    });
  }
);

app.put(
  '/api/lineup',
  auth,
  admin,
  (req, res) => {
    if (
      !Array.isArray(
        req.body?.players
      )
    ) {
      return res
        .status(400)
        .json({
          error:
            'Lista inválida.'
        });
    }

    run(
      'DELETE FROM lineup'
    );

    for (
      const player of
      req.body.players
    ) {
      run(
        `
          INSERT INTO lineup(
            id,
            player_name,
            position,
            starter,
            injured,
            number,
            notes,
            updated_at
          )
          VALUES(
            :id,
            :name,
            :position,
            :starter,
            :injured,
            :number,
            :notes,
            :updated
          )
        `,
        {
          id: id(),
          name:
            String(
              player.player_name ||
              ''
            ).trim(),
          position:
            player.position ||
            '',
          starter:
            player.starter
              ? 1
              : 0,
          injured:
            player.injured
              ? 1
              : 0,
          number:
            player.number ||
            '',
          notes:
            player.notes ||
            '',
          updated: now()
        }
      );
    }

    res.json({
      ok: true
    });
  }
);

/* =========================
   MEMBROS
========================= */

app.get(
  '/api/members',
  auth,
  (req, res) => {
    res.json({
      members:
        all(
          `
            SELECT
              id,
              name,
              email,
              role,
              created_at
            FROM users
            ORDER BY name
          `
        )
    });
  }
);

app.put(
  '/api/members/:id/role',
  auth,
  admin,
  (req, res) => {
    const role =
      req.body?.role;

    if (
      !['member', 'admin']
        .includes(role)
    ) {
      return res
        .status(400)
        .json({
          error:
            'Cargo inválido.'
        });
    }

    run(
      `
        UPDATE users
        SET role=:role
        WHERE id=:id
      `,
      {
        role,
        id: req.params.id
      }
    );

    res.json({
      ok: true
    });
  }
);

app.delete(
  '/api/members/:id',
  auth,
  admin,
  (req, res) => {
    if (
      req.params.id ===
      req.user.id
    ) {
      return res
        .status(400)
        .json({
          error:
            'Você não pode remover sua própria conta.'
        });
    }

    run(
      `
        DELETE FROM users
        WHERE id=:id
      `,
      {
        id: req.params.id
      }
    );

    res.json({
      ok: true
    });
  }
);

/* =========================
   FRONTEND
========================= */

app.get(
  /.*/,
  (req, res) => {
    res.sendFile(
      path.join(
        FRONTEND_DIR,
        'index.html'
      )
    );
  }
);

/* =========================
   START
========================= */

init()
  .then(() => {
    app.listen(
      PORT,
      () => {
        console.log(
          `Beiçola F.I. rodando em http://localhost:${PORT}`
        );
      }
    );
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
