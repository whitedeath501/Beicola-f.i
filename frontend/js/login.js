(() => {
  const $ = (selector) => document.querySelector(selector);
  const panels = [...document.querySelectorAll('.panel')];
  const tabs = [...document.querySelectorAll('[data-panel]')];
  const heading = $('#heading');
  const subheading = $('#subheading');

  function message(id, text, ok = false) {
    const el = $(id);
    if (!el) return;
    el.textContent = text || '';
    el.classList.toggle('ok', ok);
  }

  function showPanel(id) {
    panels.forEach(panel => { panel.hidden = panel.id !== id; });
    tabs.forEach(tab => tab.classList.toggle('active', tab.dataset.panel === id));
    if (heading) heading.textContent = id === 'registerForm' ? 'Entre para o time.' : id === 'forgotForm' ? 'Recuperar acesso.' : id === 'setupAdminForm' ? 'Configurar administrador.' : id === 'resetForm' ? 'Definir nova senha.' : 'Bem-vindo de volta.';
    if (subheading) subheading.textContent = id === 'registerForm' ? 'Crie uma conta para acessar o painel.' : id === 'forgotForm' ? 'Vamos ajudar você a recuperar sua conta.' : id === 'setupAdminForm' ? 'Crie a conta que vai administrar o Beiçola F.I.' : id === 'resetForm' ? 'Escolha uma senha nova para recuperar seu acesso.' : 'Entre com sua conta para abrir o painel.';
  }

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'include',
      ...options,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
    });
    let data = {};
    try { data = await response.json(); } catch {}
    if (!response.ok) throw new Error(data.error || data.message || 'Não foi possível concluir a operação.');
    return data;
  }

  tabs.forEach(tab => tab.addEventListener('click', () => showPanel(tab.dataset.panel)));
  $('#showForgot')?.addEventListener('click', () => showPanel('forgotForm'));
  $('#backToLogin')?.addEventListener('click', () => showPanel('loginForm'));

  $('#loginForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    message('#loginMessage', 'Verificando acesso...');
    try {
      await api('/api/login', { method: 'POST', body: JSON.stringify({ email: $('#loginEmail').value.trim(), password: $('#loginPassword').value }) });
      window.location.replace('/index.html');
    } catch (error) {
      message('#loginMessage', error.message);
    } finally { button.disabled = false; }
  });

  $('#registerForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const password = $('#registerPassword').value;
    if (password !== $('#registerPasswordConfirm').value) return message('#registerMessage', 'As senhas não coincidem.');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/register', { method: 'POST', body: JSON.stringify({ name: $('#registerName').value.trim(), email: $('#registerEmail').value.trim(), password }) });
      message('#registerMessage', 'Conta criada. Agora você já pode entrar.', true);
      event.currentTarget.reset();
      showPanel('loginForm');
      message('#loginMessage', 'Cadastro concluído. Entre com seu e-mail e senha.', true);
    } catch (error) { message('#registerMessage', error.message); }
    finally { button.disabled = false; }
  });

  $('#forgotForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const data = await api('/api/forgot-password', { method: 'POST', body: JSON.stringify({ email: $('#forgotEmail').value.trim() }) });
      message('#forgotMessage', data.message || 'Se o e-mail estiver cadastrado, enviaremos as instruções.', true);
    } catch (error) { message('#forgotMessage', error.message); }
  });

  $('#resetForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const token = new URLSearchParams(window.location.search).get('reset_token');
    if (!token) return message('#resetMessage', 'O link de recuperação não contém um token válido.');
    const password = $('#resetPassword').value;
    if (password !== $('#resetPasswordConfirm').value) return message('#resetMessage', 'As senhas não coincidem.');
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = await api('/api/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      event.currentTarget.reset();
      window.history.replaceState({}, '', '/login.html');
      showPanel('loginForm');
      message('#loginMessage', data.message || 'Senha redefinida. Agora faça login.', true);
    } catch (error) { message('#resetMessage', error.message); }
    finally { button.disabled = false; }
  });

  $('#setupAdminForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await api('/api/setup-admin', { method: 'POST', body: JSON.stringify({ key: $('#setupAdminKey').value, name: $('#setupAdminName').value.trim(), email: $('#setupAdminEmail').value.trim(), password: $('#setupAdminPassword').value }) });
      event.currentTarget.reset();
      showPanel('loginForm');
      message('#loginMessage', 'Administrador criado. Entre com a conta nova.', true);
    } catch (error) { message('#setupAdminMessage', error.message); }
    finally { button.disabled = false; }
  });

  async function init() {
    const resetToken = new URLSearchParams(window.location.search).get('reset_token');
    if (resetToken) {
      showPanel('resetForm');
      return;
    }
    try {
      await api('/api/me');
      window.location.replace('/index.html');
      return;
    } catch {}
    try {
      const data = await api('/api/setup-admin/status');
      if (data.available) showPanel('setupAdminForm');
    } catch { /* O login continua disponível se a consulta falhar. */ }
  }
  init();
})();
