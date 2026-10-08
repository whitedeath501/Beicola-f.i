/* =========================================================
   BEIÇOLA F.I. — FRONTEND
   Sistema pessoal do time
========================================================= */

const $ = (selector) =>
  document.querySelector(selector);

const $$ = (selector) =>
  [...document.querySelectorAll(selector)];

let me = null;
let playersData = [];
let matchesData = [];
let editingPlayerId = null;


/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {

  const response = await fetch(url, {
    ...options,

    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },

    credentials: "include"
  });

  let data = {};

  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    throw new Error(
      data.error ||
      data.message ||
      "Ocorreu um erro."
    );
  }

  return data;
}


/* =========================================================
   MENSAGENS
========================================================= */

function showMessage(element, text, success = false) {

  if (!element) return;

  element.textContent = text;

  element.className =
    success
      ? "ok"
      : "err";
}


function toast(message, type = "ok") {

  const element = $("#toast");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.className = `toast ${type}`;

  setTimeout(() => {
    element.className = "toast hidden";
  }, 3000);
}


/* =========================================================
   ABAS DE AUTENTICAÇÃO
========================================================= */

function setupAuthTabs() {

  const showRegister = $("#showRegister");
  const showForgot = $("#showForgot");
  const backToLogin = $("#backToLogin");
  const forgotBackLogin = $("#forgotBackLogin");

  showRegister?.addEventListener("click", () => {
    $("#loginBox")?.classList.add("hidden");
    $("#registerBox")?.classList.remove("hidden");
    $("#forgotBox")?.classList.add("hidden");
  });

  showForgot?.addEventListener("click", () => {
    $("#loginBox")?.classList.add("hidden");
    $("#registerBox")?.classList.add("hidden");
    $("#forgotBox")?.classList.remove("hidden");
  });

  backToLogin?.addEventListener("click", () => {
    $("#loginBox")?.classList.remove("hidden");
    $("#registerBox")?.classList.add("hidden");
    $("#forgotBox")?.classList.add("hidden");
  });

  forgotBackLogin?.addEventListener("click", () => {
    $("#loginBox")?.classList.remove("hidden");
    $("#registerBox")?.classList.add("hidden");
    $("#forgotBox")?.classList.add("hidden");
  });
}


/* =========================================================
   LOGIN
========================================================= */

$("#loginForm")?.addEventListener("submit", async (event) => {

  event.preventDefault();

  const message = $("#loginMessage");

  try {

    const data = {
      email: $("#loginEmail").value.trim(),
      password: $("#loginPassword").value
    };

    await api("/api/login", {
      method: "POST",
      body: JSON.stringify(data)
    });

    showMessage(
      message,
      "Login realizado com sucesso.",
      true
    );

    await loadApp();

  } catch (error) {

    showMessage(
      message,
      error.message
    );
  }
});


/* =========================================================
   CADASTRO
========================================================= */

$("#registerForm")?.addEventListener("submit", async (event) => {

  event.preventDefault();

  const message = $("#registerMessage");

  const password =
    $("#registerPassword").value;

  const confirmation =
    $("#registerPasswordConfirm").value;

  if (password !== confirmation) {

    showMessage(
      message,
      "As senhas não são iguais."
    );

    return;
  }

  try {

    await api("/api/register", {
      method: "POST",

      body: JSON.stringify({
        name:
          $("#registerName").value.trim(),

        email:
          $("#registerEmail").value.trim(),

        password
      })
    });

    showMessage(
      message,
      "Conta criada com sucesso! Agora faça login.",
      true
    );

    event.target.reset();

    setTimeout(() => {

      $("#backToLogin")?.click();

    }, 1000);

  } catch (error) {

    showMessage(
      message,
      error.message
    );
  }
});


/* =========================================================
   RECUPERAÇÃO DE SENHA
========================================================= */

$("#forgotForm")?.addEventListener("submit", async (event) => {

  event.preventDefault();

  const message = $("#forgotMessage");

  try {

    const data = await api(
      "/api/forgot-password",
      {
        method: "POST",

        body: JSON.stringify({
          email:
            $("#forgotEmail").value.trim()
        })
      }
    );

    showMessage(
      message,
      data.message ||
      "Se o e-mail existir, enviaremos as instruções.",
      true
    );

  } catch (error) {

    showMessage(
      message,
      error.message
    );
  }
});


/* =========================================================
   LOGOUT
========================================================= */

$("#logoutButton")?.addEventListener(
  "click",
  async () => {

    try {

      await api(
        "/api/logout",
        {
          method: "POST"
        }
      );

    } catch {
      // Mesmo que a API falhe,
      // voltamos para a tela inicial.
    }

    location.reload();
  }
);


/* =========================================================
   NAVEGAÇÃO
========================================================= */

function setupNavigation() {

  $$(".nav-button").forEach(button => {

    button.addEventListener("click", () => {

      const section =
        button.dataset.section;

      if (!section) return;

      $$(".nav-button").forEach(item => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      $$(".app-section").forEach(item => {
        item.classList.add("hidden");
      });

      const target =
        $(`#section-${section}`);

      target?.classList.remove("hidden");

      if (section === "players") {
        loadPlayers();
      }

      if (section === "lineup") {
        loadLineup();
        loadMatchLineup();
      }

      if (section === "polls") {
        loadPolls();
      }

      if (section === "matches") {
        loadMatches();
      }

      if (section === "announcements") {
        loadAnnouncements();
      }

      if (section === "admin") {
        loadMembers();
      }

    });

  });
}


/* =========================================================
   CARREGAR USUÁRIO
========================================================= */

async function loadApp() {

  try {

    const data =
      await api("/api/me");

    me = data.user;

    $("#authScreen")?.classList.add("hidden");

    $("#appScreen")?.classList.remove("hidden");

    $("#headerUserName").textContent =
      me.name;

    $("#headerUserRole").textContent =
      me.role === "admin"
        ? "Administrador"
        : "Integrante";

    if (me.role === "admin") {

      $$(".admin-only").forEach(element => {
        element.classList.remove("hidden");
      });

    } else {

      $$(".admin-only").forEach(element => {
        element.classList.add("hidden");
      });
    }

    await loadDashboard();

    await loadPlayers();

    await loadMatches();

    await loadPolls();

    await loadAnnouncements();

    await loadMembers();

    await loadRoles();

    await loadLineup();

    await loadMatchLineup();

    loadProfile();

  } catch {

    $("#authScreen")?.classList.remove("hidden");

    $("#appScreen")?.classList.add("hidden");

    await checkAdminSetup();

  }
}


/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {

  try {

    const [
      players,
      matches,
      polls,
      announcements
    ] = await Promise.all([
      api("/api/players"),
      api("/api/matches"),
      api("/api/polls"),
      api("/api/announcements")
    ]);

    const playerList =
      players.players || [];

    const matchList =
      matches.matches || [];

    const pollList =
      polls.polls || [];

    const announcementList =
      announcements.announcements || [];

    $("#welcomeName").textContent =
      me?.name || "Integrante";

    $("#dashboardPlayers").textContent =
      playerList.length;

    $("#dashboardMatches").textContent =
      matchList.length;

    $("#dashboardPolls").textContent =
      pollList.length;

    $("#dashboardAnnouncements").textContent =
      announcementList.length;

    const nextMatch =
      [...matchList]
        .filter(match => {
          return match.date &&
            new Date(match.date) >= new Date();
        })
        .sort((a, b) =>
          new Date(a.date) -
          new Date(b.date)
        )[0];

    $("#dashboardNextMatch").textContent =
      nextMatch
        ? `vs. ${nextMatch.opponent} — ${formatDate(nextMatch.date)}`
        : "Nenhuma partida próxima.";

  } catch {
    // Dashboard não deve impedir o resto do sistema.
  }
}


/* =========================================================
   JOGADORES
========================================================= */

async function loadPlayers() {

  try {

    const data =
      await api("/api/players");

    playersData =
      data.players || [];

    renderPlayers();

    updatePlayerSelects();

    renderCaptain();

  } catch (error) {

    console.error(
      "Erro ao carregar jogadores:",
      error
    );
  }
}


function renderPlayers() {

  const container =
    $("#playersList");

  if (!container) return;

  if (!playersData.length) {

    container.innerHTML = `
      <div class="empty">
        Nenhum jogador cadastrado.
      </div>
    `;

    return;
  }

  container.innerHTML =
    playersData.map(player => {

      const secondary =
        parsePositions(
          player.secondary_positions
        );

      return `
        <div class="player-card">

          <div class="player-number">
            ${player.number ?? "-"}
          </div>

          <div class="player-info">

            <h3>
              ${esc(player.name)}
            </h3>

            <div class="muted">
              ${esc(player.primary_position)}
              ${
                secondary.length
                  ? " • " +
                    secondary
                      .map(esc)
                      .join(", ")
                  : ""
              }
            </div>

            <div class="player-status">
              ${statusLabel(player.status)}

              ${
                player.is_captain
                  ? " • Capitão"
                  : ""
              }
            </div>

            ${
              player.instructions
                ? `
                  <p class="muted">
                    ${esc(player.instructions)}
                  </p>
                `
                : ""
            }

          </div>

          ${
            me?.role === "admin"
              ? `
                <div class="player-actions">

                  <button
                    class="ghost"
                    onclick="editPlayer(${player.id})"
                  >
                    Editar
                  </button>

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


/* =========================================================
   NOVO JOGADOR
========================================================= */

$("#newPlayerButton")?.addEventListener(
  "click",
  () => {

    editingPlayerId = null;

    $("#playerModalTitle").textContent =
      "Novo jogador";

    $("#playerForm").reset();

    $("#playerId").value = "";

    $("#playerFormMessage").textContent = "";

    $("#playerModal")
      .classList
      .remove("hidden");

    loadMemberOptions();

  }
);


/* =========================================================
   EDITAR JOGADOR
========================================================= */

window.editPlayer = async function(id) {

  const player =
    playersData.find(
      item => Number(item.id) === Number(id)
    );

  if (!player) return;

  editingPlayerId = id;

  $("#playerModalTitle").textContent =
    "Editar jogador";

  $("#playerId").value =
    player.id;

  $("#playerName").value =
    player.name || "";

  $("#playerNumber").value =
    player.number ?? "";

  $("#playerStatus").value =
    player.status || "disponivel";

  $("#playerPrimaryPosition").value =
    player.primary_position || "";

  $("#playerSecondaryPositions").value =
    parsePositions(
      player.secondary_positions
    ).join(", ");

  $("#playerInstructions").value =
    player.instructions || "";

  await loadMemberOptions(
    player.user_id
  );

  $("#playerModal")
    .classList
    .remove("hidden");
};


/* =========================================================
   SALVAR JOGADOR
========================================================= */

$("#playerForm")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const message =
      $("#playerFormMessage");

    const secondary =
      $("#playerSecondaryPositions")
        .value
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);

    const userValue =
      $("#playerUser").value;

    const data = {

      name:
        $("#playerName").value.trim(),

      number:
        $("#playerNumber").value
          ? Number($("#playerNumber").value)
          : null,

      status:
        $("#playerStatus").value,

      primary_position:
        $("#playerPrimaryPosition").value,

      secondary_positions:
        secondary,

      instructions:
        $("#playerInstructions").value.trim(),

      user_id:
        userValue
          ? Number(userValue)
          : null
    };

    try {

      if (editingPlayerId) {

        await api(
          `/api/players/${editingPlayerId}`,
          {
            method: "PUT",
            body: JSON.stringify(data)
          }
        );

      } else {

        await api(
          "/api/players",
          {
            method: "POST",
            body: JSON.stringify(data)
          }
        );

      }

      showMessage(
        message,
        "Jogador salvo com sucesso.",
        true
      );

      await loadPlayers();

      setTimeout(() => {

        closePlayerModal();

      }, 500);

    } catch (error) {

      showMessage(
        message,
        error.message
      );
    }

  }
);


/* =========================================================
   EXCLUIR JOGADOR
========================================================= */

window.deletePlayer = async function(id) {

  const player =
    playersData.find(
      item => Number(item.id) === Number(id)
    );

  if (!player) return;

  if (
    !confirm(
      `Excluir o jogador ${player.name}?`
    )
  ) {
    return;
  }

  try {

    await api(
      `/api/players/${id}`,
      {
        method: "DELETE"
      }
    );

    toast(
      "Jogador excluído."
    );

    await loadPlayers();

  } catch (error) {

    toast(
      error.message,
      "error"
    );
  }
};


/* =========================================================
   MODAL
========================================================= */

function closePlayerModal() {

  $("#playerModal")
    ?.classList
    .add("hidden");

  editingPlayerId = null;
}


window.closePlayerModal =
  closePlayerModal;


$("#closePlayerModal")?.addEventListener(
  "click",
  closePlayerModal
);

$("#cancelPlayerButton")?.addEventListener(
  "click",
  closePlayerModal
);


/* =========================================================
   MEMBROS PARA VINCULAR AO JOGADOR
========================================================= */

async function loadMemberOptions(selectedId = null) {

  const select =
    $("#playerUser");

  if (!select) return;

  try {

    const data =
      await api("/api/members");

    const members =
      data.members || [];

    select.innerHTML = `
      <option value="">
        Jogador sem conta vinculada
      </option>
    `;

    members.forEach(member => {

      const option =
        document.createElement("option");

      option.value =
        member.id;

      option.textContent =
        `${member.name} — ${member.email}`;

      if (
        selectedId &&
        Number(selectedId) === Number(member.id)
      ) {
        option.selected = true;
      }

      select.appendChild(option);

    });

  } catch (error) {

    console.error(error);
  }
}


/* =========================================================
   CAPITÃO
========================================================= */

function renderCaptain() {

  const captain =
    playersData.find(
      player =>
        Number(player.is_captain) === 1
    );

  if ($("#captainName")) {

    $("#captainName").textContent =
      captain
        ? captain.name
        : "Nenhum capitão definido";
  }
}


$("#removeCaptainButton")?.addEventListener(
  "click",
  async () => {

    try {

      await api(
        "/api/players/captain",
        {
          method: "DELETE"
        }
      );

      toast(
        "Capitão removido."
      );

      await loadPlayers();

    } catch (error) {

      toast(
        error.message,
        "error"
      );
    }
  }
);


/* =========================================================
   BATEDORES
========================================================= */

async function loadRoles() {

  try {

    const data =
      await api("/api/player-roles");

    const penalty =
      data.penalty || [];

    const freeKick =
      data.free_kick || [];

    renderRoleList(
      $("#penaltyPlayers"),
      penalty
    );

    renderRoleList(
      $("#freeKickPlayers"),
      freeKick
    );

    if ($("#penaltySelect")) {

      $("#penaltySelect").value =
        penalty[0]?.player_id || "";
    }

    if ($("#freeKickSelect")) {

      $("#freeKickSelect").value =
        freeKick[0]?.player_id || "";
    }

  } catch (error) {

    console.error(error);
  }
}


function renderRoleList(container, list) {

  if (!container) return;

  if (!list.length) {

    container.innerHTML =
      `<span class="muted">Nenhum definido.</span>`;

    return;
  }

  container.innerHTML =
    list.map((item, index) => `
      <div class="role-player">
        ${index + 1}. ${esc(item.player_name)}
      </div>
    `).join("");
}


function updatePlayerSelects() {

  const selects = [
    $("#penaltySelect"),
    $("#freeKickSelect")
  ];

  selects.forEach(select => {

    if (!select) return;

    const oldValue =
      select.value;

    select.innerHTML = `
      <option value="">
        Selecionar jogador
      </option>
    `;

    playersData
      .filter(player =>
        player.status !== "inativo"
      )
      .forEach(player => {

        const option =
          document.createElement("option");

        option.value =
          player.id;

        option.textContent =
          `${player.name} — ${player.primary_position}`;

        select.appendChild(option);

      });

    if (oldValue) {
      select.value = oldValue;
    }

  });
}


$("#saveRolesButton")?.addEventListener(
  "click",
  async () => {

    const message =
      $("#rolesMessage");

    try {

      const penalty =
        $("#penaltySelect").value;

      const freeKick =
        $("#freeKickSelect").value;

      if (penalty) {

        await api(
          "/api/player-roles/penalty",
          {
            method: "PUT",

            body: JSON.stringify({
              players: [
                Number(penalty)
              ]
            })
          }
        );

      } else {

        await api(
          "/api/player-roles/penalty",
          {
            method: "PUT",

            body: JSON.stringify({
              players: []
            })
          }
        );
      }

      if (freeKick) {

        await api(
          "/api/player-roles/free_kick",
          {
            method: "PUT",

            body: JSON.stringify({
              players: [
                Number(freeKick)
              ]
            })
          }
        );

      } else {

        await api(
          "/api/player-roles/free_kick",
          {
            method: "PUT",

            body: JSON.stringify({
              players: []
            })
          }
        );
      }

      showMessage(
        message,
        "Funções salvas.",
        true
      );

      await loadRoles();

    } catch (error) {

      showMessage(
        message,
        error.message
      );
    }
  }
);


/* =========================================================
   ESCALAÇÃO PRINCIPAL
========================================================= */

async function loadLineup() {

  const court =
    $(".court");

  if (!court) return;

  try {

    const data =
      await api("/api/players");

    playersData =
      data.players || [];

    $$(".court-player").forEach(slot => {

      const position =
        slot.dataset.position;

      const player =
        playersData.find(
          item =>
            item.primary_position === position
        );

      const nameElement =
        slot.querySelector(
          ".court-player-name"
        );

      if (nameElement) {

        nameElement.textContent =
          player
            ? player.name
            : "Vazio";
      }

      slot.dataset.playerId =
        player
          ? player.id
          : "";

    });

    renderLineupEditor();

  } catch (error) {

    console.error(error);
  }
}


function renderLineupEditor() {

  const editor =
    $("#lineupEditor");

  if (!editor) return;

  const positions = [
    "Goleiro",
    "Fixo",
    "Ala direita",
    "Ala esquerda",
    "Pivô"
  ];

  editor.innerHTML =
    positions.map(position => {

      const player =
        playersData.find(
          item =>
            item.primary_position === position
        );

      return `
        <div class="lineup-row">

          <label>
            ${esc(position)}
          </label>

          <select
            data-lineup-position="${esc(position)}"
          >

            <option value="">
              Selecionar jogador
            </option>

            ${
              playersData
                .map(item => `
                  <option
                    value="${item.id}"
                    ${
                      player &&
                      Number(player.id) ===
                      Number(item.id)
                        ? "selected"
                        : ""
                    }
                  >
                    ${esc(item.name)}
                  </option>
                `)
                .join("")
            }

          </select>

        </div>
      `;

    }).join("");
}


$("#saveLineupButton")?.addEventListener(
  "click",
  async () => {

    const message =
      $("#lineupMessage");

    try {

      const selections =
        $$("[data-lineup-position]");

      for (const select of selections) {

        const playerId =
          select.value;

        if (!playerId) continue;

        await api(
          `/api/players/${playerId}`,
          {
            method: "PUT",

            body: JSON.stringify({
              primary_position:
                select.dataset.lineupPosition
            })
          }
        );
      }

      showMessage(
        message,
        "Escalação salva.",
        true
      );

      await loadPlayers();
      await loadLineup();

    } catch (error) {

      showMessage(
        message,
        error.message
      );
    }
  }
);


/* =========================================================
   ESCALAÇÃO POR PARTIDA
========================================================= */

async function loadMatchSelectors() {

  const select =
    $("#lineupMatchSelect");

  if (!select) return;

  select.innerHTML = `
    <option value="">
      Escolha uma partida
    </option>
  `;

  matchesData.forEach(match => {

    const option =
      document.createElement("option");

    option.value =
      match.id;

    option.textContent =
      `${formatDate(match.date)} — ${match.opponent}`;

    select.appendChild(option);

  });
}


$("#lineupMatchSelect")?.addEventListener(
  "change",
  loadMatchLineup
);


async function loadMatchLineup() {

  const select =
    $("#lineupMatchSelect");

  const editor =
    $("#matchLineupEditor");

  if (!select || !editor) return;

  if (!select.value) {

    editor.innerHTML = `
      <p class="muted">
        Selecione uma partida.
      </p>
    `;

    return;
  }

  try {

    const data =
      await api(
        `/api/matches/${select.value}/lineup`
      );

    const lineup =
      data.lineup || [];

    editor.innerHTML =
      playersData.map(player => {

        const existing =
          lineup.find(
            item =>
              Number(item.player_id) ===
              Number(player.id)
          );

        return `
          <div class="match-player-row">

            <label>
              <input
                type="checkbox"
                data-match-player="${player.id}"
                ${
                  existing
                    ? "checked"
                    : ""
                }
              >

              ${esc(player.name)}
            </label>

            <select
              data-match-position="${player.id}"
            >

              ${[
                "Goleiro",
                "Fixo",
                "Ala direita",
                "Ala esquerda",
                "Pivô"
              ].map(position => `
                <option
                  value="${esc(position)}"
                  ${
                    existing &&
                    existing.position === position
                      ? "selected"
                      : ""
                  }
                >
                  ${esc(position)}
                </option>
              `).join("")}

            </select>

            <label>
              <input
                type="checkbox"
                data-match-starter="${player.id}"
                ${
                  existing &&
                  existing.starter
                    ? "checked"
                    : ""
                }
              >

              Titular
            </label>

          </div>
        `;

      }).join("");

  } catch (error) {

    editor.innerHTML = `
      <p class="err">
        ${esc(error.message)}
      </p>
    `;
  }
}


$("#saveMatchLineupButton")?.addEventListener(
  "click",
  async () => {

    const matchId =
      $("#lineupMatchSelect").value;

    const message =
      $("#matchLineupMessage");

    if (!matchId) {

      showMessage(
        message,
        "Selecione uma partida."
      );

      return;
    }

    try {

      const rows =
        $$("[data-match-player]");

      const lineup = [];

      rows.forEach(check => {

        if (!check.checked) return;

        const playerId =
          check.dataset.matchPlayer;

        const position =
          $(
            `[data-match-position="${playerId}"]`
          ).value;

        const starter =
          $(
            `[data-match-starter="${playerId}"]`
          ).checked;

        lineup.push({
          player_id:
            Number(playerId),

          position,

          starter,

          instructions: ""
        });

      });

      const starters =
        lineup.filter(
          player => player.starter
        );

      if (starters.length > 5) {

        showMessage(
          message,
          "Uma equipe de futsal pode ter no máximo 5 titulares."
        );

        return;
      }

      await api(
        `/api/matches/${matchId}/lineup`,
        {
          method: "PUT",

          body: JSON.stringify({
            lineup
          })
        }
      );

      showMessage(
        message,
        "Escalação da partida salva.",
        true
      );

    } catch (error) {

      showMessage(
        message,
        error.message
      );
    }
  }
);


/* =========================================================
   ENQUETES
========================================================= */

async function loadPolls() {

  const container =
    $("#pollsList");

  if (!container) return;

  try {

    const data =
      await api("/api/polls");

    const polls =
      data.polls || [];

    if (!polls.length) {

      container.innerHTML = `
        <p class="muted">
          Nenhuma enquete ainda.
        </p>
      `;

      return;
    }

    container.innerHTML =
      polls.map(poll => {

        return `
          <div class="poll-card">

            <h3>
              ${esc(poll.question)}
            </h3>

            <div class="poll-options">

              ${
                (poll.options || [])
                  .map((option, index) => `
                    <label class="choice">

                      <input
                        type="${
                          poll.multiple
                            ? "checkbox"
                            : "radio"
                        }"

                        name="poll-${poll.id}"

                        value="${index}"

                        ${
                          poll.hasVoted ||
                          poll.closed
                            ? "disabled"
                            : ""
                        }
                      >

                      ${esc(option)}

                    </label>
                  `)
                  .join("")
              }

            </div>

            ${
              poll.closed
                ? `
                  <span class="muted">
                    Encerrada
                  </span>
                `
                : poll.hasVoted
                ? `
                  <span class="ok">
                    Você já votou.
                  </span>
                `
                : `
                  <button
                    onclick="votePoll(${poll.id}, ${Boolean(poll.multiple)})"
                  >
                    Votar
                  </button>
                `
            }

            <button
              class="ghost"
              onclick="showPollResults(${poll.id})"
            >
              Resultados
            </button>

            ${
              me?.role === "admin" &&
              !poll.closed
                ? `
                  <button
                    class="danger"
                    onclick="closePoll(${poll.id})"
                  >
                    Encerrar
                  </button>
                `
                : ""
            }

          </div>
        `;

      }).join("");

  } catch (error) {

    console.error(error);
  }
}


window.votePoll =
  async function(id, multiple) {

    const selected =
      $$(`[name="poll-${id}"]:checked`)
        .map(input =>
          Number(input.value)
        );

    if (!selected.length) {

      toast(
        "Selecione uma opção.",
        "error"
      );

      return;
    }

    try {

      await api(
        `/api/polls/${id}/vote`,
        {
          method: "POST",

          body: JSON.stringify({
            options: selected
          })
        }
      );

      toast(
        "Voto registrado."
      );

      await loadPolls();

    } catch (error) {

      toast(
        error.message,
        "error"
      );
    }
};


window.showPollResults =
  async function(id) {

    try {

      const data =
        await api(
          `/api/polls/${id}/results`
        );

      const text =
        [
          data.question,
          "",
          ...(data.results || [])
            .map(item =>
              `${item.label}: ${item.count}`
            ),
          "",
          `Total de votos: ${data.total}`
        ].join("\n");

      alert(text);

    } catch (error) {

      toast(
        error.message,
        "error"
      );
    }
};


window.closePoll =
  async function(id) {

    if (
      !confirm(
        "Encerrar esta enquete?"
      )
    ) {
      return;
    }

    try {

      await api(
        `/api/polls/${id}/close`,
        {
          method: "POST"
        }
      );

      await loadPolls();

      toast(
        "Enquete encerrada."
      );

    } catch (error) {

      toast(
        error.message,
        "error"
      );
    }
};


/* =========================================================
   CRIAR ENQUETE
========================================================= */

$("#newPollButton")?.addEventListener(
  "click",
  () => {

    $("#pollCreateBox")
      ?.classList
      .toggle("hidden");

  }
);


$("#cancelPollButton")?.addEventListener(
  "click",
  () => {

    $("#pollCreateBox")
      ?.classList
      .add("hidden");

  }
);


$("#addPollOptionButton")?.addEventListener(
  "click",
  () => {

    const container =
      $("#pollOptions");

    const count =
      container.querySelectorAll(
        ".poll-option"
      ).length;

    const wrapper =
      document.createElement("div");

    wrapper.className =
      "poll-option";

    wrapper.innerHTML = `
      <input
        type="text"
        placeholder="Opção ${count + 1}"
      >

      <button
        type="button"
        class="ghost remove-poll-option"
      >
        Remover
      </button>
    `;

    wrapper
      .querySelector(
        ".remove-poll-option"
      )
      .addEventListener(
        "click",
        () => wrapper.remove()
      );

    container.appendChild(wrapper);

  }
);


$("#pollForm")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const options =
      $$("#pollOptions input")
        .map(input =>
          input.value.trim()
        )
        .filter(Boolean);

    if (options.length < 2) {

      showMessage(
        $("#pollMessage"),
        "Adicione pelo menos 2 opções."
      );

      return;
    }

    try {

      await api(
        "/api/polls",
        {
          method: "POST",

          body: JSON.stringify({

            question:
              $("#pollQuestion")
                .value
                .trim(),

            options,

            closes_at:
              $("#pollCloseDate").value
                || null,

            multiple:
              $("#pollMultiple").checked

          })
        }
      );

      event.target.reset();

      $("#pollCreateBox")
        .classList
        .add("hidden");

      showMessage(
        $("#pollMessage"),
        "Enquete criada.",
        true
      );

      await loadPolls();

    } catch (error) {

      showMessage(
        $("#pollMessage"),
        error.message
      );
    }
  }
);


/* =========================================================
   PARTIDAS
========================================================= */

async function loadMatches() {

  const container =
    $("#matchesList");

  if (!container) return;

  try {

    const data =
      await api("/api/matches");

    matchesData =
      data.matches || [];

    if (!matchesData.length) {

      container.innerHTML = `
        <p class="muted">
          Nenhuma partida cadastrada.
        </p>
      `;

    } else {

      container.innerHTML =
        matchesData.map(match => `

          <div class="match-card">

            <h3>
              Beiçola F.I.
              <span>vs.</span>
              ${esc(match.opponent)}
            </h3>

            <div class="muted">
              ${formatDate(match.date)}

              ${
                match.time
                  ? ` • ${esc(match.time)}`
                  : ""
              }

              ${
                match.location
                  ? ` • ${esc(match.location)}`
                  : ""
              }
            </div>

            ${
              match.result
                ? `
                  <strong>
                    Resultado:
                    ${esc(match.result)}
                  </strong>
                `
                : ""
            }

            ${
              match.notes
                ? `
                  <p>
                    ${esc(match.notes)}
                  </p>
                `
                : ""
            }

            ${
              me?.role === "admin"
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

    await loadMatchSelectors();

  } catch (error) {

    console.error(error);
  }
}


/* =========================================================
   CRIAR PARTIDA
========================================================= */

$("#newMatchButton")?.addEventListener(
  "click",
  () => {

    $("#matchCreateBox")
      ?.classList
      .toggle("hidden");

  }
);


$("#cancelMatchButton")?.addEventListener(
  "click",
  () => {

    $("#matchCreateBox")
      ?.classList
      .add("hidden");

  }
);


$("#matchForm")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    try {

      await api(
        "/api/matches",
        {
          method: "POST",

          body: JSON.stringify({

            opponent:
              $("#matchOpponent").value.trim(),

            date:
              $("#matchDate").value,

            location:
              $("#matchLocation").value.trim(),

            result:
              $("#matchResult").value.trim(),

            notes:
              $("#matchNotes").value.trim()

          })
        }
      );

      event.target.reset();

      $("#matchCreateBox")
        .classList
        .add("hidden");

      showMessage(
        $("#matchMessage"),
        "Partida cadastrada.",
        true
      );

      await loadMatches();
      await loadDashboard();

    } catch (error) {

      showMessage(
        $("#matchMessage"),
        error.message
      );
    }
  }
);


window.deleteMatch =
  async function(id) {

    if (
      !confirm(
        "Excluir esta partida?"
      )
    ) {
      return;
    }

    try {

      await api(
        `/api/matches/${id}`,
        {
          method: "DELETE"
        }
      );

      await loadMatches();
      await loadDashboard();

      toast(
        "Partida excluída."
      );

    } catch (error) {

      toast(
        error.message,
        "error"
      );
    }
};


/* =========================================================
   AVISOS
========================================================= */

async function loadAnnouncements() {

  const container =
    $("#announcementsList");

  if (!container) return;

  try {

    const data =
      await api("/api/announcements");

    const list =
      data.announcements || [];

    if (!list.length) {

      container.innerHTML = `
        <p class="muted">
          Nenhum aviso publicado.
        </p>
      `;

      return;
    }

    container.innerHTML =
      list.map(item => `

        <article class="announcement-card">

          <h3>
            ${esc(item.title)}
          </h3>

          <p>
            ${esc(item.body || item.content || "")}
          </p>

          <span class="muted">
            ${formatDateTime(item.created_at)}
          </span>

          ${
            me?.role === "admin"
              ? `
                <button
                  class="danger"
                  onclick="deleteAnnouncement(${item.id})"
                >
                  Excluir
                </button>
              `
              : ""
          }

        </article>

      `).join("");

  } catch (error) {

    console.error(error);
  }
}


$("#newAnnouncementButton")?.addEventListener(
  "click",
  () => {

    $("#announcementCreateBox")
      ?.classList
      .toggle("hidden");

  }
);


$("#cancelAnnouncementButton")?.addEventListener(
  "click",
  () => {

    $("#announcementCreateBox")
      ?.classList
      .add("hidden");

  }
);


$("#announcementForm")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    try {

      await api(
        "/api/announcements",
        {
          method: "POST",

          body: JSON.stringify({

            title:
              $("#announcementTitle")
                .value
                .trim(),

            body:
              $("#announcementContent")
                .value
                .trim()

          })
        }
      );

      event.target.reset();

      $("#announcementCreateBox")
        .classList
        .add("hidden");

      showMessage(
        $("#announcementMessage"),
        "Aviso publicado.",
        true
      );

      await loadAnnouncements();
      await loadDashboard();

    } catch (error) {

      showMessage(
        $("#announcementMessage"),
        error.message
      );
    }
  }
);


window.deleteAnnouncement =
  async function(id) {

    if (
      !confirm(
        "Excluir este aviso?"
      )
    ) {
      return;
    }

    try {

      await api(
        `/api/announcements/${id}`,
        {
          method: "DELETE"
        }
      );

      await loadAnnouncements();

    } catch (error) {

      toast(
        error.message,
        "error"
      );
    }
};


/* =========================================================
   PERFIL
========================================================= */

function loadProfile() {

  if (!me) return;

  $("#profileName").value =
    me.name || "";

  $("#profileEmail").value =
    me.email || "";

  $("#profileRole").value =
    me.role === "admin"
      ? "Administrador"
      : "Integrante";
}


$("#profileForm")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    try {

      const data =
        await api(
          "/api/profile",
          {
            method: "PUT",

            body: JSON.stringify({
              name:
                $("#profileName").value.trim()
            })
          }
        );

      me =
        data.user;

      $("#headerUserName").textContent =
        me.name;

      showMessage(
        $("#profileMessage"),
        "Perfil atualizado.",
        true
      );

      await loadDashboard();

    } catch (error) {

      showMessage(
        $("#profileMessage"),
        error.message
      );
    }
  }
);


/* =========================================================
   ALTERAR SENHA
========================================================= */

$("#passwordForm")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    const newPassword =
      $("#newPassword").value;

    const confirmation =
      $("#confirmNewPassword").value;

    if (
      newPassword !== confirmation
    ) {

      showMessage(
        $("#passwordMessage"),
        "As novas senhas não são iguais."
      );

      return;
    }

    try {

      const data =
        await api(
          "/api/change-password",
          {
            method: "POST",

            body: JSON.stringify({

              current_password:
                $("#currentPassword").value,

              new_password:
                newPassword

            })
          }
        );

      showMessage(
        $("#passwordMessage"),
        data.message ||
        "Senha alterada.",
        true
      );

      event.target.reset();

    } catch (error) {

      showMessage(
        $("#passwordMessage"),
        error.message
      );
    }
  }
);


/* =========================================================
   ADMIN — MEMBROS
========================================================= */

async function loadMembers() {

  const container =
    $("#membersList");

  if (!container) return;

  try {

    const data =
      await api("/api/members");

    const members =
      data.members || [];

    if (!members.length) {

      container.innerHTML = `
        <p class="muted">
          Nenhum integrante.
        </p>
      `;

      return;
    }

    container.innerHTML =
      members.map(member => {

        const isMe =
          Number(member.id) ===
          Number(me?.id);

        const newRole =
          member.role === "admin"
            ? "member"
            : "admin";

        return `
          <div class="member-card">

            <div>

              <strong>
                ${esc(member.name)}
              </strong>

              <div class="muted">
                ${esc(member.email)}
              </div>

              <span>
                ${
                  member.role === "admin"
                    ? "Administrador"
                    : "Integrante"
                }
              </span>

            </div>

            ${
              !isMe &&
              me?.role === "admin"
                ? `
                  <button
                    onclick="changeMemberRole(
                      ${member.id},
                      '${newRole}'
                    )"
                  >
                    ${
                      member.role === "admin"
                        ? "Tornar integrante"
                        : "Tornar administrador"
                    }
                  </button>
                `
                : ""
            }

          </div>
        `;

      }).join("");

  } catch (error) {

    console.error(error);
  }
}


window.changeMemberRole =
  async function(id, role) {

    try {

      await api(
        `/api/members/${id}/role`,
        {
          method: "PUT",

          body: JSON.stringify({
            role
          })
        }
      );

      toast(
        "Permissão atualizada."
      );

      await loadMembers();

    } catch (error) {

      toast(
        error.message,
        "error"
      );
    }
};


/* =========================================================
   PRIMEIRO ADMIN
========================================================= */

async function checkAdminSetup() {

  const box =
    $("#setupAdminBox");

  if (!box) return;

  try {

    const data =
      await api(
        "/api/setup-admin/status"
      );

    if (data.available) {

      box.classList.remove(
        "hidden"
      );

    } else {

      box.classList.add(
        "hidden"
      );
    }

  } catch {

    box.classList.add(
      "hidden"
    );
  }
}


$("#setupAdminForm")?.addEventListener(
  "submit",
  async event => {

    event.preventDefault();

    try {

      await api(
        "/api/setup-admin",
        {
          method: "POST",

          body: JSON.stringify({

            key:
              $("#setupAdminKey").value,

            name:
              $("#setupAdminName")
                .value
                .trim(),

            email:
              $("#setupAdminEmail")
                .value
                .trim(),

            password:
              $("#setupAdminPassword")
                .value

          })
        }
      );

      showMessage(
        $("#setupAdminMessage"),
        "Administrador criado. Agora faça login.",
        true
      );

      event.target.reset();

      setTimeout(() => {

        $("#loginEmail").value =
          $("#setupAdminEmail").value;

      }, 500);

    } catch (error) {

      showMessage(
        $("#setupAdminMessage"),
        error.message
      );
    }
  }
);


/* =========================================================
   UTILITÁRIOS
========================================================= */

function parsePositions(value) {

  if (Array.isArray(value)) {
    return value;
  }

  if (!value) {
    return [];
  }

  try {

    const parsed =
      JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed
      : [];

  } catch {

    return String(value)
      .split(",")
      .map(item => item.trim())
      .filter(Boolean);
  }
}


function statusLabel(status) {

  const labels = {

    disponivel:
      "Disponível",

    duvida:
      "Em dúvida",

    lesionado:
      "Lesionado",

    suspenso:
      "Suspenso",

    inativo:
      "Inativo"

  };

  return labels[status] ||
    status ||
    "Disponível";
}


function formatDate(date) {

  if (!date) {
    return "Data não definida";
  }

  const parsed =
    new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleDateString(
    "pt-BR"
  );
}


function formatDateTime(date) {

  if (!date) return "";

  const parsed =
    new Date(date);

  if (Number.isNaN(parsed.getTime())) {
    return date;
  }

  return parsed.toLocaleString(
    "pt-BR"
  );
}


function esc(value) {

  return String(
    value ?? ""
  ).replace(
    /[&<>'"]/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[character]
  );
}


/* =========================================================
   INICIALIZAÇÃO
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    setupAuthTabs();

    setupNavigation();

    await loadApp();

  }
);
