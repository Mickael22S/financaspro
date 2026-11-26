/* =====================================================================
   FinançasPro — telas de acesso e inicialização (login, cadastro,
   recuperar senha) dentro do mesmo index.html.

   - Sem sessão: mostra login/cadastro/recuperar (rota pelo # da URL).
   - Com sessão: mostra o app e carrega js/app.js e js/config.js.
   ===================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var PANES = ['login', 'cadastro', 'recuperar', 'nova-senha'];
  var TITULOS = { login: 'Entrar', cadastro: 'Criar conta', recuperar: 'Recuperar senha', 'nova-senha': 'Nova senha' };
  var appIniciado = false;
  var recuperando = false; // true enquanto a pessoa define a nova senha (veio do link do e-mail)

  /* ---------- carrega o app (só depois do login) ---------- */
  function carrega(src) {
    return new Promise(function (ok, falha) {
      var s = document.createElement('script');
      // versão de arquivo único: o código vem embutido em <script type="text/plain" data-src="...">
      var embutido = document.querySelector('script[type="text/plain"][data-src="' + src + '"]');
      if (embutido) { s.text = embutido.textContent; document.body.appendChild(s); ok(); return; }
      s.src = src;
      s.onload = ok;
      s.onerror = function () { falha(new Error('Não foi possível carregar ' + src)); };
      document.body.appendChild(s);
    });
  }
  function iniciaApp() {
    root.setAttribute('data-view', 'app');
    document.title = 'Vaylence — Controle Financeiro';
    if (history.replaceState && location.hash) history.replaceState(null, '', location.pathname + location.search);
    if (appIniciado) return;
    appIniciado = true;
    carrega('js/app.js?v=5').then(function () { return carrega('js/config.js?v=5'); })
      .catch(function (e) { console.error(e); });
  }

  /* ---------- telas de acesso ---------- */
  function paneDoHash() {
    var h = location.hash.replace('#', '');
    return ['login', 'cadastro', 'recuperar'].indexOf(h) > -1 ? h : 'login';
  }
  function mostraPane(nome, foco) {
    PANES.forEach(function (p) {
      var el = document.getElementById('pane-' + p);
      el.hidden = p !== nome;
    });
    document.title = TITULOS[nome] + ' — Vaylence';
    var pane = document.getElementById('pane-' + nome);
    pane.querySelectorAll('.au-msg').forEach(function (m) { m.textContent = ''; m.className = 'au-msg'; });
    pane.querySelectorAll('input[aria-invalid]').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    var auth = document.getElementById('auth');
    if (auth) auth.scrollTop = 0;
    if (foco) { var i = pane.querySelector('input'); if (i) i.focus({ preventScroll: true }); }
  }

  function msg(form, texto, tipo) {
    var m = form.querySelector('.au-msg');
    m.textContent = texto || '';
    m.className = 'au-msg' + (tipo ? ' ' + tipo : '');
  }
  function marca(form, nomes) {
    form.querySelectorAll('input').forEach(function (i) { i.removeAttribute('aria-invalid'); });
    (nomes || []).forEach(function (n) { form.elements[n].setAttribute('aria-invalid', 'true'); });
    if (nomes && nomes.length) form.elements[nomes[0]].focus();
  }
  function ocupado(form, sim, texto) {
    var b = form.querySelector('.au-btn');
    b.disabled = sim;
    if (sim) { b.dataset.txt = b.textContent; b.textContent = texto; }
    else if (b.dataset.txt) b.textContent = b.dataset.txt;
  }
  function erroTxt(e) { return e && e.userMessage ? e.userMessage : 'Algo deu errado. Tente novamente.'; }

  function ligaFormularios() {
    // olho de mostrar/ocultar senha
    document.querySelectorAll('[data-toggle-pass]').forEach(function (b) {
      b.addEventListener('click', function () {
        var input = b.parentNode.querySelector('input');
        var mostrar = input.type === 'password';
        input.type = mostrar ? 'text' : 'password';
        b.setAttribute('aria-pressed', mostrar ? 'true' : 'false');
        b.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
      });
    });

    // LOGIN
    var fl = document.getElementById('form-login');
    fl.addEventListener('submit', function (ev) {
      ev.preventDefault();
      msg(fl, '');
      var id = fl.elements.identificador.value, senha = fl.elements.senha.value;
      if (!id.trim() || !senha) {
        marca(fl, [!id.trim() ? 'identificador' : 'senha']);
        return msg(fl, 'Preencha e-mail/usuário e senha.', 'err');
      }
      marca(fl, []);
      ocupado(fl, true, 'Entrando…');
      Auth.login(id, senha, fl.elements.lembrar.checked).then(function () {
        fl.reset();
        ocupado(fl, false);
        iniciaApp();
      }).catch(function (e) { ocupado(fl, false); marca(fl, ['identificador', 'senha']); msg(fl, erroTxt(e), 'err'); });
    });

    // CADASTRO
    var fc = document.getElementById('form-cadastro');
    fc.addEventListener('submit', function (ev) {
      ev.preventDefault();
      msg(fc, '');
      var e = fc.elements;
      var apelido = e.apelido.value.trim(), email = e.email.value.trim(), s1 = e.senha.value, s2 = e.senha2.value;
      if (apelido.length < 2) { marca(fc, ['apelido']); return msg(fc, 'Informe um apelido com pelo menos 2 caracteres.', 'err'); }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { marca(fc, ['email']); return msg(fc, 'Digite um e-mail válido.', 'err'); }
      if (s1.length < 6) { marca(fc, ['senha']); return msg(fc, 'A senha precisa ter pelo menos 6 caracteres.', 'err'); }
      if (s1 !== s2) { marca(fc, ['senha2']); return msg(fc, 'As senhas não são iguais.', 'err'); }
      marca(fc, []);
      ocupado(fc, true, 'Criando conta…');
      Auth.register({ apelido: apelido, email: email, senha: s1 }).then(function (r) {
        ocupado(fc, false);
        if (r && r.precisaConfirmar) {
          fc.reset();
          msg(fc, 'Conta criada! Enviamos um link de confirmação para o seu e-mail. Confirme e depois entre.', 'ok');
          return;
        }
        fc.reset();
        iniciaApp();
      }).catch(function (er) { ocupado(fc, false); msg(fc, erroTxt(er), 'err'); });
    });

    // RECUPERAR SENHA
    var fr = document.getElementById('form-recuperar');
    fr.addEventListener('submit', function (ev) {
      ev.preventDefault();
      msg(fr, '');
      ocupado(fr, true, 'Enviando…');
      Auth.recoverPassword(fr.elements.email.value).then(function () {
        ocupado(fr, false);
        msg(fr, 'Se esse e-mail tiver cadastro, você receberá as instruções em instantes.', 'ok');
      }).catch(function (e) { ocupado(fr, false); marca(fr, ['email']); msg(fr, erroTxt(e), 'err'); });
    });

    // NOVA SENHA (depois do link do e-mail)
    var fn = document.getElementById('form-nova-senha');
    fn.addEventListener('submit', function (ev) {
      ev.preventDefault();
      msg(fn, '');
      var a = fn.elements.senha.value, b = fn.elements.senha2.value;
      if (a.length < 6) { marca(fn, ['senha']); return msg(fn, 'A senha precisa ter pelo menos 6 caracteres.', 'err'); }
      if (a !== b) { marca(fn, ['senha2']); return msg(fn, 'As senhas não são iguais.', 'err'); }
      marca(fn, []);
      ocupado(fn, true, 'Salvando…');
      Auth.setNewPassword(a).then(function () {
        recuperando = false;
        fn.reset();
        ocupado(fn, false);
        iniciaApp();
      }).catch(function (e) { ocupado(fn, false); msg(fn, erroTxt(e), 'err'); });
    });
  }

  /* ---------- vídeo: só em telas grandes (no celular nem é baixado) ---------- */
  var larga = window.matchMedia('(min-width: 901px)');
  function ajustaVideo() {
    var v = document.querySelector('.au-media video');
    if (!v) return;
    if (larga.matches) {
      if (!v.getAttribute('src')) v.src = v.dataset.src;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    } else {
      v.pause();
    }
  }
  if (larga.addEventListener) larga.addEventListener('change', ajustaVideo);

  /* ---------- início ---------- */
  function mostraAcesso(nome, foco) { root.setAttribute('data-view', 'auth'); mostraPane(nome, foco); }
  function entraRecuperacao() {
    recuperando = true;
    mostraAcesso('nova-senha', true);
  }

  ajustaVideo();
  ligaFormularios();
  window.addEventListener('hashchange', function () {
    if (root.getAttribute('data-view') === 'auth' && !recuperando) mostraPane(paneDoHash(), true);
  });
  Auth.onRecovery(entraRecuperacao);
  Auth.onSignedOut(function () { if (root.getAttribute('data-view') === 'app') location.reload(); });

  if (!Auth.configurado) {
    mostraAcesso(paneDoHash(), false);
    msg(document.getElementById('form-login'), 'O banco de dados ainda não foi configurado (js/supabase-config.js).', 'err');
  } else {
    Auth.init().then(function (user) {
      if (Auth.inRecovery()) return entraRecuperacao();
      if (user) return iniciaApp();
      var erroLink = Auth.urlError();
      if (erroLink) {
        if (history.replaceState) history.replaceState(null, '', location.pathname + '#recuperar');
        mostraAcesso('recuperar', false);
        msg(document.getElementById('form-recuperar'), erroLink, 'err');
      } else {
        mostraAcesso(paneDoHash(), false);
      }
    });
  }
})();
