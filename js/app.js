/* ============================================================
   app.js — interface, chat e regras do dia a dia
   ============================================================ */
(function () {
  'use strict';

  var S = window.RotinaStore;
  var N = window.RotinaNotify;
  var NLP = window.RotinaNLP;

  var st = null;
  var swReg = null;
  var vista = 'hoje';
  var diaCorrente = S.hoje();
  // preferência de expandir/colapsar divisão de treino — só de sessão, não salva no estado
  var divisaoAberta = {};

  // onboarding: número de hábitos ativos além do qual avisamos (sem bloquear)
  // durante a primeira semana de uso — quem cadastra 15 hábitos no dia 1
  // costuma falhar e desinstalar.
  var LIMITE_ONBOARDING = 3;
  function diasDeUso() {
    return Math.floor((Date.now() - new Date(st.criadoEm).getTime()) / 86400000);
  }
  function dentroOnboarding() {
    return diasDeUso() < 7;
  }
  function habitosAtivos() {
    return st.habitos.filter(function (h) {
      return h.ativo;
    }).length;
  }

  // XP / nível — 150 xp por nível, linear e sem balanceamento sofisticado
  var XP_POR_NIVEL = 150;
  function nivelDe(xp) {
    return Math.floor((xp || 0) / XP_POR_NIVEL) + 1;
  }
  function ganharXp(qtd) {
    st.xp = (st.xp || 0) + qtd;
  }

  /* ---------------- utilidades ---------------- */
  function $(s, r) {
    return (r || document).querySelector(s);
  }
  function $$(s, r) {
    return Array.prototype.slice.call((r || document).querySelectorAll(s));
  }
  function pad(n) {
    return String(n).padStart(2, '0');
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function hora(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function nomeDia(d) {
    return NLP.NOMES_DIA[d.getDay()];
  }
  function dataCurta(d) {
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1);
  }
  /** @param {number|number[]} [padrao] */
  function vibrar(padrao) {
    if (navigator.vibrate) {
      try {
        navigator.vibrate(padrao || 15);
      } catch (e) {
        /* ignora — nem todo navegador suporta */
      }
    }
  }

  var CORES_CONFETE = ['var(--accent)', 'var(--accent-2)', '#ffd166', '#ef476f', '#06d6a0'];
  function confete() {
    for (var i = 0; i < 16; i++) {
      var el = document.createElement('span');
      el.className = 'confete-item';
      el.style.left = Math.random() * 100 + 'vw';
      el.style.background = CORES_CONFETE[i % CORES_CONFETE.length];
      el.style.animationDelay = Math.random() * 0.25 + 's';
      el.style.animationDuration = 0.9 + Math.random() * 0.5 + 's';
      document.body.appendChild(el);
      (function (e) {
        setTimeout(function () {
          e.remove();
        }, 1600);
      })(el);
    }
  }

  // dispara vibração + confete só na transição pra 100% — não a cada clique
  /** @param {number} antes */
  function celebrarSeCompletou(antes) {
    if (antes < 100 && scoreDia() === 100) {
      vibrar([15, 60, 20]);
      confete();
    }
  }

  function hojeD() {
    var d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }
  /** @param {EventTarget} el @param {string} sel @returns {HTMLElement|null} */
  function alvo(el, sel) {
    return el instanceof Element ? /** @type {HTMLElement|null} */ (el.closest(sel)) : null;
  }

  var salvarTimer = null;
  function salvar(reRender) {
    clearTimeout(salvarTimer);
    salvarTimer = setTimeout(function () {
      S.salvar(st);
    }, 250);
    if (reRender !== false) render();
  }

  function reg(data) {
    return S.registroDe(st, data || S.hoje());
  }

  var brindeTimer = null;
  function brinde(msg) {
    var el = $('#brinde');
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(brindeTimer);
    brindeTimer = setTimeout(function () {
      el.classList.remove('on');
    }, 2200);
  }

  function abrirModal(html) {
    $('#modal-conteudo').innerHTML = html;
    $('#modal').classList.add('aberto');
    document.body.style.overflow = 'hidden';
  }
  function fecharModal() {
    $('#modal').classList.remove('aberto');
    document.body.style.overflow = '';
  }

  function diasLabel(dias) {
    if (!dias || !dias.length) return 'nenhum dia';
    if (dias.length === 7) return 'todos os dias';
    var s = dias.slice().sort().join(',');
    if (s === '1,2,3,4,5') return 'dias úteis';
    if (s === '0,6') return 'fim de semana';
    return dias
      .slice()
      .sort()
      .map(function (d) {
        return NLP.NOMES_DIA_CURTO[d];
      })
      .join(', ');
  }

  function recorrenciaLabel(rec) {
    if (!rec) return '';
    if (rec.tipo === 'diaria') return 'todo dia';
    var ds = (rec.dias || []).slice().sort();
    if (ds.length === 7) return 'todo dia';
    var s = ds.join(',');
    if (s === '1,2,3,4,5') return 'dias úteis';
    if (s === '0,6') return 'fim de semana';
    if (ds.length === 1)
      return (ds[0] === 0 || ds[0] === 6 ? 'todo ' : 'toda ') + NLP.NOMES_DIA[ds[0]];
    return (
      'toda ' +
      ds
        .map(function (d) {
          return NLP.NOMES_DIA_CURTO[d];
        })
        .join(', ')
    );
  }

  function plural(n, um, muitos) {
    return n + ' ' + (n === 1 ? um : muitos);
  }

  function seletorDias(dias, id) {
    return (
      '<div class="dias-semana" id="' +
      id +
      '">' +
      NLP.NOMES_DIA_CURTO.map(function (n, i) {
        return (
          '<button type="button" data-dia="' +
          i +
          '" class="' +
          (dias.indexOf(i) !== -1 ? 'on' : '') +
          '">' +
          n +
          '</button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function lerDias(id) {
    return $$('#' + id + ' button.on').map(function (b) {
      return +b.dataset.dia;
    });
  }

  /* ---------------- score do dia ---------------- */
  // null quando o dia não tinha nada previsto (hábito/meta/evento) — não é
  // "0% cumprido", é "não se aplica", e o histórico trata isso diferente.
  function scoreDoDia(d) {
    var r = st.registros[S.iso(d)] || {
        habitos: {},
        agua: 0,
        estudoMin: 0,
        treinos: [],
        eventosFeitos: []
      },
      total = 0,
      feito = 0;
    st.habitos.forEach(function (h) {
      if (!h.ativo || (h.dias || []).indexOf(d.getDay()) === -1) return;
      total++;
      if (r.habitos[h.id]) feito++;
    });
    if (st.config.metaAgua > 0) {
      total++;
      feito += Math.min(1, (r.agua || 0) / st.config.metaAgua);
    }
    if (st.config.metaEstudoMin > 0) {
      total++;
      feito += Math.min(1, (r.estudoMin || 0) / st.config.metaEstudoMin);
    }
    var divs = N.treinoDoDia(st, d);
    if (divs) {
      total++;
      if (r.treinos.length) feito++;
    }
    N.eventosDoDia(st, d).forEach(function (o) {
      total++;
      if (r.eventosFeitos.indexOf(o.ev.id) !== -1) feito++;
    });
    if (!total) return null;
    return Math.round((feito / total) * 100);
  }
  function scoreDia() {
    return scoreDoDia(hojeD()) || 0;
  }

  // Conta dias consecutivos cumpridos. Se hoje ainda não foi cumprido,
  // a sequência não quebra — começa a contagem por ontem. Um dia congelado
  // manualmente ou dentro de uma pausa (modo férias) conta como cumprido
  // mesmo sem registro real — é o que impede o streak de zerar por um
  // imprevisto pontual ou uma viagem avisada.
  function cumpriu(fn, d) {
    return fn(st.registros[S.iso(d)], d) || S.diaProtegido(st, S.iso(d));
  }
  function sequencia(fn) {
    var n = 0,
      d = hojeD();
    if (!cumpriu(fn, d)) d.setDate(d.getDate() - 1);
    for (var i = 0; i < 400; i++) {
      if (!cumpriu(fn, d)) break;
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }

  /* ---------------- cabeçalho ---------------- */
  var TITULOS = {
    hoje: 'Hoje',
    chat: 'Chat',
    treino: 'Treino',
    estudos: 'Estudos',
    agenda: 'Agenda',
    historico: 'Histórico'
  };
  function renderTopo() {
    $('#titulo-topo').textContent = TITULOS[vista] || 'Rotina';
    var d = new Date();
    $('#sub-topo').textContent =
      nomeDia(d).charAt(0).toUpperCase() +
      nomeDia(d).slice(1) +
      ', ' +
      d.getDate() +
      ' de ' +
      [
        'janeiro',
        'fevereiro',
        'março',
        'abril',
        'maio',
        'junho',
        'julho',
        'agosto',
        'setembro',
        'outubro',
        'novembro',
        'dezembro'
      ][d.getMonth()];
  }

  /* ---------------- vista: HOJE ---------------- */
  function renderHoje() {
    var d = hojeD(),
      r = reg();

    var h = new Date().getHours();
    var sauda = h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    $('#saudacao').textContent = sauda + (st.perfil.nome ? ', ' + st.perfil.nome : '');

    var s = scoreDia();
    var circ = 2 * Math.PI * 29;
    $('#anel-prog').setAttribute('stroke-dasharray', circ.toFixed(1));
    $('#anel-prog').setAttribute('stroke-dashoffset', (circ * (1 - s / 100)).toFixed(1));
    $('#anel-valor').textContent = s + '%';

    var nivel = nivelDe(st.xp);
    var xpNoNivel = (st.xp || 0) % XP_POR_NIVEL;
    $('#xp-info').textContent =
      '⭐ Nível ' + nivel + ' · ' + xpNoNivel + '/' + XP_POR_NIVEL + ' XP';

    // hábitos e metas (treino/estudo) ficam em listas separadas — juntar tudo
    // numa frase só deixava o "e mais N" ambíguo (hábito? meta? os dois?)
    var pendHabitos = [];
    st.habitos.forEach(function (hb) {
      if (hb.ativo && (hb.dias || []).indexOf(d.getDay()) !== -1 && !r.habitos[hb.id])
        pendHabitos.push(hb.nome);
    });
    var pendMetas = [];
    var divs = N.treinoDoDia(st, d);
    if (divs && !r.treinos.length) pendMetas.push('treino ' + divs[0].nome);
    if ((r.estudoMin || 0) < st.config.metaEstudoMin) pendMetas.push('estudo');

    var partes = [];
    if (pendHabitos.length) {
      partes.push(
        pendHabitos.slice(0, 3).join(', ') +
          (pendHabitos.length > 3 ? ' e mais ' + (pendHabitos.length - 3) : '')
      );
    }
    if (pendMetas.length) partes.push(pendMetas.join(', '));

    $('#resumo-dia').textContent = partes.length
      ? 'Falta: ' + partes.join(' · ')
      : 'Tudo em dia por aqui. 👏';

    // água
    var meta = st.config.metaAgua;
    $('#agua-n').textContent = (r.agua || 0) + ' ml';
    $('#agua-d').textContent = 'de ' + meta + ' ml';
    $('#agua-barra').style.width = Math.min(100, ((r.agua || 0) / meta) * 100) + '%';
    var copo = st.config.copoPadrao;
    $('#agua-chips').innerHTML =
      '<button class="chip forte" data-agua="' +
      copo +
      '">+ copo (' +
      copo +
      ' ml)</button>' +
      '<button class="chip" data-agua="500">+500 ml</button>' +
      '<button class="chip" data-agua="' +
      -copo +
      '" aria-label="Remover ' +
      copo +
      ' ml">−' +
      copo +
      ' ml</button>';

    // hábitos
    var lista = st.habitos.filter(function (hb) {
      return hb.ativo && (hb.dias || []).indexOf(d.getDay()) !== -1;
    });
    $('#lista-habitos').innerHTML = lista.length
      ? lista
          .map(function (hb) {
            var on = !!r.habitos[hb.id];
            var seq = sequencia(function (rr) {
              return rr && rr.habitos && rr.habitos[hb.id];
            });
            return (
              '<div class="item ' +
              (on ? 'feito' : '') +
              '" data-habito="' +
              hb.id +
              '">' +
              '<span class="emoji">' +
              esc(hb.emoji || '✅') +
              '</span>' +
              '<div class="info"><div class="nome">' +
              esc(hb.nome) +
              '</div>' +
              '<div class="meta">' +
              esc(hb.horario) +
              (hb.tipo === 'quantidade' && hb.meta ? ' · ' + hb.meta + (hb.unidade || '') : '') +
              (seq > 1 ? ' · <span class="streak">🔥 ' + seq + ' dias</span>' : '') +
              '</div></div>' +
              '<button class="marcar ' +
              (on ? 'on' : '') +
              '" data-toggle="' +
              hb.id +
              '">✓</button>' +
              '</div>'
            );
          })
          .join('')
      : '<p class="vazio">Nenhum hábito para hoje.</p>';

    // treino
    var alvo = $('#treino-hoje');
    if (!divs) {
      alvo.innerHTML = '<p class="vazio">Dia de descanso. 😌</p>';
    } else {
      var dv = divs[0];
      var jaFez = r.treinos.length > 0;
      alvo.innerHTML =
        '<div class="divisao-cab"><span class="tag hoje">TREINO ' +
        esc(dv.nome) +
        '</span>' +
        '<strong style="font-size:15px">' +
        esc(dv.foco) +
        '</strong></div>' +
        '<p class="mini" style="margin:2px 0 12px">' +
        dv.exercicios.length +
        ' exercícios · ' +
        esc(dv.horario || st.treino.horario) +
        '</p>' +
        (jaFez
          ? '<p class="mini" style="color:var(--accent)">✅ Treino registrado hoje às ' +
            esc(r.treinos[0].hora) +
            '</p>'
          : '<button class="btn" data-registrar="' + dv.id + '">Registrar treino</button>');
    }

    // estudo
    var em = r.estudoMin || 0,
      me = st.config.metaEstudoMin;
    $('#estudo-n').textContent = em + ' min';
    $('#estudo-d').textContent = 'de ' + me + ' min';
    $('#estudo-barra').style.width = Math.min(100, me ? (em / me) * 100 : 0) + '%';

    // próximos — só a 1ª ocorrência de cada recorrência, senão "toda terça"
    // sozinha ocupa a prévia inteira e esconde os outros compromissos
    var prox = [];
    var vistoRec = {};
    for (var i = 0; i < 14 && prox.length < 5; i++) {
      var dia = new Date(d.getTime());
      dia.setDate(dia.getDate() + i);
      N.eventosDoDia(st, dia).forEach(function (o) {
        if (prox.length >= 5) return;
        if (i === 0 && o.quando < new Date()) return;
        if (o.ev.recorrencia) {
          if (vistoRec[o.ev.id]) return;
          vistoRec[o.ev.id] = true;
        }
        prox.push({ o: o, dia: dia });
      });
    }
    $('#proximos').innerHTML = prox.length
      ? prox
          .map(function (p) {
            var quando =
              p.dia.toDateString() === d.toDateString()
                ? 'hoje'
                : (p.dia.getTime() - d.getTime()) / 86400000 < 2
                  ? 'amanhã'
                  : nomeDia(p.dia) + ' ' + dataCurta(p.dia);
            return (
              '<div class="item"><span class="emoji">' +
              (p.o.ev.subtipo === 'lembrete' ? '🔔' : '📅') +
              '</span>' +
              '<div class="info"><div class="nome">' +
              esc(p.o.ev.titulo) +
              '</div>' +
              '<div class="meta">' +
              quando +
              ' às ' +
              hora(p.o.quando) +
              '</div></div></div>'
            );
          })
          .join('')
      : '<p class="vazio">Nada agendado nos próximos dias.</p>';

    // aviso de notificações
    var av = $('#aviso-notif');
    if (!('Notification' in window)) {
      av.innerHTML = '';
    } else if (Notification.permission !== 'granted' || !st.config.notificacoes) {
      av.innerHTML =
        '<div class="aviso"><span>🔔</span><div style="flex:1">Ative as notificações para receber os lembretes de remédio, água e treino.</div>' +
        '<button id="btn-ativar-notif">Ativar</button></div>';
    } else {
      av.innerHTML = '';
    }
  }

  /* ---------------- vista: TREINO ---------------- */
  function renderTreino() {
    var hojeDow = new Date().getDay();
    var r = reg();
    var ordemDivisao = st.treino.divisao.slice().sort(function (a, b) {
      var aHoje = (a.dias || []).indexOf(hojeDow) !== -1;
      var bHoje = (b.dias || []).indexOf(hojeDow) !== -1;
      return (bHoje ? 1 : 0) - (aHoje ? 1 : 0);
    });
    $('#treino-conteudo').innerHTML = ordemDivisao
      .map(function (dv) {
        var ehHoje = (dv.dias || []).indexOf(hojeDow) !== -1;
        var aberta = divisaoAberta[dv.id] !== undefined ? divisaoAberta[dv.id] : ehHoje;
        return (
          '<div class="cartao">' +
          '<div class="divisao-cab" data-toggle-div="' +
          dv.id +
          '" style="cursor:pointer">' +
          '<span class="chevron">' +
          (aberta ? '▾' : '▸') +
          '</span>' +
          '<span class="tag ' +
          (ehHoje ? 'hoje' : '') +
          '">' +
          esc(dv.nome) +
          '</span>' +
          '<strong style="flex:1;font-size:15px">' +
          esc(dv.foco) +
          '</strong>' +
          '<button class="icone-btn" data-editar-div="' +
          dv.id +
          '" style="width:32px;height:32px;font-size:14px">✏️</button>' +
          '</div>' +
          '<p class="mini" style="margin:0 0 10px">' +
          diasLabel(dv.dias) +
          ' · ' +
          esc(dv.horario || st.treino.horario) +
          (aberta ? '' : ' · ' + dv.exercicios.length + ' exercícios') +
          '</p>' +
          (!aberta
            ? ''
            : dv.exercicios
                .map(function (ex) {
                  return (
                    '<div class="exercicio"><span class="nome">' +
                    esc(ex.nome) +
                    '</span>' +
                    '<span class="num">' +
                    ex.series +
                    '×' +
                    esc(ex.reps) +
                    (ex.carga ? ' · ' + esc(ex.carga) : '') +
                    '</span></div>'
                  );
                })
                .join('') +
              '<div style="height:12px"></div>' +
              '<button class="btn ' +
              (ehHoje ? '' : 'sec') +
              '" data-registrar="' +
              dv.id +
              '">' +
              (ehHoje && r.treinos.length
                ? 'Registrar de novo'
                : 'Registrar treino ' + esc(dv.nome)) +
              '</button>') +
          '</div>'
        );
      })
      .join('');

    // histórico
    var out = [];
    for (var i = 13; i >= 0; i--) {
      var d = hojeD();
      d.setDate(d.getDate() - i);
      var rr = st.registros[S.iso(d)];
      var fez = rr && rr.treinos && rr.treinos.length;
      var previsto = N.treinoDoDia(st, d);
      out.push(
        '<div class="col" title="' +
          dataCurta(d) +
          ' — ' +
          (fez ? 'treinou' : previsto ? 'estava previsto' : 'descanso') +
          '">' +
          '<div class="haste ' +
          (fez ? 'ok' : '') +
          '" style="height:' +
          (fez ? 100 : previsto ? 26 : 10) +
          '%"></div>' +
          '<div class="rot">' +
          d.getDate() +
          '</div></div>'
      );
    }
    var seqT = sequencia(function (rr, d) {
      var prev = N.treinoDoDia(st, d);
      if (!prev) return true;
      return rr && rr.treinos && rr.treinos.length > 0;
    });
    $('#treino-historico').innerHTML =
      '<div class="semana">' +
      out.join('') +
      '</div>' +
      '<p class="mini centro">' +
      plural(contarTreinos(14), 'treino', 'treinos') +
      ' nos últimos 14 dias' +
      (seqT > 1 ? ' · <span class="streak">🔥 ' + seqT + ' dias sem furar</span>' : '') +
      '</p>';
  }

  function contarTreinos(dias) {
    var n = 0;
    for (var i = 0; i < dias; i++) {
      var d = hojeD();
      d.setDate(d.getDate() - i);
      var rr = st.registros[S.iso(d)];
      if (rr && rr.treinos && rr.treinos.length) n += rr.treinos.length;
    }
    return n;
  }

  /* ---------------- vista: ESTUDOS ---------------- */
  function renderEstudos() {
    var r = reg(),
      me = st.config.metaEstudoMin;
    $('#estudo-n2').textContent = (r.estudoMin || 0) + ' min';
    $('#estudo-d2').textContent = 'de ' + me + ' min';
    $('#estudo-barra2').style.width = Math.min(100, me ? ((r.estudoMin || 0) / me) * 100 : 0) + '%';

    var cols = [],
      soma = 0;
    for (var i = 6; i >= 0; i--) {
      var d = hojeD();
      d.setDate(d.getDate() - i);
      var rr = st.registros[S.iso(d)];
      var min = (rr && rr.estudoMin) || 0;
      soma += min;
      var pct = me ? Math.min(100, (min / me) * 100) : min ? 100 : 0;
      cols.push(
        '<div class="col" title="' +
          dataCurta(d) +
          ': ' +
          min +
          ' min">' +
          '<div class="haste ' +
          (min >= me && me ? 'ok' : '') +
          '" style="height:' +
          Math.max(4, pct) +
          '%"></div>' +
          '<div class="rot">' +
          NLP.NOMES_DIA_CURTO[d.getDay()] +
          '</div></div>'
      );
    }
    $('#estudo-semana').innerHTML = cols.join('');
    $('#estudo-media').textContent =
      'Média de ' +
      Math.round(soma / 7) +
      ' min/dia · ' +
      Math.round((soma / 60) * 10) / 10 +
      ' h na semana';
    var seq = sequencia(function (rr) {
      return rr && (rr.estudoMin || 0) >= me;
    });
    $('#estudo-streak').textContent = seq > 1 ? '🔥 ' + seq + ' dias' : '';
  }

  /* ---------------- vista: AGENDA ---------------- */
  function renderAgenda() {
    var d0 = hojeD();
    var todos = [];
    for (var i = 0; i < 35; i++) {
      var dia = new Date(d0.getTime());
      dia.setDate(dia.getDate() + i);
      N.eventosDoDia(st, dia).forEach(function (o) {
        todos.push({ dia: dia, i: i, o: o });
      });
    }

    // recorrência só mostra a próxima ocorrência na lista — sem isso, um
    // compromisso semanal vira uma dúzia de cards idênticos e afoga os
    // compromissos únicos
    var totalPorEvento = {};
    todos.forEach(function (e) {
      totalPorEvento[e.o.ev.id] = (totalPorEvento[e.o.ev.id] || 0) + 1;
    });

    // cada dia vira um grupo (cabeçalho + eventos) fechado num wrapper —
    // é o que permite a grade de 2 colunas em tela larga sem misturar
    // eventos de dias diferentes na mesma linha
    var mostrado = {};
    var html = '';
    var diaAtualStr = null;
    var grupoAberto = false;
    todos.forEach(function (e) {
      if (e.o.ev.recorrencia) {
        if (mostrado[e.o.ev.id]) return;
        mostrado[e.o.ev.id] = true;
      }
      var diaStr = S.iso(e.dia);
      if (diaStr !== diaAtualStr) {
        diaAtualStr = diaStr;
        if (grupoAberto) html += '</div>';
        var rot =
          e.i === 0 ? 'Hoje' : e.i === 1 ? 'Amanhã' : nomeDia(e.dia) + ', ' + dataCurta(e.dia);
        html += '<div class="dia-grupo"><div class="dia-cab">' + rot + '</div>';
        grupoAberto = true;
      }
      var rr = st.registros[diaStr];
      var o = e.o;
      var feito = rr && rr.eventosFeitos && rr.eventosFeitos.indexOf(o.ev.id) !== -1;
      var passou = o.quando < new Date();
      var extras = totalPorEvento[o.ev.id] - 1;
      html +=
        '<div class="evento ' +
        (feito || passou ? 'passado' : '') +
        '" data-evento="' +
        o.ev.id +
        '" data-dia="' +
        diaStr +
        '">' +
        '<div class="hora">' +
        hora(o.quando) +
        '</div>' +
        '<div class="corpo"><div class="t">' +
        esc(o.ev.titulo) +
        '</div>' +
        '<div class="d">' +
        (o.ev.recorrencia
          ? '🔁 ' +
            recorrenciaLabel(o.ev.recorrencia) +
            (extras > 0 ? ' · +' + extras + (extras === 1 ? ' próxima' : ' próximas') : '') +
            ' · '
          : '') +
        (o.ev.duracaoMin ? o.ev.duracaoMin + ' min · ' : '') +
        'alerta ' +
        (typeof o.ev.alertaMin === 'number' ? o.ev.alertaMin : st.config.alertaEventoMin) +
        ' min antes' +
        (o.ev.notas ? '<br>' + esc(o.ev.notas) : '') +
        '</div></div>' +
        '<button class="marcar ' +
        (feito ? 'on' : '') +
        '" data-concluir="' +
        o.ev.id +
        '" data-d="' +
        diaStr +
        '">✓</button>' +
        '</div>';
    });
    if (grupoAberto) html += '</div>';

    $('#lista-agenda').innerHTML = todos.length
      ? html
      : '<p class="vazio">Nenhum compromisso nos próximos 35 dias.<br>Use o chat: "consulta no dentista quinta 15h".</p>';
  }

  /* ---------------- vista: HISTÓRICO ---------------- */
  function renderHistorico() {
    var DIAS = 30;
    var somaScore7 = 0,
      nScore7 = 0,
      somaScore30 = 0,
      nScore30 = 0;
    var linhas = [];
    for (var i = 0; i < DIAS; i++) {
      var d = hojeD();
      d.setDate(d.getDate() - i);
      var s = scoreDoDia(d);
      if (s !== null) {
        somaScore30 += s;
        nScore30++;
        if (i < 7) {
          somaScore7 += s;
          nScore7++;
        }
      }
      var rr = st.registros[S.iso(d)];
      var agua = (rr && rr.agua) || 0;
      var estudoMin = (rr && rr.estudoMin) || 0;
      var treinoFeito = !!(rr && rr.treinos && rr.treinos.length);
      var totalHabitos = 0,
        feitoHabitos = 0;
      st.habitos.forEach(function (h) {
        if (!h.ativo || (h.dias || []).indexOf(d.getDay()) === -1) return;
        totalHabitos++;
        if (rr && rr.habitos && rr.habitos[h.id]) feitoHabitos++;
      });
      var label = i === 0 ? 'Hoje' : i === 1 ? 'Ontem' : nomeDia(d) + ', ' + dataCurta(d);
      linhas.push(
        '<div class="item">' +
          '<span class="emoji">' +
          (s === null ? '⚪' : s >= 70 ? '✅' : s >= 40 ? '🟡' : '🔴') +
          '</span>' +
          '<div class="info"><div class="nome">' +
          label +
          '</div>' +
          '<div class="meta">💧 ' +
          agua +
          ' ml · 📚 ' +
          estudoMin +
          ' min · 🏋️ ' +
          (treinoFeito ? 'sim' : 'não') +
          (totalHabitos ? ' · ✅ ' + feitoHabitos + '/' + totalHabitos + ' hábitos' : '') +
          '</div></div>' +
          '<strong style="flex:0 0 auto;font-size:14px">' +
          (s === null ? '—' : s + '%') +
          '</strong>' +
          '</div>'
      );
    }
    $('#historico-dias').innerHTML = linhas.join('');

    // barras dos últimos 14 dias
    var barras = [];
    for (var j = 13; j >= 0; j--) {
      var dj = hojeD();
      dj.setDate(dj.getDate() - j);
      var sj = scoreDoDia(dj);
      barras.push(
        '<div class="col" title="' +
          dataCurta(dj) +
          ': ' +
          (sj === null ? 'sem dados' : sj + '%') +
          '">' +
          '<div class="haste ' +
          (sj !== null && sj >= 70 ? 'ok' : '') +
          '" style="height:' +
          (sj === null ? 4 : Math.max(4, sj)) +
          '%"></div>' +
          '<div class="rot">' +
          NLP.NOMES_DIA_CURTO[dj.getDay()] +
          '</div></div>'
      );
    }
    $('#historico-semana').innerHTML = barras.join('');

    var media7 = nScore7 ? Math.round(somaScore7 / nScore7) : null;
    var media30 = nScore30 ? Math.round(somaScore30 / nScore30) : null;
    $('#historico-media').textContent =
      media7 !== null
        ? 'Média de ' +
          media7 +
          '% nos últimos 7 dias' +
          (media30 !== null ? ' · ' + media30 + '% em 30 dias' : '')
        : 'Sem dados suficientes ainda.';

    // sequências em destaque
    var seqs = [];
    if (st.config.metaAgua > 0) {
      var seqA = sequencia(function (rr) {
        return rr && (rr.agua || 0) >= st.config.metaAgua;
      });
      if (seqA > 1) seqs.push('💧 Água ' + seqA + ' dias');
    }
    if (st.config.metaEstudoMin > 0) {
      var seqE = sequencia(function (rr) {
        return rr && (rr.estudoMin || 0) >= st.config.metaEstudoMin;
      });
      if (seqE > 1) seqs.push('📚 Estudo ' + seqE + ' dias');
    }
    var seqT = sequencia(function (rr, dd) {
      var prev = N.treinoDoDia(st, dd);
      if (!prev) return true;
      return rr && rr.treinos && rr.treinos.length > 0;
    });
    if (seqT > 1) seqs.push('🏋️ Treino ' + seqT + ' dias');
    st.habitos.forEach(function (h) {
      if (!h.ativo) return;
      var seqH = sequencia(function (rr, dd) {
        if ((h.dias || []).indexOf(dd.getDay()) === -1) return true;
        return rr && rr.habitos && rr.habitos[h.id];
      });
      if (seqH > 1) seqs.push(esc(h.emoji || '✅') + ' ' + esc(h.nome) + ' ' + seqH + ' dias');
    });
    $('#historico-sequencias').innerHTML = seqs.length
      ? seqs
          .map(function (s) {
            return (
              '<span class="streak" style="display:inline-block;margin:2px 10px 2px 0">🔥 ' +
              s +
              '</span>'
            );
          })
          .join('')
      : '<p class="mini">Nenhuma sequência ativa ainda.</p>';

    // congelamento de streak — pool mensal compartilhado entre todas as sequências
    var mesAtual = S.hoje().slice(0, 7);
    var disponiveis = S.congelamentosDisponiveis(st, mesAtual);
    var hojeProtegido = st.diasProtegidos.indexOf(S.hoje()) !== -1;
    $('#historico-congelamentos').textContent = hojeProtegido
      ? '❄️ Hoje já está protegido'
      : disponiveis +
        ' de ' +
        st.config.congelamentosPorMes +
        ' congelamentos disponíveis este mês';
    var btnProteger = $('#btn-proteger-dia');
    btnProteger.disabled = hojeProtegido || disponiveis <= 0;
    btnProteger.style.opacity = btnProteger.disabled ? '.5' : '';

    renderHeatmap();
    renderTendencias();
    renderConquistas();
  }

  // maior sequência ativa entre água, estudo, treino e cada hábito — usada
  // tanto nas conquistas quanto na imagem de compartilhamento
  function melhorSequenciaAtual() {
    var melhorSeq = 0;
    if (st.config.metaAgua > 0) {
      melhorSeq = Math.max(
        melhorSeq,
        sequencia(function (rr) {
          return rr && (rr.agua || 0) >= st.config.metaAgua;
        })
      );
    }
    if (st.config.metaEstudoMin > 0) {
      melhorSeq = Math.max(
        melhorSeq,
        sequencia(function (rr) {
          return rr && (rr.estudoMin || 0) >= st.config.metaEstudoMin;
        })
      );
    }
    melhorSeq = Math.max(
      melhorSeq,
      sequencia(function (rr, dd) {
        var prev = N.treinoDoDia(st, dd);
        if (!prev) return true;
        return rr && rr.treinos && rr.treinos.length > 0;
      })
    );
    st.habitos.forEach(function (h) {
      if (!h.ativo) return;
      melhorSeq = Math.max(
        melhorSeq,
        sequencia(function (rr, dd) {
          if ((h.dias || []).indexOf(dd.getDay()) === -1) return true;
          return rr && rr.habitos && rr.habitos[h.id];
        })
      );
    });
    return melhorSeq;
  }

  function renderConquistas() {
    var totalAgua = 0,
      totalEstudo = 0,
      totalTreinos = 0;
    Object.keys(st.registros).forEach(function (k) {
      var r = st.registros[k];
      totalAgua += r.agua || 0;
      totalEstudo += r.estudoMin || 0;
      totalTreinos += (r.treinos || []).length;
    });

    var melhorSeq = melhorSequenciaAtual();

    var badges = [
      {
        emoji: '💧',
        nome: 'Hidratado(a)',
        ok: totalAgua >= 50000,
        prog: Math.min(100, Math.round((totalAgua / 50000) * 100))
      },
      {
        emoji: '📚',
        nome: 'Estudioso(a)',
        ok: totalEstudo >= 1000,
        prog: Math.min(100, Math.round((totalEstudo / 1000) * 100))
      },
      {
        emoji: '🏋️',
        nome: 'Regular na academia',
        ok: totalTreinos >= 20,
        prog: Math.min(100, Math.round((totalTreinos / 20) * 100))
      },
      {
        emoji: '🔥',
        nome: 'Consistente',
        ok: melhorSeq >= 14,
        prog: Math.min(100, Math.round((melhorSeq / 14) * 100))
      },
      {
        emoji: '⭐',
        nome: 'Nível 5',
        ok: nivelDe(st.xp) >= 5,
        prog: Math.min(100, Math.round((nivelDe(st.xp) / 5) * 100))
      }
    ];

    $('#historico-conquistas').innerHTML = badges
      .map(function (b) {
        return (
          '<div class="item">' +
          '<span class="emoji"' +
          (b.ok ? '' : ' style="filter:grayscale(1);opacity:.45"') +
          '>' +
          b.emoji +
          '</span>' +
          '<div class="info"><div class="nome">' +
          b.nome +
          '</div>' +
          '<div class="meta">' +
          (b.ok ? 'Conquistado ✓' : b.prog + '% do caminho') +
          '</div></div></div>'
        );
      })
      .join('');
  }

  /* ---------------- compartilhar progresso (imagem + Web Share API) ---------------- */
  // desenha um cartão 1080x1350 (proporção de story) com os tokens de cor
  // atuais do tema, pra imagem já sair combinando com claro/escuro
  function gerarImagemConquista() {
    return new Promise(function (resolve) {
      var W = 1080,
        H = 1350;
      var canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      var ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      var cs = getComputedStyle(document.documentElement);
      var cor = function (v) {
        return cs.getPropertyValue(v).trim();
      };
      var bg = cor('--bg'),
        surface = cor('--surface-2'),
        accent = cor('--accent'),
        accent2 = cor('--accent-2'),
        txt = cor('--txt'),
        muted = cor('--muted');

      var grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, bg);
      grad.addColorStop(1, surface);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';

      ctx.fillStyle = muted;
      ctx.font = '700 34px system-ui, -apple-system, sans-serif';
      ctx.fillText('MINHA ROTINA', W / 2, 150);

      var s = scoreDia();
      ctx.fillStyle = txt;
      ctx.font = '800 260px system-ui, -apple-system, sans-serif';
      ctx.fillText(s + '%', W / 2, 470);
      ctx.font = '500 38px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = muted;
      ctx.fillText('cumprido hoje', W / 2, 540);

      ctx.strokeStyle = surface;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(140, 630);
      ctx.lineTo(W - 140, 630);
      ctx.stroke();

      var r = reg();
      var stats = [
        { label: 'NÍVEL', valor: String(nivelDe(st.xp)) },
        { label: 'SEQUÊNCIA', valor: melhorSequenciaAtual() + ' dias' },
        { label: 'ÁGUA', valor: (r.agua || 0) + ' ml' },
        { label: 'ESTUDO', valor: (r.estudoMin || 0) + ' min' }
      ];
      var colW = (W - 160) / stats.length;
      stats.forEach(function (item, i) {
        var x = 80 + colW * i + colW / 2;
        ctx.font = '800 56px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = accent;
        ctx.fillText(item.valor, x, 740);
        ctx.font = '600 26px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = muted;
        ctx.fillText(item.label, x, 780);
      });

      ctx.font = '500 30px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = muted;
      ctx.fillText(
        nomeDia(hojeD()).charAt(0).toUpperCase() +
          nomeDia(hojeD()).slice(1) +
          ', ' +
          dataCurta(hojeD()),
        W / 2,
        H - 150
      );
      ctx.font = '700 34px system-ui, -apple-system, sans-serif';
      ctx.fillStyle = accent2;
      ctx.fillText('🏠 Rotina', W / 2, H - 90);

      canvas.toBlob(function (blob) {
        resolve(blob);
      }, 'image/png');
    });
  }

  function compartilharConquista() {
    gerarImagemConquista().then(function (blob) {
      if (!blob) {
        brinde('Não consegui gerar a imagem');
        return;
      }
      var arquivo = new File([blob], 'rotina-' + S.hoje() + '.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [arquivo] })) {
        navigator
          .share({
            files: [arquivo],
            title: 'Minha rotina',
            text: 'Olha meu progresso no Rotina hoje 💪'
          })
          .catch(function () {
            /* usuário cancelou o share — não é erro */
          });
        return;
      }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'rotina-' + S.hoje() + '.png';
      a.click();
      setTimeout(function () {
        URL.revokeObjectURL(a.href);
      }, 3000);
      brinde('Imagem baixada — compartilhe onde quiser');
    });
  }

  // mapa de contribuições estilo GitHub: uma coluna por semana, do domingo
  // ao sábado, cobrindo os últimos ~12 meses até a semana atual.
  function renderHeatmap() {
    var hoje = hojeD();
    var fimSemana = new Date(hoje.getTime());
    fimSemana.setDate(fimSemana.getDate() + (6 - hoje.getDay()));
    var inicio = new Date(fimSemana.getTime());
    inicio.setDate(inicio.getDate() - 370);
    inicio.setDate(inicio.getDate() - inicio.getDay());

    var html = '';
    var d = new Date(inicio.getTime());
    while (d <= fimSemana) {
      html += '<div class="heat-col">';
      for (var dow = 0; dow < 7; dow++) {
        if (d > hoje) {
          html += '<span class="heat-dia vazio"></span>';
        } else {
          var s = scoreDoDia(d);
          var nivel = s === null || s === 0 ? 0 : s >= 80 ? 4 : s >= 50 ? 3 : s >= 20 ? 2 : 1;
          html +=
            '<span class="heat-dia nivel-' +
            nivel +
            '" title="' +
            dataCurta(d) +
            ': ' +
            (s === null ? 'sem dados' : s + '%') +
            '"></span>';
        }
        d.setDate(d.getDate() + 1);
      }
      html += '</div>';
    }
    var alvo = $('#historico-heatmap');
    alvo.innerHTML = html;
    alvo.scrollLeft = alvo.scrollWidth;
  }

  function renderTendencias() {
    var somaPorDia = [0, 0, 0, 0, 0, 0, 0],
      nPorDia = [0, 0, 0, 0, 0, 0, 0];
    for (var i = 0; i < 90; i++) {
      var d = hojeD();
      d.setDate(d.getDate() - i);
      var s = scoreDoDia(d);
      if (s !== null) {
        somaPorDia[d.getDay()] += s;
        nPorDia[d.getDay()]++;
      }
    }
    var melhorDow = -1,
      melhorMedia = -1;
    for (var w = 0; w < 7; w++) {
      if (!nPorDia[w]) continue;
      var media = somaPorDia[w] / nPorDia[w];
      if (media > melhorMedia) {
        melhorMedia = media;
        melhorDow = w;
      }
    }

    var agora = hojeD();
    var somaMes = 0,
      nMes = 0;
    for (var dia = 1; dia <= agora.getDate(); dia++) {
      var dm = new Date(agora.getFullYear(), agora.getMonth(), dia, 12, 0, 0, 0);
      var sm = scoreDoDia(dm);
      if (sm !== null) {
        somaMes += sm;
        nMes++;
      }
    }
    var taxaMes = nMes ? Math.round(somaMes / nMes) : null;

    var itens = [];
    if (melhorDow !== -1) {
      itens.push(
        '<div class="item"><span class="emoji">🏆</span><div class="info"><div class="nome">Melhor dia da semana</div>' +
          '<div class="meta">' +
          NLP.NOMES_DIA[melhorDow].charAt(0).toUpperCase() +
          NLP.NOMES_DIA[melhorDow].slice(1) +
          ' · média de ' +
          Math.round(melhorMedia) +
          '%</div></div></div>'
      );
    }
    if (taxaMes !== null) {
      itens.push(
        '<div class="item"><span class="emoji">📅</span><div class="info"><div class="nome">Taxa de conclusão do mês</div>' +
          '<div class="meta">' +
          taxaMes +
          '% de média em ' +
          nMes +
          ' dias registrados</div></div></div>'
      );
    }
    $('#historico-tendencias').innerHTML = itens.length
      ? itens.join('')
      : '<p class="mini">Sem dados suficientes ainda.</p>';
  }

  /* ---------------- render geral ---------------- */
  function render() {
    renderTopo();
    renderHoje();
    renderTreino();
    renderEstudos();
    renderAgenda();
    renderHistorico();
  }

  /* ---------------- ações ---------------- */
  function addAgua(ml) {
    var r = reg();
    r.agua = Math.max(0, (r.agua || 0) + ml);
    if (ml > 0) ganharXp(5);
    salvar();
    return r.agua;
  }

  function toggleHabito(id, valor) {
    var r = reg(),
      hb = st.habitos.filter(function (h) {
        return h.id === id;
      })[0];
    if (!hb) return null;
    var jaEstava = !!r.habitos[id];
    if (typeof valor === 'undefined') valor = !jaEstava;
    if (!valor) delete r.habitos[id];
    else r.habitos[id] = valor;
    if (!jaEstava && r.habitos[id]) ganharXp(10);
    salvar();
    return { habito: hb, on: !!r.habitos[id] };
  }

  function addEstudo(min, data) {
    var r = reg(data);
    r.estudoMin = Math.max(0, (r.estudoMin || 0) + min);
    if (min > 0) ganharXp(Math.max(1, Math.round(min / 5)));
    salvar();
    return r.estudoMin;
  }

  function registrarTreino(divisaoId, cargas, data) {
    var dv = st.treino.divisao.filter(function (d) {
      return d.id === divisaoId;
    })[0];
    var r = reg(data);
    var exs = dv
      ? dv.exercicios.map(function (ex) {
          var c = cargas && cargas[ex.id] !== undefined ? cargas[ex.id] : ex.carga;
          if (c) ex.carga = c;
          return { nome: ex.nome, series: ex.series, reps: ex.reps, carga: c || '' };
        })
      : [];
    r.treinos.push({
      divisaoId: divisaoId,
      nome: dv ? dv.nome : '?',
      foco: dv ? dv.foco : '',
      hora: hora(new Date()),
      exercicios: exs
    });
    ganharXp(30);
    salvar();
    return dv;
  }

  function criarEvento(dados) {
    var ev = {
      id: S.uid(),
      titulo: dados.titulo,
      subtipo: dados.subtipo || 'evento',
      inicio: dados.inicio.toISOString(),
      duracaoMin: dados.duracaoMin || 0,
      recorrencia: dados.recorrencia || null,
      alertaMin: typeof dados.alertaMin === 'number' ? dados.alertaMin : st.config.alertaEventoMin,
      notas: dados.notas || '',
      criadoEm: new Date().toISOString()
    };
    st.eventos.push(ev);
    salvar();
    return ev;
  }

  /* ---------------- CHAT ---------------- */
  function addMsg(autor, texto, semSalvar) {
    var m = { autor: autor, texto: texto, ts: Date.now() };
    if (!semSalvar) {
      st.chat.push(m);
      if (st.chat.length > 80) st.chat = st.chat.slice(-80);
      salvar(false);
    }
    renderChat();
  }

  function renderChat() {
    var c = $('#mensagens');
    c.innerHTML = st.chat
      .map(function (m) {
        return '<div class="msg ' + m.autor + '">' + esc(m.texto).replace(/\n/g, '<br>') + '</div>';
      })
      .join('');
    c.scrollIntoView(false);
    window.scrollTo(0, document.body.scrollHeight);
  }

  var SUGESTOES = [
    'o que tenho hoje?',
    'bebi 500ml',
    'tomei os remédios',
    'estudei 1h30',
    'treinei peito e ombro',
    'consulta no dentista quinta 15h',
    'inglês toda terça às 20h',
    'o que ainda falta hoje'
  ];

  function renderSugestoes() {
    $('#sugestoes').innerHTML = SUGESTOES.map(function (s) {
      return '<button class="chip" data-sug="' + esc(s) + '">' + esc(s) + '</button>';
    }).join('');
  }

  function processar(texto) {
    addMsg('user', texto);
    var acao = NLP.interpretar(texto, {
      agora: new Date(),
      habitos: st.habitos,
      divisao: st.treino.divisao,
      copoPadrao: st.config.copoPadrao
    });
    var resposta = executar(acao, texto);
    setTimeout(function () {
      addMsg('bot', resposta);
    }, 120);
  }

  function executar(a, textoOriginal) {
    reg();
    switch (a.tipo) {
      case 'ajuda':
        return (
          'Escreve em português normal que eu anoto. Alguns exemplos:\n\n' +
          '💧 "bebi 500ml" · "tomei 2 copos de água"\n' +
          '💊 "tomei os remédios" · "tomei 5g de creatina"\n' +
          '📚 "estudei 1h30"\n' +
          '🏋️ "treinei peito ombro e tríceps"\n' +
          '📅 "consulta no dentista quinta 15h"\n' +
          '🔁 "inglês toda terça às 20h" · "academia dias úteis 19h"\n' +
          '❓ "o que tenho hoje?" · "o que ainda falta"\n' +
          '➕ "novo hábito tomar ômega 3 às 12h todo dia"'
        );

      case 'agua': {
        var total = addAgua(a.ml);
        var falta = st.config.metaAgua - total;
        return (
          '💧 +' +
          a.ml +
          ' ml anotado. Você está em ' +
          total +
          ' ml' +
          (falta > 0 ? ' — faltam ' + falta + ' ml pra meta.' : ' — meta batida! 🎉')
        );
      }

      case 'habito': {
        var res = toggleHabito(a.habito.id, a.desmarcar ? false : a.valor);
        if (!res) return 'Não achei esse hábito.';
        if (!res.on) return 'Ok, desmarquei "' + res.habito.nome + '".';
        var seq = sequencia(function (rr) {
          return rr && rr.habitos && rr.habitos[a.habito.id];
        });
        return (
          (res.habito.emoji || '✅') +
          ' "' +
          res.habito.nome +
          '" marcado' +
          (typeof a.valor === 'number' ? ' (' + a.valor + (res.habito.unidade || '') + ')' : '') +
          '.' +
          (seq > 1 ? '\n🔥 ' + seq + ' dias seguidos.' : '')
        );
      }

      case 'estudo': {
        if (a.perguntar) return 'Boa! Quanto tempo? Ex.: "estudei 45 min" ou "estudei 1h30".';
        var dataE = a.data ? S.iso(a.data) : S.hoje();
        var tot = addEstudo(a.minutos, dataE);
        var faltaE = st.config.metaEstudoMin - tot;
        return (
          '📚 +' +
          a.minutos +
          ' min. Total do dia: ' +
          tot +
          ' min' +
          (faltaE > 0 ? ' — faltam ' + faltaE + ' min pra meta.' : ' — meta batida! 🎉')
        );
      }

      case 'pomodoro':
        irPara('estudos');
        return '⏱️ Abri o timer pra você. É só apertar iniciar.';

      case 'treino': {
        var dv = a.divisao;
        if (!dv) {
          var previstos = N.treinoDoDia(st, a.data || new Date());
          dv = previstos ? previstos[0] : st.treino.divisao[0];
        }
        if (!dv) return 'Você ainda não tem nenhuma divisão de treino cadastrada.';
        registrarTreino(dv.id, null, a.data ? S.iso(a.data) : S.hoje());
        return '🏋️ Treino ' + dv.nome + ' (' + dv.foco + ') registrado. Mandou bem.';
      }

      case 'novoHabito': {
        var novo = {
          id: S.uid(),
          nome: a.nome,
          emoji: '✅',
          tipo: 'check',
          horario: a.horario,
          dias: a.dias,
          lembrete: true,
          ativo: true
        };
        st.habitos.push(novo);
        salvar();
        var dicaOnboarding =
          dentroOnboarding() && habitosAtivos() > LIMITE_ONBOARDING
            ? '\n\n💡 Você já tem ' +
              habitosAtivos() +
              ' hábitos ativos nesta primeira semana. Focar em poucos primeiro costuma grudar mais.'
            : '';
        return (
          '✅ Hábito "' +
          novo.nome +
          '" criado — ' +
          diasLabel(novo.dias) +
          ' às ' +
          novo.horario +
          '.' +
          dicaOnboarding
        );
      }

      case 'config':
        if (a.campo === 'metaAgua') {
          st.config.metaAgua = a.valor;
          salvar();
          return '💧 Meta de água ajustada para ' + a.valor + ' ml por dia.';
        }
        return 'Ok.';

      case 'evento': {
        var ev = criarEvento(a);
        var q = new Date(ev.inicio);
        var quandoTxt = ev.recorrencia
          ? recorrenciaLabel(ev.recorrencia) + ' às ' + hora(q)
          : nomeDia(q) + ', ' + dataCurta(q) + ' às ' + hora(q);
        return (
          (ev.subtipo === 'lembrete' ? '🔔' : '📅') +
          ' Anotado: "' +
          ev.titulo +
          '" — ' +
          quandoTxt +
          '.' +
          '\nVou te avisar ' +
          ev.alertaMin +
          ' min antes.'
        );
      }

      case 'consulta':
        return resumo(a.escopo);

      case 'vazio':
        return 'Manda aí.';

      default:
        return 'Não peguei essa. 🤔\nTenta algo como "bebi 500ml", "estudei 1h", "treinei costas" ou "dentista sexta 14h".\nEscreve "ajuda" pra ver tudo que eu entendo.';
    }
  }

  function resumo(escopo) {
    var d = hojeD(),
      r = reg();

    if (escopo === 'treino') {
      var divs = N.treinoDoDia(st, d);
      if (!divs) return '😌 Hoje é descanso — nenhum treino programado.';
      var dv = divs[0];
      return (
        '🏋️ Hoje é o treino ' +
        dv.nome +
        ': ' +
        dv.foco +
        '.\n' +
        dv.exercicios
          .map(function (e) {
            return (
              '• ' +
              e.nome +
              ' — ' +
              e.series +
              '×' +
              e.reps +
              (e.carga ? ' (' + e.carga + ')' : '')
            );
          })
          .join('\n') +
        (r.treinos.length ? '\n\n✅ Já registrado hoje.' : '\n\nAinda não registrei nada hoje.')
      );
    }

    if (escopo === 'stats') {
      var seqA = sequencia(function (rr) {
        return rr && (rr.agua || 0) >= st.config.metaAgua;
      });
      var seqE = sequencia(function (rr) {
        return rr && (rr.estudoMin || 0) >= st.config.metaEstudoMin;
      });
      return (
        '📊 Como você está:\n' +
        '• Score de hoje: ' +
        scoreDia() +
        '%\n' +
        '• Água: ' +
        (r.agua || 0) +
        '/' +
        st.config.metaAgua +
        ' ml' +
        (seqA > 1 ? ' · 🔥 ' + seqA + ' dias' : '') +
        '\n' +
        '• Estudo: ' +
        (r.estudoMin || 0) +
        '/' +
        st.config.metaEstudoMin +
        ' min' +
        (seqE > 1 ? ' · 🔥 ' + seqE + ' dias' : '') +
        '\n' +
        '• Treinos nos últimos 14 dias: ' +
        contarTreinos(14)
      );
    }

    if (escopo === 'pendente') {
      var falta = [];
      st.habitos.forEach(function (hb) {
        if (hb.ativo && (hb.dias || []).indexOf(d.getDay()) !== -1 && !r.habitos[hb.id]) {
          falta.push((hb.emoji || '✅') + ' ' + hb.nome + ' (' + hb.horario + ')');
        }
      });
      if ((r.agua || 0) < st.config.metaAgua)
        falta.push('💧 Água — faltam ' + (st.config.metaAgua - (r.agua || 0)) + ' ml');
      if ((r.estudoMin || 0) < st.config.metaEstudoMin)
        falta.push('📚 Estudo — faltam ' + (st.config.metaEstudoMin - (r.estudoMin || 0)) + ' min');
      var dvs = N.treinoDoDia(st, d);
      if (dvs && !r.treinos.length) falta.push('🏋️ Treino ' + dvs[0].nome + ' — ' + dvs[0].foco);
      N.eventosDoDia(st, d).forEach(function (o) {
        if (r.eventosFeitos.indexOf(o.ev.id) === -1 && o.quando > new Date()) {
          falta.push('📅 ' + o.ev.titulo + ' às ' + hora(o.quando));
        }
      });
      return falta.length
        ? 'Ainda falta:\n' +
            falta
              .map(function (x) {
                return '• ' + x;
              })
              .join('\n')
        : '🎉 Nada pendente. Dia limpo!';
    }

    var dia = escopo === 'amanha' ? new Date(d.getTime() + 86400000) : d;
    if (escopo === 'semana') {
      var linhas = [];
      for (var i = 0; i < 7; i++) {
        var dd = new Date(d.getTime());
        dd.setDate(dd.getDate() + i);
        var evs = N.eventosDoDia(st, dd);
        var tr = N.treinoDoDia(st, dd);
        var partes = [];
        if (tr) partes.push('🏋️ ' + tr[0].nome);
        evs.forEach(function (o) {
          partes.push(hora(o.quando) + ' ' + o.ev.titulo);
        });
        linhas.push(
          (i === 0 ? 'Hoje' : nomeDia(dd)) + ': ' + (partes.length ? partes.join(' · ') : '—')
        );
      }
      return '🗓️ Sua semana:\n' + linhas.join('\n');
    }

    var rr2 =
      escopo === 'amanha'
        ? st.registros[S.iso(dia)] || { habitos: {}, agua: 0, estudoMin: 0, treinos: [] }
        : r;
    var out = [
      escopo === 'amanha' ? '🗓️ Amanhã (' + nomeDia(dia) + '):' : '🗓️ Hoje (' + nomeDia(dia) + '):'
    ];
    var hs = st.habitos.filter(function (hb) {
      return hb.ativo && (hb.dias || []).indexOf(dia.getDay()) !== -1;
    });
    if (hs.length) {
      out.push('\nRotina:');
      hs.forEach(function (hb) {
        out.push(
          '• ' +
            (rr2.habitos && rr2.habitos[hb.id] ? '✅' : '⬜') +
            ' ' +
            hb.nome +
            ' — ' +
            hb.horario
        );
      });
    }
    var tr2 = N.treinoDoDia(st, dia);
    out.push(
      '\nTreino: ' +
        (tr2
          ? tr2[0].nome + ' — ' + tr2[0].foco + (rr2.treinos && rr2.treinos.length ? ' ✅' : '')
          : 'descanso 😌')
    );
    out.push('Estudo: ' + (rr2.estudoMin || 0) + '/' + st.config.metaEstudoMin + ' min');
    if (escopo !== 'amanha') out.push('Água: ' + (r.agua || 0) + '/' + st.config.metaAgua + ' ml');
    var evs2 = N.eventosDoDia(st, dia);
    out.push('\nCompromissos:');
    if (evs2.length)
      evs2.forEach(function (o) {
        out.push('• ' + hora(o.quando) + ' — ' + o.ev.titulo);
      });
    else out.push('• nenhum');
    return out.join('\n');
  }

  /* ---------------- modais ---------------- */
  function modalHabito(id) {
    var hb = id
      ? st.habitos.filter(function (h) {
          return h.id === id;
        })[0]
      : null;
    var novo = !hb;
    hb = hb || {
      id: S.uid(),
      nome: '',
      emoji: '💊',
      tipo: 'check',
      meta: '',
      unidade: '',
      horario: '08:00',
      dias: [0, 1, 2, 3, 4, 5, 6],
      lembrete: true,
      ativo: true
    };
    abrirModal(
      '<h3>' +
        (novo ? 'Novo hábito' : 'Editar hábito') +
        '</h3>' +
        '<div class="grade2">' +
        '<label class="campo"><span>Emoji</span><input type="text" id="f-emoji" maxlength="2" value="' +
        esc(hb.emoji) +
        '"></label>' +
        '<label class="campo"><span>Horário</span><input type="time" id="f-hora" value="' +
        esc(hb.horario) +
        '"></label>' +
        '</div>' +
        '<label class="campo"><span>Nome</span><input type="text" id="f-nome" placeholder="Ex.: Remédios da manhã" value="' +
        esc(hb.nome) +
        '"></label>' +
        '<div class="grade2">' +
        '<label class="campo"><span>Tipo</span><select id="f-tipo">' +
        '<option value="check"' +
        (hb.tipo === 'check' ? ' selected' : '') +
        '>Marcar feito</option>' +
        '<option value="quantidade"' +
        (hb.tipo === 'quantidade' ? ' selected' : '') +
        '>Com quantidade</option>' +
        '</select></label>' +
        '<label class="campo"><span>Meta / unidade</span>' +
        '<div class="grade2"><input type="number" id="f-meta" value="' +
        esc(hb.meta || '') +
        '" placeholder="5">' +
        '<input type="text" id="f-unid" value="' +
        esc(hb.unidade || '') +
        '" placeholder="g"></div></label>' +
        '</div>' +
        '<label class="campo"><span>Dias da semana</span></label>' +
        seletorDias(hb.dias, 'f-dias') +
        '<div style="height:14px"></div>' +
        '<label class="campo" style="display:flex;align-items:center;gap:10px">' +
        '<input type="checkbox" class="toggle" id="f-lembrete" ' +
        (hb.lembrete ? 'checked' : '') +
        '>' +
        '<span style="margin:0">Me lembrar no horário</span></label>' +
        '<div style="height:8px"></div>' +
        '<button class="btn" id="f-salvar">Salvar</button>' +
        (novo ? '' : '<button class="btn perigo" id="f-excluir">Excluir hábito</button>') +
        '<button class="btn sec" data-fechar>Cancelar</button>'
    );

    $('#f-salvar').onclick = function () {
      if (novo && dentroOnboarding() && habitosAtivos() >= LIMITE_ONBOARDING) {
        var seguir = confirm(
          'Você já tem ' +
            habitosAtivos() +
            ' hábitos ativos criados nesta primeira semana.\n\n' +
            'Rotina nova gruda mais quando você foca em poucos hábitos primeiro — dá pra adicionar o resto depois que os primeiros já viraram costume.\n\n' +
            'Adicionar mesmo assim?'
        );
        if (!seguir) return;
      }
      hb.nome = $('#f-nome').value.trim() || 'Hábito';
      hb.emoji = $('#f-emoji').value.trim() || '✅';
      hb.horario = $('#f-hora').value || '08:00';
      hb.tipo = $('#f-tipo').value;
      hb.meta = $('#f-meta').value ? +$('#f-meta').value : '';
      hb.unidade = $('#f-unid').value.trim();
      hb.dias = lerDias('f-dias');
      hb.lembrete = $('#f-lembrete').checked;
      if (novo) st.habitos.push(hb);
      fecharModal();
      salvar();
      brinde('Hábito salvo');
    };
    if (!novo)
      $('#f-excluir').onclick = function () {
        st.habitos = st.habitos.filter(function (h) {
          return h.id !== hb.id;
        });
        fecharModal();
        salvar();
        brinde('Hábito excluído');
      };
  }

  function modalDivisao(id) {
    var dv = id
      ? st.treino.divisao.filter(function (d) {
          return d.id === id;
        })[0]
      : null;
    var novo = !dv;
    dv = dv || {
      id: S.uid(),
      nome: 'D',
      foco: '',
      dias: [],
      horario: st.treino.horario,
      exercicios: []
    };
    var texto = dv.exercicios
      .map(function (e) {
        return e.nome + ' ' + e.series + 'x' + e.reps + (e.carga ? ' @' + e.carga : '');
      })
      .join('\n');
    abrirModal(
      '<h3>' +
        (novo ? 'Nova divisão' : 'Editar divisão') +
        '</h3>' +
        '<div class="grade2">' +
        '<label class="campo"><span>Letra / nome</span><input type="text" id="d-nome" maxlength="12" value="' +
        esc(dv.nome) +
        '"></label>' +
        '<label class="campo"><span>Horário</span><input type="time" id="d-hora" value="' +
        esc(dv.horario || st.treino.horario) +
        '"></label>' +
        '</div>' +
        '<label class="campo"><span>Foco (grupos musculares)</span><input type="text" id="d-foco" placeholder="Peito, ombro e tríceps" value="' +
        esc(dv.foco) +
        '"></label>' +
        '<label class="campo"><span>Dias da semana</span></label>' +
        seletorDias(dv.dias, 'd-dias') +
        '<div style="height:14px"></div>' +
        '<label class="campo"><span>Exercícios — um por linha, formato <code>Nome 4x8-12</code></span>' +
        '<textarea id="d-ex" style="min-height:150px" placeholder="Supino reto 4x8-12&#10;Elevação lateral 3x12-15">' +
        esc(texto) +
        '</textarea></label>' +
        '<button class="btn" id="d-salvar">Salvar</button>' +
        (novo ? '' : '<button class="btn perigo" id="d-excluir">Excluir divisão</button>') +
        '<button class="btn sec" data-fechar>Cancelar</button>'
    );

    $('#d-salvar').onclick = function () {
      dv.nome = $('#d-nome').value.trim() || 'D';
      dv.foco = $('#d-foco').value.trim();
      dv.horario = $('#d-hora').value;
      dv.dias = lerDias('d-dias');
      dv.exercicios = $('#d-ex')
        .value.split('\n')
        .map(function (linha) {
          linha = linha.trim();
          if (!linha) return null;
          var carga = '';
          var mc = /@\s*(.+)$/.exec(linha);
          if (mc) {
            carga = mc[1].trim();
            linha = linha.slice(0, mc.index).trim();
          }
          var m = /^(.*?)\s+(\d+)\s*[x×]\s*(.+)$/.exec(linha);
          if (m)
            return {
              id: S.uid(),
              nome: m[1].trim(),
              series: +m[2],
              reps: m[3].trim(),
              carga: carga
            };
          return { id: S.uid(), nome: linha, series: 3, reps: '10-12', carga: carga };
        })
        .filter(Boolean);
      if (novo) st.treino.divisao.push(dv);
      fecharModal();
      salvar();
      brinde('Divisão salva');
    };
    if (!novo)
      $('#d-excluir').onclick = function () {
        st.treino.divisao = st.treino.divisao.filter(function (d) {
          return d.id !== dv.id;
        });
        fecharModal();
        salvar();
        brinde('Divisão excluída');
      };
  }

  function modalRegistrarTreino(divisaoId) {
    var dv = st.treino.divisao.filter(function (d) {
      return d.id === divisaoId;
    })[0];
    if (!dv) return;
    abrirModal(
      '<h3>Treino ' +
        esc(dv.nome) +
        ' — ' +
        esc(dv.foco) +
        '</h3>' +
        '<p class="mini" style="margin-top:-8px">Preencha a carga que usou (opcional). Fica salvo como referência pro próximo.</p>' +
        dv.exercicios
          .map(function (ex) {
            return (
              '<div class="exercicio"><span class="nome">' +
              esc(ex.nome) +
              '<br><span class="num">' +
              ex.series +
              '×' +
              esc(ex.reps) +
              '</span></span>' +
              '<input class="carga" data-ex="' +
              ex.id +
              '" type="text" placeholder="kg" value="' +
              esc(ex.carga || '') +
              '"></div>'
            );
          })
          .join('') +
        '<div style="height:16px"></div>' +
        '<button class="btn" id="t-concluir">✅ Concluir treino</button>' +
        '<button class="btn sec" data-fechar>Cancelar</button>'
    );
    $('#t-concluir').onclick = function () {
      var cargas = {};
      $$('#modal input.carga').forEach(function (i) {
        cargas[i.dataset.ex] = i.value.trim();
      });
      var antesTreino = scoreDia();
      registrarTreino(dv.id, cargas);
      vibrar(15);
      celebrarSeCompletou(antesTreino);
      fecharModal();
      brinde('Treino registrado 💪');
    };
  }

  function modalEvento(id) {
    var ev = id
      ? st.eventos.filter(function (e) {
          return e.id === id;
        })[0]
      : null;
    var novo = !ev;
    var base = new Date();
    base.setMinutes(0, 0, 0);
    base.setHours(base.getHours() + 1);
    ev = ev || {
      id: S.uid(),
      titulo: '',
      subtipo: 'evento',
      inicio: base.toISOString(),
      duracaoMin: 60,
      recorrencia: null,
      alertaMin: st.config.alertaEventoMin,
      notas: ''
    };
    var ini = new Date(ev.inicio);
    var recTipo = ev.recorrencia ? ev.recorrencia.tipo : 'nenhuma';
    abrirModal(
      '<h3>' +
        (novo ? 'Novo compromisso' : 'Editar compromisso') +
        '</h3>' +
        '<label class="campo"><span>Título</span><input type="text" id="e-titulo" placeholder="Consulta no dentista" value="' +
        esc(ev.titulo) +
        '"></label>' +
        '<div class="grade2">' +
        '<label class="campo"><span>Data</span><input type="date" id="e-data" value="' +
        S.iso(ini) +
        '"></label>' +
        '<label class="campo"><span>Hora</span><input type="time" id="e-hora" value="' +
        hora(ini) +
        '"></label>' +
        '</div>' +
        '<div class="grade2">' +
        '<label class="campo"><span>Duração (min)</span><input type="number" id="e-dur" value="' +
        (ev.duracaoMin || 0) +
        '"></label>' +
        '<label class="campo"><span>Avisar antes (min)</span><input type="number" id="e-alerta" value="' +
        ev.alertaMin +
        '"></label>' +
        '</div>' +
        '<label class="campo"><span>Repetir</span><select id="e-rec">' +
        '<option value="nenhuma"' +
        (recTipo === 'nenhuma' ? ' selected' : '') +
        '>Não repetir</option>' +
        '<option value="diaria"' +
        (recTipo === 'diaria' ? ' selected' : '') +
        '>Todo dia</option>' +
        '<option value="semanal"' +
        (recTipo === 'semanal' ? ' selected' : '') +
        '>Dias da semana</option>' +
        '</select></label>' +
        '<div id="e-dias-wrap" style="' +
        (recTipo === 'semanal' ? '' : 'display:none') +
        '">' +
        seletorDias(ev.recorrencia && ev.recorrencia.dias ? ev.recorrencia.dias : [], 'e-dias') +
        '<div style="height:14px"></div>' +
        '</div>' +
        '<label class="campo"><span>Notas</span><textarea id="e-notas" placeholder="Endereço, o que levar...">' +
        esc(ev.notas || '') +
        '</textarea></label>' +
        '<button class="btn" id="e-salvar">Salvar</button>' +
        (novo ? '' : '<button class="btn perigo" id="e-excluir">Excluir</button>') +
        '<button class="btn sec" data-fechar>Cancelar</button>'
    );
    $('#e-rec').onchange = function () {
      $('#e-dias-wrap').style.display = this.value === 'semanal' ? '' : 'none';
    };
    $('#e-salvar').onclick = function () {
      var p = $('#e-data').value.split('-');
      var t = ($('#e-hora').value || '09:00').split(':');
      var dt = new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1], 0, 0);
      ev.titulo = $('#e-titulo').value.trim() || 'Compromisso';
      ev.inicio = dt.toISOString();
      ev.duracaoMin = +$('#e-dur').value || 0;
      ev.alertaMin = +$('#e-alerta').value || 0;
      ev.notas = $('#e-notas').value.trim();
      var rt = $('#e-rec').value;
      ev.recorrencia =
        rt === 'nenhuma'
          ? null
          : rt === 'diaria'
            ? { tipo: 'diaria' }
            : { tipo: 'semanal', dias: lerDias('e-dias') };
      if (ev.recorrencia && ev.recorrencia.tipo === 'semanal' && !ev.recorrencia.dias.length)
        ev.recorrencia = null;
      if (novo) st.eventos.push(ev);
      fecharModal();
      salvar();
      brinde('Compromisso salvo');
    };
    if (!novo)
      $('#e-excluir').onclick = function () {
        st.eventos = st.eventos.filter(function (e) {
          return e.id !== ev.id;
        });
        fecharModal();
        salvar();
        brinde('Compromisso excluído');
      };
  }

  function modalConfig() {
    var c = st.config,
      p = st.perfil;
    var hojeIso = S.hoje();
    /** @type {{inicio: string, fim: string} | null} */
    var pausaAtiva = null;
    (st.pausas || []).forEach(function (pa) {
      if (hojeIso >= pa.inicio && hojeIso <= pa.fim) pausaAtiva = pa;
    });
    abrirModal(
      '<h3>Configurações</h3>' +
        '<label class="campo"><span>Seu nome</span><input type="text" id="c-nome" value="' +
        esc(p.nome) +
        '" placeholder="Pedro"></label>' +
        '<div class="grade2">' +
        '<label class="campo"><span>Acordo às</span><input type="time" id="c-acordar" value="' +
        esc(p.acordar) +
        '"></label>' +
        '<label class="campo"><span>Durmo às</span><input type="time" id="c-dormir" value="' +
        esc(p.dormir) +
        '"></label>' +
        '</div>' +
        '<div class="sep"></div>' +
        '<div class="grade2">' +
        '<label class="campo"><span>Meta de água (ml)</span><input type="number" id="c-agua" value="' +
        c.metaAgua +
        '"></label>' +
        '<label class="campo"><span>Copo padrão (ml)</span><input type="number" id="c-copo" value="' +
        c.copoPadrao +
        '"></label>' +
        '</div>' +
        '<div class="grade2">' +
        '<label class="campo"><span>Meta de estudo (min)</span><input type="number" id="c-estudo" value="' +
        c.metaEstudoMin +
        '"></label>' +
        '<label class="campo"><span>Pomodoro (min)</span><input type="number" id="c-pomo" value="' +
        c.pomodoroMin +
        '"></label>' +
        '</div>' +
        '<div class="grade2">' +
        '<label class="campo"><span>Lembrar água a cada (min)</span><input type="number" id="c-int-agua" value="' +
        c.intervaloAguaMin +
        '"></label>' +
        '<label class="campo"><span>Avisar evento antes (min)</span><input type="number" id="c-alerta" value="' +
        c.alertaEventoMin +
        '"></label>' +
        '</div>' +
        '<label class="campo" style="display:flex;align-items:center;gap:10px">' +
        '<input type="checkbox" class="toggle" id="c-notif" ' +
        (c.notificacoes ? 'checked' : '') +
        '>' +
        '<span style="margin:0">Notificações ligadas</span></label>' +
        '<button class="btn sec" id="c-testar">🔔 Testar notificação</button>' +
        '<div class="sep"></div>' +
        '<label class="campo"><span>🌴 Modo férias</span></label>' +
        (pausaAtiva
          ? '<p class="mini">Pausado até ' +
            dataCurta(S.deISO(pausaAtiva.fim)) +
            ' — lembretes não tocam e a sequência não quebra.</p>' +
            '<button class="btn sec" id="c-cancelar-pausa">Cancelar pausa</button>'
          : '<p class="mini">Pausa lembretes e protege sequências por alguns dias (viagem, doença).</p>' +
            '<div class="linha-btn">' +
            '<button class="btn sec" data-pausar="3">+3 dias</button>' +
            '<button class="btn sec" data-pausar="7">+7 dias</button>' +
            '<button class="btn sec" data-pausar="14">+14 dias</button>' +
            '</div>') +
        '<div class="sep"></div>' +
        '<label class="campo"><span>Tema</span><select id="c-tema">' +
        '<option value="escuro"' +
        (c.tema === 'escuro' ? ' selected' : '') +
        '>Escuro</option>' +
        '<option value="claro"' +
        (c.tema === 'claro' ? ' selected' : '') +
        '>Claro</option>' +
        '<option value="auto"' +
        (c.tema === 'auto' ? ' selected' : '') +
        '>Seguir o sistema</option>' +
        '</select></label>' +
        '<div class="linha-btn"><button class="btn sec" id="c-exportar">⬇ Backup</button>' +
        '<button class="btn sec" id="c-importar">⬆ Restaurar</button></div>' +
        '<input type="file" id="c-arquivo" accept="application/json" style="display:none">' +
        '<div style="height:8px"></div>' +
        '<button class="btn" id="c-salvar">Salvar</button>' +
        '<button class="btn perigo" id="c-zerar">Apagar todos os dados</button>' +
        '<button class="btn sec" data-fechar>Fechar</button>' +
        '<p class="mini centro" style="margin-top:14px">Tudo fica salvo só no seu aparelho.</p>'
    );

    $('#c-salvar').onclick = function () {
      p.nome = $('#c-nome').value.trim();
      p.acordar = $('#c-acordar').value || '07:00';
      p.dormir = $('#c-dormir').value || '23:30';
      c.metaAgua = +$('#c-agua').value || 2000;
      c.copoPadrao = +$('#c-copo').value || 250;
      c.metaEstudoMin = +$('#c-estudo').value || 0;
      c.pomodoroMin = +$('#c-pomo').value || 25;
      c.intervaloAguaMin = +$('#c-int-agua').value || 120;
      c.alertaEventoMin = +$('#c-alerta').value || 0;
      c.tema = $('#c-tema').value;
      var querNotif = $('#c-notif').checked;
      aplicarTema();
      if (querNotif && !c.notificacoes) {
        pedirNotificacoes();
      } else {
        c.notificacoes = querNotif;
      }
      fecharModal();
      salvar();
      brinde('Configurações salvas');
    };
    $('#c-testar').onclick = function () {
      if (!('Notification' in window)) return brinde('Este navegador não suporta notificações');
      Notification.requestPermission().then(function (perm) {
        if (perm !== 'granted') return brinde('Permissão negada');
        if (swReg) swReg.active && swReg.active.postMessage({ tipo: 'teste' });
        else
          new Notification('🔔 Notificações ligadas', {
            body: 'É assim que os lembretes vão aparecer.'
          });
      });
    };
    $('#c-exportar').onclick = exportar;
    $('#c-importar').onclick = function () {
      $('#c-arquivo').click();
    };
    $('#c-arquivo').onchange = function (e) {
      importar(e.target.files[0]);
    };
    if (pausaAtiva) {
      $('#c-cancelar-pausa').onclick = function () {
        cancelarPausa();
        fecharModal();
      };
    } else {
      $$('button[data-pausar]').forEach(function (b) {
        b.onclick = function () {
          pausar(+b.dataset.pausar);
          fecharModal();
        };
      });
    }
    $('#c-zerar').onclick = function () {
      if (!confirm('Apagar TODOS os dados do app? Isso não tem volta.')) return;
      st = S.estadoPadrao();
      S.salvar(st).then(function () {
        location.reload();
      });
    };
  }

  /* ---------------- backup ---------------- */
  function exportar() {
    var blob = new Blob([JSON.stringify(st, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'rotina-backup-' + S.hoje() + '.json';
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
    }, 3000);
    brinde('Backup baixado');
  }

  function importar(arquivo) {
    if (!arquivo) return;
    var fr = new FileReader();
    fr.onload = function () {
      try {
        st = S.sanear(JSON.parse(/** @type {string} */ (fr.result)));
        S.salvar(st).then(function () {
          location.reload();
        });
      } catch (e) {
        brinde('Arquivo inválido');
      }
    };
    fr.readAsText(arquivo);
  }

  /* ---------------- congelamento de streak / modo férias ---------------- */
  function protegerHoje() {
    var mes = S.hoje().slice(0, 7);
    if (S.congelamentosDisponiveis(st, mes) <= 0) {
      brinde('Sem congelamentos disponíveis este mês');
      return;
    }
    var hojeIso = S.hoje();
    if (st.diasProtegidos.indexOf(hojeIso) !== -1) {
      brinde('Hoje já está protegido');
      return;
    }
    st.diasProtegidos.push(hojeIso);
    salvar();
    vibrar(15);
    brinde('❄️ Hoje protegido — sua sequência não quebra');
  }

  function pausar(dias) {
    var inicio = S.hoje();
    var fimD = hojeD();
    fimD.setDate(fimD.getDate() + dias - 1);
    st.pausas.push({ inicio: inicio, fim: S.iso(fimD) });
    salvar();
    brinde('Lembretes pausados até ' + dataCurta(fimD));
  }

  function cancelarPausa() {
    var hojeIso = S.hoje();
    var ontem = hojeD();
    ontem.setDate(ontem.getDate() - 1);
    var ontemIso = S.iso(ontem);
    st.pausas = st.pausas
      .map(function (p) {
        if (hojeIso < p.inicio || hojeIso > p.fim) return p;
        return { inicio: p.inicio, fim: ontemIso < p.inicio ? p.inicio : ontemIso };
      })
      .filter(function (p) {
        return p.fim >= p.inicio;
      });
    salvar();
    brinde('Pausa cancelada');
  }

  /* ---------------- tema ---------------- */
  function aplicarTema() {
    var t = st.config.tema;
    if (t === 'auto') {
      t =
        window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
          ? 'claro'
          : 'escuro';
    }
    document.documentElement.setAttribute('data-tema', t);
    var mc = document.querySelector('meta[name=theme-color]');
    if (mc) mc.setAttribute('content', t === 'claro' ? '#f4f6fa' : '#0f1115');
  }

  /* ---------------- notificações ---------------- */
  function pedirNotificacoes() {
    if (!('Notification' in window)) {
      brinde('Este navegador não suporta notificações');
      return;
    }
    Notification.requestPermission().then(function (perm) {
      st.config.notificacoes = perm === 'granted';
      salvar();
      if (perm === 'granted') {
        brinde('Notificações ativadas 🔔');
        registrarSyncPeriodico();
      } else {
        brinde('Permissão negada');
      }
    });
  }

  function registrarSyncPeriodico() {
    if (!swReg || !('periodicSync' in swReg) || !navigator.permissions) return;
    try {
      navigator.permissions
        // 'periodic-background-sync' é real (Chromium/Android), só falta na lib do TS
        .query(/** @type {*} */ ({ name: 'periodic-background-sync' }))
        .then(function (s) {
          if (s.state === 'granted') {
            swReg.periodicSync
              .register('lembretes', { minInterval: 15 * 60 * 1000 })
              .catch(function () {});
          }
        })
        .catch(function () {});
    } catch (e) {
      /* navegador sem suporte */
    }
  }

  function checarLembretes(toleranciaMin) {
    if (!st.config.notificacoes || !swReg) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    N.disparar(st, new Date(), swReg, toleranciaMin).then(function (n) {
      if (n > 0) S.salvar(st);
    });
  }

  // une o que o service worker já marcou como notificado (disparado em segundo
  // plano) no estado em memória, sem tocar no resto — evita reavisar o que o
  // sw.js já mostrou enquanto a página estava fechada/escondida.
  function sincronizarNotificado() {
    return S.carregar()
      .then(function (fresco) {
        Object.keys(fresco.notificado || {}).forEach(function (k) {
          if (!st.notificado[k] || fresco.notificado[k] > st.notificado[k]) {
            st.notificado[k] = fresco.notificado[k];
          }
        });
      })
      .catch(function () {});
  }

  /* ---------------- timer pomodoro ---------------- */
  var timer = { fase: 'foco', restante: 0, rodando: false, fimTs: 0, intervalo: null };

  function carregarTimer() {
    try {
      var raw = localStorage.getItem('rotina-timer');
      if (raw) {
        var t = JSON.parse(raw);
        timer.fase = t.fase || 'foco';
        timer.fimTs = t.fimTs || 0;
        timer.rodando = !!t.rodando;
        timer.restante = t.restante || st.config.pomodoroMin * 60;
        if (timer.rodando) {
          var falta = Math.round((timer.fimTs - Date.now()) / 1000);
          if (falta <= 0) {
            timer.rodando = false;
            concluirFase(true);
          } else {
            timer.restante = falta;
            iniciarIntervalo();
          }
        }
      } else {
        timer.restante = st.config.pomodoroMin * 60;
      }
    } catch (e) {
      timer.restante = st.config.pomodoroMin * 60;
    }
    pintarTimer();
  }

  function salvarTimerLS() {
    try {
      localStorage.setItem(
        'rotina-timer',
        JSON.stringify({
          fase: timer.fase,
          fimTs: timer.fimTs,
          rodando: timer.rodando,
          restante: timer.restante
        })
      );
    } catch (e) {}
  }

  function pintarTimer() {
    var m = Math.floor(Math.max(0, timer.restante) / 60),
      s = Math.max(0, timer.restante) % 60;
    $('#timer-display').textContent = pad(m) + ':' + pad(s);
    $('#timer-fase').textContent =
      timer.fase === 'foco'
        ? timer.rodando
          ? 'Foco — mão na massa 📚'
          : 'Pomodoro — pronto para começar'
        : timer.rodando
          ? 'Pausa — respira 🌿'
          : 'Pausa';
    $('#btn-timer').textContent = timer.rodando ? '⏸ Pausar' : '▶ Iniciar';
  }

  function iniciarIntervalo() {
    clearInterval(timer.intervalo);
    timer.intervalo = setInterval(function () {
      timer.restante = Math.round((timer.fimTs - Date.now()) / 1000);
      if (timer.restante <= 0) {
        concluirFase();
      }
      pintarTimer();
    }, 1000);
  }

  function concluirFase(silencioso) {
    clearInterval(timer.intervalo);
    timer.rodando = false;
    if (timer.fase === 'foco') {
      addEstudo(st.config.pomodoroMin);
      if (!silencioso) {
        brinde('+' + st.config.pomodoroMin + ' min de estudo 📚');
        avisar('📚 Pomodoro concluído', 'Bora de pausa de ' + st.config.pausaMin + ' min.');
      }
      timer.fase = 'pausa';
      timer.restante = st.config.pausaMin * 60;
    } else {
      if (!silencioso) avisar('🌿 Pausa acabou', 'Voltar pro foco?');
      timer.fase = 'foco';
      timer.restante = st.config.pomodoroMin * 60;
    }
    salvarTimerLS();
    pintarTimer();
  }

  function avisar(titulo, corpo) {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (swReg)
      swReg.showNotification(titulo, { body: corpo, icon: 'icons/icon-192.png', tag: 'pomodoro' });
    else new Notification(titulo, { body: corpo });
  }

  /* ---------------- navegação ---------------- */
  function irPara(v) {
    vista = v;
    $$('.vista').forEach(function (s) {
      s.classList.toggle('ativa', s.id === 'vista-' + v);
    });
    $$('#nav button').forEach(function (b) {
      b.classList.toggle('ativa', b.dataset.vista === v);
    });
    renderTopo();
    window.scrollTo(0, 0);
    if (v === 'chat') {
      renderChat();
      setTimeout(function () {
        window.scrollTo(0, document.body.scrollHeight);
      }, 60);
    }
    try {
      history.replaceState(null, '', '#' + v);
    } catch (e) {}
  }

  /* ---------------- eventos globais ---------------- */
  function ligarEventos() {
    $('#nav').addEventListener('click', function (e) {
      var b = alvo(e.target, 'button[data-vista]');
      if (b) irPara(b.dataset.vista);
    });

    $('#btn-config').onclick = modalConfig;
    $('#btn-nova-rotina').onclick = function () {
      modalHabito(null);
    };
    $('#btn-nova-divisao').onclick = function () {
      modalDivisao(null);
    };
    $('#btn-novo-evento').onclick = function () {
      modalEvento(null);
    };
    $('#btn-ver-agenda').onclick = function () {
      irPara('agenda');
    };
    $('#btn-ir-timer').onclick = function () {
      irPara('estudos');
    };
    $('#btn-agua-config').onclick = modalConfig;
    $('#btn-proteger-dia').onclick = protegerHoje;
    $('#btn-compartilhar').onclick = compartilharConquista;

    document.addEventListener('click', function (e) {
      var t = /** @type {HTMLElement} */ (e.target);

      if (alvo(t, '[data-fechar]')) {
        fecharModal();
        return;
      }
      if (t.id === 'modal') {
        fecharModal();
        return;
      }

      var bAgua = alvo(t, '[data-agua]');
      if (bAgua) {
        var ml = +bAgua.dataset.agua;
        var antesAgua = scoreDia();
        var tot = addAgua(ml);
        if (ml > 0) vibrar(15);
        celebrarSeCompletou(antesAgua);
        brinde(
          ml > 0 ? '+' + ml + ' ml · total ' + tot + ' ml' : 'Removido · total ' + tot + ' ml'
        );
        return;
      }

      var bEst = alvo(t, '[data-estudo]');
      if (bEst) {
        var min = +bEst.dataset.estudo;
        var antesEst = scoreDia();
        var totE = addEstudo(min);
        if (min > 0) vibrar(15);
        celebrarSeCompletou(antesEst);
        brinde((min > 0 ? '+' : '') + min + ' min · total ' + totE + ' min');
        return;
      }

      var bTog = alvo(t, '[data-toggle]');
      if (bTog) {
        var antesTog = scoreDia();
        var res = toggleHabito(bTog.dataset.toggle);
        if (res) {
          if (res.on) vibrar(15);
          celebrarSeCompletou(antesTog);
          brinde(res.on ? res.habito.nome + ' ✅' : res.habito.nome + ' desmarcado');
        }
        return;
      }

      var item = alvo(t, '.item[data-habito]');
      if (item && !alvo(t, '[data-toggle]')) {
        modalHabito(item.dataset.habito);
        return;
      }

      var bReg = alvo(t, '[data-registrar]');
      if (bReg) {
        modalRegistrarTreino(bReg.dataset.registrar);
        return;
      }

      var bDiv = alvo(t, '[data-editar-div]');
      if (bDiv) {
        modalDivisao(bDiv.dataset.editarDiv);
        return;
      }

      var bTogDiv = alvo(t, '[data-toggle-div]');
      if (bTogDiv) {
        var idDiv = bTogDiv.dataset.toggleDiv;
        var hojeDow = new Date().getDay();
        var dvAtual = st.treino.divisao.filter(function (d) {
          return d.id === idDiv;
        })[0];
        var ehHojeAtual = dvAtual && (dvAtual.dias || []).indexOf(hojeDow) !== -1;
        var abertaAtual = divisaoAberta[idDiv] !== undefined ? divisaoAberta[idDiv] : ehHojeAtual;
        divisaoAberta[idDiv] = !abertaAtual;
        renderTreino();
        return;
      }

      var bConc = alvo(t, '[data-concluir]');
      if (bConc) {
        var antesConc = scoreDia();
        var rr = reg(bConc.dataset.d);
        var idx = rr.eventosFeitos.indexOf(bConc.dataset.concluir);
        if (idx === -1) {
          rr.eventosFeitos.push(bConc.dataset.concluir);
          ganharXp(5);
          vibrar(15);
        } else rr.eventosFeitos.splice(idx, 1);
        salvar();
        celebrarSeCompletou(antesConc);
        return;
      }

      var bEv = alvo(t, '.evento[data-evento]');
      if (bEv && !alvo(t, '[data-concluir]')) {
        modalEvento(bEv.dataset.evento);
        return;
      }

      var bSug = alvo(t, '[data-sug]');
      if (bSug) {
        $('#entrada-chat').value = bSug.dataset.sug;
        $('#form-chat').requestSubmit();
        return;
      }

      var bNotif = alvo(t, '#btn-ativar-notif');
      if (bNotif) {
        pedirNotificacoes();
        return;
      }

      var bDia = alvo(t, '.dias-semana button');
      if (bDia) {
        bDia.classList.toggle('on');
        return;
      }
    });

    $('#form-chat').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = $('#entrada-chat').value.trim();
      if (!v) return;
      $('#entrada-chat').value = '';
      processar(v);
    });

    $('#btn-timer').onclick = function () {
      if (timer.rodando) {
        clearInterval(timer.intervalo);
        timer.rodando = false;
        timer.restante = Math.max(0, Math.round((timer.fimTs - Date.now()) / 1000));
      } else {
        timer.rodando = true;
        timer.fimTs = Date.now() + timer.restante * 1000;
        iniciarIntervalo();
      }
      salvarTimerLS();
      pintarTimer();
    };
    $('#btn-timer-zerar').onclick = function () {
      clearInterval(timer.intervalo);
      timer.rodando = false;
      timer.fase = 'foco';
      timer.restante = st.config.pomodoroMin * 60;
      salvarTimerLS();
      pintarTimer();
    };

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') {
        if (S.hoje() !== diaCorrente) {
          diaCorrente = S.hoje();
          render();
        }
        // catch-up: no iOS não existe periodicSync, então reabrir o app é a
        // única chance de perceber lembretes que venceram enquanto o Safari
        // barrava a checagem em segundo plano — janela bem maior que o poll
        // normal (45 min) pra pegar o que ficou parado por horas.
        sincronizarNotificado().then(function () {
          checarLembretes(720);
        });
      }
    });

    if (window.matchMedia) {
      window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', function () {
        if (st.config.tema === 'auto') aplicarTema();
      });
    }
  }

  /* ---------------- boot ---------------- */
  function boot() {
    S.carregar().then(function (estado) {
      st = estado;
      aplicarTema();
      ligarEventos();
      renderSugestoes();
      render();
      carregarTimer();

      if (!st.chat.length) {
        addMsg(
          'bot',
          'Oi! Sou sua rotina. 👋\n\n' +
            'Fala comigo em português normal que eu anoto:\n' +
            '• "bebi 500ml"\n' +
            '• "tomei os remédios"\n' +
            '• "estudei 1h30"\n' +
            '• "treinei peito ombro e tríceps"\n' +
            '• "consulta no dentista quinta 15h"\n\n' +
            'Escreve "ajuda" quando quiser a lista completa.'
        );
      }

      var h = (location.hash || '').replace('#', '');
      if (['hoje', 'chat', 'treino', 'estudos', 'agenda', 'historico'].indexOf(h) !== -1) irPara(h);

      setInterval(function () {
        if (S.hoje() !== diaCorrente) {
          diaCorrente = S.hoje();
          render();
        }
        checarLembretes();
      }, 30000);

      setTimeout(checarLembretes, 2500);
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('sw.js')
        .then(function (r) {
          swReg = r;
          registrarSyncPeriodico();
        })
        .catch(function () {});
    }

    // avisado pelo sw.js quando ele dispara lembrete em segundo plano —
    // sincroniza o que já foi notificado pra não reavisar e atualiza a tela
    if (typeof BroadcastChannel !== 'undefined') {
      var canalLembretes = new BroadcastChannel('rotina-lembretes');
      canalLembretes.onmessage = function () {
        sincronizarNotificado().then(function () {
          render();
        });
      };
    }

    checarAtualizacao();
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) checarAtualizacao();
    });
  }

  /* ---------- atualização automática ----------
     versao.json é servido sem cache. Se o valor mudou desde a última vez que
     o app abriu, saiu versão nova no servidor: mostra a barra e, ao tocar,
     limpa o cache do service worker e recarrega. Os dados (IndexedDB /
     localStorage) não são tocados. */
  var CHAVE_VERSAO = 'rotina.versao';
  var checando = false;
  var ultimaChecagem = 0;

  function checarAtualizacao() {
    var agora = Date.now();
    if (checando || agora - ultimaChecagem < 60000) return;
    checando = true;
    ultimaChecagem = agora;
    fetch('versao.json?t=' + agora, { cache: 'no-store' })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (j) {
        checando = false;
        var v = j && j.versao;
        if (!v) return;
        var anterior = null;
        try {
          anterior = localStorage.getItem(CHAVE_VERSAO);
        } catch (e) {}
        if (!anterior) {
          try {
            localStorage.setItem(CHAVE_VERSAO, v);
          } catch (e) {}
          return;
        }
        if (anterior !== v) mostrarBarraAtualizacao(v);
      })
      .catch(function () {
        checando = false;
      });
  }

  function mostrarBarraAtualizacao(v) {
    if (document.getElementById('barra-atualizacao')) return;
    var b = document.createElement('div');
    b.id = 'barra-atualizacao';
    b.className = 'barra-atualizacao';
    b.innerHTML =
      '<span>Nova versão disponível</span>' + '<button type="button">Atualizar</button>';
    b.querySelector('button').addEventListener('click', function () {
      b.querySelector('button').textContent = 'Atualizando…';
      aplicarAtualizacao(v);
    });
    document.body.appendChild(b);
  }

  function aplicarAtualizacao(v) {
    try {
      localStorage.setItem(CHAVE_VERSAO, v);
    } catch (e) {}
    var passos = [];
    if (window.caches) {
      passos.push(
        caches
          .keys()
          .then(function (ks) {
            return Promise.all(
              ks.map(function (k) {
                return caches.delete(k);
              })
            );
          })
          .catch(function () {})
      );
    }
    if (navigator.serviceWorker) {
      passos.push(
        navigator.serviceWorker
          .getRegistration()
          .then(function (r) {
            return r ? r.update() : null;
          })
          .catch(function () {})
      );
    }
    Promise.all(passos)
      .catch(function () {})
      .then(function () {
        location.reload();
      });
  }

  window.RotinaApp = {
    irPara: irPara,
    get estado() {
      return st;
    }
  };
  document.addEventListener('DOMContentLoaded', boot);
})();
