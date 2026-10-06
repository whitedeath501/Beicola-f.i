const $ = selector =>
  document.querySelector(selector);

const api = async (
  url,
  options = {}
) => {

  const response = await fetch(
    url,
    {
      ...options,

      headers: {
        'Content-Type':
          'application/json',

        ...(options.headers || {})
      }
    }
  );

  let json = {};

  try {
    json = await response.json();
  } catch {}

  if (!response.ok) {
    throw new Error(
      json.error || 'Erro'
    );
  }

  return json;
};

function msg(
  element,
  text,
  ok = false
) {
  element.textContent = text;

  element.className =
    ok
      ? 'ok'
      : 'err';
}

let me = null;


/* =========================
   ABAS
========================= */

for (
  const button of
  document.querySelectorAll(
    '[data-tab]'
  )
) {

  button.onclick = () => {

    for (
      const formName of
      ['login', 'register', 'forgot']
    ) {

      $('#' + formName)
        .classList.toggle(
          'hidden',
          button.dataset.tab !==
          formName
        );
    }

  };

}


/* =========================
   LOGIN
========================= */

$('#login').onsubmit =
  async event => {

    event.preventDefault();

    try {

      const form =
        new FormData(
          event.target
        );

      await api(
        '/api/login',
        {
          method: 'POST',

          body:
            JSON.stringify(
              Object.fromEntries(
                form
              )
            )
        }
      );

      await load();

    } catch (error) {

      msg(
        $('#authMsg'),
        error.message
      );
    }
  };


/* =========================
   CADASTRO
========================= */

$('#register').onsubmit =
  async event => {

    event.preventDefault();

    try {

      const form =
        new FormData(
          event.target
        );

      await api(
        '/api/register',
        {
          method: 'POST',

          body:
            JSON.stringify(
              Object.fromEntries(
                form
              )
            )
        }
      );

      msg(
        $('#authMsg'),
        'Conta criada. Agora entre.',
        true
      );

      document
        .querySelector(
          '[data-tab="login"]'
        )
        .click();

    } catch (error) {

      msg(
        $('#authMsg'),
        error.message
      );
    }
  };


/* =========================
   ESQUECI A SENHA
========================= */

$('#forgot').onsubmit =
  async event => {

    event.preventDefault();

    try {

      const form =
        new FormData(
          event.target
        );

      const result =
        await api(
          '/api/forgot-password',
          {
            method: 'POST',

            body:
              JSON.stringify(
                Object.fromEntries(
                  form
                )
              )
          }
        );

      msg(
        $('#authMsg'),
        result.message,
        true
      );

    } catch (error) {

      msg(
        $('#authMsg'),
        error.message
      );
    }
  };


/* =========================
   PRIMEIRO ADMIN
========================= */

async function checkAdminSetup() {

  try {

    const result =
      await api(
        '/api/setup-admin/status'
      );

    if (
      result.available
    ) {

      $('#setupAdmin')
        .classList
        .remove('hidden');

    } else {

      $('#setupAdmin')
        .classList
        .add('hidden');
    }

  } catch {

    $('#setupAdmin')
      .classList
      .add('hidden');
  }
}


$('#setupAdminForm').onsubmit =
  async event => {

    event.preventDefault();

    const form =
      new FormData(
        event.target
      );

    try {

      const data =
        await api(
          '/api/setup-admin',
          {
            method: 'POST',

            body:
              JSON.stringify(
                Object.fromEntries(
                  form
                )
              )
          }
        );

      msg(
        $('#setupAdminMsg'),
        data.message,
        true
      );

      event.target.reset();

      setTimeout(
        () => {

          document
            .querySelector(
              '[data-tab="login"]'
            )
            .click();

        },
        1500
      );

      await checkAdminSetup();

    } catch (error) {

      msg(
        $('#setupAdminMsg'),
        error.message
      );
    }
  };


/* =========================
   LOGOUT
========================= */

$('#logout').onclick =
  async () => {

    try {

      await api(
        '/api/logout',
        {
          method: 'POST'
        }
      );

    } finally {

      location.reload();
    }
  };


$('#refresh').onclick =
  load;


/* =========================
   CARREGAR SISTEMA
========================= */

async function load() {

  try {

    const result =
      await api('/api/me');

    me = result.user;

    $('#auth')
      .classList
      .add('hidden');

    $('#app')
      .classList
      .remove('hidden');

    $('#logout')
      .classList
      .remove('hidden');

    $('#userName')
      .textContent =
      me.name;

    $('#userRole')
      .textContent =
      me.role === 'admin'
        ? 'Administrador'
        : 'Integrante';

    /*
      Mostra ferramentas administrativas
      somente para admins.
    */

    if (
      me.role === 'admin'
    ) {

      [
        'adminPoll',
        'adminMatch',
        'adminNotice'
      ].forEach(
        elementId => {

          $(
            '#' + elementId
          )
            .classList
            .remove('hidden');

        }
      );

    } else {

      [
        'adminPoll',
        'adminMatch',
        'adminNotice'
      ].forEach(
        elementId => {

          $(
            '#' + elementId
          )
            .classList
            .add('hidden');

        }
      );
    }

    await Promise.all([
      polls(),
      matches(),
      lineup(),
      announcements(),
      members()
    ]);

    $('#profileForm input')
      .value =
      me.name;

  } catch {

    $('#auth')
      .classList
      .remove('hidden');

    $('#app')
      .classList
      .add('hidden');

    $('#logout')
      .classList
      .add('hidden');

    await checkAdminSetup();
  }
}


/* =========================
   ENQUETES
========================= */

async function polls() {

  const result =
    await api(
      '/api/polls'
    );

  const pollList =
    result.polls;

  $('#polls').innerHTML =
    pollList.length

      ? pollList
          .map(poll => {

            return `
              <div class="item">

                <b>
                  ${esc(
                    poll.question
                  )}
                </b>

                ${poll.options
                  .map(
                    (option, index) => `
                      <label class="choice">

                        <input
                          type="${
                            poll.multiple
                              ? 'checkbox'
                              : 'radio'
                          }"

                          name="poll-${
                            poll.id
                          }"

                          value="${index}"

                          ${
                            poll.hasVoted
                              ? 'disabled'
                              : ''
                          }
                        >

                        ${esc(option)}

                      </label>
                    `
                  )
                  .join('')}

                ${
                  poll.hasVoted
                    ? `
                      <span class="muted">
                        Você já votou.
                      </span>
                    `
                    : poll.closed
                    ? `
                      <span class="muted">
                        Encerrada.
                      </span>
                    `
                    : `
                      <button
                        onclick="vote(
                          '${poll.id}',
                          ${poll.multiple}
                        )"
                      >
                        Votar
                      </button>
                    `
                }

                <button
                  class="ghost"
                  onclick="results(
                    '${poll.id}'
                  )"
                >
                  Resultados
                </button>

                ${
                  me.role === 'admin' &&
                  !poll.closed
                    ? `
                      <button
                        class="danger"
                        onclick="closePoll(
                          '${poll.id}'
                        )"
                      >
                        Encerrar
                      </button>
                    `
                    : ''
                }

              </div>
            `;

          })
          .join('')

      : `
        <p class="muted">
          Nenhuma enquete ainda.
        </p>
      `;
}


window.vote =
  async (
    id,
    multiple
  ) => {

    const choices =
      [
        ...document.querySelectorAll(
          `[name="poll-${id}"]:checked`
        )
      ].map(
        input =>
          Number(
            input.value
          )
      );

    try {

      await api(
        '/api/polls/' +
        id +
        '/vote',
        {
          method: 'POST',

          body:
            JSON.stringify({
              options:
                choices
            })
        }
      );

      await polls();

    } catch (error) {

      alert(
        error.message
      );
    }
  };


window.results =
  async id => {

    try {

      const result =
        await api(
          '/api/polls/' +
          id +
          '/results'
        );

      alert(
        result.question +
        '\n\n' +

        result.results
          .map(
            item =>
              `${item.label}: ${item.count}`
          )
          .join('\n') +

        '\n\nTotal de votos: ' +
        result.total
      );

    } catch (error) {

      alert(
        error.message
      );
    }
  };


window.closePoll =
  async id => {

    try {

      await api(
        '/api/polls/' +
        id +
        '/close',
        {
          method: 'POST'
        }
      );

      await polls();

    } catch (error) {

      alert(
        error.message
      );
    }
  };


$('#pollForm').onsubmit =
  async event => {

    event.preventDefault();

    const form =
      new FormData(
        event.target
      );

    try {

      await api(
        '/api/polls',
        {
          method: 'POST',

          body:
            JSON.stringify({
              question:
                form.get(
                  'question'
                ),

              options:
                String(
                  form.get(
                    'options'
                  )
                )
                  .split(',')
                  .map(
                    value =>
                      value.trim()
                  )
                  .filter(Boolean),

              multiple:
                form.get(
                  'multiple'
                ) === 'on'
            })
        }
      );

      event.target.reset();

      await polls();

    } catch (error) {

      alert(
        error.message
      );
    }
  };


/* =========================
   PARTIDAS
========================= */

async function matches() {

  const result =
    await api(
      '/api/matches'
    );

  const list =
    result.matches;

  $('#matches').innerHTML =
    list.length

      ? list
          .map(
            match => `
              <div class="item">

                <b>
                  ${esc(
                    match.opponent
                  )}
                </b>

                <div class="muted">
                  ${match.date}

                  ${
                    match.time
                      ? ' • ' +
                        match.time
                      : ''
                  }

                  ${
                    match.location
                      ? ' • ' +
                        esc(
                          match.location
                        )
                      : ''
                  }
                </div>

                <div>
                  ${esc(
                    match.status
                  )}

                  ${
                    match.result
                      ? ' — ' +
                        esc(
                          match.result
                        )
                      : ''
                  }
                </div>

                ${
                  me.role === 'admin'
                    ? `
                      <button
                        class="danger"
                        onclick="delMatch(
                          '${match.id}'
                        )"
                      >
                        Excluir
                      </button>
                    `
                    : ''
                }

              </div>
            `
          )
          .join('')

      : `
        <p class="muted">
          Nenhuma partida cadastrada.
        </p>
      `;
}


window.delMatch =
  async id => {

    if (
      !confirm(
        'Excluir esta partida?'
      )
    ) {
      return;
    }

    try {

      await api(
        '/api/matches/' +
        id,
        {
          method: 'DELETE'
        }
      );

      await matches();

    } catch (error) {

      alert(
        error.message
      );
    }
  };


$('#matchForm').onsubmit =
  async event => {

    event.preventDefault();

    const form =
      new FormData(
        event.target
      );

    try {

      await api(
        '/api/matches',
        {
          method: 'POST',

          body:
            JSON.stringify(
              Object.fromEntries(
                form
              )
            )
        }
      );

      event.target.reset();

      await matches();

    } catch (error) {

      alert(
        error.message
      );
    }
  };


/* =========================
   ESCALAÇÃO
========================= */

async function lineup() {

  const result =
    await api(
      '/api/lineup'
    );

  const players =
    result.lineup;

  $('#lineup').innerHTML =
    players.length

      ? players
          .map(
            player => `
              <div class="item">

                <b>
                  ${esc(
                    player.player_name
                  )}
                </b>

                <span class="muted">
                  ${esc(
                    player.position ||
                    ''
                  )}
                </span>

                ${
                  player.starter
                    ? ' — titular'
                    : ''
                }

                ${
                  player.injured
                    ? ' — lesionado'
                    : ''
                }

              </div>
            `
          )
          .join('')

      : `
        <p class="muted">
          Escalação ainda não cadastrada.
        </p>
      `;
}


/* =========================
   AVISOS
========================= */

async function announcements() {

  const result =
    await api(
      '/api/announcements'
    );

  const list =
    result.announcements;

  $('#announcements').innerHTML =
    list.length

      ? list
          .map(
            announcement => `
              <div class="item">

                <b>
                  ${esc(
                    announcement.title
                  )}
                </b>

                <p>
                  ${esc(
                    announcement.body
                  )}
                </p>

                <span class="muted">
                  ${new Date(
                    announcement.created_at
                  ).toLocaleString(
                    'pt-BR'
                  )}
                </span>

              </div>
            `
          )
          .join('')

      : `
        <p class="muted">
          Nenhum aviso.
        </p>
      `;
}


$('#noticeForm').onsubmit =
  async event => {

    event.preventDefault();

    const form =
      new FormData(
        event.target
      );

    try {

      await api(
        '/api/announcements',
        {
          method: 'POST',

          body:
            JSON.stringify(
              Object.fromEntries(
                form
              )
            )
        }
      );

      event.target.reset();

      await announcements();

    } catch (error) {

      alert(
        error.message
      );
    }
  };


/* =========================
   MEMBROS
========================= */

async function members() {

  const result =
    await api(
      '/api/members'
    );

  const list =
    result.members;

  $('#members').innerHTML =
    list.length

      ? list
          .map(
            user => `
              <div class="item">

                <b>
                  ${esc(
                    user.name
                  )}
                </b>

                <div class="muted">

                  ${esc(
                    user.email
                  )}

                  •
                  ${user.role}

                </div>

                ${
                  me.role === 'admin' &&
                  user.id !== me.id

                    ? `
                      <button
                        onclick="changeRole(
                          '${user.id}',
                          '${
                            user.role ===
                            'admin'
                              ? 'member'
                              : 'admin'
                          }'
                        )"
                      >
                        Tornar ${
                          user.role ===
                          'admin'
                            ? 'integrante'
                            : 'admin'
                        }
                      </button>
                    `

                    : ''
                }

              </div>
            `
          )
          .join('')

      : `
        <p class="muted">
          Nenhum membro.
        </p>
      `;
}


window.changeRole =
  async (
    id,
    role
  ) => {

    try {

      await api(
        '/api/members/' +
        id +
        '/role',
        {
          method: 'PUT',

          body:
            JSON.stringify({
              role
            })
        }
      );

      await members();

    } catch (error) {

      alert(
        error.message
      );
    }
  };


/* Mantém compatibilidade
   com o nome antigo da função. */

window.role =
  window.changeRole;


/* =========================
   PERFIL
========================= */

$('#profileForm').onsubmit =
  async event => {

    event.preventDefault();

    try {

      const form =
        new FormData(
          event.target
        );

      const result =
        await api(
          '/api/profile',
          {
            method: 'PUT',

            body:
              JSON.stringify(
                Object.fromEntries(
                  form
                )
              )
          }
        );

      me =
        result.user;

      $('#userName')
        .textContent =
        me.name;

      msg(
        $('#profileMsg'),
        'Nome salvo.',
        true
      );

    } catch (error) {

      msg(
        $('#profileMsg'),
        error.message
      );
    }
  };


/* =========================
   ALTERAR SENHA
========================= */

$('#passwordForm').onsubmit =
  async event => {

    event.preventDefault();

    try {

      const form =
        new FormData(
          event.target
        );

      const result =
        await api(
          '/api/change-password',
          {
            method: 'POST',

            body:
              JSON.stringify(
                Object.fromEntries(
                  form
                )
              )
          }
        );

      msg(
        $('#profileMsg'),
        result.message,
        true
      );

      setTimeout(
        () => location.reload(),
        1200
      );

    } catch (error) {

      msg(
        $('#profileMsg'),
        error.message
      );
    }
  };


/* =========================
   SEGURANÇA HTML
========================= */

function esc(value) {

  return String(
    value ?? ''
  ).replace(
    /[&<>'"]/g,
    character => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    })[character]
  );
}


/* =========================
   INÍCIO
========================= */

checkAdminSetup();

load();
