/* ============================================================
   nlp.js — interpretador de comandos em português (offline)
   Não usa IA externa: regex + gramática de datas/horas em pt-BR.
   Marca os trechos consumidos para conseguir extrair o título.
   ============================================================ */
(function (root) {
  'use strict';

  /* ---------- normalização preservando o comprimento ---------- */
  var ACENTOS = {
    á: 'a',
    à: 'a',
    ã: 'a',
    â: 'a',
    ä: 'a',
    é: 'e',
    è: 'e',
    ê: 'e',
    ë: 'e',
    í: 'i',
    ì: 'i',
    î: 'i',
    ï: 'i',
    ó: 'o',
    ò: 'o',
    õ: 'o',
    ô: 'o',
    ö: 'o',
    ú: 'u',
    ù: 'u',
    û: 'u',
    ü: 'u',
    ç: 'c',
    ñ: 'n'
  };

  function normalizar(txt) {
    var out = '';
    var s = String(txt).toLowerCase();
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      out += ACENTOS[c] || c;
    }
    return out;
  }

  var NUM_PALAVRA = {
    um: 1,
    uma: 1,
    dois: 2,
    duas: 2,
    tres: 3,
    quatro: 4,
    cinco: 5,
    seis: 6,
    sete: 7,
    oito: 8,
    nove: 9,
    dez: 10,
    onze: 11,
    doze: 12,
    quinze: 15,
    vinte: 20,
    trinta: 30,
    quarenta: 40,
    cinquenta: 50,
    meia: 0.5,
    meio: 0.5
  };

  var DIAS_MAP = {
    domingo: 0,
    dom: 0,
    segunda: 1,
    seg: 1,
    terca: 2,
    ter: 2,
    quarta: 3,
    qua: 3,
    quinta: 4,
    qui: 4,
    sexta: 5,
    sex: 5,
    sabado: 6,
    sab: 6
  };

  var MESES = {
    janeiro: 0,
    jan: 0,
    fevereiro: 1,
    fev: 1,
    marco: 2,
    mar: 2,
    abril: 3,
    abr: 3,
    maio: 4,
    mai: 4,
    junho: 5,
    jun: 5,
    julho: 6,
    jul: 6,
    agosto: 7,
    ago: 7,
    setembro: 8,
    set: 8,
    outubro: 9,
    out: 9,
    novembro: 10,
    nov: 10,
    dezembro: 11,
    dez: 11
  };

  var NOMES_DIA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  var NOMES_DIA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  /* ---------- dicionário de palavras-chave por intenção ---------- */
  var LEXICO = {
    ajuda: ['ajuda', 'help', '\\?', 'comandos', 'o que voce faz'],
    pendencia: ['o que falta', 'falta o que', 'ainda falta', 'pendencias', 'pendencia', 'pendente'],
    estatisticas: [
      'estatisticas',
      'estatistica',
      'progresso',
      'sequencias',
      'sequencia',
      'streaks',
      'streak',
      'como fui'
    ],
    negacao: ['nao', 'ainda nao', 'esqueci'],
    aguaVerbos: ['bebi', 'tomei', 'bebe', 'beber', 'tomar', 'enchi', 'encher', 'mais'],
    aguaConfig: ['meta', 'definir', 'configurar', 'mudar'],
    treinoVerbos: ['treinei', 'treino', 'treinar', 'academia', 'malhei', 'malhar', 'gym'],
    treinoRegistrou: ['treinei', 'malhei', 'fui', 'fiz', 'acabei'],
    treinoPular: ['vou', 'marcar', 'agendar', 'lembr'],
    habitoConfirmou: ['tomei', 'fiz', 'ja', 'feito', 'concluido', 'apliquei', 'usei', 'acabei'],
    habitoInfinitivo: ['tomar', 'fazer', 'marcar', 'nao']
  };

  function reAlt(lista) {
    return new RegExp('\\b(' + lista.join('|') + ')\\b');
  }

  var RE_AJUDA = new RegExp('^\\s*(' + LEXICO.ajuda.join('|') + ')\\s*[?!.]*\\s*$');
  var RE_PENDENCIA = reAlt(LEXICO.pendencia);
  var RE_ESTATISTICAS = reAlt(LEXICO.estatisticas);
  var RE_NEGACAO = reAlt(LEXICO.negacao);
  var RE_AGUA_VERBOS = reAlt(LEXICO.aguaVerbos);
  var RE_AGUA_CONFIG = reAlt(LEXICO.aguaConfig);
  var RE_TREINO_VERBOS = reAlt(LEXICO.treinoVerbos);
  var RE_TREINO_REGISTROU = reAlt(LEXICO.treinoRegistrou);
  var RE_TREINO_PULAR = reAlt(LEXICO.treinoPular);
  var RE_HABITO_CONFIRMOU = reAlt(LEXICO.habitoConfirmou);
  var RE_HABITO_INFINITIVO = reAlt(LEXICO.habitoInfinitivo);

  /* ---------- distância de edição (fuzzy matching) ---------- */
  function levenshtein(a, b) {
    if (a === b) return 0;
    var al = a.length,
      bl = b.length;
    if (!al) return bl;
    if (!bl) return al;
    var prev = new Array(bl + 1);
    var curr = new Array(bl + 1);
    for (var j = 0; j <= bl; j++) prev[j] = j;
    for (var i = 1; i <= al; i++) {
      curr[0] = i;
      for (var j2 = 1; j2 <= bl; j2++) {
        var custo = a.charAt(i - 1) === b.charAt(j2 - 1) ? 0 : 1;
        curr[j2] = Math.min(prev[j2] + 1, curr[j2 - 1] + 1, prev[j2 - 1] + custo);
      }
      var tmp = prev;
      prev = curr;
      curr = tmp;
    }
    return prev[bl];
  }

  function distanciaMaxima(len) {
    if (len <= 4) return 1;
    if (len <= 8) return 2;
    return 3;
  }

  function tokens(n) {
    return n.split(/[^a-z]+/).filter(Boolean);
  }

  // tolera erro de digitação: "agua" bate certo, "ágia"/"agiua" também via distância de edição
  function temPalavraFuzzy(n, alvo) {
    if (new RegExp('\\b' + alvo + '\\b').test(n)) return true;
    var max = distanciaMaxima(alvo.length);
    var toks = tokens(n);
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (Math.abs(t.length - alvo.length) > max) continue;
      if (t.charAt(0) !== alvo.charAt(0)) continue;
      if (levenshtein(t, alvo) <= max) return true;
    }
    return false;
  }

  /* ---------- marcação de trechos consumidos ---------- */
  function Marcas() {
    this.spans = [];
  }
  Marcas.prototype.add = function (i, len) {
    if (i >= 0 && len > 0) this.spans.push([i, i + len]);
  };
  Marcas.prototype.limpar = function (original) {
    var chars = original.split('');
    for (var k = 0; k < this.spans.length; k++) {
      for (var i = this.spans[k][0]; i < this.spans[k][1] && i < chars.length; i++) chars[i] = ' ';
    }
    return chars.join('');
  };

  function pad2(x) {
    return String(x).padStart(2, '0');
  }
  function zerar(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  /* ---------- extração de hora ---------- */
  function extrairHora(n, marcas) {
    var m;
    m = /\bmeio[\s-]?dia\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return { h: 12, m: 0 };
    }
    m = /\bmeia[\s-]?noite\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return { h: 0, m: 0 };
    }

    var pm = /\b(da|de|à|a)\s+(tarde|noite)\b/.exec(n);
    var am = /\b(da|de|à|a)\s+(manha|madrugada)\b/.exec(n);
    var periodo = pm ? 'pm' : am ? 'am' : null;

    // 15:30 | 15h30 | 15hs30
    m = /(^|[^\d])(\d{1,2})\s*(?::|h|hs)\s*(\d{2})\b/.exec(n);
    if (m && +m[3] < 60) {
      marcas.add(m.index + m[1].length, m[0].length - m[1].length);
      return ajustar(+m[2], +m[3], periodo, pm, am, marcas);
    }
    // 15h | 15 horas | 8 hrs
    m = /(^|[^\d])(\d{1,2})\s*(?:h|hs|hrs|horas|hora)\b(?!\s*\d)/.exec(n);
    if (m) {
      marcas.add(m.index + m[1].length, m[0].length - m[1].length);
      return ajustar(+m[2], 0, periodo, pm, am, marcas);
    }
    // às 9 | as 19 | pras 8
    m =
      /\b(?:as|à|a|pras|pra|para as)\s+(\d{1,2})(?!\d)(?!\s*(?:min|ml|g\b|kg|dias|semanas|copos))/.exec(
        n
      );
    if (m) {
      marcas.add(m.index, m[0].length);
      return ajustar(+m[1], 0, periodo, pm, am, marcas);
    }
    return null;
  }

  function ajustar(h, mm, periodo, pm, am, marcas) {
    if (periodo === 'pm' && h < 12) h += 12;
    if (periodo === 'am' && h === 12) h = 0;
    if (pm) marcas.add(pm.index, pm[0].length);
    if (am) marcas.add(am.index, am[0].length);
    if (h > 23) h = 23;
    return { h: h, m: mm };
  }

  /* ---------- dias da semana presentes no texto ---------- */
  function tokensDia(n) {
    var re =
      /\b(domingos?|segundas?-feiras?|segundas?|tercas?-feiras?|tercas?|quartas?-feiras?|quartas?|quintas?-feiras?|quintas?|sextas?-feiras?|sextas?|sabados?|dom|seg|ter|qua|qui|sex|sab)\b/g;
    var achados = [],
      m;
    while ((m = re.exec(n)) !== null) {
      var tok = m[1];
      if (tok === 'ter' && /^\s+(que|de|certeza|uns|umas)\b/.test(n.slice(m.index + 3))) continue;
      var chave = tok.replace(/-feiras?$/, '').replace(/s$/, '');
      if (!(chave in DIAS_MAP)) continue;
      achados.push({ dia: DIAS_MAP[chave], index: m.index, len: tok.length });
    }
    return achados;
  }

  /* ---------- extração de data ---------- */
  function extrairData(n, agora, marcas) {
    var m, d;
    m = /\bdepois\s+de\s+amanha\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return diasDepois(agora, 2);
    }
    m = /\bamanha\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return diasDepois(agora, 1);
    }
    m = /\b(hoje|hj)\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return diasDepois(agora, 0);
    }
    m = /\bontem\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return diasDepois(agora, -1);
    }

    m =
      /\b(?:daqui\s+a|daqui\s+há|em|dentro\s+de)\s+(\d+|um|uma|dois|duas|tres)\s+(dias?|semanas?|mes|meses)\b/.exec(
        n
      );
    if (m) {
      marcas.add(m.index, m[0].length);
      var q = /^\d+$/.test(m[1]) ? +m[1] : NUM_PALAVRA[m[1]] || 1;
      var mult = /semana/.test(m[2]) ? 7 : /mes/.test(m[2]) ? 30 : 1;
      return diasDepois(agora, q * mult);
    }

    m = /\b(?:dia\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      var ano = m[3] ? (+m[3] < 100 ? 2000 + +m[3] : +m[3]) : agora.getFullYear();
      d = new Date(ano, +m[2] - 1, +m[1], 12, 0, 0, 0);
      if (!m[3] && d < zerar(agora)) d.setFullYear(ano + 1);
      return d;
    }

    m = /\b(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)\b/.exec(n);
    if (m && m[2] in MESES) {
      marcas.add(m.index, m[0].length);
      d = new Date(agora.getFullYear(), MESES[m[2]], +m[1], 12, 0, 0, 0);
      if (d < zerar(agora)) d.setFullYear(agora.getFullYear() + 1);
      return d;
    }

    m = /\bdia\s+(\d{1,2})\b(?!\s*[:h])/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      d = new Date(agora.getFullYear(), agora.getMonth(), +m[1], 12, 0, 0, 0);
      if (d < zerar(agora)) d.setMonth(d.getMonth() + 1);
      return d;
    }

    m = /\b(semana\s+que\s+vem|proxima\s+semana)\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return diasDepois(agora, 7);
    }

    var dias = tokensDia(n);
    if (dias.length === 1 && !/\b(toda|todas|todo|todos)\b/.test(n)) {
      marcas.add(dias[0].index, dias[0].len);
      var prox = /\bproxim[ao]\b/.exec(n);
      if (prox) marcas.add(prox.index, prox[0].length);
      var na = /\b(na|no|essa|nessa|neste|nesta)\s+$/.exec(n.slice(0, dias[0].index));
      if (na) marcas.add(dias[0].index - na[0].length, na[0].length);
      return proximoDiaSemana(agora, dias[0].dia, !!prox);
    }
    return null;
  }

  function diasDepois(agora, n) {
    var d = new Date(agora.getTime());
    d.setDate(d.getDate() + n);
    d.setHours(12, 0, 0, 0);
    return d;
  }

  function proximoDiaSemana(agora, alvo, forcarProxima) {
    var d = new Date(agora.getTime());
    d.setHours(12, 0, 0, 0);
    var delta = (alvo - d.getDay() + 7) % 7;
    if (delta === 0 && forcarProxima) delta = 7;
    d.setDate(d.getDate() + delta);
    return d;
  }

  /* ---------- recorrência ---------- */
  function unicos(arr) {
    return arr
      .filter(function (v, i, a) {
        return a.indexOf(v) === i;
      })
      .sort(function (a, b) {
        return a - b;
      });
  }

  function extrairRecorrencia(n, marcas) {
    var m;
    m = /\b(todo\s+dia|todos\s+os\s+dias|diariamente|diario)\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return { tipo: 'diaria' };
    }
    m = /\b(dias\s+uteis|de\s+segunda\s+a\s+sexta|seg\s+a\s+sex)\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return { tipo: 'semanal', dias: [1, 2, 3, 4, 5] };
    }
    m = /\b(fim\s+de\s+semana|fins\s+de\s+semana|finais\s+de\s+semana)\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return { tipo: 'semanal', dias: [0, 6] };
    }

    var temTodo = /\b(todas\s+as|todos\s+os|toda|todo)\b/.exec(n);
    var dias = tokensDia(n);
    if (temTodo && dias.length >= 1) {
      marcas.add(temTodo.index, temTodo[0].length);
      dias.forEach(function (a) {
        marcas.add(a.index, a.len);
      });
      limparConectores(n, dias, marcas);
      return {
        tipo: 'semanal',
        dias: unicos(
          dias.map(function (a) {
            return a.dia;
          })
        )
      };
    }
    if (dias.length >= 2) {
      dias.forEach(function (a) {
        marcas.add(a.index, a.len);
      });
      limparConectores(n, dias, marcas);
      return {
        tipo: 'semanal',
        dias: unicos(
          dias.map(function (a) {
            return a.dia;
          })
        )
      };
    }
    return null;
  }

  function limparConectores(n, dias, marcas) {
    var min = Math.min.apply(
      null,
      dias.map(function (a) {
        return a.index;
      })
    );
    var max = Math.max.apply(
      null,
      dias.map(function (a) {
        return a.index + a.len;
      })
    );
    var re = /(\se\s|,\s?)/g,
      c;
    while ((c = re.exec(n)) !== null) {
      if (c.index >= min && c.index < max) marcas.add(c.index, c[0].length);
    }
  }

  /* ---------- duração ---------- */
  function extrairDuracao(n, marcas) {
    var m;
    m = /\b(\d{1,2})\s*h(?:oras?)?\s*(\d{1,2})\s*(?:min|minutos?)?\b/.exec(n);
    if (m && +m[2] < 60) {
      marcas.add(m.index, m[0].length);
      return +m[1] * 60 + +m[2];
    }
    m = /\b(\d{1,3})\s*(?:min|minutos|minuto)\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return +m[1];
    }
    m = /\b(\d{1,2})\s*(?:h|horas|hora)\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      return +m[1] * 60;
    }
    m = /\b(meia|uma|um|dois|duas|tres|quatro)\s+(horas?|minutos?)\b/.exec(n);
    if (m) {
      marcas.add(m.index, m[0].length);
      var q = NUM_PALAVRA[m[1]] || 1;
      return /hora/.test(m[2]) ? Math.round(q * 60) : Math.round(q);
    }
    return null;
  }

  /* ---------- quantidade de água ---------- */
  function extrairAgua(n, copoPadrao) {
    var m;
    m = /\b(\d{2,4})\s*(ml|mls)\b/.exec(n);
    if (m) return +m[1];
    m = /\b(\d(?:[.,]\d)?)\s*(l|lt|litro|litros)\b/.exec(n);
    if (m) return Math.round(parseFloat(m[1].replace(',', '.')) * 1000);
    m = /\b(\d{1,2}|um|uma|dois|duas|tres|meio|meia)\s*(copos?|garrafas?)\b/.exec(n);
    if (m) {
      var q = /^\d+$/.test(m[1]) ? +m[1] : NUM_PALAVRA[m[1]] || 1;
      var base = /garrafa/.test(m[2]) ? 500 : copoPadrao;
      return Math.round(q * base);
    }
    m = /\b(\d{2,4})\b/.exec(n);
    if (m && +m[1] >= 50 && +m[1] <= 3000) return +m[1];
    return copoPadrao;
  }

  /* ---------- limpeza do título ---------- */
  var LIXO = [
    /\s(me\s+)?lembr(a|e|ar|ete)\s+(de\s+|que\s+)?/g,
    /\s(anota|anotar|marca|marcar|agenda|agendar|cria|criar|adiciona|adicionar|coloca|colocar|bota|botar)\s+(ai\s+)?(uma\s+|um\s+|o\s+|a\s+)?/gi,
    /\s(eu\s+)?(tenho|vou\s+ter|tem)\s+/gi,
    /\s(que\s+eu\s+tenho|que\s+eu\s+vou)\s/gi
  ];

  function limparTitulo(s) {
    var t = ' ' + s + ' ';
    LIXO.forEach(function (re) {
      t = t.replace(re, ' ');
    });
    t = t.replace(/\s+/g, ' ').trim();
    t = t.replace(/^[,;:.!?\s]+/, '').replace(/[,;:\s]+$/, '');
    t = t.replace(/\s+(as|às|na|no|em|de|do|da|pra|para|com|a|o)$/i, '');
    t = t.replace(/^(as|às|na|no|em|de|do|da|pra|para|e|que)\s+/i, '');
    t = t.trim();
    if (!t) return '';
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /* ---------- casamento de hábito / treino ---------- */
  /**
   * @param {string} n texto normalizado
   * @param {Habito[]} habitos
   * @returns {Habito|null}
   */
  function acharHabito(n, habitos) {
    var melhor = null;
    (habitos || []).forEach(function (h) {
      if (h.ativo === false) return;
      var alvo = normalizar(h.nome);
      var raiz = alvo.replace(/s$/, '');
      if (n.indexOf(alvo) !== -1 || (raiz.length >= 4 && n.indexOf(raiz) !== -1)) {
        if (!melhor || alvo.length > normalizar(melhor.nome).length) melhor = h;
      }
    });
    if (melhor) return melhor;

    // fallback fuzzy: tolera erro de digitação no nome do hábito
    var toks = tokens(n);
    var melhorDist = Infinity;
    (habitos || []).forEach(function (h) {
      if (h.ativo === false) return;
      var palavras = normalizar(h.nome)
        .split(/\s+/)
        .filter(function (p) {
          return p.length >= 4;
        });
      palavras.forEach(function (p) {
        var max = distanciaMaxima(p.length);
        toks.forEach(function (t) {
          if (Math.abs(t.length - p.length) > max) return;
          var d = levenshtein(t, p);
          if (d <= max && d < melhorDist) {
            melhorDist = d;
            melhor = h;
          }
        });
      });
    });
    return melhor;
  }

  /**
   * @param {string} n texto normalizado
   * @param {DivisaoTreino[]} divisao
   * @returns {DivisaoTreino|null}
   */
  function acharDivisao(n, divisao) {
    var melhor = null,
      maxPontos = 0;
    (divisao || []).forEach(function (d) {
      var pontos = 0;
      var termos = normalizar(d.foco || '')
        .split(/[^a-z]+/)
        .filter(function (t) {
          return t.length > 2 && t !== 'com';
        });
      termos.forEach(function (t) {
        var raiz = t.replace(/(es|s)$/, '');
        if (raiz.length > 2 && n.indexOf(raiz) !== -1) pontos++;
      });
      var nomeDiv = normalizar(d.nome || '');
      if (nomeDiv && new RegExp('\\btreino\\s+' + nomeDiv + '\\b').test(n)) pontos += 3;
      if (pontos > maxPontos) {
        maxPontos = pontos;
        melhor = d;
      }
    });
    return maxPontos > 0 ? melhor : null;
  }

  /* NlpCtx/Acao/Habito/DivisaoTreino são globais ambientes, definidos em
     js/types.d.ts (só VS Code, zero runtime) */

  /**
   * Interpreta uma frase livre em português e devolve a ação que ela pede.
   * @param {string} texto
   * @param {NlpCtx} [ctx]
   * @returns {Acao}
   */
  function interpretar(texto, ctx) {
    ctx = ctx || {};
    var agora = ctx.agora || new Date();
    var original = String(texto || '').trim();
    if (!original) return { tipo: 'vazio' };
    var n = normalizar(original);
    var marcas = new Marcas();

    if (RE_AJUDA.test(n)) return { tipo: 'ajuda' };

    /* --- consultas --- */
    if (
      /\b(o que|oque|que)\s+(eu\s+)?(tenho|tem|ta marcado|esta marcado|falta)\b/.test(n) ||
      /\b(resumo|minha agenda|meu dia|agenda de|como (ta|esta) (meu|o) dia)\b/.test(n) ||
      /^\s*(hoje|agenda|amanha|semana|resumo)\s*[?!.]*\s*$/.test(n)
    ) {
      return {
        tipo: 'consulta',
        escopo: /\bamanha\b/.test(n) ? 'amanha' : /\bsemana\b/.test(n) ? 'semana' : 'hoje'
      };
    }
    if (RE_PENDENCIA.test(n)) {
      return { tipo: 'consulta', escopo: 'pendente' };
    }
    if (RE_ESTATISTICAS.test(n)) {
      return { tipo: 'consulta', escopo: 'stats' };
    }
    if (
      /\b(qual|que)\s+(e\s+)?(o\s+)?treino\b/.test(n) ||
      /\btreino de hoje\b/.test(n) ||
      /\btreino de amanha\b/.test(n)
    ) {
      return { tipo: 'consulta', escopo: 'treino' };
    }

    var negado = RE_NEGACAO.test(n);

    /* --- água --- */
    var recipiente =
      /\b(um|uma|dois|duas|tres|meio|meia|\d{1,2})\s*(copos?|litros?|garrafas?)\b/.test(n);
    var temAgua = temPalavraFuzzy(n, 'agua');
    if (temAgua || /\b\d{2,4}\s*ml\b/.test(n) || recipiente) {
      if (RE_AGUA_CONFIG.test(n)) {
        return { tipo: 'config', campo: 'metaAgua', valor: extrairAgua(n, 2500) };
      }
      var verboBebida = RE_AGUA_VERBOS.test(n);
      var temNumero = /\d/.test(n);
      if (verboBebida || recipiente || /\bml\b/.test(n) || (temAgua && temNumero)) {
        return { tipo: 'agua', ml: extrairAgua(n, ctx.copoPadrao || 250) };
      }
    }

    /* --- estudo --- */
    if (/\bestud(ei|ar|ando|o)\b|\bpomodoro\b/.test(n)) {
      var mEst = new Marcas();
      var durEst = extrairDuracao(n, mEst);
      var dataEst = extrairData(n, agora, mEst);
      var passado = /\bestudei\b/.test(n) || /\bontem\b/.test(n);
      var futuro = dataEst && zerar(dataEst) > zerar(agora);
      if (durEst && !futuro) {
        return { tipo: 'estudo', minutos: durEst, data: dataEst || agora };
      }
      if (passado && !durEst) return { tipo: 'estudo', minutos: null, perguntar: true };
      if (/\bpomodoro\b/.test(n)) return { tipo: 'pomodoro' };
    }

    /* --- treino --- */
    if (RE_TREINO_VERBOS.test(n)) {
      var mTr = new Marcas();
      var divisaoAchada = acharDivisao(n, ctx.divisao);
      var dataTr = extrairData(n, agora, mTr);
      var futuroTr = dataTr && zerar(dataTr) > zerar(agora);
      var registrou = RE_TREINO_REGISTROU.test(n);
      if (registrou && !negado) {
        return { tipo: 'treino', divisao: divisaoAchada, data: dataTr || agora };
      }
      if (!futuroTr && !negado && !RE_TREINO_PULAR.test(n) && !extrairHora(n, new Marcas())) {
        return { tipo: 'treino', divisao: divisaoAchada, data: dataTr || agora };
      }
    }

    /* --- hábitos --- */
    var hab = acharHabito(n, ctx.habitos);
    // "tomei os remédios" = registrar. "me lembra de tomar remédio às 22h" = compromisso.
    var confirmou = RE_HABITO_CONFIRMOU.test(n);
    var temQuando =
      !!extrairHora(n, new Marcas()) ||
      !!extrairData(n, agora, new Marcas()) ||
      !!extrairRecorrencia(n, new Marcas());
    var infinitivo = RE_HABITO_INFINITIVO.test(n);
    if (hab && !/\blembr/.test(n) && (confirmou || (infinitivo && !temQuando))) {
      var quant = null;
      var mq = /\b(\d+(?:[.,]\d+)?)\s*(g|gr|gramas?|ml|comprimidos?|caps|capsulas?|x|vezes)\b/.exec(
        n
      );
      if (mq) quant = parseFloat(mq[1].replace(',', '.'));
      return {
        tipo: 'habito',
        habito: hab,
        valor: negado ? 0 : quant !== null ? quant : true,
        desmarcar: negado
      };
    }

    /* --- criar hábito --- */
    var mNovo = /\b(novo\s+habito|criar\s+habito|adicionar\s+habito|habito\s+novo)\b[:\s]*/.exec(n);
    if (mNovo) {
      var corte = mNovo.index + mNovo[0].length;
      var restoOrig = original.slice(corte);
      var nn = normalizar(restoOrig);
      var m2 = new Marcas();
      var horaH = extrairHora(nn, m2);
      var recH = extrairRecorrencia(nn, m2);
      var nomeH = limparTitulo(m2.limpar(restoOrig));
      return {
        tipo: 'novoHabito',
        nome: nomeH || 'Novo hábito',
        horario: horaH ? pad2(horaH.h) + ':' + pad2(horaH.m) : '09:00',
        dias: recH && recH.tipo === 'semanal' ? recH.dias : [0, 1, 2, 3, 4, 5, 6]
      };
    }

    /* --- compromisso / lembrete --- */
    var rec = extrairRecorrencia(n, marcas);
    var data = extrairData(n, agora, marcas);
    var hora = extrairHora(n, marcas);
    // duração só no que sobrou: senão "15h" (horário) vira 900 minutos
    var marcasDur = new Marcas();
    var dur = extrairDuracao(marcas.limpar(n), marcasDur);
    marcasDur.spans.forEach(function (s) {
      marcas.spans.push(s);
    });

    if (hora || data || rec) {
      var inicio;
      if (rec && rec.tipo === 'semanal' && !data) {
        inicio = proximoDiaSemana(agora, rec.dias[0], false);
      } else {
        inicio = data ? new Date(data.getTime()) : new Date(agora.getTime());
      }
      if (hora) inicio.setHours(hora.h, hora.m, 0, 0);
      else inicio.setHours(9, 0, 0, 0);
      if (!data && !rec && hora && inicio.getTime() < agora.getTime())
        inicio.setDate(inicio.getDate() + 1);

      var titulo = limparTitulo(marcas.limpar(original));
      var ehLembrete = /\blembr/.test(n) || !titulo;
      return {
        tipo: 'evento',
        titulo: titulo || 'Lembrete',
        inicio: inicio,
        duracaoMin: dur || (ehLembrete ? 0 : 60),
        recorrencia: rec,
        subtipo: ehLembrete ? 'lembrete' : 'evento',
        temHora: !!hora
      };
    }

    return { tipo: 'desconhecido', texto: original };
  }

  root.RotinaNLP = {
    interpretar: interpretar,
    normalizar: normalizar,
    extrairHora: extrairHora,
    extrairData: extrairData,
    extrairDuracao: extrairDuracao,
    extrairRecorrencia: extrairRecorrencia,
    extrairAgua: extrairAgua,
    limparTitulo: limparTitulo,
    proximoDiaSemana: proximoDiaSemana,
    levenshtein: levenshtein,
    NOMES_DIA: NOMES_DIA,
    NOMES_DIA_CURTO: NOMES_DIA_CURTO,
    Marcas: Marcas
  };
})(typeof self !== 'undefined' ? self : this);
