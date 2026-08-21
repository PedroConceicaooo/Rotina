/* ============================================================
   notify.js — cálculo de lembretes e disparo de notificações
   Sem DOM: roda tanto na página quanto no service worker.
   ============================================================ */
(function (root) {
  'use strict';

  function pad(n) {
    return String(n).padStart(2, '0');
  }
  function isoData(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function comHora(base, hhmm) {
    var p = String(hhmm || '09:00').split(':');
    var d = new Date(base.getTime());
    d.setHours(+p[0] || 0, +p[1] || 0, 0, 0);
    return d;
  }
  function mesmoDia(a, b) {
    return isoData(a) === isoData(b);
  }
  function zerar(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  /* ---------- ocorrências de um evento em um dia ---------- */
  function ocorreEm(ev, dia) {
    var inicio = new Date(ev.inicio);
    var d0 = zerar(inicio),
      dd = zerar(dia);
    if (dd < d0) return null;
    var rec = ev.recorrencia;
    if (!rec) return mesmoDia(inicio, dia) ? new Date(inicio) : null;
    if (rec.tipo === 'diaria')
      return comHora(dia, pad(inicio.getHours()) + ':' + pad(inicio.getMinutes()));
    if (rec.tipo === 'semanal' && rec.dias && rec.dias.indexOf(dia.getDay()) !== -1) {
      return comHora(dia, pad(inicio.getHours()) + ':' + pad(inicio.getMinutes()));
    }
    return null;
  }

  /* ---------- eventos de um dia, ordenados ---------- */
  function eventosDoDia(state, dia) {
    var lista = [];
    (state.eventos || []).forEach(function (ev) {
      if (ev.arquivado) return;
      var q = ocorreEm(ev, dia);
      if (q) lista.push({ ev: ev, quando: q });
    });
    lista.sort(function (a, b) {
      return a.quando - b.quando;
    });
    return lista;
  }

  /* ---------- divisão de treino prevista para o dia ---------- */
  function treinoDoDia(state, dia) {
    var dow = dia.getDay();
    var achados = (state.treino.divisao || []).filter(function (d) {
      return (d.dias || []).indexOf(dow) !== -1;
    });
    return achados.length ? achados : null;
  }

  /* ---------- lembretes previstos para o dia ---------- */
  function lembretesDoDia(state, dia) {
    var out = [];
    var cfg = state.config;
    var dataStr = isoData(dia);
    var reg = (state.registros || {})[dataStr] || {
      habitos: {},
      agua: 0,
      estudoMin: 0,
      treinos: []
    };
    var dow = dia.getDay();

    // hábitos
    (state.habitos || []).forEach(function (h) {
      if (!h.ativo || !h.lembrete) return;
      if ((h.dias || []).indexOf(dow) === -1) return;
      var feito = reg.habitos && reg.habitos[h.id];
      if (feito) return;
      out.push({
        chave: 'hab:' + h.id + ':' + dataStr,
        quando: comHora(dia, h.horario),
        titulo: (h.emoji || '✅') + ' ' + h.nome,
        corpo:
          h.tipo === 'quantidade'
            ? 'Hora de tomar ' +
              (h.meta || '') +
              (h.unidade || '') +
              ' de ' +
              h.nome.toLowerCase() +
              '.'
            : 'Ainda não marcou hoje. Bora?',
        tag: 'habito-' + h.id
      });
    });

    // água
    if (cfg.lembreteAgua && (reg.agua || 0) < cfg.metaAgua) {
      var ini = comHora(dia, state.perfil.acordar);
      var fim = comHora(dia, state.perfil.dormir);
      var passo = Math.max(30, cfg.intervaloAguaMin || 120);
      var t = new Date(ini.getTime() + passo * 60000);
      var n = 0;
      while (t < fim && n < 12) {
        out.push({
          chave: 'agua:' + dataStr + ':' + pad(t.getHours()) + pad(t.getMinutes()),
          quando: new Date(t.getTime()),
          titulo: '💧 Água',
          corpo:
            'Você está em ' + (reg.agua || 0) + ' ml de ' + cfg.metaAgua + ' ml. Bebe um copo.',
          tag: 'agua'
        });
        t = new Date(t.getTime() + passo * 60000);
        n++;
      }
    }

    // treino
    var divs = treinoDoDia(state, dia);
    if (state.treino.lembrete && divs && !(reg.treinos || []).length) {
      var d = divs[0];
      out.push({
        chave: 'treino:' + d.id + ':' + dataStr,
        quando: comHora(dia, d.horario || state.treino.horario),
        titulo: '🏋️ Treino ' + d.nome,
        corpo:
          'Você ainda não fez ' + (d.foco || 'seu treino').toLowerCase() + '. Vamos pra academia?',
        tag: 'treino'
      });
    }

    // estudo
    if (cfg.metaEstudoMin > 0 && (reg.estudoMin || 0) < cfg.metaEstudoMin) {
      var alvo = comHora(dia, state.perfil.dormir);
      alvo = new Date(alvo.getTime() - 3 * 3600000);
      out.push({
        chave: 'estudo:' + dataStr,
        quando: alvo,
        titulo: '📚 Estudo',
        corpo:
          'Faltam ' +
          (cfg.metaEstudoMin - (reg.estudoMin || 0)) +
          ' min pra bater sua meta de hoje.',
        tag: 'estudo'
      });
    }

    // eventos
    eventosDoDia(state, dia).forEach(function (o) {
      var alerta = typeof o.ev.alertaMin === 'number' ? o.ev.alertaMin : cfg.alertaEventoMin;
      var feito = (reg.eventosFeitos || []).indexOf(o.ev.id) !== -1;
      if (feito) return;
      var quando = new Date(o.quando.getTime() - alerta * 60000);
      var quandoTxt = pad(o.quando.getHours()) + ':' + pad(o.quando.getMinutes());
      out.push({
        chave: 'ev:' + o.ev.id + ':' + dataStr,
        quando: quando,
        titulo: (o.ev.subtipo === 'lembrete' ? '🔔 ' : '📅 ') + o.ev.titulo,
        corpo:
          alerta > 0
            ? 'Começa às ' + quandoTxt + ' (em ' + alerta + ' min).'
            : 'Agora, às ' + quandoTxt + '.',
        tag: 'evento-' + o.ev.id
      });
    });

    out.sort(function (a, b) {
      return a.quando - b.quando;
    });
    return out;
  }

  /* ---------- o que está vencido e ainda não notificado ---------- */
  function pendentes(state, agora, toleranciaMin) {
    toleranciaMin = toleranciaMin || 45;
    var limiteInferior = new Date(agora.getTime() - toleranciaMin * 60000);
    var lista = lembretesDoDia(state, agora);
    return lista.filter(function (l) {
      if (l.quando > agora || l.quando < limiteInferior) return false;
      return !state.notificado[l.chave];
    });
  }

  /* ---------- disparo ---------- */
  function mostrar(reg, l) {
    return reg.showNotification(l.titulo, {
      body: l.corpo,
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: l.tag,
      renotify: true,
      requireInteraction: false,
      data: { chave: l.chave, url: './index.html' }
    });
  }

  function disparar(state, agora, reg) {
    var lista = pendentes(state, agora);
    if (!lista.length) return Promise.resolve(0);
    return Promise.all(
      lista.map(function (l) {
        state.notificado[l.chave] = Date.now();
        return mostrar(reg, l).catch(function () {});
      })
    ).then(function () {
      limparNotificado(state);
      return lista.length;
    });
  }

  function limparNotificado(state) {
    var corte = Date.now() - 3 * 86400000;
    Object.keys(state.notificado).forEach(function (k) {
      if (state.notificado[k] < corte) delete state.notificado[k];
    });
  }

  root.RotinaNotify = {
    lembretesDoDia: lembretesDoDia,
    pendentes: pendentes,
    disparar: disparar,
    eventosDoDia: eventosDoDia,
    treinoDoDia: treinoDoDia,
    ocorreEm: ocorreEm,
    isoData: isoData,
    comHora: comHora
  };
})(typeof self !== 'undefined' ? self : this);
