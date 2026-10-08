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
const NODE_ENV = process.env.NODE_ENV || "development";

const FRONTEND_DIR = path.join(__dirname, "..", "frontend");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "beicola.sqlite");

fs.mkdirSync(DATA_DIR, { recursive: true });

app.disable("x-powered-by");

app.use(
    helmet({
        contentSecurityPolicy: false
    })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        error: "Muitas tentativas. Aguarde alguns minutos."
    }
});

const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 8,
    standardHeaders: true,
    legacyHeaders: false
});

let db;

let transporter = null;

if (
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
) {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure:
            String(process.env.SMTP_SECURE).toLowerCase() === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
}

// ======================================================
// BANCO DE DADOS
// ======================================================

function saveDatabase() {
    const data = db.export();

    fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function run(sql, params = []) {
    db.run(sql, params);
}

function get(sql, params = []) {
    const result = db.exec(sql, params);

    if (!result.length) {
        return null;
    }

    const columns = result[0].columns;
    const values = result[0].values;

    if (!values.length) {
        return null;
    }

    const row = {};

    columns.forEach((column, index) => {
        row[column] = values[0][index];
    });

    return row;
}

function all(sql, params = []) {
    const result = db.exec(sql, params);

    if (!result.length) {
        return [];
    }

    const columns = result[0].columns;

    return result[0].values.map(values => {
        const row = {};

        columns.forEach((column, index) => {
            row[column] = values[index];
        });

        return row;
    });
}

function columnExists(table, column) {
    const rows = all(`PRAGMA table_info(${table})`);

    return rows.some(row => row.name === column);
}

function addColumnIfMissing(table, column, definition) {
    if (!columnExists(table, column)) {
        run(
            `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`
        );
    }
}

function initializeDatabase(SQL) {
    if (fs.existsSync(DB_FILE)) {
        const file = fs.readFileSync(DB_FILE);

        db = new SQL.Database(file);
    } else {
        db = new SQL.Database();
    }

    run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS password_resets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            token_hash TEXT NOT NULL UNIQUE,
            expires_at TEXT NOT NULL,
            used INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER UNIQUE,
            name TEXT NOT NULL,
            number INTEGER UNIQUE,
            primary_position TEXT NOT NULL,
            secondary_positions TEXT NOT NULL DEFAULT '[]',
            status TEXT NOT NULL DEFAULT 'disponivel',
            instructions TEXT NOT NULL DEFAULT '',
            is_captain INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE SET NULL
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS player_roles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            priority INTEGER NOT NULL DEFAULT 1,
            UNIQUE(player_id, role, priority),
            FOREIGN KEY (player_id)
                REFERENCES players(id)
                ON DELETE CASCADE
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS polls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            question TEXT NOT NULL,
            closes_at TEXT,
            multiple_choice INTEGER NOT NULL DEFAULT 0,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by)
                REFERENCES users(id)
                ON DELETE SET NULL
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS poll_options (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poll_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            FOREIGN KEY (poll_id)
                REFERENCES polls(id)
                ON DELETE CASCADE
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS poll_votes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            poll_id INTEGER NOT NULL,
            option_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (poll_id)
                REFERENCES polls(id)
                ON DELETE CASCADE,
            FOREIGN KEY (option_id)
                REFERENCES poll_options(id)
                ON DELETE CASCADE,
            FOREIGN KEY (user_id)
                REFERENCES users(id)
                ON DELETE CASCADE
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            opponent TEXT NOT NULL,
            match_date TEXT,
            location TEXT NOT NULL DEFAULT '',
            result TEXT NOT NULL DEFAULT '',
            notes TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS match_lineup (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            position TEXT NOT NULL,
            starter INTEGER NOT NULL DEFAULT 0,
            instructions TEXT NOT NULL DEFAULT '',
            UNIQUE(match_id, player_id),
            FOREIGN KEY (match_id)
                REFERENCES matches(id)
                ON DELETE CASCADE,
            FOREIGN KEY (player_id)
                REFERENCES players(id)
                ON DELETE CASCADE
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS lineup (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_name TEXT NOT NULL,
            position TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'reserva',
            number INTEGER,
            notes TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);

    run(`
        CREATE TABLE IF NOT EXISTS announcements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            created_by INTEGER,
            created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (created_by)
                REFERENCES users(id)
                ON DELETE SET NULL
        )
    `);

    // Compatibilidade com versões antigas
    addColumnIfMissing(
        "users",
        "role",
        "TEXT NOT NULL DEFAULT 'member'"
    );

    addColumnIfMissing(
        "players",
        "secondary_positions",
        "TEXT NOT NULL DEFAULT '[]'"
    );

    addColumnIfMissing(
        "players",
        "status",
        "TEXT NOT NULL DEFAULT 'disponivel'"
    );

    addColumnIfMissing(
        "players",
        "instructions",
        "TEXT NOT NULL DEFAULT ''"
    );

    addColumnIfMissing(
        "players",
        "is_captain",
        "INTEGER NOT NULL DEFAULT 0"
    );

    addColumnIfMissing(
        "polls",
        "multiple_choice",
        "INTEGER NOT NULL DEFAULT 0"
    );

    saveDatabase();
}

// ======================================================
// UTILIDADES
// ======================================================

function cleanString(value, maxLength = 5000) {
    if (typeof value !== "string") {
        return "";
    }

    return value.trim().slice(0, maxLength);
}

function normalizeEmail(email) {
    return cleanString(email, 320).toLowerCase();
}

function hashToken(token) {
    return crypto
        .createHash("sha256")
        .update(token)
        .digest("hex");
}

function generateToken() {
    return crypto.randomBytes(32).toString("hex");
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongEnoughPassword(password) {
    return (
        typeof password === "string" &&
        password.length >= 8
    );
}

function setupAdminKeyValid(key) {
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

    if (key.length !== configuredKey.length) {
        return false;
    }

    return crypto.timingSafeEqual(
        Buffer.from(key),
        Buffer.from(configuredKey)
    );
}

function parseJSON(value, fallback = []) {
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function normalizeSecondaryPositions(value) {
    if (Array.isArray(value)) {
        return JSON.stringify(
            value
                .map(item => cleanString(item, 100))
                .filter(Boolean)
        );
    }

    if (typeof value === "string") {
        return JSON.stringify(
            value
                .split(",")
                .map(item => item.trim())
                .filter(Boolean)
        );
    }

    return "[]";
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

function publicPlayer(player) {
    if (!player) return null;

    return {
        ...player,
        secondary_positions:
            parseJSON(
                player.secondary_positions,
                []
            )
    };
}

function sessionCookieOptions() {
    return {
        httpOnly: true,
        secure: NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: "/"
    };
}

// ======================================================
// AUTENTICAÇÃO
// ======================================================

function createSession(userId) {
    const token = generateToken();
    const tokenHash = hashToken(token);

    const expiresAt = new Date(
        Date.now() +
        7 * 24 * 60 * 60 * 1000
    ).toISOString();

    run(
        `
            INSERT INTO sessions
            (user_id, token_hash, expires_at)
            VALUES (?, ?, ?)
        `,
        [
            userId,
            tokenHash,
            expiresAt
        ]
    );

    saveDatabase();

    return token;
}

function getSessionUser(req) {
    const token =
        req.cookies?.beicola_session;

    if (!token) {
        return null;
    }

    const tokenHash = hashToken(token);

    const session = get(
        `
            SELECT
                sessions.id AS session_id,
                sessions.expires_at,
                users.*
            FROM sessions
            JOIN users
                ON users.id = sessions.user_id
            WHERE sessions.token_hash = ?
        `,
        [tokenHash]
    );

    if (!session) {
        return null;
    }

    if (
        new Date(session.expires_at) <=
        new Date()
    ) {
        run(
            "DELETE FROM sessions WHERE id = ?",
            [session.session_id]
        );

        saveDatabase();

        return null;
    }

    return session;
}

function requireAuth(req, res, next) {
    const user = getSessionUser(req);

    if (!user) {
        return res.status(401).json({
            error: "Você precisa estar logado."
        });
    }

    req.user = user;

    next();
}

function requireAdmin(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            error: "Não autenticado."
        });
    }

    if (req.user.role !== "admin") {
        return res.status(403).json({
            error: "Apenas administradores podem fazer isso."
        });
    }

    next();
}

// ======================================================
// E-MAIL
// ======================================================

async function sendPasswordResetEmail(
    email,
    resetUrl
) {
    if (!transporter) {
        console.log(
            "SMTP não configurado. Link de recuperação:",
            resetUrl
        );

        return;
    }

    await transporter.sendMail({
        from:
            process.env.MAIL_FROM ||
            process.env.SMTP_USER,

        to: email,

        subject:
            "Redefinição de senha — Beiçola F.I.",

        text:
            `Olá!\n\n` +
            `Recebemos uma solicitação para redefinir sua senha no Beiçola F.I.\n\n` +
            `Acesse o link abaixo:\n\n` +
            `${resetUrl}\n\n` +
            `Se você não solicitou isso, ignore este e-mail.`
    });
}

// ======================================================
// ROTAS BÁSICAS
// ======================================================

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        service: "Beiçola F.I."
    });
});

app.get("/api/me", requireAuth, (req, res) => {
    res.json({
        user: publicUser(req.user)
    });
});

// ======================================================
// LOGIN
// ======================================================

app.post(
    "/api/login",
    loginLimiter,
    async (req, res) => {
        try {
            const email =
                normalizeEmail(req.body.email);

            const password =
                req.body.password;

            if (
                !email ||
                !password
            ) {
                return res.status(400).json({
                    error:
                        "Informe e-mail e senha."
                });
            }

            const user = get(
                `
                    SELECT *
                    FROM users
                    WHERE email = ?
                `,
                [email]
            );

            if (!user) {
                return res.status(401).json({
                    error:
                        "E-mail ou senha incorretos."
                });
            }

            const valid =
                await bcrypt.compare(
                    password,
                    user.password_hash
                );

            if (!valid) {
                return res.status(401).json({
                    error:
                        "E-mail ou senha incorretos."
                });
            }

            const token =
                createSession(user.id);

            res.cookie(
                "beicola_session",
                token,
                sessionCookieOptions()
            );

            res.json({
                user: publicUser(user)
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível fazer login."
            });
        }
    }
);

// ======================================================
// CADASTRO
// ======================================================

app.post(
    "/api/register",
    async (req, res) => {
        try {
            const name =
                cleanString(req.body.name, 120);

            const email =
                normalizeEmail(req.body.email);

            const password =
                req.body.password;

            if (!name) {
                return res.status(400).json({
                    error:
                        "Informe seu nome."
                });
            }

            if (!isValidEmail(email)) {
                return res.status(400).json({
                    error:
                        "Informe um e-mail válido."
                });
            }

            if (
                !isStrongEnoughPassword(password)
            ) {
                return res.status(400).json({
                    error:
                        "A senha deve ter pelo menos 8 caracteres."
                });
            }

            const existing = get(
                `
                    SELECT id
                    FROM users
                    WHERE email = ?
                `,
                [email]
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

            run(
                `
                    INSERT INTO users
                    (name, email, password_hash, role)
                    VALUES (?, ?, ?, 'member')
                `,
                [
                    name,
                    email,
                    passwordHash
                ]
            );

            saveDatabase();

            res.status(201).json({
                message:
                    "Conta criada com sucesso."
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível criar a conta."
            });
        }
    }
);

// ======================================================
// LOGOUT
// ======================================================

app.post(
    "/api/logout",
    requireAuth,
    (req, res) => {
        const token =
            req.cookies?.beicola_session;

        if (token) {
            run(
                `
                    DELETE FROM sessions
                    WHERE token_hash = ?
                `,
                [hashToken(token)]
            );

            saveDatabase();
        }

        res.clearCookie(
            "beicola_session",
            {
                httpOnly: true,
                secure:
                    NODE_ENV === "production",
                sameSite: "lax",
                path: "/"
            }
        );

        res.json({
            message: "Logout realizado."
        });
    }
);

// ======================================================
// RECUPERAÇÃO DE SENHA
// ======================================================

app.post(
    "/api/forgot-password",
    passwordLimiter,
    async (req, res) => {
        const email =
            normalizeEmail(req.body.email);

        const genericMessage =
            "Se esse e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha.";

        try {
            if (!isValidEmail(email)) {
                return res.json({
                    message: genericMessage
                });
            }

            const user = get(
                `
                    SELECT *
                    FROM users
                    WHERE email = ?
                `,
                [email]
            );

            if (!user) {
                return res.json({
                    message: genericMessage
                });
            }

            run(
                `
                    UPDATE password_resets
                    SET used = 1
                    WHERE user_id = ?
                `,
                [user.id]
            );

            const token =
                generateToken();

            const tokenHash =
                hashToken(token);

            const expiresAt =
                new Date(
                    Date.now() +
                    30 * 60 * 1000
                ).toISOString();

            run(
                `
                    INSERT INTO password_resets
                    (user_id, token_hash, expires_at)
                    VALUES (?, ?, ?)
                `,
                [
                    user.id,
                    tokenHash,
                    expiresAt
                ]
            );

            saveDatabase();

            const frontendUrl =
                process.env.FRONTEND_URL ||
                `http://localhost:${PORT}`;

            const resetUrl =
                `${frontendUrl}/?reset_token=${encodeURIComponent(token)}`;

            await sendPasswordResetEmail(
                user.email,
                resetUrl
            );

            res.json({
                message: genericMessage
            });
        } catch (error) {
            console.error(error);

            res.json({
                message: genericMessage
            });
        }
    }
);

// ======================================================
// REDEFINIR SENHA
// ======================================================

app.post(
    "/api/reset-password",
    passwordLimiter,
    async (req, res) => {
        try {
            const token =
                cleanString(
                    req.body.token,
                    500
                );

            const password =
                req.body.password;

            if (!token) {
                return res.status(400).json({
                    error:
                        "Token inválido."
                });
            }

            if (
                !isStrongEnoughPassword(password)
            ) {
                return res.status(400).json({
                    error:
                        "A senha deve ter pelo menos 8 caracteres."
                });
            }

            const reset = get(
                `
                    SELECT *
                    FROM password_resets
                    WHERE token_hash = ?
                    AND used = 0
                `,
                [hashToken(token)]
            );

            if (!reset) {
                return res.status(400).json({
                    error:
                        "Link inválido ou expirado."
                });
            }

            if (
                new Date(reset.expires_at) <=
                new Date()
            ) {
                return res.status(400).json({
                    error:
                        "Link expirado."
                });
            }

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );

            run(
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

            run(
                `
                    UPDATE password_resets
                    SET used = 1
                    WHERE id = ?
                `,
                [reset.id]
            );

            run(
                `
                    DELETE FROM sessions
                    WHERE user_id = ?
                `,
                [reset.user_id]
            );

            saveDatabase();

            res.json({
                message:
                    "Senha redefinida com sucesso."
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível redefinir a senha."
            });
        }
    }
);

// ======================================================
// ALTERAR SENHA
// ======================================================

app.post(
    "/api/change-password",
    requireAuth,
    passwordLimiter,
    async (req, res) => {
        try {
            const currentPassword =
                req.body.currentPassword;

            const newPassword =
                req.body.newPassword;

            if (
                !isStrongEnoughPassword(
                    newPassword
                )
            ) {
                return res.status(400).json({
                    error:
                        "A nova senha deve ter pelo menos 8 caracteres."
                });
            }

            const valid =
                await bcrypt.compare(
                    currentPassword,
                    req.user.password_hash
                );

            if (!valid) {
                return res.status(400).json({
                    error:
                        "A senha atual está incorreta."
                });
            }

            const passwordHash =
                await bcrypt.hash(
                    newPassword,
                    12
                );

            run(
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

            saveDatabase();

            res.json({
                message:
                    "Senha alterada com sucesso."
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível alterar a senha."
            });
        }
    }
);

// ======================================================
// PERFIL
// ======================================================

app.get(
    "/api/profile",
    requireAuth,
    (req, res) => {
        res.json({
            user: publicUser(req.user)
        });
    }
);

app.put(
    "/api/profile",
    requireAuth,
    (req, res) => {
        try {
            const name =
                cleanString(
                    req.body.name,
                    120
                );

            if (!name) {
                return res.status(400).json({
                    error:
                        "Informe um nome."
                });
            }

            run(
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

            saveDatabase();

            const updated =
                get(
                    `
                        SELECT *
                        FROM users
                        WHERE id = ?
                    `,
                    [req.user.id]
                );

            res.json({
                user: publicUser(updated)
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível atualizar o perfil."
            });
        }
    }
);

// ======================================================
// MEMBROS
// ======================================================

app.get(
    "/api/members",
    requireAuth,
    requireAdmin,
    (req, res) => {
        const members = all(`
            SELECT
                id,
                name,
                email,
                role,
                created_at
            FROM users
            ORDER BY name COLLATE NOCASE
        `);

        res.json(members);
    }
);

// ======================================================
// JOGADORES
// ======================================================

app.get(
    "/api/players",
    requireAuth,
    (req, res) => {
        const players = all(`
            SELECT
                players.*,
                users.name AS linked_user_name,
                users.email AS linked_user_email
            FROM players
            LEFT JOIN users
                ON users.id = players.user_id
            ORDER BY
                players.number IS NULL,
                players.number,
                players.name COLLATE NOCASE
        `);

        res.json(
            players.map(publicPlayer)
        );
    }
);

app.post(
    "/api/players",
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const name =
                cleanString(
                    req.body.name,
                    120
                );

            const primaryPosition =
                cleanString(
                    req.body.primary_position,
                    100
                );

            const secondaryPositions =
                normalizeSecondaryPositions(
                    req.body.secondary_positions
                );

            const status =
                cleanString(
                    req.body.status ||
                    "disponivel",
                    50
                );

            const instructions =
                cleanString(
                    req.body.instructions,
                    2000
                );

            const number =
                req.body.number === null ||
                req.body.number === "" ||
                req.body.number === undefined
                    ? null
                    : Number(req.body.number);

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
                    !Number.isInteger(number) ||
                    number < 0 ||
                    number > 999
                )
            ) {
                return res.status(400).json({
                    error:
                        "Número de camisa inválido."
                });
            }

            if (number !== null) {
                const existingNumber =
                    get(
                        `
                            SELECT id
                            FROM players
                            WHERE number = ?
                        `,
                        [number]
                    );

                if (existingNumber) {
                    return res.status(409).json({
                        error:
                            "Esse número de camisa já está sendo usado."
                    });
                }
            }

            run(
                `
                    INSERT INTO players
                    (
                        name,
                        number,
                        primary_position,
                        secondary_positions,
                        status,
                        instructions
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                `,
                [
                    name,
                    number,
                    primaryPosition,
                    secondaryPositions,
                    status,
                    instructions
                ]
            );

            saveDatabase();

            const player =
                get(
                    `
                        SELECT *
                        FROM players
                        WHERE id = last_insert_rowid()
                    `
                );

            res.status(201).json({
                player:
                    publicPlayer(player)
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível criar o jogador."
            });
        }
    }
);

app.put(
    "/api/players/:id",
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const id =
                Number(req.params.id);

            const existing =
                get(
                    `
                        SELECT *
                        FROM players
                        WHERE id = ?
                    `,
                    [id]
                );

            if (!existing) {
                return res.status(404).json({
                    error:
                        "Jogador não encontrado."
                });
            }

            const name =
                cleanString(
                    req.body.name ??
                    existing.name,
                    120
                );

            const primaryPosition =
                cleanString(
                    req.body.primary_position ??
                    existing.primary_position,
                    100
                );

            const secondaryPositions =
                req.body.secondary_positions ===
                undefined
                    ? existing.secondary_positions
                    : normalizeSecondaryPositions(
                        req.body.secondary_positions
                    );

            const status =
                cleanString(
                    req.body.status ??
                    existing.status,
                    50
                );

            const instructions =
                cleanString(
                    req.body.instructions ??
                    existing.instructions,
                    2000
                );

            let number;

            if (
                req.body.number === null ||
                req.body.number === ""
            ) {
                number = null;
            } else if (
                req.body.number === undefined
            ) {
                number = existing.number;
            } else {
                number =
                    Number(req.body.number);
            }

            if (
                number !== null &&
                (
                    !Number.isInteger(number) ||
                    number < 0 ||
                    number > 999
                )
            ) {
                return res.status(400).json({
                    error:
                        "Número de camisa inválido."
                });
            }

            if (number !== null) {
                const duplicate =
                    get(
                        `
                            SELECT id
                            FROM players
                            WHERE number = ?
                            AND id != ?
                        `,
                        [
                            number,
                            id
                        ]
                    );

                if (duplicate) {
                    return res.status(409).json({
                        error:
                            "Esse número de camisa já está sendo usado."
                    });
                }
            }

            run(
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
                    secondaryPositions,
                    status,
                    instructions,
                    id
                ]
            );

            saveDatabase();

            const player =
                get(
                    `
                        SELECT *
                        FROM players
                        WHERE id = ?
                    `,
                    [id]
                );

            res.json({
                player:
                    publicPlayer(player)
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível atualizar o jogador."
            });
        }
    }
);

app.delete(
    "/api/players/:id",
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const id =
                Number(req.params.id);

            const player =
                get(
                    `
                        SELECT id
                        FROM players
                        WHERE id = ?
                    `,
                    [id]
                );

            if (!player) {
                return res.status(404).json({
                    error:
                        "Jogador não encontrado."
                });
            }

            run(
                `
                    DELETE FROM players
                    WHERE id = ?
                `,
                [id]
            );

            saveDatabase();

            res.json({
                message:
                    "Jogador excluído."
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível excluir o jogador."
            });
        }
    }
);

// ======================================================
// CONVERTER MEMBRO EM JOGADOR
// ======================================================

app.post(
    "/api/players/from-member/:userId",
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const userId =
                Number(req.params.userId);

            const user =
                get(
                    `
                        SELECT *
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

            const existing =
                get(
                    `
                        SELECT *
                        FROM players
                        WHERE user_id = ?
                    `,
                    [userId]
                );

            if (existing) {
                return res.status(409).json({
                    error:
                        "Esse membro já é jogador."
                });
            }

            const name =
                cleanString(
                    req.body.name ||
                    user.name,
                    120
                );

            const primaryPosition =
                cleanString(
                    req.body.primary_position ||
                    "pivo",
                    100
                );

            const secondaryPositions =
                normalizeSecondaryPositions(
                    req.body.secondary_positions
                );

            const status =
                cleanString(
                    req.body.status ||
                    "disponivel",
                    50
                );

            const instructions =
                cleanString(
                    req.body.instructions ||
                    "",
                    2000
                );

            const number =
                req.body.number === null ||
                req.body.number === "" ||
                req.body.number === undefined
                    ? null
                    : Number(req.body.number);

            if (
                number !== null &&
                !Number.isInteger(number)
            ) {
                return res.status(400).json({
                    error:
                        "Número de camisa inválido."
                });
            }

            if (number !== null) {
                const duplicate =
                    get(
                        `
                            SELECT id
                            FROM players
                            WHERE number = ?
                        `,
                        [number]
                    );

                if (duplicate) {
                    return res.status(409).json({
                        error:
                            "Esse número de camisa já está sendo usado."
                    });
                }
            }

            run(
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
                    secondaryPositions,
                    status,
                    instructions
                ]
            );

            saveDatabase();

            const player =
                get(
                    `
                        SELECT *
                        FROM players
                        WHERE id = last_insert_rowid()
                    `
                );

            res.status(201).json({
                player:
                    publicPlayer(player)
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível converter o membro em jogador."
            });
        }
    }
);

// ======================================================
// CAPITÃO
// ======================================================

app.put(
    "/api/players/:id/captain",
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const id =
                Number(req.params.id);

            const player =
                get(
                    `
                        SELECT *
                        FROM players
                        WHERE id = ?
                    `,
                    [id]
                );

            if (!player) {
                return res.status(404).json({
                    error:
                        "Jogador não encontrado."
                });
            }

            run(
                `
                    UPDATE players
                    SET is_captain = 0
                `
            );

            run(
                `
                    UPDATE players
                    SET
                        is_captain = 1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `,
                [id]
            );

            saveDatabase();

            res.json({
                message:
                    "Capitão definido."
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível definir o capitão."
            });
        }
    }
);

app.delete(
    "/api/players/captain",
    requireAuth,
    requireAdmin,
    (req, res) => {
        run(`
            UPDATE players
            SET is_captain = 0
        `);

        saveDatabase();

        res.json({
            message:
                "Capitão removido."
        });
    }
);

// ======================================================
// FUNÇÕES DE COBRANÇA
// ======================================================

app.get(
    "/api/player-roles",
    requireAuth,
    (req, res) => {
        const rows = all(`
            SELECT
                player_roles.id,
                player_roles.player_id,
                player_roles.role,
                player_roles.priority,
                players.name AS player_name
            FROM player_roles
            JOIN players
                ON players.id =
                    player_roles.player_id
            ORDER BY
                player_roles.role,
                player_roles.priority
        `);

        res.json({
            penalty:
                rows.filter(
                    row => row.role === "penalty"
                ),

            free_kick:
                rows.filter(
                    row => row.role === "free_kick"
                )
        });
    }
);

app.put(
    "/api/player-roles/:role",
    requireAuth,
    requireAdmin,
    (req, res) => {
        const role =
            req.params.role;

        if (
            role !== "penalty" &&
            role !== "free_kick"
        ) {
            return res.status(400).json({
                error:
                    "Função inválida."
            });
        }

        const players =
            Array.isArray(req.body.players)
                ? req.body.players
                : [];

        const uniquePlayers = [
            ...new Set(
                players
                    .map(Number)
                    .filter(
                        Number.isInteger
                    )
            )
        ];

        run(
            `
                DELETE FROM player_roles
                WHERE role = ?
            `,
            [role]
        );

        uniquePlayers.forEach(
            (playerId, index) => {
                const player =
                    get(
                        `
                            SELECT id
                            FROM players
                            WHERE id = ?
                        `,
                        [playerId]
                    );

                if (!player) {
                    return;
                }

                run(
                    `
                        INSERT INTO player_roles
                        (player_id, role, priority)
                        VALUES (?, ?, ?)
                    `,
                    [
                        playerId,
                        role,
                        index + 1
                    ]
                );
            }
        );

        saveDatabase();

        res.json({
            message:
                "Função salva."
        });
    }
);

// ======================================================
// ESCALAÇÃO PRINCIPAL
// ======================================================

app.get(
    "/api/lineup",
    requireAuth,
    (req, res) => {
        const lineup = all(`
            SELECT *
            FROM lineup
            ORDER BY
                CASE position
                    WHEN 'goleiro' THEN 1
                    WHEN 'fixo' THEN 2
                    WHEN 'ala-direita' THEN 3
                    WHEN 'ala-esquerda' THEN 4
                    WHEN 'pivo' THEN 5
                    ELSE 6
                END
        `);

        res.json({
            lineup
        });
    }
);

app.put(
    "/api/lineup",
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const lineup =
                Array.isArray(req.body.lineup)
                    ? req.body.lineup
                    : [];

            const starters =
                lineup.filter(
                    item =>
                        item.status === "titular"
                );

            if (starters.length > 5) {
                return res.status(400).json({
                    error:
                        "A escalação pode ter no máximo 5 titulares."
                });
            }

            const positions = new Set();

            for (const item of starters) {
                const position =
                    cleanString(
                        item.position,
                        100
                    );

                if (!position) {
                    return res.status(400).json({
                        error:
                            "Todo titular precisa ter uma posição."
                    });
                }

                if (
                    positions.has(position)
                ) {
                    return res.status(400).json({
                        error:
                            "Não é possível repetir a mesma posição entre os titulares."
                    });
                }

                positions.add(position);
            }

            run("DELETE FROM lineup");

            lineup.forEach(item => {
                const playerName =
                    cleanString(
                        item.player_name,
                        120
                    );

                if (!playerName) {
                    return;
                }

                const position =
                    cleanString(
                        item.position,
                        100
                    );

                const status =
                    item.status === "titular"
                        ? "titular"
                        : "reserva";

                const number =
                    item.number === null ||
                    item.number === undefined ||
                    item.number === ""
                        ? null
                        : Number(item.number);

                const notes =
                    cleanString(
                        item.notes,
                        2000
                    );

                run(
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
            });

            saveDatabase();

            res.json({
                message:
                    "Escalação salva."
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível salvar a escalação."
            });
        }
    }
);

// ======================================================
// PARTIDAS
// ======================================================

app.get(
    "/api/matches",
    requireAuth,
    (req, res) => {
        const matches = all(`
            SELECT *
            FROM matches
            ORDER BY
                CASE
                    WHEN match_date IS NULL
                    THEN 1
                    ELSE 0
                END,
                match_date ASC
        `);

        res.json(matches);
    }
);

app.post(
    "/api/matches",
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const opponent =
                cleanString(
                    req.body.opponent,
                    150
                );

            const matchDate =
                req.body.match_date
                    ? cleanString(
                        req.body.match_date,
                        100
                    )
                    : null;

            const location =
                cleanString(
                    req.body.location,
                    300
                );

            const result =
                cleanString(
                    req.body.result,
                    100
                );

            const notes =
                cleanString(
                    req.body.notes,
                    2000
                );

            if (!opponent) {
                return res.status(400).json({
                    error:
                        "Informe o adversário."
                });
            }

            run(
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

            saveDatabase();

            const match =
                get(
                    `
                        SELECT *
                        FROM matches
                        WHERE id = last_insert_rowid()
                    `
                );

            res.status(201).json({
                match
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível criar a partida."
            });
        }
    }
);

app.delete(
    "/api/matches/:id",
    requireAuth,
    requireAdmin,
    (req, res) => {
        const id =
            Number(req.params.id);

        run(
            `
                DELETE FROM matches
                WHERE id = ?
            `,
            [id]
        );

        saveDatabase();

        res.json({
            message:
                "Partida excluída."
        });
    }
);

// ======================================================
// ESCALAÇÃO POR PARTIDA
// ======================================================

app.get(
    "/api/matches/:matchId/lineup",
    requireAuth,
    (req, res) => {
        const matchId =
            Number(req.params.matchId);

        const lineup = all(
            `
                SELECT
                    match_lineup.*,
                    players.name AS player_name,
                    players.number
                FROM match_lineup
                JOIN players
                    ON players.id =
                        match_lineup.player_id
                WHERE match_lineup.match_id = ?
                ORDER BY
                    match_lineup.starter DESC,
                    match_lineup.id
            `,
            [matchId]
        );

        res.json({
            lineup
        });
    }
);

app.put(
    "/api/matches/:matchId/lineup",
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const matchId =
                Number(req.params.matchId);

            const match =
                get(
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
                        "Partida não encontrada."
                });
            }

            const lineup =
                Array.isArray(req.body.lineup)
                    ? req.body.lineup
                    : [];

            const starters =
                lineup.filter(
                    item =>
                        Number(item.starter) === 1
                );

            if (starters.length > 5) {
                return res.status(400).json({
                    error:
                        "Uma partida pode ter no máximo 5 titulares."
                });
            }

            const playerIds =
                new Set();

            for (const item of lineup) {
                const playerId =
                    Number(item.player_id);

                if (
                    !Number.isInteger(playerId)
                ) {
                    return res.status(400).json({
                        error:
                            "Jogador inválido."
                    });
                }

                if (
                    playerIds.has(playerId)
                ) {
                    return res.status(400).json({
                        error:
                            "Um jogador não pode aparecer duas vezes na escalação."
                    });
                }

                playerIds.add(playerId);

                const player =
                    get(
                        `
                            SELECT id
                            FROM players
                            WHERE id = ?
                        `,
                        [playerId]
                    );

                if (!player) {
                    return res.status(400).json({
                        error:
                            "Um dos jogadores não existe."
                    });
                }
            }

            // Só apaga depois de validar tudo.
            run(
                `
                    DELETE FROM match_lineup
                    WHERE match_id = ?
                `,
                [matchId]
            );

            lineup.forEach(item => {
                run(
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
                        Number(item.player_id),
                        cleanString(
                            item.position,
                            100
                        ),
                        Number(item.starter) === 1
                            ? 1
                            : 0,
                        cleanString(
                            item.instructions,
                            2000
                        )
                    ]
                );
            });

            saveDatabase();

            res.json({
                message:
                    "Escalação da partida salva."
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível salvar a escalação da partida."
            });
        }
    }
);

// ======================================================
// ENQUETES
// ======================================================

app.get(
    "/api/polls",
    requireAuth,
    (req, res) => {
        const polls = all(`
            SELECT *
            FROM polls
            ORDER BY created_at DESC
        `);

        const result = polls.map(poll => {
            const options = all(
                `
                    SELECT
                        poll_options.id,
                        poll_options.text,
                        COUNT(
                            poll_votes.id
                        ) AS votes
                    FROM poll_options
                    LEFT JOIN poll_votes
                        ON poll_votes.option_id =
                            poll_options.id
                    WHERE poll_options.poll_id = ?
                    GROUP BY
                        poll_options.id,
                        poll_options.text
                    ORDER BY poll_options.id
                `,
                [poll.id]
            );

            const userVotes = all(
                `
                    SELECT option_id
                    FROM poll_votes
                    WHERE poll_id = ?
                    AND user_id = ?
                `,
                [
                    poll.id,
                    req.user.id
                ]
            );

            const votedIds =
                new Set(
                    userVotes.map(
                        vote =>
                            Number(
                                vote.option_id
                            )
                    )
                );

            const hasVoted =
                userVotes.length > 0;

            const closed =
                poll.closes_at &&
                new Date(poll.closes_at) <=
                    new Date();

            return {
                ...poll,

                multiple_choice:
                    Number(
                        poll.multiple_choice
                    ) === 1,

                closed:
                    Boolean(closed),

                has_voted:
                    hasVoted,

                options:
                    options.map(option => ({
                        ...option,

                        votes:
                            Number(
                                option.votes
                            ),

                        voted:
                            votedIds.has(
                                Number(
                                    option.id
                                )
                            )
                    }))
            };
        });

        res.json(result);
    }
);

app.post(
    "/api/polls",
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const question =
                cleanString(
                    req.body.question,
                    1000
                );

            const options =
                Array.isArray(
                    req.body.options
                )
                    ? req.body.options
                        .map(
                            option =>
                                cleanString(
                                    option,
                                    500
                                )
                        )
                        .filter(Boolean)
                    : [];

            const closesAt =
                req.body.closes_at
                    ? cleanString(
                        req.body.closes_at,
                        100
                    )
                    : null;

            const multipleChoice =
                req.body.multiple_choice
                    ? 1
                    : 0;

            if (!question) {
                return res.status(400).json({
                    error:
                        "Informe a pergunta."
                });
            }

            if (options.length < 2) {
                return res.status(400).json({
                    error:
                        "A enquete precisa de pelo menos 2 opções."
                });
            }

            run(
                `
                    INSERT INTO polls
                    (
                        question,
                        closes_at,
                        multiple_choice,
                        created_by
                    )
                    VALUES (?, ?, ?, ?)
                `,
                [
                    question,
                    closesAt,
                    multipleChoice,
                    req.user.id
                ]
            );

            const poll =
                get(
                    `
                        SELECT *
                        FROM polls
                        WHERE id = last_insert_rowid()
                    `
                );

            options.forEach(option => {
                run(
                    `
                        INSERT INTO poll_options
                        (poll_id, text)
                        VALUES (?, ?)
                    `,
                    [
                        poll.id,
                        option
                    ]
                );
            });

            saveDatabase();

            res.status(201).json({
                poll
            });
        } catch (error) {
            console.error(error);

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
                Number(req.params.id);

            const poll =
                get(
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
                new Date(poll.closes_at) <=
                    new Date()
            ) {
                return res.status(400).json({
                    error:
                        "Esta enquete já foi encerrada."
                });
            }

            const optionIds =
                Array.isArray(
                    req.body.option_ids
                )
                    ? [
                        ...new Set(
                            req.body.option_ids
                                .map(Number)
                                .filter(
                                    Number.isInteger
                                )
                        )
                    ]
                    : [];

            if (!optionIds.length) {
                return res.status(400).json({
                    error:
                        "Escolha pelo menos uma opção."
                });
            }

            if (
                Number(poll.multiple_choice) !== 1 &&
                optionIds.length > 1
            ) {
                return res.status(400).json({
                    error:
                        "Esta enquete permite apenas uma opção."
                });
            }

            const existingVote =
                get(
                    `
                        SELECT id
                        FROM poll_votes
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

            for (const optionId of optionIds) {
                const option =
                    get(
                        `
                            SELECT id
                            FROM poll_options
                            WHERE id = ?
                            AND poll_id = ?
                        `,
                        [
                            optionId,
                            pollId
                        ]
                    );

                if (!option) {
                    return res.status(400).json({
                        error:
                            "Uma das opções é inválida."
                    });
                }
            }

            optionIds.forEach(optionId => {
                run(
                    `
                        INSERT INTO poll_votes
                        (
                            poll_id,
                            option_id,
                            user_id
                        )
                        VALUES (?, ?, ?)
                    `,
                    [
                        pollId,
                        optionId,
                        req.user.id
                    ]
                );
            });

            saveDatabase();

            res.json({
                message:
                    "Voto registrado."
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível registrar o voto."
            });
        }
    }
);

app.delete(
    "/api/polls/:id",
    requireAuth,
    requireAdmin,
    (req, res) => {
        const id =
            Number(req.params.id);

        run(
            `
                DELETE FROM polls
                WHERE id = ?
            `,
            [id]
        );

        saveDatabase();

        res.json({
            message:
                "Enquete excluída."
        });
    }
);

// ======================================================
// AVISOS
// ======================================================

app.get(
    "/api/announcements",
    requireAuth,
    (req, res) => {
        const announcements = all(`
            SELECT
                announcements.*,
                users.name AS author_name
            FROM announcements
            LEFT JOIN users
                ON users.id =
                    announcements.created_by
            ORDER BY
                announcements.created_at DESC
        `);

        res.json(announcements);
    }
);

app.post(
    "/api/announcements",
    requireAuth,
    requireAdmin,
    (req, res) => {
        try {
            const title =
                cleanString(
                    req.body.title,
                    300
                );

            const content =
                cleanString(
                    req.body.content,
                    10000
                );

            if (!title) {
                return res.status(400).json({
                    error:
                        "Informe o título."
                });
            }

            if (!content) {
                return res.status(400).json({
                    error:
                        "Informe o conteúdo."
                });
            }

            run(
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

            saveDatabase();

            const announcement =
                get(
                    `
                        SELECT *
                        FROM announcements
                        WHERE id = last_insert_rowid()
                    `
                );

            res.status(201).json({
                announcement
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível publicar o aviso."
            });
        }
    }
);

app.delete(
    "/api/announcements/:id",
    requireAuth,
    requireAdmin,
    (req, res) => {
        const id =
            Number(req.params.id);

        run(
            `
                DELETE FROM announcements
                WHERE id = ?
            `,
            [id]
        );

        saveDatabase();

        res.json({
            message:
                "Aviso excluído."
        });
    }
);

// ======================================================
// CONFIGURAÇÃO DO PRIMEIRO ADMIN
// ======================================================

app.get(
    "/api/setup-admin/status",
    (req, res) => {
        const admin =
            get(
                `
                    SELECT id
                    FROM users
                    WHERE role = 'admin'
                    LIMIT 1
                `
            );

        res.json({
            available:
                !admin &&
                Boolean(
                    process.env.ADMIN_SETUP_KEY
                )
        });
    }
);

app.post(
    "/api/setup-admin",
    passwordLimiter,
    async (req, res) => {
        try {
            const existingAdmin =
                get(
                    `
                        SELECT id
                        FROM users
                        WHERE role = 'admin'
                        LIMIT 1
                    `
                );

            if (existingAdmin) {
                return res.status(409).json({
                    error:
                        "Já existe um administrador."
                });
            }

            if (
                !setupAdminKeyValid(
                    req.body.key
                )
            ) {
                return res.status(403).json({
                    error:
                        "Chave de configuração inválida."
                });
            }

            const name =
                cleanString(
                    req.body.name,
                    120
                );

            const email =
                normalizeEmail(
                    req.body.email
                );

            const password =
                req.body.password;

            if (!name) {
                return res.status(400).json({
                    error:
                        "Informe o nome."
                });
            }

            if (!isValidEmail(email)) {
                return res.status(400).json({
                    error:
                        "Informe um e-mail válido."
                });
            }

            if (
                !isStrongEnoughPassword(
                    password
                )
            ) {
                return res.status(400).json({
                    error:
                        "A senha deve ter pelo menos 8 caracteres."
                });
            }

            const existingUser =
                get(
                    `
                        SELECT id
                        FROM users
                        WHERE email = ?
                    `,
                    [email]
                );

            if (existingUser) {
                return res.status(409).json({
                    error:
                        "Esse e-mail já está cadastrado."
                });
            }

            const passwordHash =
                await bcrypt.hash(
                    password,
                    12
                );

            run(
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

            saveDatabase();

            const user =
                get(
                    `
                        SELECT *
                        FROM users
                        WHERE id = last_insert_rowid()
                    `
                );

            const token =
                createSession(user.id);

            res.cookie(
                "beicola_session",
                token,
                sessionCookieOptions()
            );

            res.status(201).json({
                message:
                    "Administrador criado.",
                user:
                    publicUser(user)
            });
        } catch (error) {
            console.error(error);

            res.status(500).json({
                error:
                    "Não foi possível criar o administrador."
            });
        }
    }
);

// ======================================================
// LIMPEZA DE SESSÕES
// ======================================================

function cleanupExpiredSessions() {
    try {
        run(
            `
                DELETE FROM sessions
                WHERE expires_at <= ?
            `,
            [new Date().toISOString()]
        );

        run(
            `
                DELETE FROM password_resets
                WHERE expires_at <= ?
                OR used = 1
            `,
            [new Date().toISOString()]
        );

        saveDatabase();
    } catch (error) {
        console.error(
            "Erro na limpeza:",
            error
        );
    }
}

// ======================================================
// FRONTEND
// ======================================================

app.use(
    express.static(FRONTEND_DIR, {
        extensions: ["html"]
    })
);

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return next();
    }

    res.sendFile(
        path.join(
            FRONTEND_DIR,
            "index.html"
        )
    );
});

// ======================================================
// ERRO 404 DA API
// ======================================================

app.use(
    "/api",
    (req, res) => {
        res.status(404).json({
            error:
                "Rota da API não encontrada."
        });
    }
);

// ======================================================
// ERROS
// ======================================================

app.use(
    (error, req, res, next) => {
        console.error(error);

        if (res.headersSent) {
            return next(error);
        }

        res.status(500).json({
            error:
                "Erro interno do servidor."
        });
    }
);

// ======================================================
// INICIALIZAÇÃO
// ======================================================

(async () => {
    try {
        const SQL =
            await initSqlJs({
                locateFile:
                    file =>
                        path.join(
                            __dirname,
                            "node_modules",
                            "sql.js",
                            "dist",
                            file
                        )
            });

        initializeDatabase(SQL);

        cleanupExpiredSessions();

        setInterval(
            cleanupExpiredSessions,
            60 * 60 * 1000
        );

        app.listen(
            PORT,
            "0.0.0.0",
            () => {
                console.log(
                    `Beiçola F.I. rodando na porta ${PORT}`
                );
            }
        );
    } catch (error) {
        console.error(
            "Erro ao iniciar o servidor:",
            error
        );

        process.exit(1);
    }
})();
