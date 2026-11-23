/* =====================================================================
   FinançasPro — Configurações (painel que sobe, lista e telas internas)
   + saudação "Olá, apelido".
   Tudo de conta passa pelo objeto Auth (js/api.js), que depois será
   ligado ao banco de dados (Supabase).
   ===================================================================== */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var painel = $('cfg'), overlay = $('cfg-overlay');
  var user = null, pilha = ['home'], abertoPor = null;

  var TITULOS = { home: 'Configurações', tema: 'Tema', apelido: 'Apelido', email: 'E-mail', senha: 'Alterar senha', sair: 'Sair da conta', excluir: 'Excluir conta' };
  var TEMAS = { auto: 'Automático', light: 'Claro', dark: 'Escuro' };

  function erroTxt(e) { return e && e.userMessage ? e.userMessage : 'Algo deu errado. Tente novamente.'; }
  function msg(id, texto, tipo) { var el = $(id); el.textContent = texto || ''; el.className = 'cfg-msg' + (tipo ? ' ' + tipo : ''); }
  function ocupado(form, sim) { form.querySelectorAll('button[type="submit"]').forEach(function (b) { b.disabled = sim; }); }
  function aviso(t) { if (window.notify) window.notify(t); }

  /* ---------- dados do usuário na tela ---------- */
  function pinta() {
    if (!user) return;
    var nick = user.apelido || '';
    $('user-nick').textContent = nick;
    $('cfg-avatar').textContent = (nick.charAt(0) || '?').toUpperCase();
    $('nav-avatar').textContent = (nick.charAt(0) || '?').toUpperCase();
    $('nav-nome').textContent = nick;
    $('nav-mail').textContent = user.email || '';
    $('cfg-pname').textContent = nick;
    $('cfg-pmail').textContent = user.email;
    $('cfg-v-apelido').textContent = nick;
    $('cfg-v-email').textContent = user.email;
    $('cfg-email').value = user.email;
    if (document.activeElement !== $('cfg-apelido')) $('cfg-apelido').value = nick;
    pintaTema();
    pintaExclusao();
  }
  function pintaTema() {
    var t = temaAtual();
    $('cfg-v-tema').textContent = TEMAS[t];
    document.querySelectorAll('[data-tema]').forEach(function (b) {
      b.setAttribute('aria-checked', b.dataset.tema === t ? 'true' : 'false');
    });
  }
  function pintaExclusao() {
    var pendente = !!(user && user.exclusaoSolicitadaEm);
    $('cfg-del-idle').hidden = pendente;
    $('cfg-del-pendente').hidden = !pendente;
    if (pendente) {
      var d = new Date(user.exclusaoSolicitadaEm);
      $('cfg-del-pendente-txt').textContent = 'Pedido de exclusão enviado em ' + d.toLocaleDateString('pt-BR') + '. Ele está aguardando processamento.';
    }
  }

  /* ---------- navegação entre as telas do painel ---------- */
  function desenha() {
    var atual = pilha[pilha.length - 1];
    document.querySelectorAll('.cfg-screen').forEach(function (s) {
      var n = s.dataset.screen, ativa = n === atual;
      s.classList.toggle('is-active', ativa);
      s.classList.toggle('is-prev', !ativa && pilha.indexOf(n) > -1);
      s.setAttribute('aria-hidden', ativa ? 'false' : 'true');
      if ('inert' in s) s.inert = !ativa;
    });
    $('cfg-title').textContent = TITULOS[atual];
    var voltar = $('cfg-back'), temVoltar = pilha.length > 1;
    voltar.style.visibility = temVoltar ? 'visible' : 'hidden';
    voltar.disabled = !temVoltar;
    $('cfg-stage').scrollTop = 0;
  }
  function vai(nome) {
    pilha.push(nome);
    desenha();
    if (nome === 'apelido' || nome === 'senha') {
      setTimeout(function () { var i = document.querySelector('.cfg-screen.is-active input:not([readonly])'); if (i) i.focus({ preventScroll: true }); }, 420);
    }
  }
  function volta() {
    if (pilha.length > 1) { pilha.pop(); desenha(); }
  }

  /* ---------- abrir / fechar ---------- */
  function limpaSensiveis() {
    ['cfg-form-senha', 'cfg-form-excluir'].forEach(function (id) { $(id).reset(); });
    ['cfg-msg-apelido', 'cfg-msg-senha', 'cfg-msg-del'].forEach(function (id) { msg(id, ''); });
  }
  function abrir() {
    abertoPor = document.activeElement;
    pilha = ['home'];
    limpaSensiveis();
    desenha();
    pintaTema();
    overlay.classList.add('open');
    painel.classList.add('open');
    painel.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    setTimeout(function () { $('cfg-close').focus({ preventScroll: true }); }, 50);
    Auth.currentUser().then(function (u) { if (u) { user = u; pinta(); } });
  }
  function fechar() {
    overlay.classList.remove('open');
    painel.classList.remove('open');
    painel.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    limpaSensiveis();
    if (abertoPor && abertoPor.focus) abertoPor.focus({ preventScroll: true });
    setTimeout(function () { pilha = ['home']; desenha(); }, 500);
  }
  window.abrirConfig = abrir;
  window.fecharConfig = fechar;

  overlay.addEventListener('click', fechar);
  $('cfg-close').addEventListener('click', fechar);
  $('cfg-back').addEventListener('click', volta);
  document.querySelectorAll('[data-go]').forEach(function (b) { b.addEventListener('click', function () { vai(b.dataset.go); }); });
  document.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', volta); });

  document.addEventListener('keydown', function (e) {
    if (!painel.classList.contains('open')) return;
    if (e.key === 'Escape') { fechar(); return; }
    if (e.key === 'Tab') { // mantém o foco dentro do painel
      var itens = Array.prototype.filter.call(
        painel.querySelectorAll('button, input:not([readonly]), a[href]'),
        function (el) { return !el.disabled && el.offsetParent !== null && !el.closest('.cfg-screen:not(.is-active)') && !el.closest('[hidden]'); }
      );
      if (!itens.length) return;
      var primeiro = itens[0], ultimo = itens[itens.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    }
  });

  /* ---------- arrastar para baixo para fechar (celular) ---------- */
  var arrasto = null, celular = window.matchMedia('(max-width: 768px)');
  var topo = $('cfg-top'), alca = painel.querySelector('.cfg-grab');
  function ini(e) {
    if (!celular.matches || e.touches.length !== 1) return;
    arrasto = { y: e.touches[0].clientY, dy: 0 };
    painel.style.transition = 'none';
  }
  function mov(e) {
    if (!arrasto) return;
    arrasto.dy = Math.max(0, e.touches[0].clientY - arrasto.y);
    painel.style.transform = 'translateY(' + arrasto.dy + 'px)';
  }
  function fim() {
    if (!arrasto) return;
    var dy = arrasto.dy; arrasto = null;
    painel.style.transition = '';
    if (dy > 110) {
      painel.style.transform = 'translateY(105%)';
      fechar();
      setTimeout(function () { painel.style.transform = ''; }, 520);
    } else {
      painel.style.transform = '';
    }
  }
  [topo, alca].forEach(function (el) {
    el.addEventListener('touchstart', ini, { passive: true });
    el.addEventListener('touchmove', mov, { passive: true });
    el.addEventListener('touchend', fim);
    el.addEventListener('touchcancel', fim);
  });

  /* ---------- tema ---------- */
  document.querySelectorAll('[data-tema]').forEach(function (b) {
    b.addEventListener('click', function () {
      aplicaTema(b.dataset.tema);
      pintaTema();
      Auth.updateTheme(b.dataset.tema).catch(function () {});
    });
  });

  /* ---------- apelido ---------- */
  $('cfg-form-apelido').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.currentTarget;
    msg('cfg-msg-apelido', '');
    ocupado(f, true);
    Auth.updateNickname($('cfg-apelido').value).then(function (u) {
      user = u; pinta();
      aviso('Apelido atualizado!');
      volta();
    }).catch(function (e) { msg('cfg-msg-apelido', erroTxt(e), 'err'); })
      .then(function () { ocupado(f, false); });
  });

  /* ---------- senha ---------- */
  $('cfg-form-senha').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.currentTarget;
    var atual = $('cfg-senha-atual').value, nova = $('cfg-senha-nova').value, nova2 = $('cfg-senha-nova2').value;
    msg('cfg-msg-senha', '');
    if (!atual) return msg('cfg-msg-senha', 'Digite sua senha atual.', 'err');
    if (nova.length < 6) return msg('cfg-msg-senha', 'A nova senha precisa ter pelo menos 6 caracteres.', 'err');
    if (nova !== nova2) return msg('cfg-msg-senha', 'As novas senhas não são iguais.', 'err');
    ocupado(f, true);
    Auth.changePassword(atual, nova).then(function () {
      f.reset();
      aviso('Senha alterada!');
      volta();
    }).catch(function (e) { msg('cfg-msg-senha', erroTxt(e), 'err'); })
      .then(function () { ocupado(f, false); });
  });

  /* ---------- sair ---------- */
  $('cfg-sair').addEventListener('click', function () {
    Auth.logout().then(function () {
      if (history.replaceState) history.replaceState(null, '', location.pathname + '#login');
      location.reload();
    });
  });

  /* ---------- excluir conta (pedido) ---------- */
  $('cfg-form-excluir').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var f = ev.currentTarget;
    msg('cfg-msg-del', '');
    if (!$('cfg-del-senha').value) return msg('cfg-msg-del', 'Digite sua senha para confirmar.', 'err');
    ocupado(f, true);
    Auth.requestAccountDeletion($('cfg-del-senha').value).then(function (r) {
      user.exclusaoSolicitadaEm = r.exclusaoSolicitadaEm;
      f.reset();
      pintaExclusao();
      aviso('Pedido de exclusão enviado.');
    }).catch(function (e) { msg('cfg-msg-del', erroTxt(e), 'err'); })
      .then(function () { ocupado(f, false); });
  });
  $('cfg-del-desfazer').addEventListener('click', function () {
    Auth.cancelAccountDeletion().then(function () {
      delete user.exclusaoSolicitadaEm;
      pintaExclusao();
      aviso('Pedido de exclusão cancelado.');
      volta();
    });
  });

  /* ---------- botão de configurações no celular: some ao rolar para baixo, volta ao rolar para cima ---------- */
  var botaoTopo = document.querySelector('.gnav-right'), ultimoY = window.pageYOffset, esperando = false;
  window.addEventListener('scroll', function () {
    if (esperando || !botaoTopo) return;
    esperando = true;
    window.requestAnimationFrame(function () {
      var y = window.pageYOffset, desce = y > ultimoY + 6, sobe = y < ultimoY - 6;
      if (y < 80 || sobe) botaoTopo.classList.remove('is-hidden');
      else if (desce) botaoTopo.classList.add('is-hidden');
      if (desce || sobe) ultimoY = y;
      esperando = false;
    });
  }, { passive: true });

  /* ---------- início ---------- */
  desenha();
  Auth.currentUser().then(function (u) {
    if (!u) { Auth.logout().then(function () { location.reload(); }); return; }
    user = u;
    // o tema escolhido na conta vale em qualquer aparelho
    if (u.tema && u.tema !== temaAtual()) aplicaTema(u.tema);
    pinta();
  });
})();
