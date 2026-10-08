const API = "/api";

const state = {
    me: null,
    players: [],
    members: [],
    roles: {
        penalty: [],
        free_kick: []
    },
    matches: [],
    polls: [],
    announcements: [],
    currentSection: "dashboard",
    editingPlayerId: null
};

// ===============================
// UTILIDADES
// ===============================

const $ = (id) => document.getElementById(id);

async function api(path, options = {}) {
    const config = {
        credentials: "include",
        ...options,
        headers: {
            ...(options.body ? { "Content-Type": "application/json" } : {}),
            ...(options.headers || {})
        }
    };

    const response = await fetch(API + path, config);

    let data = null;

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (!response.ok) {
        throw new Error(data.error || data.message || "Ocorreu um erro.");
    }

    return data;
}

function showMessage(element, message, type = "") {
    if (!element) return;

    element.textContent = message;
    element.className = type;

    if (message) {
        setTimeout(() => {
            if (element.textContent === message) {
                element.textContent = "";
            }
        }, 5000);
    }
}

function toast(message, type = "") {
    const element = $("toast");

    if (!element) {
        alert(message);
        return;
    }

    element.textContent = message;
    element.className = `toast ${type}`;

    setTimeout(() => {
        element.textContent = "";
        element.className = "toast";
    }, 3500);
}

function escapeHTML(value = "") {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function formatDate(value) {
    if (!value) return "Não informado";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toLocaleString("pt-BR");
}

function toISOStringFromInput(value) {
    if (!value) return null;

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return value;
    }

    return date.toISOString();
}

function isAdmin() {
    return state.me?.role === "admin";
}

function positionLabel(position) {
    const positions = {
        goleiro: "Goleiro",
        fixo: "Fixo",
        "ala-direita": "Ala direita",
        "ala-esquerda": "Ala esquerda",
        pivo: "Pivô"
    };

    return positions[position] || position;
}

function normalizePosition(position) {
    const value = String(position || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    if (value.includes("goleiro")) return "goleiro";
    if (value.includes("fixo")) return "fixo";
    if (value.includes("direita")) return "ala-direita";
    if (value.includes("esquerda")) return "ala-esquerda";
    if (value.includes("pivo")) return "pivo";

    return value;
}

function getPlayerName(playerId) {
    const player = state.players.find(
        player => Number(player.id) === Number(playerId)
    );

    return player ? player.name : "Jogador";
}

// ===============================
// AUTENTICAÇÃO
// ===============================

function showAuthBox(boxId) {
    ["loginBox", "registerBox", "forgotBox"].forEach(id => {
        const element = $(id);
        if (element) element.classList.add("hidden");
    });

    const box = $(boxId);

    if (box) {
        box.classList.remove("hidden");
    }
}

function showLogin() {
    showAuthBox("loginBox");
}

function showRegister() {
    showAuthBox("registerBox");
}

function showForgotPassword() {
    showAuthBox("forgotBox");
}

function showApp() {
    $("authScreen")?.classList.add("hidden");
    $("appScreen")?.classList.remove("hidden");
}

function showAuth() {
    $("appScreen")?.classList.add("hidden");
    $("authScreen")?.classList.remove("hidden");
    showLogin();
}

async function checkSession() {
    try {
        const data = await api("/me");

        state.me = data.user || data;

        showApp();

        await bootApplication();
    } catch {
        showAuth();
    }
}

async function login(event) {
    event.preventDefault();

    const email = $("loginEmail")?.value.trim();
    const password = $("loginPassword")?.value;

    const message = $("loginMessage");

    try {
        await api("/login", {
            method: "POST",
            body: JSON.stringify({
                email,
                password
            })
        });

        await checkSession();
    } catch (error) {
        showMessage(message, error.message, "err");
    }
}

async function register(event) {
    event.preventDefault();

    const name = $("registerName")?.value.trim();
    const email = $("registerEmail")?.value.trim();
    const password = $("registerPassword")?.value;
    const passwordConfirm = $("registerPasswordConfirm")?.value;

    const message = $("registerMessage");

    if (password !== passwordConfirm) {
        showMessage(message, "As senhas não são iguais.", "err");
        return;
    }

    try {
        await api("/register", {
            method: "POST",
            body: JSON.stringify({
                name,
                email,
                password
            })
        });

        showMessage(
            message,
            "Conta criada! Agora você pode entrar.",
            "ok"
        );

        $("registerForm")?.reset();

        setTimeout(showLogin, 1000);
    } catch (error) {
        showMessage(message, error.message, "err");
    }
}

async function forgotPassword(event) {
    event.preventDefault();

    const email = $("forgotEmail")?.value.trim();
    const message = $("forgotMessage");

    try {
        await api("/forgot-password", {
            method: "POST",
            body: JSON.stringify({ email })
        });

        showMessage(
            message,
            "Se esse e-mail estiver cadastrado, enviaremos as instruções para redefinir a senha.",
            "ok"
        );
    } catch (error) {
        showMessage(message, error.message, "err");
    }
}

async function logout() {
    try {
        await api("/logout", {
            method: "POST"
        });
    } catch {
        // Mesmo se der erro, vamos voltar para a tela de login.
    }

    state.me = null;
    showAuth();
}

// ===============================
// NAVEGAÇÃO
// ===============================

function getSectionElement(sectionName) {
    return (
        document.getElementById(sectionName) ||
        document.querySelector(
            `.section[data-section="${sectionName}"]`
        ) ||
        document.querySelector(
            `[data-section-panel="${sectionName}"]`
        )
    );
}

function navigate(sectionName) {
    state.currentSection = sectionName;

    document.querySelectorAll(".nav-button").forEach(button => {
        button.classList.toggle(
            "active",
            button.dataset.section === sectionName
        );
    });

    document.querySelectorAll(".section").forEach(section => {
        section.classList.add("hidden");
    });

    const section = getSectionElement(sectionName);

    if (section) {
        section.classList.remove("hidden");
    }

    if (sectionName === "dashboard") {
        loadDashboard();
    }

    if (sectionName === "players") {
        loadPlayers();
    }

    if (sectionName === "lineup") {
        loadLineup();
        loadMatchLineupEditor();
    }

    if (sectionName === "polls") {
        loadPolls();
    }

    if (sectionName === "matches") {
        loadMatches();
    }

    if (sectionName === "announcements") {
        loadAnnouncements();
    }

    if (sectionName === "profile") {
        loadProfile();
    }

    if (sectionName === "admin") {
        loadMembers();
        checkAdminSetup();
    }
}

// ===============================
// DASHBOARD
// ===============================

async function loadDashboard() {
    try {
        await Promise.all([
            loadPlayers(),
            loadMatches(),
            loadPolls(),
            loadAnnouncements()
        ]);

        if ($("welcomeName")) {
            $("welcomeName").textContent =
                state.me?.name || "Integrante";
        }

        if ($("dashboardPlayers")) {
            $("dashboardPlayers").textContent =
                state.players.length;
        }

        if ($("dashboardMatches")) {
            $("dashboardMatches").textContent =
                state.matches.length;
        }

        if ($("dashboardPolls")) {
            $("dashboardPolls").textContent =
                state.polls.length;
        }

        if ($("dashboardAnnouncements")) {
            $("dashboardAnnouncements").textContent =
                state.announcements.length;
        }

        const nextMatch = [...state.matches]
            .filter(match => {
                if (!match.match_date) return false;

                return new Date(match.match_date) >= new Date();
            })
            .sort(
                (a, b) =>
                    new Date(a.match_date) -
                    new Date(b.match_date)
            )[0];

        if ($("dashboardNextMatch")) {
            $("dashboardNextMatch").textContent =
                nextMatch
                    ? `vs ${nextMatch.opponent} — ${formatDate(nextMatch.match_date)}`
                    : "Nenhum próximo jogo.";
        }
    } catch (error) {
        console.error(error);
    }
}

// ===============================
// JOGADORES
// ===============================

async function loadPlayers() {
    try {
        const data = await api("/players");

        state.players = Array.isArray(data)
            ? data
            : data.players || [];

        renderPlayers();
        renderCaptain();
        renderRoleSelectors();
        renderLineupEditor();
        updatePlayerSelects();
    } catch (error) {
        console.error(error);
    }
}

function renderPlayers() {
    const container = $("playersList");

    if (!container) return;

    if (!state.players.length) {
        container.innerHTML = `
            <div class="item">
                <strong>Nenhum jogador cadastrado.</strong>
                <div class="muted">
                    Um administrador pode adicionar os jogadores.
                </div>
            </div>
        `;

        return;
    }

    container.innerHTML = state.players.map(player => {
        const secondary = Array.isArray(player.secondary_positions)
            ? player.secondary_positions
            : [];

        const positions = [
            player.primary_position,
            ...secondary
        ]
            .filter(Boolean)
            .map(positionLabel)
            .join(" • ");

        return `
            <div class="item player-item">
                <div>
                    <h3>
                        ${escapeHTML(player.name)}
                        ${
                            player.number !== null &&
                            player.number !== undefined
                                ? `<span class="muted">#${escapeHTML(player.number)}</span>`
                                : ""
                        }
                    </h3>

                    <div class="muted">
                        ${escapeHTML(positions || "Posição não definida")}
                    </div>

                    <div class="muted">
                        Status: ${escapeHTML(player.status || "disponivel")}
                    </div>

                    ${
                        Number(player.is_captain) === 1
                            ? `<strong>👑 Capitão</strong>`
                            : ""
                    }

                    ${
                        player.instructions
                            ? `
                                <div class="muted">
                                    Instruções:
                                    ${escapeHTML(player.instructions)}
                                </div>
                            `
                            : ""
                    }
                </div>

                ${
                    isAdmin()
                        ? `
                            <div class="player-actions">
                                <button
                                    class="ghost"
                                    onclick="editPlayer(${player.id})"
                                >
                                    Editar
                                </button>

                                ${
                                    Number(player.is_captain) !== 1
                                        ? `
                                            <button
                                                class="ghost"
                                                onclick="setCaptain(${player.id})"
                                            >
                                                Capitão
                                            </button>
                                        `
                                        : ""
                                }

                                <button
                                    class="danger"
                                    onclick="deletePlayer(${player.id})"
                                >
                                    Excluir
                                </button>
                            </div>
                        `
                        : ""
                }
            </div>
        `;
    }).join("");
}

function renderCaptain() {
    const captain = state.players.find(
        player => Number(player.is_captain) === 1
    );

    if ($("captainName")) {
        $("captainName").textContent =
            captain?.name || "Nenhum capitão definido";
    }

    if ($("removeCaptainButton")) {
        $("removeCaptainButton").style.display =
            captain && isAdmin() ? "inline-block" : "none";
    }
}

function openPlayerModal(player = null) {
    if (!isAdmin()) return;

    state.editingPlayerId = player?.id || null;

    if ($("playerModalTitle")) {
        $("playerModalTitle").textContent =
            player
                ? "Editar jogador"
                : "Novo jogador";
    }

    $("playerId").value = player?.id || "";
    $("playerName").value = player?.name || "";
    $("playerNumber").value =
        player?.number ?? "";
    $("playerStatus").value =
        player?.status || "disponivel";
    $("playerPrimaryPosition").value =
        player?.primary_position || "";

    const secondary = Array.isArray(player?.secondary_positions)
        ? player.secondary_positions
        : [];

    $("playerSecondaryPositions").value =
        secondary.join(", ");

    $("playerInstructions").value =
        player?.instructions || "";

    populatePlayerMemberSelect(player);

    $("playerModal")?.classList.remove("hidden");
}

function closePlayerModal() {
    $("playerModal")?.classList.add("hidden");
    state.editingPlayerId = null;
}

function populatePlayerMemberSelect(player = null) {
    const select = $("playerUser");

    if (!select) return;

    const linkedUserIds = new Set(
        state.players
            .filter(item => item.id !== player?.id)
            .map(item => Number(item.user_id))
            .filter(Boolean)
    );

    select.innerHTML = `
        <option value="">
            Jogador sem conta vinculada
        </option>
    `;

    state.members.forEach(member => {
        const alreadyLinked = linkedUserIds.has(Number(member.id));

        if (alreadyLinked) return;

        const selected =
            Number(player?.user_id) === Number(member.id)
                ? "selected"
                : "";

        select.innerHTML += `
            <option value="${member.id}" ${selected}>
                ${escapeHTML(member.name)}
                — ${escapeHTML(member.email)}
            </option>
        `;
    });
}

async function savePlayer(event) {
    event.preventDefault();

    if (!isAdmin()) return;

    const id = $("playerId").value;

    const secondaryPositions =
        $("playerSecondaryPositions")
            .value
            .split(",")
            .map(item => item.trim())
            .filter(Boolean);

    const numberValue = $("playerNumber").value.trim();

    const body = {
        name: $("playerName").value.trim(),
        number: numberValue === ""
            ? null
            : Number(numberValue),
        primary_position:
            $("playerPrimaryPosition").value,
        secondary_positions:
            secondaryPositions,
        status:
            $("playerStatus").value,
        instructions:
            $("playerInstructions").value.trim()
    };

    const message = $("playerFormMessage");

    try {
        if (id) {
            await api(`/players/${id}`, {
                method: "PUT",
                body: JSON.stringify(body)
            });
        } else {
            await api("/players", {
                method: "POST",
                body: JSON.stringify(body)
            });
        }

        toast(
            id
                ? "Jogador atualizado!"
                : "Jogador criado!",
            "ok"
        );

        closePlayerModal();

        await loadPlayers();
        await loadMembers();
    } catch (error) {
        showMessage(message, error.message, "err");
    }
}

async function editPlayer(id) {
    if (!isAdmin()) return;

    const player = state.players.find(
        item => Number(item.id) === Number(id)
    );

    if (!player) return;

    openPlayerModal(player);
}

async function deletePlayer(id) {
    if (!isAdmin()) return;

    const player = state.players.find(
        item => Number(item.id) === Number(id)
    );

    if (!player) return;

    if (!confirm(`Excluir o jogador ${player.name}?`)) {
        return;
    }

    try {
        await api(`/players/${id}`, {
            method: "DELETE"
        });

        toast("Jogador excluído.", "ok");

        await loadPlayers();
    } catch (error) {
        toast(error.message, "err");
    }
}

async function setCaptain(id) {
    if (!isAdmin()) return;

    try {
        await api(`/players/${id}/captain`, {
            method: "PUT"
        });

        toast("Capitão definido!", "ok");

        await loadPlayers();
    } catch (error) {
        toast(error.message, "err");
    }
}

async function removeCaptain() {
    if (!isAdmin()) return;

    try {
        await api("/players/captain", {
            method: "DELETE"
        });

        toast("Capitão removido.", "ok");

        await loadPlayers();
    } catch (error) {
        toast(error.message, "err");
    }
}

// ===============================
// CONVERTER MEMBRO EM JOGADOR
// ===============================

async function convertMemberToPlayer(userId) {
    if (!isAdmin()) return;

    const member = state.members.find(
        item => Number(item.id) === Number(userId)
    );

    if (!member) return;

    if (
        !confirm(
            `Transformar ${member.name} em jogador?`
        )
    ) {
        return;
    }

    try {
        await api(`/players/from-member/${userId}`, {
            method: "POST"
        });

        toast("Membro convertido em jogador!", "ok");

        await loadMembers();
        await loadPlayers();
    } catch (error) {
        toast(error.message, "err");
    }
}

// ===============================
// COBRANÇAS
// ===============================

async function loadRoles() {
    try {
        const data = await api("/player-roles");

        state.roles = {
            penalty: data.penalty || [],
            free_kick: data.free_kick || []
        };

        renderRoleSelectors();
    } catch (error) {
        console.error(error);
    }
}

function renderRoleSelectors() {
    const penaltySelect = $("penaltySelect");
    const freeKickSelect = $("freeKickSelect");

    const createOptions = (selectedPlayers) => {
        return state.players.map(player => {
            const selected = selectedPlayers.some(
                item =>
                    Number(item.player_id ?? item.id) ===
                    Number(player.id)
            );

            return `
                <option
                    value="${player.id}"
                    ${selected ? "selected" : ""}
                >
                    ${escapeHTML(player.name)}
                </option>
            `;
        }).join("");
    };

    if (penaltySelect) {
        penaltySelect.innerHTML = createOptions(
            state.roles.penalty
        );
    }

    if (freeKickSelect) {
        freeKickSelect.innerHTML = createOptions(
            state.roles.free_kick
        );
    }

    renderRoleNames();
}

function renderRoleNames() {
    if ($("penaltyPlayers")) {
        $("penaltyPlayers").textContent =
            state.roles.penalty
                .map(item => getPlayerName(item.player_id ?? item.id))
                .join(" → ") ||
            "Nenhum definido";
    }

    if ($("freeKickPlayers")) {
        $("freeKickPlayers").textContent =
            state.roles.free_kick
                .map(item => getPlayerName(item.player_id ?? item.id))
                .join(" → ") ||
            "Nenhum definido";
    }
}

async function saveRoles() {
    if (!isAdmin()) return;

    const penaltyPlayers =
        [...($("penaltySelect")?.selectedOptions || [])]
            .map(option => Number(option.value));

    const freeKickPlayers =
        [...($("freeKickSelect")?.selectedOptions || [])]
            .map(option => Number(option.value));

    try {
        await api("/player-roles/penalty", {
            method: "PUT",
            body: JSON.stringify({
                players: penaltyPlayers
            })
        });

        await api("/player-roles/free_kick", {
            method: "PUT",
            body: JSON.stringify({
                players: freeKickPlayers
            })
        });

        await loadRoles();

        showMessage(
            $("rolesMessage"),
            "Funções salvas!",
            "ok"
        );
    } catch (error) {
        showMessage(
            $("rolesMessage"),
            error.message,
            "err"
        );
    }
}

// ===============================
// ESCALAÇÃO PRINCIPAL
// ===============================

const LINEUP_POSITIONS = [
    {
        key: "goleiro",
        label: "Goleiro"
    },
    {
        key: "fixo",
        label: "Fixo"
    },
    {
        key: "ala-direita",
        label: "Ala direita"
    },
    {
        key: "ala-esquerda",
        label: "Ala esquerda"
    },
    {
        key: "pivo",
        label: "Pivô"
    }
];

let currentLineup = [];

async function loadLineup() {
    try {
        const data = await api("/lineup");

        currentLineup = Array.isArray(data)
            ? data
            : data.lineup || [];

        renderCourt();
        renderLineupEditor();
    } catch (error) {
        console.error(error);
    }
}

function getCurrentLineupPlayer(position) {
    return currentLineup.find(
        item =>
            normalizePosition(item.position) ===
            normalizePosition(position)
    );
}

function renderCourt() {
    document
        .querySelectorAll(".court-player")
        .forEach(element => {
            const position =
                element.dataset.position ||
                element.dataset.playerPosition;

            const lineupPlayer =
                getCurrentLineupPlayer(position);

            const name =
                lineupPlayer?.player_name ||
                lineupPlayer?.name ||
                "—";

            element.textContent = name;
            element.title = name;
        });
}

function renderLineupEditor() {
    const container = $("lineupEditor");

    if (!container) return;

    if (!state.players.length) {
        container.innerHTML = `
            <p class="muted">
                Cadastre jogadores primeiro.
            </p>
        `;

        return;
    }

    const usedPlayers = new Set();

    container.innerHTML = LINEUP_POSITIONS.map(position => {
        const current =
            getCurrentLineupPlayer(position.key);

        const currentName =
            current?.player_name ||
            current?.name ||
            "";

        const currentPlayer =
            state.players.find(
                player => player.name === currentName
            );

        if (currentPlayer) {
            usedPlayers.add(currentPlayer.id);
        }

        return `
            <label>
                ${position.label}

                <select
                    class="lineup-position-select"
                    data-position="${position.key}"
                >
                    <option value="">
                        Nenhum jogador
                    </option>

                    ${state.players.map(player => `
                        <option
                            value="${player.id}"
                            ${
                                Number(player.id) ===
                                Number(currentPlayer?.id)
                                    ? "selected"
                                    : ""
                            }
                        >
                            ${
                                player.number !== null &&
                                player.number !== undefined
                                    ? `#${player.number} `
                                    : ""
                            }
                            ${escapeHTML(player.name)}
                        </option>
                    `).join("")}
                </select>
            </label>
        `;
    }).join("");
}

async function saveLineup() {
    if (!isAdmin()) return;

    const selects = [
        ...document.querySelectorAll(
            ".lineup-position-select"
        )
    ];

    const lineup = [];
    const selectedIds = new Set();

    for (const select of selects) {
        const playerId = select.value;

        if (!playerId) continue;

        if (selectedIds.has(playerId)) {
            showMessage(
                $("lineupMessage"),
                "Um jogador não pode ocupar duas posições.",
                "err"
            );

            return;
        }

        selectedIds.add(playerId);

        const player = state.players.find(
            item => Number(item.id) === Number(playerId)
        );

        if (!player) continue;

        lineup.push({
            player_name: player.name,
            position: select.dataset.position,
            status: "titular",
            number: player.number,
            notes: player.instructions || ""
        });
    }

    state.players
        .filter(player => !selectedIds.has(String(player.id)))
        .forEach(player => {
            lineup.push({
                player_name: player.name,
                position: player.primary_position || "",
                status: "reserva",
                number: player.number,
                notes: player.instructions || ""
            });
        });

    if (
        lineup.filter(
            item => item.status === "titular"
        ).length > 5
    ) {
        showMessage(
            $("lineupMessage"),
            "A escalação pode ter no máximo 5 titulares.",
            "err"
        );

        return;
    }

    try {
        await api("/lineup", {
            method: "PUT",
            body: JSON.stringify({
                lineup
            })
        });

        showMessage(
            $("lineupMessage"),
            "Escalação salva!",
            "ok"
        );

        await loadLineup();
    } catch (error) {
        showMessage(
            $("lineupMessage"),
            error.message,
            "err"
        );
    }
}

// ===============================
// ESCALAÇÃO POR PARTIDA
// ===============================

function updateMatchSelect() {
    const select = $("lineupMatchSelect");

    if (!select) return;

    const current = select.value;

    select.innerHTML = `
        <option value="">
            Escolha uma partida
        </option>
    `;

    state.matches.forEach(match => {
        select.innerHTML += `
            <option value="${match.id}">
                vs ${escapeHTML(match.opponent)}
                — ${formatDate(match.match_date)}
            </option>
        `;
    });

    if (current) {
        select.value = current;
    }
}

async function loadMatchLineupEditor() {
    updateMatchSelect();

    const select = $("lineupMatchSelect");

    if (!select?.value) {
        renderMatchLineupEditor([]);
        return;
    }

    try {
        const data = await api(
            `/matches/${select.value}/lineup`
        );

        renderMatchLineupEditor(
            Array.isArray(data)
                ? data
                : data.lineup || []
        );
    } catch (error) {
        console.error(error);
    }
}

function renderMatchLineupEditor(existing = []) {
    const container = $("matchLineupEditor");

    if (!container) return;

    const starters = existing.filter(
        item => Number(item.starter) === 1
    );

    container.innerHTML = `
        ${LINEUP_POSITIONS.map(position => {
            const current = starters.find(
                item =>
                    normalizePosition(item.position) ===
                    position.key
            );

            return `
                <label>
                    ${position.label}

                    <select
                        class="match-position-select"
                        data-position="${position.key}"
                    >
                        <option value="">
                            Nenhum jogador
                        </option>

                        ${state.players.map(player => `
                            <option
                                value="${player.id}"
                                ${
                                    Number(player.id) ===
                                    Number(current?.player_id)
                                        ? "selected"
                                        : ""
                                }
                            >
                                ${
                                    player.number !== null &&
                                    player.number !== undefined
                                        ? `#${player.number} `
                                        : ""
                                }
                                ${escapeHTML(player.name)}
                            </option>
                        `).join("")}
                    </select>
                </label>
            `;
        }).join("")}

        <div class="item">
            <strong>Instruções da partida</strong>

            ${LINEUP_POSITIONS.map(position => `
                <label>
                    ${position.label}

                    <input
                        type="text"
                        class="match-instruction"
                        data-position="${position.key}"
                        placeholder="Ex.: ficar mais recuado"
                    >
                </label>
            `).join("")}
        </div>
    `;
}

async function saveMatchLineup() {
    if (!isAdmin()) return;

    const matchId = $("lineupMatchSelect")?.value;

    if (!matchId) {
        showMessage(
            $("matchLineupMessage"),
            "Escolha uma partida.",
            "err"
        );

        return;
    }

    const selects = [
        ...document.querySelectorAll(
            ".match-position-select"
        )
    ];

    const lineup = [];
    const selectedIds = new Set();

    for (const select of selects) {
        if (!select.value) continue;

        if (selectedIds.has(select.value)) {
            showMessage(
                $("matchLineupMessage"),
                "Um jogador não pode ocupar duas posições.",
                "err"
            );

            return;
        }

        selectedIds.add(select.value);

        const player = state.players.find(
            item => Number(item.id) === Number(select.value)
        );

        if (!player) continue;

        const instruction = document.querySelector(
            `.match-instruction[data-position="${select.dataset.position}"]`
        );

        lineup.push({
            player_id: player.id,
            position: select.dataset.position,
            starter: 1,
            instructions:
                instruction?.value.trim() ||
                player.instructions ||
                ""
        });
    }

    if (lineup.length > 5) {
        showMessage(
            $("matchLineupMessage"),
            "A partida pode ter no máximo 5 titulares.",
            "err"
        );

        return;
    }

    try {
        await api(`/matches/${matchId}/lineup`, {
            method: "PUT",
            body: JSON.stringify({
                lineup
            })
        });

        showMessage(
            $("matchLineupMessage"),
            "Escalação da partida salva!",
            "ok"
        );

        await loadMatchLineupEditor();
    } catch (error) {
        showMessage(
            $("matchLineupMessage"),
            error.message,
            "err"
        );
    }
}

// ===============================
// ENQUETES
// ===============================

function renderPollOptionInputs() {
    const container = $("pollOptions");

    if (!container) return;

    if (!container.querySelector(".poll-option")) {
        container.innerHTML = `
            <input
                class="poll-option"
                type="text"
                placeholder="Opção 1"
            >

            <input
                class="poll-option"
                type="text"
                placeholder="Opção 2"
            >
        `;
    }
}

function addPollOption() {
    const container = $("pollOptions");

    if (!container) return;

    const count =
        container.querySelectorAll(".poll-option").length;

    const input = document.createElement("input");

    input.type = "text";
    input.className = "poll-option";
    input.placeholder = `Opção ${count + 1}`;

    container.appendChild(input);
}

async function loadPolls() {
    try {
        const data = await api("/polls");

        state.polls = Array.isArray(data)
            ? data
            : data.polls || [];

        renderPolls();
    } catch (error) {
        console.error(error);
    }
}

function renderPolls() {
    const container = $("pollsList");

    if (!container) return;

    if (!state.polls.length) {
        container.innerHTML = `
            <div class="item">
                Nenhuma enquete criada.
            </div>
        `;

        return;
    }

    container.innerHTML = state.polls.map(poll => {
        const closed =
            poll.closes_at &&
            new Date(poll.closes_at) <= new Date();

        const options = poll.options || [];

        return `
            <div class="item poll">
                <h3>${escapeHTML(poll.question)}</h3>

                <div class="muted">
                    ${
                        closed
                            ? "Enquete encerrada"
                            : `Fecha em ${formatDate(poll.closes_at)}`
                    }
                </div>

                <form
                    onsubmit="votePoll(event, ${poll.id})"
                >
                    ${options.map(option => {
                        const inputType =
                            poll.multiple_choice
                                ? "checkbox"
                                : "radio";

                        return `
                            <label class="choice">
                                <input
                                    type="${inputType}"
                                    name="poll-${poll.id}"
                                    value="${option.id}"
                                    ${
                                        option.voted
                                            ? "checked"
                                            : ""
                                    }
                                    ${
                                        closed ||
                                        poll.has_voted
                                            ? "disabled"
                                            : ""
                                    }
                                >

                                ${escapeHTML(option.text)}

                                ${
                                    option.votes !== undefined
                                        ? `
                                            <span class="muted">
                                                — ${option.votes} voto(s)
                                            </span>
                                        `
                                        : ""
                                }
                            </label>
                        `;
                    }).join("")}

                    ${
                        !closed && !poll.has_voted
                            ? `
                                <button type="submit">
                                    Votar
                                </button>
                            `
                            : ""
                    }
                </form>

                ${
                    isAdmin()
                        ? `
                            <button
                                class="danger"
                                onclick="deletePoll(${poll.id})"
                            >
                                Excluir enquete
                            </button>
                        `
                        : ""
                }
            </div>
        `;
    }).join("");
}

async function votePoll(event, pollId) {
    event.preventDefault();

    const form = event.target;

    const selected = [
        ...form.querySelectorAll(
            `input[name="poll-${pollId}"]:checked`
        )
    ].map(input => Number(input.value));

    if (!selected.length) {
        toast("Escolha uma opção.", "err");
        return;
    }

    try {
        await api(`/polls/${pollId}/vote`, {
            method: "POST",
            body: JSON.stringify({
                option_ids: selected
            })
        });

        toast("Voto registrado!", "ok");

        await loadPolls();
    } catch (error) {
        toast(error.message, "err");
    }
}

async function createPoll(event) {
    event.preventDefault();

    if (!isAdmin()) return;

    const question =
        $("pollQuestion").value.trim();

    const options =
        [...document.querySelectorAll(".poll-option")]
            .map(input => input.value.trim())
            .filter(Boolean);

    const closesAt =
        $("pollCloseDate").value;

    if (options.length < 2) {
        showMessage(
            $("pollMessage"),
            "A enquete precisa de pelo menos 2 opções.",
            "err"
        );

        return;
    }

    try {
        await api("/polls", {
            method: "POST",
            body: JSON.stringify({
                question,
                options,
                closes_at:
                    toISOStringFromInput(closesAt),
                multiple_choice:
                    $("pollMultiple").checked
            })
        });

        showMessage(
            $("pollMessage"),
            "Enquete criada!",
            "ok"
        );

        $("pollForm").reset();

        $("pollCreateBox")?.classList.add("hidden");

        await loadPolls();
    } catch (error) {
        showMessage(
            $("pollMessage"),
            error.message,
            "err"
        );
    }
}

async function deletePoll(id) {
    if (!isAdmin()) return;

    if (!confirm("Excluir esta enquete?")) {
        return;
    }

    try {
        await api(`/polls/${id}`, {
            method: "DELETE"
        });

        toast("Enquete excluída.", "ok");

        await loadPolls();
    } catch (error) {
        toast(error.message, "err");
    }
}

// ===============================
// PARTIDAS
// ===============================

async function loadMatches() {
    try {
        const data = await api("/matches");

        state.matches = Array.isArray(data)
            ? data
            : data.matches || [];

        renderMatches();
        updateMatchSelect();
    } catch (error) {
        console.error(error);
    }
}

function renderMatches() {
    const container = $("matchesList");

    if (!container) return;

    if (!state.matches.length) {
        container.innerHTML = `
            <div class="item">
                Nenhuma partida cadastrada.
            </div>
        `;

        return;
    }

    container.innerHTML = state.matches.map(match => `
        <div class="item">
            <h3>
                Beiçola F.I. ×
                ${escapeHTML(match.opponent)}
            </h3>

            <div class="muted">
                ${formatDate(match.match_date)}
            </div>

            ${
                match.location
                    ? `
                        <div class="muted">
                            Local: ${escapeHTML(match.location)}
                        </div>
                    `
                    : ""
            }

            ${
                match.result
                    ? `
                        <div>
                            Resultado:
                            <strong>
                                ${escapeHTML(match.result)}
                            </strong>
                        </div>
                    `
                    : ""
            }

            ${
                match.notes
                    ? `
                        <div class="muted">
                            ${escapeHTML(match.notes)}
                        </div>
                    `
                    : ""
            }

            ${
                isAdmin()
                    ? `
                        <button
                            class="danger"
                            onclick="deleteMatch(${match.id})"
                        >
                            Excluir
                        </button>
                    `
                    : ""
            }
        </div>
    `).join("");
}

async function createMatch(event) {
    event.preventDefault();

    if (!isAdmin()) return;

    const body = {
        opponent:
            $("matchOpponent").value.trim(),

        match_date:
            toISOStringFromInput(
                $("matchDate").value
            ),

        location:
            $("matchLocation").value.trim(),

        result:
            $("matchResult").value.trim(),

        notes:
            $("matchNotes").value.trim()
    };

    try {
        await api("/matches", {
            method: "POST",
            body: JSON.stringify(body)
        });

        showMessage(
            $("matchMessage"),
            "Partida criada!",
            "ok"
        );

        $("matchForm").reset();

        $("matchCreateBox")?.classList.add("hidden");

        await loadMatches();
    } catch (error) {
        showMessage(
            $("matchMessage"),
            error.message,
            "err"
        );
    }
}

async function deleteMatch(id) {
    if (!isAdmin()) return;

    if (!confirm("Excluir esta partida?")) {
        return;
    }

    try {
        await api(`/matches/${id}`, {
            method: "DELETE"
        });

        toast("Partida excluída.", "ok");

        await loadMatches();
    } catch (error) {
        toast(error.message, "err");
    }
}

// ===============================
// AVISOS
// ===============================

async function loadAnnouncements() {
    try {
        const data = await api("/announcements");

        state.announcements =
            Array.isArray(data)
                ? data
                : data.announcements || [];

        renderAnnouncements();
    } catch (error) {
        console.error(error);
    }
}

function renderAnnouncements() {
    const container = $("announcementsList");

    if (!container) return;

    if (!state.announcements.length) {
        container.innerHTML = `
            <div class="item">
                Nenhum aviso publicado.
            </div>
        `;

        return;
    }

    container.innerHTML =
        state.announcements.map(announcement => `
            <div class="item">
                <h3>
                    ${escapeHTML(announcement.title)}
                </h3>

                <div class="muted">
                    ${formatDate(announcement.created_at)}
                </div>

                <p>
                    ${escapeHTML(announcement.content)}
                </p>

                ${
                    isAdmin()
                        ? `
                            <button
                                class="danger"
                                onclick="deleteAnnouncement(${announcement.id})"
                            >
                                Excluir
                            </button>
                        `
                        : ""
                }
            </div>
        `).join("");
}

async function createAnnouncement(event) {
    event.preventDefault();

    if (!isAdmin()) return;

    try {
        await api("/announcements", {
            method: "POST",
            body: JSON.stringify({
                title:
                    $("announcementTitle").value.trim(),

                content:
                    $("announcementContent").value.trim()
            })
        });

        showMessage(
            $("announcementMessage"),
            "Aviso publicado!",
            "ok"
        );

        $("announcementForm").reset();

        $("announcementCreateBox")
            ?.classList.add("hidden");

        await loadAnnouncements();
    } catch (error) {
        showMessage(
            $("announcementMessage"),
            error.message,
            "err"
        );
    }
}

async function deleteAnnouncement(id) {
    if (!isAdmin()) return;

    if (!confirm("Excluir este aviso?")) {
        return;
    }

    try {
        await api(`/announcements/${id}`, {
            method: "DELETE"
        });

        toast("Aviso excluído.", "ok");

        await loadAnnouncements();
    } catch (error) {
        toast(error.message, "err");
    }
}

// ===============================
// PERFIL
// ===============================

async function loadProfile() {
    try {
        const data = await api("/profile");

        const profile =
            data.user ||
            data.profile ||
            data;

        if ($("profileName")) {
            $("profileName").value =
                profile.name || "";
        }

        if ($("profileEmail")) {
            $("profileEmail").value =
                profile.email || "";
        }

        if ($("profileRole")) {
            $("profileRole").value =
                profile.role || "";
        }
    } catch (error) {
        console.error(error);
    }
}

async function updateProfile(event) {
    event.preventDefault();

    try {
        const data = await api("/profile", {
            method: "PUT",
            body: JSON.stringify({
                name:
                    $("profileName").value.trim()
            })
        });

        state.me = data.user || {
            ...state.me,
            name: $("profileName").value.trim()
        };

        if ($("headerUserName")) {
            $("headerUserName").textContent =
                state.me.name;
        }

        showMessage(
            $("profileMessage"),
            "Perfil atualizado!",
            "ok"
        );
    } catch (error) {
        showMessage(
            $("profileMessage"),
            error.message,
            "err"
        );
    }
}

async function changePassword(event) {
    event.preventDefault();

    const currentPassword =
        $("currentPassword").value;

    const newPassword =
        $("newPassword").value;

    const confirmPassword =
        $("confirmNewPassword").value;

    if (newPassword !== confirmPassword) {
        showMessage(
            $("passwordMessage"),
            "As novas senhas não são iguais.",
            "err"
        );

        return;
    }

    try {
        await api("/change-password", {
            method: "POST",
            body: JSON.stringify({
                currentPassword,
                newPassword
            })
        });

        showMessage(
            $("passwordMessage"),
            "Senha alterada com sucesso!",
            "ok"
        );

        $("passwordForm").reset();
    } catch (error) {
        showMessage(
            $("passwordMessage"),
            error.message,
            "err"
        );
    }
}

// ===============================
// ADMINISTRAÇÃO
// ===============================

async function loadMembers() {
    if (!isAdmin()) return;

    try {
        const data = await api("/members");

        state.members = Array.isArray(data)
            ? data
            : data.members || [];

        renderMembers();
        populatePlayerMemberSelect(
            state.editingPlayerId
                ? state.players.find(
                    player =>
                        Number(player.id) ===
                        Number(state.editingPlayerId)
                )
                : null
        );
    } catch (error) {
        console.error(error);
    }
}

function renderMembers() {
    const container = $("membersList");

    if (!container) return;

    if (!state.members.length) {
        container.innerHTML = `
            <div class="item">
                Nenhum membro encontrado.
            </div>
        `;

        return;
    }

    const playerUserIds = new Set(
        state.players
            .map(player => Number(player.user_id))
            .filter(Boolean)
    );

    container.innerHTML =
        state.members.map(member => {
            const isPlayer =
                playerUserIds.has(Number(member.id));

            return `
                <div class="item">
                    <strong>
                        ${escapeHTML(member.name)}
                    </strong>

                    <div class="muted">
                        ${escapeHTML(member.email)}
                    </div>

                    <div class="muted">
                        Função:
                        ${member.role === "admin"
                            ? "Administrador"
                            : "Integrante"}
                    </div>

                    ${
                        !isPlayer
                            ? `
                                <button
                                    class="ghost"
                                    onclick="convertMemberToPlayer(${member.id})"
                                >
                                    Tornar jogador
                                </button>
                            `
                            : `
                                <span class="muted">
                                    Já é jogador
                                </span>
                            `
                    }
                </div>
            `;
        }).join("");
}

async function checkAdminSetup() {
    const box = $("setupAdminBox");

    if (!box) return;

    try {
        const data =
            await api("/setup-admin/status");

        if (data.available) {
            box.classList.remove("hidden");
        } else {
            box.classList.add("hidden");
        }
    } catch {
        box.classList.add("hidden");
    }
}

async function setupAdmin(event) {
    event.preventDefault();

    const message =
        $("setupAdminMessage");

    try {
        await api("/setup-admin", {
            method: "POST",
            body: JSON.stringify({
                key:
                    $("setupAdminKey").value,

                name:
                    $("setupAdminName").value.trim(),

                email:
                    $("setupAdminEmail").value.trim(),

                password:
                    $("setupAdminPassword").value
            })
        });

        showMessage(
            message,
            "Administrador criado com sucesso!",
            "ok"
        );

        $("setupAdminForm").reset();

        setTimeout(() => {
            checkSession();
        }, 1000);
    } catch (error) {
        showMessage(
            message,
            error.message,
            "err"
        );
    }
}

// ===============================
// FORMULÁRIOS E BOTÕES
// ===============================

function setupEvents() {
    $("loginForm")?.addEventListener(
        "submit",
        login
    );

    $("registerForm")?.addEventListener(
        "submit",
        register
    );

    $("forgotForm")?.addEventListener(
        "submit",
        forgotPassword
    );

    $("showRegister")?.addEventListener(
        "click",
        showRegister
    );

    $("showForgotPassword")?.addEventListener(
        "click",
        showForgotPassword
    );

    $("backToLogin")?.addEventListener(
        "click",
        showLogin
    );

    $("forgotBackLogin")?.addEventListener(
        "click",
        showLogin
    );

    $("logoutButton")?.addEventListener(
        "click",
        logout
    );

    document
        .querySelectorAll(".nav-button")
        .forEach(button => {
            button.addEventListener(
                "click",
                () => navigate(button.dataset.section)
            );
        });

    $("newPlayerButton")?.addEventListener(
        "click",
        () => openPlayerModal()
    );

    $("closePlayerModal")?.addEventListener(
        "click",
        closePlayerModal
    );

    $("cancelPlayerButton")?.addEventListener(
        "click",
        closePlayerModal
    );

    $("playerForm")?.addEventListener(
        "submit",
        savePlayer
    );

    $("removeCaptainButton")?.addEventListener(
        "click",
        removeCaptain
    );

    $("saveRolesButton")?.addEventListener(
        "click",
        saveRoles
    );

    $("saveLineupButton")?.addEventListener(
        "click",
        saveLineup
    );

    $("lineupMatchSelect")?.addEventListener(
        "change",
        loadMatchLineupEditor
    );

    $("saveMatchLineupButton")?.addEventListener(
        "click",
        saveMatchLineup
    );

    $("newPollButton")?.addEventListener(
        "click",
        () => {
            $("pollCreateBox")?.classList.remove(
                "hidden"
            );

            renderPollOptionInputs();
        }
    );

    $("cancelPollButton")?.addEventListener(
        "click",
        () => {
            $("pollCreateBox")?.classList.add(
                "hidden"
            );
        }
    );

    $("addPollOptionButton")?.addEventListener(
        "click",
        addPollOption
    );

    $("pollForm")?.addEventListener(
        "submit",
        createPoll
    );

    $("newMatchButton")?.addEventListener(
        "click",
        () => {
            $("matchCreateBox")?.classList.remove(
                "hidden"
            );
        }
    );

    $("cancelMatchButton")?.addEventListener(
        "click",
        () => {
            $("matchCreateBox")?.classList.add(
                "hidden"
            );
        }
    );

    $("matchForm")?.addEventListener(
        "submit",
        createMatch
    );

    $("newAnnouncementButton")?.addEventListener(
        "click",
        () => {
            $("announcementCreateBox")
                ?.classList.remove("hidden");
        }
    );

    $("cancelAnnouncementButton")?.addEventListener(
        "click",
        () => {
            $("announcementCreateBox")
                ?.classList.add("hidden");
        }
    );

    $("announcementForm")?.addEventListener(
        "submit",
        createAnnouncement
    );

    $("profileForm")?.addEventListener(
        "submit",
        updateProfile
    );

    $("passwordForm")?.addEventListener(
        "submit",
        changePassword
    );

    $("setupAdminForm")?.addEventListener(
        "submit",
        setupAdmin
    );
}

// ===============================
// INICIALIZAÇÃO
// ===============================

async function bootApplication() {
    if (!state.me) return;

    if ($("headerUserName")) {
        $("headerUserName").textContent =
            state.me.name || "";
    }

    if ($("headerUserRole")) {
        $("headerUserRole").textContent =
            state.me.role === "admin"
                ? "Administrador"
                : "Integrante";
    }

    document
        .querySelectorAll(".admin-only")
        .forEach(element => {
            element.classList.toggle(
                "hidden",
                !isAdmin()
            );
        });

    await Promise.all([
        loadPlayers(),
        loadRoles(),
        loadMatches(),
        loadPolls(),
        loadAnnouncements()
    ]);

    if (isAdmin()) {
        await loadMembers();
    }

    await loadLineup();

    updateMatchSelect();

    navigate(state.currentSection);
}

// ===============================
// INÍCIO
// ===============================

document.addEventListener(
    "DOMContentLoaded",
    async () => {
        setupEvents();
        renderPollOptionInputs();
        await checkSession();
    }
);

// ===============================
// FUNÇÕES GLOBAIS
// ===============================

window.editPlayer = editPlayer;
window.deletePlayer = deletePlayer;
window.setCaptain = setCaptain;
window.convertMemberToPlayer = convertMemberToPlayer;
window.votePoll = votePoll;
window.deletePoll = deletePoll;
window.deleteMatch = deleteMatch;
window.deleteAnnouncement = deleteAnnouncement;
