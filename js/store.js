/* ============================================================
   store.js — modelo de dados + persistência (IndexedDB)
   Compartilhado entre a página e o service worker.
   ============================================================ */
(function (root) {
  'use strict';

  var DB_NAME = 'rotina-db';
  var DB_VERSION = 1;
  var STORE = 'kv';
  var KEY = 'state';

  /* os tipos Estado/Habito/DivisaoTreino/Evento/RegistroDia/Config são
     globais ambientes, definidos em js/types.d.ts (só VS Code, zero
     runtime) */

  /* ---------- IndexedDB mínimo ---------- */
  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
      req.onerror = function () {
        reject(req.error);
      };
    });
  }

  /** @param {string} key @returns {Promise<*>} */
  function idbGet(key) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var req = tx.objectStore(STORE).get(key);
        req.onsuccess = function () {
          resolve(req.result);
        };
        req.onerror = function () {
          reject(req.error);
        };
      });
    });
  }

  /** @param {string} key @param {*} value @returns {Promise<boolean>} */
  function idbSet(key, value) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(value, key);
        tx.oncomplete = function () {
          resolve(true);
        };
        tx.onerror = function () {
          reject(tx.error);
        };
      });
    });
  }

  /* ---------- utilitários de data ---------- */
  /** @param {number} n @returns {string} */
  function pad(n) {
    return String(n).padStart(2, '0');
  }

  /** @param {Date} [d] @returns {string} 'YYYY-MM-DD' */
  function iso(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** @returns {string} 'YYYY-MM-DD' de hoje */
  function hoje() {
    return iso(new Date());
  }

  /** @param {Date} d @returns {string} 'HH:MM' */
  function hhmm(d) {
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  /** @param {string} s 'YYYY-MM-DD' @returns {Date} meio-dia local, evita virada de fuso */
  function deISO(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2], 12, 0, 0, 0);
  }

  /** @param {Date} d @param {number} n @returns {Date} */
  function addDias(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  /** @param {string} str 'HH:MM' @returns {number|null} minutos desde meia-noite */
  function minutosDoDia(str) {
    if (!str) return null;
    var p = String(str).split(':');
    return +p[0] * 60 + +(p[1] || 0);
  }

  /** @returns {string} id curto e único o bastante pra uso local */
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- estado padrão ---------- */
  /** @returns {Estado} */
  function estadoPadrao() {
    return {
      versao: 1,
      criadoEm: new Date().toISOString(),
      perfil: { nome: '', acordar: '07:00', dormir: '23:30' },
      config: {
        metaAgua: 2500,
        copoPadrao: 250,
        metaEstudoMin: 60,
        pomodoroMin: 25,
        pausaMin: 5,
        notificacoes: false,
        alertaEventoMin: 30,
        tema: 'auto',
        lembreteAgua: true,
        intervaloAguaMin: 120
      },
      habitos: [
        {
          id: uid(),
          nome: 'Remédios',
          emoji: '💊',
          tipo: 'check',
          horario: '08:00',
          dias: [0, 1, 2, 3, 4, 5, 6],
          lembrete: true,
          ativo: true
        },
        {
          id: uid(),
          nome: 'Creatina',
          emoji: '🥤',
          tipo: 'quantidade',
          meta: 5,
          unidade: 'g',
          horario: '09:00',
          dias: [0, 1, 2, 3, 4, 5, 6],
          lembrete: true,
          ativo: true
        },
        {
          id: uid(),
          nome: 'Alongamento',
          emoji: '🧘',
          tipo: 'check',
          horario: '21:00',
          dias: [1, 3, 5],
          lembrete: false,
          ativo: true
        }
      ],
      treino: {
        lembrete: true,
        horario: '19:00',
        divisao: [
          {
            id: uid(),
            nome: 'A',
            foco: 'Peito, ombro e tríceps',
            dias: [1, 4],
            exercicios: [
              { id: uid(), nome: 'Supino reto', series: 4, reps: '8-12', carga: '' },
              {
                id: uid(),
                nome: 'Supino inclinado com halteres',
                series: 3,
                reps: '10-12',
                carga: ''
              },
              { id: uid(), nome: 'Desenvolvimento militar', series: 4, reps: '8-10', carga: '' },
              { id: uid(), nome: 'Elevação lateral', series: 3, reps: '12-15', carga: '' },
              { id: uid(), nome: 'Tríceps na polia', series: 3, reps: '10-15', carga: '' },
              { id: uid(), nome: 'Tríceps francês', series: 3, reps: '10-12', carga: '' }
            ]
          },
          {
            id: uid(),
            nome: 'B',
            foco: 'Costas e bíceps',
            dias: [2, 5],
            exercicios: [
              { id: uid(), nome: 'Barra fixa / puxada alta', series: 4, reps: '8-12', carga: '' },
              { id: uid(), nome: 'Remada curvada', series: 4, reps: '8-12', carga: '' },
              { id: uid(), nome: 'Remada unilateral', series: 3, reps: '10-12', carga: '' },
              { id: uid(), nome: 'Rosca direta', series: 3, reps: '10-12', carga: '' },
              { id: uid(), nome: 'Rosca martelo', series: 3, reps: '10-12', carga: '' }
            ]
          },
          {
            id: uid(),
            nome: 'C',
            foco: 'Pernas e abdômen',
            dias: [3, 6],
            exercicios: [
              { id: uid(), nome: 'Agachamento livre', series: 4, reps: '8-12', carga: '' },
              { id: uid(), nome: 'Leg press', series: 4, reps: '10-15', carga: '' },
              { id: uid(), nome: 'Cadeira extensora', series: 3, reps: '12-15', carga: '' },
              { id: uid(), nome: 'Mesa flexora', series: 3, reps: '12-15', carga: '' },
              { id: uid(), nome: 'Panturrilha em pé', series: 4, reps: '15-20', carga: '' },
              { id: uid(), nome: 'Prancha', series: 3, reps: '45s', carga: '' }
            ]
          }
        ]
      },
      eventos: [],
      registros: {},
      chat: [],
      notificado: {}
    };
  }

  /* ---------- registro do dia ---------- */
  /**
   * @param {Estado} state
   * @param {string} [data] 'YYYY-MM-DD', padrão hoje
   * @returns {RegistroDia}
   */
  function registroDe(state, data) {
    data = data || hoje();
    if (!state.registros[data]) {
      state.registros[data] = {
        habitos: {},
        agua: 0,
        estudoMin: 0,
        treinos: [],
        eventosFeitos: []
      };
    }
    var r = state.registros[data];
    if (!r.habitos) r.habitos = {};
    if (typeof r.agua !== 'number') r.agua = 0;
    if (typeof r.estudoMin !== 'number') r.estudoMin = 0;
    if (!Array.isArray(r.treinos)) r.treinos = [];
    if (!Array.isArray(r.eventosFeitos)) r.eventosFeitos = [];
    return r;
  }

  /* ---------- migração / saneamento ---------- */
  /**
   * Migra/completa qualquer estado carregado do disco pro formato atual.
   * @param {*} s
   * @returns {Estado}
   */
  function sanear(s) {
    var base = estadoPadrao();
    if (!s || typeof s !== 'object') return base;
    s.versao = base.versao;
    s.perfil = Object.assign({}, base.perfil, s.perfil || {});
    s.config = Object.assign({}, base.config, s.config || {});
    if (!Array.isArray(s.habitos)) s.habitos = base.habitos;
    if (!s.treino || !Array.isArray(s.treino.divisao)) s.treino = base.treino;
    if (!Array.isArray(s.eventos)) s.eventos = [];
    if (!s.registros || typeof s.registros !== 'object') s.registros = {};
    if (!Array.isArray(s.chat)) s.chat = [];
    if (!s.notificado || typeof s.notificado !== 'object') s.notificado = {};
    return s;
  }

  /* ---------- API pública ---------- */
  /** @returns {Promise<Estado>} */
  function carregar() {
    return idbGet(KEY)
      .then(function (v) {
        if (v) return sanear(v);
        // fallback: backup em localStorage
        if (typeof localStorage !== 'undefined') {
          try {
            var raw = localStorage.getItem('rotina-backup');
            if (raw) return sanear(JSON.parse(raw));
          } catch (e) {
            /* ignora */
          }
        }
        return estadoPadrao();
      })
      .catch(function () {
        return estadoPadrao();
      });
  }

  /** @param {Estado} state @returns {Promise<boolean>} */
  function salvar(state) {
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('rotina-backup', JSON.stringify(state));
      } catch (e) {
        /* cota */
      }
    }
    return idbSet(KEY, state).catch(function () {
      return false;
    });
  }

  root.RotinaStore = {
    KEY: KEY,
    idbGet: idbGet,
    idbSet: idbSet,
    carregar: carregar,
    salvar: salvar,
    estadoPadrao: estadoPadrao,
    registroDe: registroDe,
    sanear: sanear,
    // helpers exportados
    pad: pad,
    iso: iso,
    hoje: hoje,
    hhmm: hhmm,
    deISO: deISO,
    addDias: addDias,
    minutosDoDia: minutosDoDia,
    uid: uid
  };
})(typeof self !== 'undefined' ? self : this);
