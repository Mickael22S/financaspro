/* =====================================================================
   FinançasPro — camada de acesso ao Supabase (api.js)

   ÚNICO ponto de contato entre o site e o banco de dados.
     Auth  -> conta: cadastro, login, recuperar senha, perfil, tema, exclusão
     Data  -> receitas, gastos, dívidas (parcelas) e metas (+ foto de capa)

   As chaves ficam em js/supabase-config.js. O SQL está em
   banco-de-dados/financaspro-supabase.sql (entregue separado do site).
   ===================================================================== */
(function (global) {
  'use strict';

  var CFG = global.FP_SUPABASE || {};
  var configurado = !!(CFG.url && CFG.anonKey && !/SEU-PROJETO|COLE_AQUI/.test(CFG.url + CFG.anonKey) && global.supabase);
  var K_LEMBRAR = 'fp_lembrar';
  var BUCKET = 'metas-capas';

  function fail(msg) { var e = new Error(msg); e.userMessage = msg; return e; }
  function norm(s) { return String(s || '').trim().toLowerCase(); }
  function base() { return location.origin + location.pathname; }
  function uuid() {
    if (global.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  /* ---------- "Lembrar de mim": sessão no localStorage (lembra) ou sessionStorage (some ao fechar) ---------- */
  function lembrar() { try { return localStorage.getItem(K_LEMBRAR) !== '0'; } catch (e) { return true; } }
  function setLembrar(v) { try { localStorage.setItem(K_LEMBRAR, v ? '1' : '0'); } catch (e) {} }
  function safe(fn) { try { return fn(); } catch (e) { return null; } }
  var storage = {
    getItem: function (k) { var v = safe(function () { return sessionStorage.getItem(k); }); return v !== null && v !== undefined ? v : safe(function () { return localStorage.getItem(k); }); },
    setItem: function (k, v) {
      var uso = lembrar() ? localStorage : sessionStorage, outro = lembrar() ? sessionStorage : localStorage;
      safe(function () { uso.setItem(k, v); }); safe(function () { outro.removeItem(k); });
    },
    removeItem: function (k) { safe(function () { sessionStorage.removeItem(k); }); safe(function () { localStorage.removeItem(k); }); }
  };

  /* ---------- cliente ---------- */
  var sb = configurado ? global.supabase.createClient(CFG.url, CFG.anonKey, {
    auth: { storage: storage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }) : null;

  function precisa() { if (!sb) throw fail('O banco de dados ainda não foi configurado. Preencha js/supabase-config.js.'); return sb; }

  /* ---------- recuperação de senha / links do e-mail ---------- */
  var hash0 = location.hash || '';
  var recuperando = /type=recovery/.test(hash0);
  var cbRecuperacao = null, cbSaiu = null;
  if (sb) {
    sb.auth.onAuthStateChange(function (ev) {
      if (ev === 'PASSWORD_RECOVERY') { recuperando = true; if (cbRecuperacao) setTimeout(cbRecuperacao, 0); }
      if (ev === 'SIGNED_OUT' && cbSaiu) setTimeout(cbSaiu, 0);
    });
  }
  function erroDaUrl() {
    var m = /error_description=([^&]+)/.exec(hash0), c = /error_code=([^&]+)/.exec(hash0);
    if (!m && !c) return null;
    if (c && /otp_expired/.test(c[1])) return 'Esse link expirou ou já foi usado. Peça um novo.';
    return 'Não foi possível validar o link do e-mail. Peça um novo.';
  }

  /* ---------- tradução de erros ---------- */
  function traduz(err) {
    if (!err) return fail('Algo deu errado. Tente novamente.');
    var m = String(err.message || err), code = err.code || '', st = err.status;
    if (/Invalid login credentials/i.test(m)) return fail('E-mail/usuário ou senha incorretos.');
    if (/Email not confirmed/i.test(m)) return fail('Confirme seu e-mail antes de entrar. Veja sua caixa de entrada.');
    if (/already registered|already been registered/i.test(m)) return fail('Já existe uma conta com esse e-mail.');
    if (/Password should be at least/i.test(m)) return fail('A senha precisa ter pelo menos 6 caracteres.');
    if (/different from the old/i.test(m)) return fail('A nova senha precisa ser diferente da atual.');
    if (/rate limit|too many|over_.*_rate_limit|security purposes/i.test(m + code) || st === 429) return fail('Muitas tentativas seguidas. Aguarde um minuto e tente de novo.');
    if (/session missing|not authenticated|JWT/i.test(m)) return fail('Sessão expirada. Entre novamente.');
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return fail('Sem conexão com o servidor. Verifique sua internet.');
    if (/Database error saving new user/i.test(m)) return fail('Não foi possível criar a conta. O apelido ou o e-mail já pode estar em uso.');
    if (code === '23505') return fail('Esse apelido já está em uso. Escolha outro.');
    if (code === '23514') return fail('Algum valor informado é inválido.');
    if (err.userMessage) return err;
    return fail('Algo deu errado. Tente novamente.');
  }
  function ok(res) { if (res && res.error) throw traduz(res.error); return res ? res.data : null; }
  function q(p) { return Promise.resolve(p).then(ok, function (e) { throw traduz(e); }); }

  function validaSenha(s) { if (!s || s.length < 6) throw fail('A senha precisa ter pelo menos 6 caracteres.'); }
  function validaApelido(a) {
    a = String(a || '').trim();
    if (a.length < 2) throw fail('O apelido precisa ter pelo menos 2 caracteres.');
    if (a.length > 24) throw fail('O apelido pode ter no máximo 24 caracteres.');
    return a;
  }
  function validaEmail(e) {
    e = norm(e);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw fail('Digite um e-mail válido.');
    return e;
  }

  function sessaoGuardada() {
    function acha(st) {
      try {
        for (var i = 0; i < st.length; i++) {
          var k = st.key(i);
          if (/^sb-.*-auth-token$/.test(k)) { var v = JSON.parse(st.getItem(k)); if (v && (v.access_token || v.refresh_token)) return true; }
        }
      } catch (e) {}
      return false;
    }
    return acha(localStorage) || acha(sessionStorage);
  }
  function usuarioDaSessao() {
    return precisa().auth.getSession().then(function (r) { return r.data && r.data.session ? r.data.session.user : null; });
  }
  function perfil(u) {
    return Promise.resolve(sb.from('profiles').select('apelido,email,tema,exclusao_solicitada_em').eq('id', u.id).maybeSingle()).then(function (r) {
      var p = r && r.data;
      var meta = u.user_metadata || {};
      return {
        id: u.id,
        apelido: p ? p.apelido : (meta.apelido || (u.email || '').split('@')[0]),
        email: p ? p.email : u.email,
        tema: p ? p.tema : null,
        exclusaoSolicitadaEm: p ? p.exclusao_solicitada_em : null
      };
    });
  }
  function reautentica(senha) {
    return usuarioDaSessao().then(function (u) {
      if (!u) throw fail('Sessão expirada. Entre novamente.');
      return sb.auth.signInWithPassword({ email: u.email, password: senha || '' }).then(function (r) {
        if (r.error) throw fail('A senha atual está incorreta.');
        return u;
      });
    });
  }

  /* ===================== CONTA ===================== */
  var Auth = {
    configurado: configurado,

    /** Síncrono: há sessão guardada neste navegador? (só decide qual tela mostrar primeiro) */
    isLoggedIn: function () { return configurado && sessaoGuardada(); },

    /** Valida a sessão de verdade (renova o token se preciso). Resolve com o usuário ou null. */
    init: function () {
      if (!sb) return Promise.resolve(null);
      return sb.auth.getSession().then(function (r) { return r.data && r.data.session ? r.data.session.user : null; }, function () { return null; });
    },
    inRecovery: function () { return recuperando; },
    onRecovery: function (fn) { cbRecuperacao = fn; },
    onSignedOut: function (fn) { cbSaiu = fn; },
    urlError: erroDaUrl,

    currentUser: function () {
      if (!sb) return Promise.resolve(null);
      return usuarioDaSessao().then(function (u) { return u ? perfil(u) : null; }).catch(function () { return null; });
    },

    register: function (d) {
      return Promise.resolve().then(function () {
        var apelido = validaApelido(d.apelido), email = validaEmail(d.email);
        validaSenha(d.senha);
        precisa();
        return sb.rpc('apelido_disponivel', { p_apelido: apelido }).then(function (r) {
          if (r.error) throw traduz(r.error);
          if (r.data === false) throw fail('Esse apelido já está em uso. Escolha outro.');
          setLembrar(true);
          return sb.auth.signUp({ email: email, password: d.senha, options: { data: { apelido: apelido }, emailRedirectTo: base() } });
        }).then(function (r) {
          if (r.error) throw traduz(r.error);
          var u = r.data.user;
          // e-mail já cadastrado: o Supabase devolve um usuário "vazio" (sem identities)
          if (u && u.identities && u.identities.length === 0) throw fail('Já existe uma conta com esse e-mail.');
          if (!r.data.session) return { precisaConfirmar: true };
          return { precisaConfirmar: false };
        }, function (e) { throw traduz(e); });
      });
    },

    login: function (identificador, senha, lembrarDeMim) {
      return Promise.resolve().then(function () {
        var id = norm(identificador);
        if (!id || !senha) throw fail('Preencha e-mail/usuário e senha.');
        precisa();
        var emailP = id.indexOf('@') > -1 ? Promise.resolve(id)
          : sb.rpc('email_por_identificador', { p_identificador: id }).then(function (r) { if (r.error) throw traduz(r.error); return r.data; });
        return emailP.then(function (email) {
          if (!email) throw fail('E-mail/usuário ou senha incorretos.');
          setLembrar(!!lembrarDeMim);
          return sb.auth.signInWithPassword({ email: email, password: senha });
        }).then(function (r) { if (r.error) throw traduz(r.error); return r.data.user; }, function (e) { throw traduz(e); });
      });
    },

    logout: function () {
      if (!sb) return Promise.resolve();
      return sb.auth.signOut().catch(function () {});
    },

    /** Envia o e-mail de recuperação. Responde igual exista ou não a conta. */
    recoverPassword: function (email) {
      return Promise.resolve().then(function () {
        email = validaEmail(email); precisa();
        return sb.auth.resetPasswordForEmail(email, { redirectTo: base() });
      }).then(function (r) {
        if (r && r.error && (r.error.status === 429 || /rate limit|security purposes/i.test(r.error.message))) throw traduz(r.error);
        return { ok: true }; // outros erros não são revelados (evita descobrir quem tem conta)
      }, function (e) { throw traduz(e); });
    },

    /** Define a nova senha depois do link do e-mail. */
    setNewPassword: function (nova) {
      return Promise.resolve().then(function () {
        validaSenha(nova); precisa();
        return sb.auth.updateUser({ password: nova });
      }).then(function (r) { if (r.error) throw traduz(r.error); recuperando = false; return { ok: true }; }, function (e) { throw traduz(e); });
    },

    updateNickname: function (novo) {
      return Promise.resolve().then(function () {
        var apelido = validaApelido(novo); precisa();
        return usuarioDaSessao().then(function (u) {
          if (!u) throw fail('Sessão expirada. Entre novamente.');
          return sb.from('profiles').update({ apelido: apelido }).eq('id', u.id).select('id');
        }).then(function (r) {
          if (r.error) throw traduz(r.error);
          if (!r.data || !r.data.length) throw fail('Não foi possível salvar o apelido.');
          return Auth.currentUser();
        });
      });
    },

    updateTheme: function (tema) {
      return Promise.resolve().then(function () {
        if (['auto', 'light', 'dark'].indexOf(tema) < 0) throw fail('Tema inválido.');
        if (!sb) return { ok: true };
        return usuarioDaSessao().then(function (u) {
          if (!u) throw fail('Sessão expirada. Entre novamente.');
          return sb.from('profiles').update({ tema: tema }).eq('id', u.id);
        }).then(function (r) { if (r.error) throw traduz(r.error); return { ok: true }; });
      });
    },

    changePassword: function (senhaAtual, novaSenha) {
      return Promise.resolve().then(function () {
        validaSenha(novaSenha); precisa();
        return reautentica(senhaAtual);
      }).then(function () { return sb.auth.updateUser({ password: novaSenha }); })
        .then(function (r) { if (r.error) throw traduz(r.error); return { ok: true }; }, function (e) { throw traduz(e); });
    },

    requestAccountDeletion: function (senha) {
      return Promise.resolve().then(function () { precisa(); return reautentica(senha); }).then(function () {
        return sb.rpc('solicitar_exclusao_conta');
      }).then(function (r) { if (r.error) throw traduz(r.error); return { ok: true, exclusaoSolicitadaEm: r.data }; }, function (e) { throw traduz(e); });
    },

    cancelAccountDeletion: function () {
      return Promise.resolve().then(function () { precisa(); return sb.rpc('cancelar_exclusao_conta'); })
        .then(function (r) { if (r.error) throw traduz(r.error); return { ok: true }; }, function (e) { throw traduz(e); });
    }
  };

  /* ===================== DADOS ===================== */
  function rReceita(r) { return { id: r.id, desc: r.descricao, valor: +r.valor, cat: r.categoria, data: r.data, criadoEm: r.criado_em }; }
  function rGasto(r) { return rReceita(r); }
  function rDivida(d) {
    return { id: d.id, grupoId: d.grupo_id, numParcela: d.num_parcela, totalParcelas: d.total_parcelas, desc: d.descricao,
      valorParcela: +d.valor_parcela, valorTotal: +d.valor_total, banco: d.banco, venc: d.vencimento, status: d.status, criadoEm: d.criado_em };
  }
  function rMeta(m) {
    return { id: m.id, titulo: m.titulo, alvo: +m.alvo, meses: m.meses, guardado: +m.guardado, inicio: m.inicio, capaPath: m.capa_path, capa: '', criadoEm: m.criado_em };
  }

  /** Lê a tabela inteira em páginas (o Supabase devolve no máximo 1000 linhas por chamada). */
  function tudo(tabela, ordem) {
    var out = [], passo = 1000;
    function pega(de) {
      return Promise.resolve(sb.from(tabela).select('*').order(ordem, { ascending: true }).order('id', { ascending: true }).range(de, de + passo - 1)).then(function (r) {
        var lin = ok(r) || [];
        out = out.concat(lin);
        return lin.length === passo ? pega(de + passo) : out;
      });
    }
    return pega(0);
  }
  function assinaCapas(metas) {
    var com = metas.filter(function (m) { return m.capaPath; });
    if (!com.length) return Promise.resolve(metas);
    return Promise.resolve(sb.storage.from(BUCKET).createSignedUrls(com.map(function (m) { return m.capaPath; }), 86400)).then(function (r) {
      (r.data || []).forEach(function (x, i) { if (x && x.signedUrl) com[i].capa = x.signedUrl; });
      return metas;
    }, function () { return metas; });
  }

  var Data = {
    loadAll: function () {
      return Promise.resolve().then(function () {
        precisa();
        return Promise.all([tudo('receitas', 'criado_em'), tudo('dividas', 'criado_em'), tudo('gastos', 'criado_em'), tudo('metas', 'criado_em')]);
      }).then(function (r) {
        return assinaCapas(r[3].map(rMeta)).then(function (metas) {
          return { receitas: r[0].map(rReceita), dividas: r[1].map(rDivida), gastos: r[2].map(rGasto), metas: metas };
        });
      }, function (e) { throw traduz(e); });
    },

    addReceita: function (x) {
      return q(precisa().from('receitas').insert({ descricao: x.desc, valor: x.valor, categoria: x.cat, data: x.data }).select().single()).then(rReceita);
    },
    addGasto: function (x) {
      return q(precisa().from('gastos').insert({ descricao: x.desc, valor: x.valor, categoria: x.cat, data: x.data }).select().single()).then(rGasto);
    },
    /** parcelas: [{numParcela,totalParcelas,desc,valorParcela,valorTotal,banco,venc,status}] — todas da mesma dívida */
    addDividas: function (parcelas) {
      var grupo = uuid();
      var linhas = parcelas.map(function (p) {
        return { grupo_id: grupo, num_parcela: p.numParcela, total_parcelas: p.totalParcelas, descricao: p.desc,
          valor_parcela: p.valorParcela, valor_total: p.valorTotal, banco: p.banco, vencimento: p.venc, status: p.status };
      });
      return q(precisa().from('dividas').insert(linhas).select()).then(function (rows) { return rows.map(rDivida); });
    },
    remove: function (tabela, id) { return q(precisa().from(tabela).delete().eq('id', id)); },
    removeGrupoDivida: function (grupoId) { return q(precisa().from('dividas').delete().eq('grupo_id', grupoId)); },
    quitarParcela: function (id) { return q(precisa().from('dividas').update({ status: 'quitada' }).eq('id', id)); },

    addMeta: function (m, capaBlob) {
      precisa();
      var path = null;
      return usuarioDaSessao().then(function (u) {
        if (!u) throw fail('Sessão expirada. Entre novamente.');
        if (!capaBlob) return null;
        path = u.id + '/' + uuid() + '.jpg';
        return sb.storage.from(BUCKET).upload(path, capaBlob, { contentType: 'image/jpeg', upsert: false }).then(function (r) {
          if (r.error) { path = null; return 'erro-capa'; }
          return null;
        });
      }).then(function (flag) {
        return Promise.resolve(sb.from('metas').insert({ titulo: m.titulo, alvo: m.alvo, meses: m.meses, guardado: m.guardado, inicio: m.inicio, capa_path: path }).select().single()).then(function (r) {
          if (r.error) { if (path) sb.storage.from(BUCKET).remove([path]); throw traduz(r.error); }
          var meta = rMeta(r.data);
          meta.capaFalhou = flag === 'erro-capa';
          return assinaCapas([meta]).then(function (l) { return l[0]; });
        });
      }).catch(function (e) { throw traduz(e); });
    },
    setGuardado: function (id, valor) { return q(precisa().from('metas').update({ guardado: valor }).eq('id', id)); },
    removeMeta: function (m) {
      return q(precisa().from('metas').delete().eq('id', m.id)).then(function () {
        if (m.capaPath) sb.storage.from(BUCKET).remove([m.capaPath]).catch(function () {});
      });
    }
  };

  global.Auth = Auth;
  global.Data = Data;
})(window);
