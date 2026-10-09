/* =========================================================
   BEIÇOLA F.I. — FRONTEND
   Sistema pessoal do time
========================================================= */


/* =========================================================
   UTILITÁRIOS DOM
========================================================= */

const SELECTOR_ALIASES = {
  "#playersList": "#playersGrid",
  "#headerUserName": "#currentUserName",
  "#headerUserRole": "#currentUserRole",
  "#captainName": "#currentCaptain",
  "#freeKickPlayers": "#freeKickTakers",
  "#penaltyPlayers": "#penaltyTakers",
  "#lineupEditor": "#adminLineupEditor",
  "#newPlayerButton": "#addPlayerButton",
  "#cancelPlayerButton": "#cancelPlayerModal",
  "#playerId": "#editingPlayerId",
  "#playerSecondaryPositions": "#playerSecondaryPosition",
  "#profileEmail": "#profileEmailInput"
};

const $ = (selector) => {
  const direct = document.querySelector(selector);
  if (direct) return direct;
  const alias = SELECTOR_ALIASES[selector];
  return alias ? document.querySelector(alias) : null;
};

const $$ = (selector) =>
  [...document.querySelectorAll(selector)];


/* =========================================================
   ESTADO
========================================================= */

let me = null;

let playersData = [];

let membersData = [];

let matchesData = [];

let pollsData = [];

let announcementsData = [];

let editingPlayerId = null;


/* =========================================================
   API
========================================================= */

async function api(url, options = {}) {

  const config = {
    ...options,

    credentials: "include",

    headers: {
      ...(options.body
        ? {
            "Content-Type":
              "application/json"
          }
        : {}),

      ...(options.headers || {})
    }
  };

  const response =
    await fetch(url, config);

  let data = {};

  try {

    data =
      await response.json();

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

function showMessage(
  element,
  text,
  success = false
) {

  if (!element) return;

  element.textContent =
    text || "";

  element.className =
    success
      ? "ok"
      : "err";
}


function toast(
  message,
  type = "ok"
) {

  const element =
    $("#toast");

  if (!element) {

    alert(message);

    return;
  }

  element.textContent =
    message;

  element.className =
    `toast ${type}`;

  setTimeout(() => {

    element.className =
      "toast hidden";

  }, 3000);
}


/* =========================================================
   ESCAPAR HTML
========================================================= */

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
   DATAS
========================================================= */

function formatDate(date) {

  if (!date) {

    return "Data não definida";
  }

  const parsed =
    new Date(date);

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {

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

  if (
    Number.isNaN(
      parsed.getTime()
    )
  ) {

    return date;
  }

  return parsed.toLocaleString(
    "pt-BR"
  );
}


function inputDateToISO(value) {

  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return value;
  }

  return date.toISOString();
}


/* =========================================================
   POSIÇÕES
========================================================= */

function normalizePosition(
  position
) {

  return String(
    position || ""
  )
    .toLowerCase()
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(/\s+/g, "-");
}


function positionLabel(
  position
) {

  const normalized =
    normalizePosition(position);

  const labels = {

    "goleiro":
      "Goleiro",

    "fixo":
      "Fixo",

    "ala-direita":
      "Ala direita",

    "ala-esquerda":
      "Ala esquerda",

    "pivo":
      "Pivô"

  };

  return (
    labels[normalized] ||
    position ||
    ""
  );
}


/* =========================================================
   STATUS
========================================================= */

function statusLabel(
  status
) {

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

  return (
    labels[status] ||
    status ||
    "Disponível"
  );
}


/* =========================================================
   POSIÇÕES SECUNDÁRIAS
========================================================= */

function parsePositions(
  value
) {

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
      .map(
        item =>
          item.trim()
      )
      .filter(Boolean);
  }
}


/* =========================================================
   EXTRAIR LISTAS DAS RESPOSTAS
========================================================= */

function extractList(
  data,
  property
) {

  if (Array.isArray(data)) {

    return data;
  }

  if (
    data &&
    Array.isArray(
      data[property]
    )
  ) {

    return data[property];
  }

  return [];
}


/* =========================================================
   AUTENTICAÇÃO
========================================================= */

function setupAuthTabs() {

  const showRegister =
    $("#showRegister");

  const showForgot =
    $("#showForgotPassword");

  const backToLogin =
    $("#backToLogin");

  const forgotBackLogin =
    $("#forgotBackLogin");


  showRegister?.addEventListener(
    "click",
    () => {

      $("#loginBox")
        ?.classList
        .add("hidden");

      $("#registerBox")
        ?.classList
        .remove("hidden");

      $("#forgotBox")
        ?.classList
        .add("hidden");

    }
  );


  showForgot?.addEventListener(
    "click",
    () => {

      $("#loginBox")
        ?.classList
        .add("hidden");

      $("#registerBox")
        ?.classList
        .add("hidden");

      $("#forgotBox")
        ?.classList
        .remove("hidden");

    }
  );


  backToLogin?.addEventListener(
    "click",
    showLoginBox
  );


  forgotBackLogin?.addEventListener(
    "click",
    showLoginBox
  );
}


function showLoginBox() {

  $("#loginBox")
    ?.classList
    .remove("hidden");

  $("#registerBox")
    ?.classList
    .add("hidden");

  $("#forgotBox")
    ?.classList
    .add("hidden");
}


/* =========================================================
   LOGIN
========================================================= */

$("#loginForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const message =
        $("#loginMessage");

      try {

        await api(
          "/api/login",
          {
            method: "POST",

            body:
              JSON.stringify({

                email:
                  $("#loginEmail")
                    .value
                    .trim(),

                password:
                  $("#loginPassword")
                    .value

              })
          }
        );

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

    }
  );


/* =========================================================
   CADASTRO
========================================================= */

$("#registerForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const message =
        $("#registerMessage");

      const password =
        $("#registerPassword")
          .value;

      const confirmation =
        $("#registerPasswordConfirm")
          .value;


      if (
        password !==
        confirmation
      ) {

        showMessage(
          message,
          "As senhas não são iguais."
        );

        return;
      }


      try {

        await api(
          "/api/register",
          {
            method: "POST",

            body:
              JSON.stringify({

                name:
                  $("#registerName")
                    .value
                    .trim(),

                email:
                  $("#registerEmail")
                    .value
                    .trim(),

                password

              })
          }
        );


        showMessage(
          message,
          "Conta criada com sucesso! Agora faça login.",
          true
        );


        event.target.reset();


        setTimeout(
          showLoginBox,
          1000
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
   RECUPERAÇÃO DE SENHA
========================================================= */

$("#forgotForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();

      const message =
        $("#forgotMessage");

      try {

        const data =
          await api(
            "/api/forgot-password",
            {
              method: "POST",

              body:
                JSON.stringify({

                  email:
                    $("#forgotEmail")
                      .value
                      .trim()

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

    }
  );


/* =========================================================
   LOGOUT
========================================================= */

$("#logoutButton")
  ?.addEventListener(
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

        // Mesmo que falhe,
        // voltamos para a tela de login.
      }

      location.reload();

    }
  );


/* =========================================================
   NAVEGAÇÃO
========================================================= */

function setupNavigation() {
  const titles = {
    inicio: "Início", elenco: "Elenco", escalacao: "Escalação",
    partidas: "Partidas", enquetes: "Enquetes", avisos: "Avisos",
    mensagens: "Mensagens", perfil: "Meu perfil", admin: "Administração",
    "gerenciar-jogadores": "Gerenciar jogadores",
    "montar-escalacao": "Montar escalação"
  };

  async function openPage(page) {
    const target = document.querySelector(`#page-${page}`);
    if (!target) return;
    if (["admin", "gerenciar-jogadores", "montar-escalacao"].includes(page) && me?.role !== "admin") return;

    $$(".page").forEach(section => section.classList.toggle("active", section === target));
    $$(".nav-button[data-page]").forEach(button => button.classList.toggle("active", button.dataset.page === page));
    const title = $("#pageTitle");
    if (title) title.textContent = titles[page] || page;
    const sidebar = $(".sidebar");
    sidebar?.classList.remove("open");

    try {
      if (page === "inicio") await loadDashboard();
      else if (page === "elenco" || page === "gerenciar-jogadores") { await loadPlayers(); if (me?.role === "admin") await loadMembers(); await loadRoles(); }
      else if (page === "escalacao" || page === "montar-escalacao") { await loadLineup(); await loadMatchLineup(); }
      else if (page === "partidas") await loadMatches();
      else if (page === "enquetes") await loadPolls();
      else if (page === "avisos") await loadAnnouncements();
      else if (page === "perfil") loadProfile();
      else if (page === "admin" && me?.role === "admin") { await loadMembers(); await loadPlayers(); }
    } catch (error) { console.error("Falha ao abrir a seção:", error); }
  }

  $$(".nav-button[data-page]").forEach(button => {
    button.addEventListener("click", () => openPage(button.dataset.page));
  });
  $$('[data-page]').filter(el => !el.classList.contains('nav-button')).forEach(button => {
    button.addEventListener("click", () => openPage(button.dataset.page));
  });
  $("#mobileMenuButton")?.addEventListener("click", () => $(".sidebar")?.classList.toggle("open"));
  window.openBeiçolaPage = openPage;
}

/* =========================================================
   CARREGAR APLICAÇÃO
========================================================= */

async function loadApp() {
  try {
    const data = await api("/api/me");
    me = data.user || data;

    if ($("#currentUserName")) $("#currentUserName").textContent = me.name || "Integrante";
    if ($("#currentUserRole")) $("#currentUserRole").textContent = me.role === "admin" ? "Administrador" : "Integrante";
    if ($("#currentUserAvatar")) $("#currentUserAvatar").textContent = (me.name || "?").trim().charAt(0).toUpperCase();
    if ($("#welcomeName")) $("#welcomeName").textContent = me.name || "Integrante";

    $$(".admin-only").forEach(element => { element.classList.toggle("hidden", me.role !== "admin"); });

    await Promise.all([loadPlayers(), loadMatches(), loadPolls(), loadAnnouncements(), loadRoles(), loadLineup(), loadMembers()]);
    await loadMatchLineup();
    loadProfile();
    const start = document.querySelector('.nav-button[data-page="inicio"]');
    if (start) start.click();
    else $$(".page").forEach(section => section.classList.toggle("active", section.id === "page-inicio"));
  } catch (error) {
    console.warn("Sessão ausente ou expirada; voltando ao login.");
    window.location.replace("/login.html");
  }
}

/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {
  try {
    const [playersResponse, matchesResponse, pollsResponse, announcementsResponse, lineupResponse] = await Promise.all([
      api("/api/players"), api("/api/matches"), api("/api/polls"), api("/api/announcements"), api("/api/lineup")
    ]);
    const players = extractList(playersResponse, "players");
    const matches = extractList(matchesResponse, "matches");
    const polls = extractList(pollsResponse, "polls");
    const announcements = extractList(announcementsResponse, "announcements");
    const lineup = extractList(lineupResponse, "lineup");

    if ($("#welcomeName")) $("#welcomeName").textContent = me?.name || "Integrante";
    if ($("#statPlayers")) $("#statPlayers").textContent = String(players.length);
    if ($("#statPolls")) {
      const openPolls = polls.filter(poll => !poll.closes_at || new Date(poll.closes_at) > new Date());
      $("#statPolls").textContent = String(openPolls.length);
    }
    if ($("#statRole")) $("#statRole").textContent = me?.role === "admin" ? "Administrador" : "Integrante";

    const upcoming = matches.filter(match => {
      const date = match.match_date || match.date;
      return date && new Date(date) >= new Date();
    }).sort((a, b) => new Date(a.match_date || a.date) - new Date(b.match_date || b.date))[0];

    if ($("#statNextMatch")) {
      $("#statNextMatch").textContent = upcoming
        ? `${upcoming.opponent} · ${formatDate(upcoming.match_date || upcoming.date)}`
        : "—";
    }
    if ($("#nextMatch")) {
      $("#nextMatch").innerHTML = upcoming ? `
        <article class="match-card">
          <h3>Beiçola F.I. <span>vs.</span> ${esc(upcoming.opponent)}</h3>
          <p class="muted">${formatDate(upcoming.match_date || upcoming.date)}${upcoming.location ? ` · ${esc(upcoming.location)}` : ""}</p>
          ${upcoming.result ? `<strong>Resultado: ${esc(upcoming.result)}</strong>` : ""}
          ${upcoming.notes ? `<p>${esc(upcoming.notes)}</p>` : ""}
        </article>` : '<div class="empty-state">Nenhuma partida futura cadastrada.</div>';
    }
    if ($("#homeLineup")) {
      const starters = lineup.filter(item => item.status === "titular");
      $("#homeLineup").innerHTML = starters.length ? starters.map(item => `
        <div class="mini-lineup-item"><strong>${esc(item.position || "Titular")}</strong><span>${esc(item.player_name || "Jogador")}</span></div>
      `).join("") : '<div class="empty-state">A escalação ainda não foi definida.</div>';
    }
    if ($("#homeAnnouncements")) {
      const latest = announcements.slice(0, 3);
      $("#homeAnnouncements").innerHTML = latest.length ? latest.map(item => `
        <article class="announcement-card"><h3>${esc(item.title)}</h3><p>${esc(item.content)}</p><small>${formatDate(item.created_at)}</small></article>
      `).join("") : '<div class="empty-state">Nenhum aviso publicado.</div>';
    }
  } catch (error) {
    console.error("Erro no painel inicial:", error);
  }
}

/* =========================================================
   JOGADORES
========================================================= */

async function loadPlayers() {

  try {

    const data =
      await api(
        "/api/players"
      );


    playersData =
      extractList(
        data,
        "players"
      );


    renderPlayers();

    updatePlayerSelects();

    renderCaptain();

    renderLineupEditor();


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
    playersData
      .map(player => {

        const secondary =
          parsePositions(
            player.secondary_positions
          );


        return `

          <div class="player-card">

            <div class="player-number">

              ${
                player.number ??
                "-"
              }

            </div>


            <div class="player-info">

              <h3>

                ${esc(
                  player.name
                )}

                ${
                  Number(
                    player.is_captain
                  ) === 1
                    ? " 👑"
                    : ""
                }

              </h3>


              <div class="muted">

                ${esc(
                  positionLabel(
                    player.primary_position
                  )
                )}

                ${
                  secondary.length
                    ? `
                      •
                      ${secondary
                        .map(
                          positionLabel
                        )
                        .map(esc)
                        .join(", ")}
                    `
                    : ""
                }

              </div>


              <div class="player-status">

                ${esc(
                  statusLabel(
                    player.status
                  )
                )}

              </div>


              ${
                player.instructions
                  ? `

                    <p class="muted">

                      ${esc(
                        player.instructions
                      )}

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


                    ${
                      Number(
                        player.is_captain
                      ) !== 1
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

      })
      .join("");
}


/* =========================================================
   NOVO JOGADOR
========================================================= */

$("#newPlayerButton")
  ?.addEventListener(
    "click",
    async () => {

      if (
        me?.role !== "admin"
      ) return;


      editingPlayerId =
        null;


      $("#playerModalTitle")
        .textContent =
        "Novo jogador";


      $("#playerForm")
        ?.reset();


      if ($("#playerId")) {

        $("#playerId")
          .value = "";

      }


      if (
        $("#playerFormMessage")
      ) {

        $("#playerFormMessage")
          .textContent = "";

      }


      await loadMemberOptions();


      $("#playerModal")
        ?.classList
        .remove("hidden");

    }
  );


/* =========================================================
   EDITAR JOGADOR
========================================================= */

window.editPlayer =
  async function(id) {

    if (
      me?.role !== "admin"
    ) return;


    const player =
      playersData.find(
        item =>
          Number(item.id) ===
          Number(id)
      );


    if (!player) return;


    editingPlayerId =
      id;


    $("#playerModalTitle")
      .textContent =
      "Editar jogador";


    $("#playerId").value =
      player.id;


    $("#playerName").value =
      player.name || "";


    $("#playerNumber").value =
      player.number ??
      "";


    $("#playerStatus").value =
      player.status ||
      "disponivel";


    $("#playerPrimaryPosition")
      .value =
      player.primary_position ||
      "";


    $("#playerSecondaryPositions")
      .value =
      parsePositions(
        player.secondary_positions
      ).join(", ");


    $("#playerInstructions")
      .value =
      player.instructions ||
      "";


    await loadMemberOptions(
      player.user_id
    );


    $("#playerModal")
      ?.classList
      .remove("hidden");

  };


/* =========================================================
   SALVAR JOGADOR
========================================================= */

$("#playerForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      if (
        me?.role !== "admin"
      ) return;


      const message =
        ensureFeedback($("#playerForm"), "playerFormMessage");


      const secondary =
        $("#playerSecondaryPositions")
          .value
          .split(",")
          .map(
            item =>
              item.trim()
          )
          .filter(Boolean);


      const number =
        $("#playerNumber")
          .value
          .trim();


      const userId =
        $("#playerUser")
          ?.value;


      const data = {

        name:
          $("#playerName")
            .value
            .trim(),

        number:
          number
            ? Number(number)
            : null,

        status:
          $("#playerStatus")
            .value,

        primary_position:
          $("#playerPrimaryPosition")
            .value,

        secondary_positions:
          secondary,

        instructions:
          $("#playerInstructions")
            .value
            .trim(),

        user_id:
          userId
            ? Number(userId)
            : null

      };


      try {

        if (
          editingPlayerId
        ) {

          /*
             IMPORTANTE:
             O server atual não permite
             alterar user_id pelo PUT.
             Portanto o vínculo é enviado
             somente na criação.
          */

          const updateData = {

            name:
              data.name,

            number:
              data.number,

            status:
              data.status,

            primary_position:
              data.primary_position,

            secondary_positions:
              data.secondary_positions,

            instructions:
              data.instructions

          };


          await api(
            `/api/players/${editingPlayerId}`,
            {
              method: "PUT",

              body:
                JSON.stringify(
                  updateData
                )
            }
          );


        } else {

          await api(
            "/api/players",
            {
              method: "POST",

              body:
                JSON.stringify(
                  data
                )
            }
          );

        }


        showMessage(
          message,
          "Jogador salvo com sucesso.",
          true
        );


        await loadPlayers();


        setTimeout(
          closePlayerModal,
          500
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
   EXCLUIR JOGADOR
========================================================= */

window.deletePlayer =
  async function(id) {

    if (
      me?.role !== "admin"
    ) return;


    const player =
      playersData.find(
        item =>
          Number(item.id) ===
          Number(id)
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

  editingPlayerId =
    null;
}


window.closePlayerModal =
  closePlayerModal;


$("#closePlayerModal")
  ?.addEventListener(
    "click",
    closePlayerModal
  );


$("#cancelPlayerButton")
  ?.addEventListener(
    "click",
    closePlayerModal
  );


/* =========================================================
   MEMBROS PARA VINCULAR
========================================================= */

async function loadMemberOptions(
  selectedId = null
) {

  const select =
    $("#playerUser");

  if (!select) return;


  try {

    const data =
      await api(
        "/api/members"
      );


    membersData =
      extractList(
        data,
        "members"
      );


    const linkedIds =
      new Set(
        playersData
          .filter(player =>
            Number(player.id) !==
            Number(editingPlayerId)
          )
          .map(player =>
            Number(player.user_id)
          )
          .filter(Boolean)
      );


    select.innerHTML = `

      <option value="">

        Jogador sem conta vinculada

      </option>

    `;


    membersData.forEach(member => {

      if (
        linkedIds.has(
          Number(member.id)
        )
      ) {

        return;
      }


      const option =
        document.createElement(
          "option"
        );


      option.value =
        member.id;


      option.textContent =
        `${member.name} — ${member.email}`;


      if (
        selectedId &&
        Number(selectedId) ===
        Number(member.id)
      ) {

        option.selected =
          true;

      }


      select.appendChild(
        option
      );

    });


  } catch (error) {

    console.error(
      "Erro ao carregar membros:",
      error
    );

  }
}


/* =========================================================
   CAPITÃO
========================================================= */

function renderCaptain() {

  const captain =
    playersData.find(
      player =>
        Number(
          player.is_captain
        ) === 1
    );


  if (
    $("#captainName")
  ) {

    $("#captainName")
      .textContent =
      captain
        ? captain.name
        : "Nenhum capitão definido";

  }


  if (
    $("#removeCaptainButton")
  ) {

    $("#removeCaptainButton")
      .style.display =
      captain &&
      me?.role === "admin"
        ? ""
        : "none";

  }
}


window.setCaptain =
  async function(id) {

    if (
      me?.role !== "admin"
    ) return;


    try {

      await api(
        `/api/players/${id}/captain`,
        {
          method: "PUT"
        }
      );


      toast(
        "Capitão definido."
      );


      await loadPlayers();


    } catch (error) {

      toast(
        error.message,
        "error"
      );

    }

  };


$("#removeCaptainButton")
  ?.addEventListener(
    "click",
    async () => {

      if (
        me?.role !== "admin"
      ) return;


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
   COBRANÇAS — PÊNALTI E FALTA
========================================================= */

async function loadRoles() {

  try {

    const data =
      await api(
        "/api/player-roles"
      );


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


    updatePlayerSelects();


    if (
      $("#penaltySelect")
    ) {

      setSelectValues(
        $("#penaltySelect"),
        penalty.map(
          item =>
            item.player_id
        )
      );

    }


    if (
      $("#freeKickSelect")
    ) {

      setSelectValues(
        $("#freeKickSelect"),
        freeKick.map(
          item =>
            item.player_id
        )
      );

    }


  } catch (error) {

    console.error(
      "Erro ao carregar funções:",
      error
    );

  }
}


function renderRoleList(
  container,
  list
) {

  if (!container) return;


  if (!list.length) {

    container.innerHTML = `

      <span class="muted">

        Nenhum definido.

      </span>

    `;

    return;
  }


  container.innerHTML =
    list
      .map(
        (item, index) => `

          <div class="role-player">

            ${index + 1}.
            ${esc(
              item.player_name ||
              getPlayerName(
                item.player_id
              )
            )}

          </div>

        `
      )
      .join("");

}


function getPlayerName(
  id
) {

  const player =
    playersData.find(
      item =>
        Number(item.id) ===
        Number(id)
    );


  return player
    ? player.name
    : "Jogador";
}


function setSelectValues(
  select,
  values
) {

  if (
    !select
  ) return;


  const selected =
    new Set(
      values.map(
        Number
      )
    );


  [...select.options]
    .forEach(option => {

      option.selected =
        selected.has(
          Number(option.value)
        );

    });
}


function updatePlayerSelects() {

  const selects = [

    $("#penaltySelect"),

    $("#freeKickSelect")

  ];


  selects.forEach(
    select => {

      if (!select) return;


      const previous =
        [...select.selectedOptions]
          .map(
            option =>
              option.value
          );


      select.innerHTML = `

        <option value="">

          Selecionar jogador

        </option>

      `;


      playersData
        .filter(player =>
          player.status !==
          "inativo"
        )
        .forEach(player => {

          const option =
            document.createElement(
              "option"
            );


          option.value =
            player.id;


          option.textContent =
            player.number !== null &&
            player.number !== undefined
              ? `#${player.number} — ${player.name}`
              : player.name;


          if (
            previous.includes(
              String(player.id)
            )
          ) {

            option.selected =
              true;

          }


          select.appendChild(
            option
          );

        });

    }
  );
}


$("#saveRolesButton")
  ?.addEventListener(
    "click",
    async () => {

      if (
        me?.role !== "admin"
      ) return;


      const message =
        $("#rolesMessage");


      try {

        const penalty =
          $("#penaltySelect")
            ? [
                ...$(
                  "#penaltySelect"
                ).selectedOptions
              ].map(
                option =>
                  Number(option.value)
              ).filter(Boolean)
            : [];


        const freeKick =
          $("#freeKickSelect")
            ? [
                ...$(
                  "#freeKickSelect"
                ).selectedOptions
              ].map(
                option =>
                  Number(option.value)
              ).filter(Boolean)
            : [];


        await api(
          "/api/player-roles/penalty",
          {
            method: "PUT",

            body:
              JSON.stringify({
                players:
                  penalty
              })
          }
        );


        await api(
          "/api/player-roles/free_kick",
          {
            method: "PUT",

            body:
              JSON.stringify({
                players:
                  freeKick
              })
          }
        );


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

const lineupPositions = [

  {
    key:
      "goleiro",

    label:
      "Goleiro"
  },

  {
    key:
      "fixo",

    label:
      "Fixo"
  },

  {
    key:
      "ala-direita",

    label:
      "Ala direita"
  },

  {
    key:
      "ala-esquerda",

    label:
      "Ala esquerda"
  },

  {
    key:
      "pivo",

    label:
      "Pivô"
  }

];


let currentLineup =
  [];


async function loadLineup() {

  try {

    const data =
      await api(
        "/api/lineup"
      );


    currentLineup =
      extractList(
        data,
        "lineup"
      );


    renderCourt();

    renderLineupEditor();


  } catch (error) {

    console.error(
      "Erro ao carregar escalação:",
      error
    );

  }
}


function findLineupPlayer(
  position
) {

  const normalized =
    normalizePosition(
      position
    );


  return currentLineup.find(
    item =>
      normalizePosition(
        item.position
      ) === normalized
  );

}


function renderCourt() {

  $$(".court-player")
    .forEach(slot => {

      const position =
        slot.dataset.position ||
        slot.dataset.playerPosition;


      const lineupPlayer =
        findLineupPlayer(
          position
        );


      const name =
        lineupPlayer?.player_name ||
        lineupPlayer?.name ||
        "Vazio";


      const nameElement =
        slot.querySelector(
          ".court-player-name"
        );


      if (nameElement) {

        nameElement.textContent =
          name;

      } else {

        slot.textContent =
          name;

      }


      slot.dataset.playerId =
        lineupPlayer?.player_id ||
        "";

    });

}


function renderLineupEditor() {

  const editor =
    $("#lineupEditor");

  if (!editor) return;


  if (!playersData.length) {

    editor.innerHTML = `

      <p class="muted">

        Cadastre jogadores primeiro.

      </p>

    `;

    return;
  }


  editor.innerHTML =
    lineupPositions
      .map(position => {

        const current =
          findLineupPlayer(
            position.key
          );


        const currentPlayer =
          playersData.find(
            player => {

              if (
                current?.player_id
              ) {

                return (
                  Number(player.id) ===
                  Number(
                    current.player_id
                  )
                );

              }


              return (
                player.name ===
                current?.player_name
              );

            }
          );


        return `

          <div class="lineup-row">

            <label>

              ${esc(
                position.label
              )}

            </label>


            <select
              class="lineup-position-select"
              data-lineup-position="${position.key}"
            >

              <option value="">

                Nenhum jogador

              </option>


              ${
                playersData
                  .map(player => `

                    <option
                      value="${player.id}"

                      ${
                        Number(
                          player.id
                        ) ===
                        Number(
                          currentPlayer?.id
                        )
                          ? "selected"
                          : ""
                      }
                    >

                      ${
                        player.number !== null &&
                        player.number !== undefined
                          ? `#${player.number} — `
                          : ""
                      }

                      ${esc(
                        player.name
                      )}

                    </option>

                  `)
                  .join("")
              }

            </select>

          </div>

        `;

      })
      .join("");
}


/* =========================================================
   SALVAR ESCALAÇÃO PRINCIPAL
========================================================= */

$("#saveLineupButton")
  ?.addEventListener(
    "click",
    async () => {

      if (
        me?.role !== "admin"
      ) return;


      const message =
        $("#lineupMessage");


      const selects =
        $$(".lineup-position-select");


      const lineup =
        [];


      const used =
        new Set();


      try {

        for (
          const select of selects
        ) {

          if (
            !select.value
          ) continue;


          const player =
            playersData.find(
              item =>
                Number(item.id) ===
                Number(
                  select.value
                )
            );


          if (!player) continue;


          if (
            used.has(
              player.id
            )
          ) {

            showMessage(
              message,
              "Um jogador não pode ocupar duas posições."
            );

            return;
          }


          used.add(
            player.id
          );


          lineup.push({

            player_name:
              player.name,

            position:
              select.dataset
                .lineupPosition,

            status:
              "titular",

            number:
              player.number,

            notes:
              player.instructions ||
              ""

          });

        }


        /*
          Os demais jogadores entram como reservas.
          Isso mantém a escalação completa.
        */

        playersData
          .filter(
            player =>
              !used.has(
                player.id
              )
          )
          .forEach(
            player => {

              lineup.push({

                player_name:
                  player.name,

                position:
                  player.primary_position,

                status:
                  "reserva",

                number:
                  player.number,

                notes:
                  player.instructions ||
                  ""

              });

            }
          );


        if (
          lineup.filter(
            item =>
              item.status ===
              "titular"
          ).length > 5
        ) {

          showMessage(
            message,
            "A escalação pode ter no máximo 5 titulares."
          );

          return;
        }


        await api(
          "/api/lineup",
          {
            method: "PUT",

            body:
              JSON.stringify({
                lineup
              })
          }
        );


        showMessage(
          message,
          "Escalação salva.",
          true
        );


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


  const current =
    select.value;


  select.innerHTML = `

    <option value="">

      Escolha uma partida

    </option>

  `;


  matchesData.forEach(match => {

    const date =
      match.match_date ||
      match.date;


    const option =
      document.createElement(
        "option"
      );


    option.value =
      match.id;


    option.textContent =
      `${formatDate(date)} — ${match.opponent}`;


    select.appendChild(
      option
    );

  });


  if (current) {

    select.value =
      current;

  }

}


$("#lineupMatchSelect")
  ?.addEventListener(
    "change",
    loadMatchLineup
  );


async function loadMatchLineup() {

  const select =
    $("#lineupMatchSelect");

  const editor =
    $("#matchLineupEditor");


  if (
    !select ||
    !editor
  ) {

    return;
  }


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
      extractList(
        data,
        "lineup"
      );


    editor.innerHTML =
      playersData
        .map(player => {

          const existing =
            lineup.find(
              item =>
                Number(
                  item.player_id
                ) ===
                Number(
                  player.id
                )
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

                ${esc(
                  player.name
                )}

              </label>


              <select
                data-match-position="${player.id}"
              >

                ${
                  lineupPositions
                    .map(
                      position => `

                        <option
                          value="${position.key}"

                          ${
                            existing &&
                            normalizePosition(
                              existing.position
                            ) ===
                            normalizePosition(
                              position.key
                            )
                              ? "selected"
                              : ""
                          }
                        >

                          ${esc(
                            position.label
                          )}

                        </option>

                      `
                    )
                    .join("")
                }

              </select>


              <label>

                <input
                  type="checkbox"
                  data-match-starter="${player.id}"

                  ${
                    existing &&
                    Number(
                      existing.starter
                    ) === 1
                      ? "checked"
                      : ""
                  }
                >

                Titular

              </label>

            </div>

          `;

        })
        .join("");


  } catch (error) {

    editor.innerHTML = `

      <p class="err">

        ${esc(
          error.message
        )}

      </p>

    `;

  }

}


$("#saveMatchLineupButton")
  ?.addEventListener(
    "click",
    async () => {

      if (
        me?.role !== "admin"
      ) return;


      const matchId =
        $("#lineupMatchSelect")
          ?.value;


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

        const checked =
          $$(
            "[data-match-player]:checked"
          );


        const lineup =
          [];


        const usedPositions =
          new Set();


        const usedPlayers =
          new Set();


        for (
          const checkbox of checked
        ) {

          const playerId =
            Number(
              checkbox.dataset
                .matchPlayer
            );


          const player =
            playersData.find(
              item =>
                Number(item.id) ===
                playerId
            );


          if (!player) continue;


          const positionSelect =
            $(
              `[data-match-position="${playerId}"]`
            );


          const starterCheckbox =
            $(
              `[data-match-starter="${playerId}"]`
            );


          const position =
            positionSelect
              ?.value ||
            player.primary_position;


          const starter =
            starterCheckbox
              ?.checked
              ? 1
              : 0;


          if (
            usedPlayers.has(
              playerId
            )
          ) {

            continue;
          }


          usedPlayers.add(
            playerId
          );


          if (
            starter &&
            usedPositions.has(
              position
            )
          ) {

            showMessage(
              message,
              "Cada posição titular deve ter apenas um jogador."
            );

            return;
          }


          if (starter) {

            usedPositions.add(
              position
            );

          }


          lineup.push({

            player_id:
              playerId,

            position,

            starter,

            instructions:
              player.instructions ||
              ""

          });

        }


        const starters =
          lineup.filter(
            item =>
              Number(
                item.starter
              ) === 1
          );


        if (
          starters.length > 5
        ) {

          showMessage(
            message,
            "Uma escalação pode ter no máximo 5 titulares."
          );

          return;
        }


        await api(
          `/api/matches/${matchId}/lineup`,
          {
            method: "PUT",

            body:
              JSON.stringify({
                lineup
              })
          }
        );


        showMessage(
          message,
          "Escalação da partida salva.",
          true
        );


        await loadMatchLineup();


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
      await api(
        "/api/polls"
      );


    pollsData =
      extractList(
        data,
        "polls"
      );


    renderPolls();


  } catch (error) {

    console.error(
      "Erro ao carregar enquetes:",
      error
    );

  }
}


function getPollOptions(
  poll
) {

  if (
    Array.isArray(
      poll.options
    )
  ) {

    return poll.options;

  }

  return [];
}


function getPollOptionText(
  option
) {

  if (
    typeof option ===
    "string"
  ) {

    return option;
  }

  return (
    option.text ||
    option.label ||
    option.option ||
    ""
  );
}


function getPollOptionId(
  option,
  index
) {

  if (
    typeof option ===
    "object" &&
    option.id !== undefined
  ) {

    return option.id;
  }

  return index;
}


function renderPolls() {

  const container =
    $("#pollsList");

  if (!container) return;


  if (!pollsData.length) {

    container.innerHTML = `

      <p class="muted">

        Nenhuma enquete ainda.

      </p>

    `;

    return;
  }


  container.innerHTML =
    pollsData
      .map(poll => {

        const options =
          getPollOptions(
            poll
          );


        const closed =
          Boolean(
            poll.closed
          ) ||
          (
            poll.closes_at &&
            new Date(
              poll.closes_at
            ) <=
            new Date()
          );


        const hasVoted =
          Boolean(
            poll.has_voted ||
            poll.hasVoted
          );


        const multiple =
          Boolean(
            poll.multiple_choice ??
            poll.multiple
          );


        return `

          <div class="poll-card">

            <h3>

              ${esc(
                poll.question
              )}

            </h3>


            ${
              poll.closes_at
                ? `

                  <div class="muted">

                    ${
                      closed
                        ? "Encerrada"
                        : `Fecha em ${formatDateTime(
                            poll.closes_at
                          )}`
                    }

                  </div>

                `
                : ""
            }


            <form
              class="poll-vote-form"
              data-poll-id="${poll.id}"
            >

              <div class="poll-options">

                ${
                  options
                    .map(
                      (
                        option,
                        index
                      ) => {

                        const text =
                          getPollOptionText(
                            option
                          );


                        const id =
                          getPollOptionId(
                            option,
                            index
                          );


                        return `

                          <label class="choice">

                            <input
                              type="${
                                multiple
                                  ? "checkbox"
                                  : "radio"
                              }"

                              name="poll-${poll.id}"

                              value="${id}"

                              ${
                                closed ||
                                hasVoted
                                  ? "disabled"
                                  : ""
                              }
                            >

                            ${esc(
                              text
                            )}

                            ${
                              typeof option ===
                                "object" &&
                              option.votes !==
                                undefined
                                ? `
                                  <span class="muted">

                                    —
                                    ${option.votes}
                                    voto(s)

                                  </span>
                                `
                                : ""
                            }

                          </label>

                        `;

                      }
                    )
                    .join("")
                }

              </div>


              ${
                !closed &&
                !hasVoted
                  ? `

                    <button
                      type="submit"
                    >

                      Votar

                    </button>

                  `
                  : ""
              }


              ${
                hasVoted
                  ? `

                    <span class="ok">

                      Você já votou.

                    </span>

                  `
                  : ""
              }

            </form>


            ${
              me?.role === "admin"
                ? `

                  <button
                    class="danger"
                    onclick="deletePoll(${poll.id})"
                  >

                    Excluir

                  </button>

                `
                : ""
            }

          </div>

        `;

      })
      .join("");


  $$(".poll-vote-form")
    .forEach(form => {

      form.addEventListener(
        "submit",
        event => {

          event.preventDefault();

          votePollFromForm(
            form
          );

        }
      );

    });

}


/* =========================================================
   VOTAR
========================================================= */

async function votePollFromForm(
  form
) {

  const pollId =
    Number(
      form.dataset.pollId
    );


  const selected =
    [
      ...form.querySelectorAll(
        "input:checked"
      )
    ].map(
      input =>
        input.value
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
      `/api/polls/${pollId}/vote`,
      {
        method: "POST",

        body:
          JSON.stringify({

            option_ids:
              selected

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

}


/* =========================================================
   EXCLUIR ENQUETE
========================================================= */

window.deletePoll =
  async function(id) {

    if (
      me?.role !== "admin"
    ) return;


    if (
      !confirm(
        "Excluir esta enquete?"
      )
    ) {

      return;
    }


    try {

      await api(
        `/api/polls/${id}`,
        {
          method: "DELETE"
        }
      );


      toast(
        "Enquete excluída."
      );


      await loadPolls();


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

$("#newPollButton")
  ?.addEventListener(
    "click",
    () => {

      $("#pollCreateBox")
        ?.classList
        .remove("hidden");


      ensurePollOptions();

    }
  );


$("#cancelPollButton")
  ?.addEventListener(
    "click",
    () => {

      $("#pollCreateBox")
        ?.classList
        .add("hidden");

    }
  );


function ensurePollOptions() {

  const container =
    $("#pollOptions");

  if (!container || container.tagName === "TEXTAREA") return;


  if (
    container.querySelectorAll(
      "input"
    ).length >= 2
  ) {

    return;
  }


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


$("#addPollOptionButton")
  ?.addEventListener(
    "click",
    () => {

      const container =
        $("#pollOptions");

      if (!container) return;


      const count =
        container.querySelectorAll(
          "input"
        ).length;


      const input =
        document.createElement(
          "input"
        );


      input.type =
        "text";


      input.className =
        "poll-option";


      input.placeholder =
        `Opção ${count + 1}`;


      container.appendChild(
        input
      );

    }
  );


$("#pollForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      if (
        me?.role !== "admin"
      ) return;


      const options =
        [
          ...document.querySelectorAll(
            "#pollOptions input"
          )
        ]
          .map(
            input =>
              input.value.trim()
          )
          .filter(Boolean);


      if (
        options.length < 2
      ) {

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

            body:
              JSON.stringify({

                question:
                  $("#pollQuestion")
                    .value
                    .trim(),

                options,

                closes_at:
                  inputDateToISO(
                    $("#pollCloseDate")
                      .value
                  ),

                multiple_choice:
                  $("#pollMultiple")
                    .checked

              })
          }
        );


        event.target.reset();


        $("#pollCreateBox")
          ?.classList
          .add("hidden");


        showMessage(
          $("#pollMessage"),
          "Enquete criada.",
          true
        );


        await loadPolls();

        await loadDashboard();


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


  try {

    const data =
      await api(
        "/api/matches"
      );


    matchesData =
      extractList(
        data,
        "matches"
      );


    if (!container) {

      await loadMatchSelectors();

      return;
    }


    if (
      !matchesData.length
    ) {

      container.innerHTML = `

        <p class="muted">

          Nenhuma partida cadastrada.

        </p>

      `;

    } else {

      container.innerHTML =
        matchesData
          .map(match => {

            const date =
              match.match_date ||
              match.date;


            return `

              <div class="match-card">

                <h3>

                  Beiçola F.I.

                  <span>

                    vs.

                  </span>

                  ${esc(
                    match.opponent
                  )}

                </h3>


                <div class="muted">

                  ${formatDate(
                    date
                  )}

                  ${
                    match.location
                      ? `
                        •
                        ${esc(
                          match.location
                        )}
                      `
                      : ""
                  }

                </div>


                ${
                  match.result
                    ? `

                      <strong>

                        Resultado:
                        ${esc(
                          match.result
                        )}

                      </strong>

                    `
                    : ""
                }


                ${
                  match.notes
                    ? `

                      <p>

                        ${esc(
                          match.notes
                        )}

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

            `;

          })
          .join("");

    }


    await loadMatchSelectors();


  } catch (error) {

    console.error(
      "Erro ao carregar partidas:",
      error
    );

  }
}


/* =========================================================
   CRIAR PARTIDA
========================================================= */

$("#newMatchButton")
  ?.addEventListener(
    "click",
    () => {

      $("#matchCreateBox")
        ?.classList
        .remove("hidden");

    }
  );


$("#cancelMatchButton")
  ?.addEventListener(
    "click",
    () => {

      $("#matchCreateBox")
        ?.classList
        .add("hidden");

    }
  );


$("#matchForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      if (
        me?.role !== "admin"
      ) return;


      try {

        await api(
          "/api/matches",
          {
            method: "POST",

            body:
              JSON.stringify({

                opponent:
                  $("#matchOpponent")
                    .value
                    .trim(),

                match_date:
                  inputDateToISO(
                    $("#matchDate")
                      .value
                  ),

                location:
                  $("#matchLocation")
                    .value
                    .trim(),

                result:
                  $("#matchResult")
                    .value
                    .trim(),

                notes:
                  $("#matchNotes")
                    .value
                    .trim()

              })
          }
        );


        event.target.reset();


        $("#matchCreateBox")
          ?.classList
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
      me?.role !== "admin"
    ) return;


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


      toast(
        "Partida excluída."
      );


      await loadMatches();

      await loadDashboard();


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


  try {

    const data =
      await api(
        "/api/announcements"
      );


    announcementsData =
      extractList(
        data,
        "announcements"
      );


    if (!container) return;


    if (
      !announcementsData.length
    ) {

      container.innerHTML = `

        <p class="muted">

          Nenhum aviso publicado.

        </p>

      `;

      return;
    }


    container.innerHTML =
      announcementsData
        .map(item => `

          <article
            class="announcement-card"
          >

            <h3>

              ${esc(
                item.title
              )}

            </h3>


            <p>

              ${esc(
                item.content ||
                item.body ||
                ""
              )}

            </p>


            <span class="muted">

              ${formatDateTime(
                item.created_at
              )}

            </span>


            ${
              me?.role === "admin"
                ? `

                  <br>

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

        `)
        .join("");


  } catch (error) {

    console.error(
      "Erro ao carregar avisos:",
      error
    );

  }
}


/* =========================================================
   CRIAR AVISO
========================================================= */

$("#newAnnouncementButton")
  ?.addEventListener(
    "click",
    () => {

      $("#announcementCreateBox")
        ?.classList
        .remove("hidden");

    }
  );


$("#cancelAnnouncementButton")
  ?.addEventListener(
    "click",
    () => {

      $("#announcementCreateBox")
        ?.classList
        .add("hidden");

    }
  );


$("#announcementForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      if (
        me?.role !== "admin"
      ) return;


      try {

        await api(
          "/api/announcements",
          {
            method: "POST",

            body:
              JSON.stringify({

                title:
                  $("#announcementTitle")
                    .value
                    .trim(),

                content:
                  $("#announcementContent")
                    .value
                    .trim()

              })
          }
        );


        event.target.reset();


        $("#announcementCreateBox")
          ?.classList
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
      me?.role !== "admin"
    ) return;


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


      toast(
        "Aviso excluído."
      );


      await loadAnnouncements();

      await loadDashboard();


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


  if ($("#profileNameInput")) {
    $("#profileNameInput").value = me.name || "";
  }
  if (document.querySelector("#profileName")) {
    document.querySelector("#profileName").textContent = me.name || "—";
  }


  if ($("#profileEmail")) {

    $("#profileEmail")
      .value =
      me.email || "";

  }


  if ($("#profileRole")) {

    $("#profileRole").textContent =
      me.role === "admin" ? "Administrador" : "Integrante";

  }

}


$("#profileForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      try {

        const data =
          await api(
            "/api/profile",
            {
              method: "PUT",

              body:
                JSON.stringify({

                  name:
                    $("#profileNameInput")
                      .value
                      .trim()

                })
            }
          );


        me =
          data.user ||
          {
            ...me,

            name:
              $("#profileNameInput")
                .value
                .trim()

          };


        $("#headerUserName")
          .textContent =
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

$("#passwordForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const newPassword =
        $("#newPassword")
          .value;


      const confirmation =
        $("#confirmNewPassword")
          .value;


      if (
        newPassword !==
        confirmation
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

              body:
                JSON.stringify({

                  currentPassword:
                    $("#currentPassword")
                      .value,

                  newPassword

                })
            }
          );


        showMessage(
          $("#passwordMessage"),
          data.message ||
          "Senha alterada com sucesso.",
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


  /*
     Somente administrador
     pode consultar essa área.
  */

  if (
    me?.role !== "admin"
  ) {

    container.innerHTML =
      "";

    return;
  }


  try {

    const data =
      await api(
        "/api/members"
      );


    membersData =
      extractList(
        data,
        "members"
      );


    if (
      !membersData.length
    ) {

      container.innerHTML = `

        <p class="muted">

          Nenhum integrante.

        </p>

      `;

      return;
    }


    const playerUserIds =
      new Set(
        playersData
          .map(
            player =>
              Number(
                player.user_id
              )
          )
          .filter(Boolean)
      );


    container.innerHTML =
      membersData
        .map(member => {

          const isPlayer =
            playerUserIds.has(
              Number(member.id)
            );


          return `

            <div class="member-card">

              <div>

                <strong>

                  ${esc(
                    member.name
                  )}

                </strong>


                <div class="muted">

                  ${esc(
                    member.email
                  )}

                </div>


                <span>

                  ${
                    member.role ===
                    "admin"
                      ? "Administrador"
                      : "Integrante"
                  }

                </span>

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

        })
        .join("");


  } catch (error) {

    console.error(
      "Erro ao carregar membros:",
      error
    );

  }
}


/* =========================================================
   CONVERTER MEMBRO EM JOGADOR
========================================================= */

window.convertMemberToPlayer =
  async function(userId) {

    if (
      me?.role !== "admin"
    ) return;


    const member =
      membersData.find(
        item =>
          Number(item.id) ===
          Number(userId)
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

      await api(
        `/api/players/from-member/${userId}`,
        {
          method: "POST"
        }
      );


      toast(
        "Membro convertido em jogador."
      );


      await loadPlayers();

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


    if (
      data.available
    ) {

      box.classList
        .remove("hidden");

    } else {

      box.classList
        .add("hidden");

    }


  } catch {

    box.classList
      .add("hidden");

  }

}


$("#setupAdminForm")
  ?.addEventListener(
    "submit",
    async event => {

      event.preventDefault();


      const message =
        $("#setupAdminMessage");


      try {

        await api(
          "/api/setup-admin",
          {
            method: "POST",

            body:
              JSON.stringify({

                key:
                  $("#setupAdminKey")
                    .value,

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
          message,
          "Administrador criado com sucesso! Agora faça login.",
          true
        );


        event.target.reset();


      } catch (error) {

        showMessage(
          message,
          error.message
        );

      }

    }
  );


/* =========================================================
   ADAPTAÇÃO DOS FORMULÁRIOS DO HTML ATUAL
========================================================= */

function ensureFeedback(form, id) {
  let el = document.getElementById(id);
  if (!el && form) {
    el = document.createElement("p");
    el.id = id;
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    form.appendChild(el);
  }
  return el;
}

$("#createPollForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  if (me?.role !== "admin") return;
  const form = event.currentTarget;
  const feedback = ensureFeedback(form, "pollMessage");
  const options = $("#pollOptions").value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  if (options.length < 2) return showMessage(feedback, "Informe pelo menos duas opções.");
  try {
    await api("/api/polls", { method: "POST", body: JSON.stringify({
      question: $("#pollQuestion").value.trim(),
      options,
      closes_at: $("#pollCloseDate").value || null,
      multiple_choice: $("#pollMultiple").checked
    }) });
    form.reset();
    showMessage(feedback, "Enquete criada.", true);
    await loadPolls();
  } catch (error) { showMessage(feedback, error.message); }
});

$("#announcementForm")?.addEventListener("submit", async event => {
  // O listener legado já faz o envio; este handler só cria uma mensagem
  // acessível caso o formulário não tenha recebido feedback ainda.
  ensureFeedback(event.currentTarget, "announcementMessage");
});

$("#messageForm")?.addEventListener("submit", event => {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = ensureFeedback(form, "messageFeatureNotice");
  showMessage(feedback, "O recurso de mensagens ainda não está conectado ao backend; sua mensagem não foi enviada.");
});

$("#changePasswordForm")?.addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const feedback = ensureFeedback(form, "passwordMessage");
  const next = $("#newPassword").value;
  if (next !== $("#confirmNewPassword").value) return showMessage(feedback, "As novas senhas não coincidem.");
  try {
    const data = await api("/api/change-password", { method: "POST", body: JSON.stringify({ currentPassword: $("#currentPassword").value, newPassword: next }) });
    showMessage(feedback, data.message || "Senha alterada.", true);
    form.reset();
  } catch (error) { showMessage(feedback, error.message); }
});

/* =========================================================
   INICIALIZAÇÃO
========================================================= */

document.addEventListener(
  "DOMContentLoaded",
  async () => {

    setupAuthTabs();

    setupNavigation();

    ensurePollOptions();

    await loadApp();

  }
);
