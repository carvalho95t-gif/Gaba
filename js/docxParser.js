(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaDocx = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var LETTERS = ["A", "B", "C", "D", "E"];

  /* ------------------------------------------------------------------ zip */
  function findEocd(u8, dv) {
    var limit = Math.max(0, u8.length - 66000);
    for (var i = u8.length - 22; i >= limit; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) return i;
    }
    return -1;
  }

  function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "function") {
      return Promise.reject(new Error("Navegador sem DecompressionStream: atualize o Chrome do celular."));
    }
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer();
  }

  async function unzip(arrayBuffer) {
    var u8 = new Uint8Array(arrayBuffer);
    var dv = new DataView(arrayBuffer);
    var eocd = findEocd(u8, dv);
    if (eocd < 0) {
      throw new Error("Este arquivo não é um .docx (ZIP sem assinatura). No Word use Arquivo > Salvar como > Documento Word (*.docx).");
    }
    var count = dv.getUint16(eocd + 10, true);
    var off = dv.getUint32(eocd + 16, true);
    var decoder = new TextDecoder();
    var out = {};
    var jobs = [];
    for (var n = 0; n < count; n++) {
      if (off + 46 > u8.length || dv.getUint32(off, true) !== 0x02014b50) break;
      var method = dv.getUint16(off + 10, true);
      var compSize = dv.getUint32(off + 20, true);
      var nameLen = dv.getUint16(off + 28, true);
      var extraLen = dv.getUint16(off + 30, true);
      var commentLen = dv.getUint16(off + 32, true);
      var localOff = dv.getUint32(off + 42, true);
      var name = decoder.decode(u8.subarray(off + 46, off + 46 + nameLen));
      var dataStart = localOff + 30 + dv.getUint16(localOff + 26, true) + dv.getUint16(localOff + 28, true);
      var raw = u8.subarray(dataStart, dataStart + compSize);
      if (method === 0) {
        out[name] = raw;
      } else if (method === 8) {
        jobs.push(
          (function (key, bytes) {
            return inflateRaw(bytes).then(function (buf) { out[key] = new Uint8Array(buf); });
          })(name, raw)
        );
      }
      off += 46 + nameLen + extraLen + commentLen;
    }
    await Promise.all(jobs);
    return out;
  }

  /* ------------------------------------------------------------------ xml */
  function decodeEntities(s) {
    return s
      .replace(/&#x([0-9a-fA-F]+);/g, function (_, h) { return String.fromCodePoint(parseInt(h, 16)); })
      .replace(/&#(\d+);/g, function (_, d) { return String.fromCodePoint(parseInt(d, 10)); })
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
  }

  function paraText(xml) {
    var parts = [];
    var re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g;
    var m;
    while ((m = re.exec(xml))) {
      parts.push(m[1] == null ? " " : decodeEntities(m[1]));
    }
    return parts.join("").replace(/\s+/g, " ").trim();
  }

  function nextElementStart(xml, tag, from) {
    var needle = "<" + tag;
    var i = from;
    for (;;) {
      i = xml.indexOf(needle, i);
      if (i < 0) return -1;
      var next = xml.charAt(i + needle.length);
      if (next === " " || next === ">" || next === "/") return i;
      i += needle.length;
    }
  }

  // Range of the outermost <tag>...</tag> starting at or after `from`.
  function readRange(xml, tag, from) {
    var start = nextElementStart(xml, tag, from);
    if (start < 0) return null;
    var closeTag = "</" + tag + ">";
    var i = start;
    var depth = 0;
    while (i < xml.length) {
      var open = nextElementStart(xml, tag, i);
      var close = xml.indexOf(closeTag, i);
      if (close < 0) return null;
      if (open >= 0 && open < close) {
        depth++;
        i = open + tag.length + 2;
      } else {
        depth--;
        i = close + closeTag.length;
        if (depth === 0) return { start: start, end: i, text: xml.slice(start, i) };
      }
    }
    return null;
  }

  function tableRows(tblXml) {
    var rows = [];
    var from = 0;
    for (;;) {
      var r = readRange(tblXml, "w:tr", from);
      if (!r) break;
      var cells = [];
      var cfrom = 0;
      for (;;) {
        var c = readRange(r.text, "w:tc", cfrom);
        if (!c) break;
        cells.push(paraText(c.text));
        cfrom = c.end;
      }
      rows.push(cells);
      from = r.end;
    }
    return rows;
  }

  function blocksFromDocumentXml(xml) {
    var bodyStart = xml.indexOf("<w:body");
    bodyStart = bodyStart < 0 ? 0 : xml.indexOf(">", bodyStart) + 1;
    var bodyEnd = xml.lastIndexOf("</w:body>");
    var body = xml.slice(bodyStart, bodyEnd < 0 ? xml.length : bodyEnd);
    var blocks = [];
    var i = 0;
    while (i < body.length) {
      var tIdx = nextElementStart(body, "w:tbl", i);
      var pIdx = nextElementStart(body, "w:p", i);
      if (tIdx < 0 && pIdx < 0) break;
      if (tIdx >= 0 && (pIdx < 0 || tIdx < pIdx)) {
        var t = readRange(body, "w:tbl", tIdx);
        if (!t) break;
        blocks.push({ kind: "table", rows: tableRows(t.text) });
        i = t.end;
      } else {
        var p = readRange(body, "w:p", pIdx);
        if (!p) break;
        var text = paraText(p.text);
        if (text) blocks.push({ kind: "p", text: text });
        i = p.end;
      }
    }
    return blocks;
  }

  /* ------------------------------------------------------------ semantics */
  var Q_HEAD_RE = /^\s*(?:QUEST[ÃA]O|QUESTAO|QUEST|QST|Q)\s*(\d{1,3})\s*[—–\-:.]?\s+(.+)$/i;
  var Q_NUM_RE = /^\s*(\d{1,3})\s*[.)\]]\s+(\S.{2,})$/;
  var OPTION_RE = /^\s*(?:\(\s*([A-Ea-e])\s*\)|\[([A-Ea-e])\]|([A-Ea-e])\s*[.):\-])\s+(.+)$/;
  var PAIR_RE = /(\d{1,3})\s*[-:.=]\s*([A-Ea-e])(?![A-Za-z])/g;
  var KEY_LINE_RE = /^\s*(?:gabarito|respostas?)\b/i;
  var GABARITO_HINT_RE = /(gabarito|resposta\s*oficial|chave\s*de\s*respostas)/i;
  // a capa da prova conta que existem gabaritos; so o aviso que comeca pelo gabarito abre a secao
  var GABARITO_INICIO_RE = /^.{0,40}\b(gabarito|resposta\s*oficial|chave\s*de\s*respostas)/i;
  var TIPO_CELL_RE = /^\s*(?:tipo|vers[ãa]o|cor|caderno)\s*(\d{1,3})\b/i;
  var LETTER_RUN_RE = /^(?:[A-E]\s*){2,}$/i;
  /* linha de matriz de gabarito: "Q10 Tipo 1 A B E C D E ..." ou "GABARITO OFICIAL DESTA PROVA" */
  var MATRIZ_RE = /(?:\s[A-E]){3,}\s[A-E](?![A-Za-z])/;
  var CHAVE_RE = /GABARITO/i;
  /* a tabela de gabaritos individuais vira texto corrido no PDF e no .doc: numero, nome, tipo, letras */
  var PALAVRA_NOME = "[A-ZÀ-Ü][A-Za-zÀ-ÿ'’.\\-]{1,}";
  var LISTA_ALUNO_RE = new RegExp(
    "(?:^|\\s)(\\d{1,3})\\s+((" + PALAVRA_NOME + "\\s+){0,9}" + PALAVRA_NOME + ")\\s+" +
    "(?:tipo|vers[ãa]o|caderno)\\s*(\\d{1,3})\\s+((?:[A-Ea-e][\\s.]+){2,}[A-Ea-e])(?=\\s|$)", "gi");
  /* a faixa que cada caderno nominal repete no meio do texto: timbre, aluno, chamada, tipo, instrucoes e cartao */
  var CABECALHO_INICIO_RE = /^(?:governo|secretaria|prefeitura|minist[ée]rio|aluno\s*\(?\s*[a-z]?\s*\)?\s*:|n[ºo]\s*de\s*chamada|tipo\s+de\s*prova|cart[ãa]o\s+gabarito|gabarito\s+oficial|orienta[cç][õo]es\s+para|valor\s+da\s*prova|ensino\s+m[ée]dio|turno\s+|ano\s+letivo|data\s*:|nota\s*:|q1\s*[:|])/i;
  var CABECALHO_FIM_RE = /cart[ãa]o\s+gabarito|gabarito\s+oficial|uso\s+do\s+professor|\]\s*$/i;
  var DISCIPLINA_RE = /(filosofia|matem[áa]tica|l[ií]ngua|portugu[eê]s|hist[óo]ria|geografia|ci[eê]ncias|arte|educa[çc][ãa]o|qu[ií]mica|f[ií]sica|biologia)/i;
  /* cabeçalho de parte: "PARTE I", "1ª PARTE – MATEMÁTICA", "BLOCO 2: HISTÓRIA", "ÁREA: CIÊNCIAS DA NATUREZA".
     O nome depois da palavra só vale atrás de um separador, de um numeral ou quando é disciplina:
     "Área de preservação permanente" é texto de questão, não cabeçalho. */
  var PARTE_RE = /^(?:\d{1,3}[ºªa°]?\s+)?(parte|bloco|se(?:ss|[çc])[ãa]o|[áa]rea|m[óo]dulo|unidade)\b[\s.:]*(.*)$/i;
  var PARTE_SEP_RE = /^[–\-—:.]+\s*/;
  var PARTE_NUM_RE = /^([IVXLC]{1,7}|\d{1,3}[ºªa°]?|[A-E])(?![A-Za-zÀ-ü])\s*/i;

  function lettersOf(text) {
    return (String(text || "").toUpperCase().match(/[A-E]/g) || []);
  }

  function normKey(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .slice(0, 220);
  }

  function normalizeLetters(arr) {
    return (arr || []).map(function (c) { return String(c || "").trim().toUpperCase(); });
  }

  /* "Q10 Respost a [ ] [ ] [ ]" e a grade do cartao de respostas, nao o comando de uma questao */
  var GRADE_RE = /\[\s*\]|\(\s*\)|_{3,}/g;
  var TRES_PALAVRAS_RE = /[A-Za-zÀ-ÿ]{4,}\s+[A-Za-zÀ-ÿ]{4,}\s+[A-Za-zÀ-ÿ]{4,}/;
  var GRADE_NUMEROS_RE = /^(?:quest[ãa]o|item|n[ºo])\s+(?:q?\d{1,3}\s+){1,}q?\d{1,3}$/i;
  var GRADE_CAUDA_RE = /(?:quest[ãa]o|resposta|item|n[ºo])\s+(?:\[\s*\]|\(\s*\)|q?\d{1,3})(?:\s+(?:\[\s*\]|\(\s*\)|q?\d{1,3})){2,}/gi;
  var CELULA_GRADE_RE = /^(?:q?\d{1,3}|\[\s*\]|\(\s*\)|_{2,})$/i;
  var GRADE_INICIO_RE = /^(?:quest[ãa]o|resposta|item|n[ºo])$/i;
  function podarGrade(texto) {
    return String(texto || "").replace(GRADE_CAUDA_RE, " ").replace(/\s{2,}/g, " ").trim();
  }
  function ehGradeDeCartao(texto) {
    var t = String(texto || "");
    if (GRADE_NUMEROS_RE.test(t.trim())) return true;
    var buracos = (t.match(GRADE_RE) || []).length;
    return buracos >= 2 && !TRES_PALAVRAS_RE.test(t.replace(GRADE_RE, " "));
  }

  function isQuestionLine(text, explicitOnly) {
    if (KEY_LINE_RE.test(text)) return false;
    if (ehGradeDeCartao(text)) return false;
    if (Q_HEAD_RE.test(text)) {
      // linha de gabarito (matriz por tipo, cartão resposta) nao é comando de questao
      var resto = (Q_HEAD_RE.exec(text) || [])[2] || "";
      return !MATRIZ_RE.test(resto) && !CHAVE_RE.test(resto);
    }
    if (explicitOnly) return false;
    var m = Q_NUM_RE.exec(text);
    if (!m) return false;
    // "1. A 2. C" answer lists are not questions.
    if (LETTER_RUN_RE.test(m[2])) return false;
    return true;
  }

  function questionNumber(text) {
    var m = Q_HEAD_RE.exec(text) || Q_NUM_RE.exec(text);
    return m ? parseInt(m[1], 10) : null;
  }

  function questionHeadRemainder(text) {
    var m = Q_HEAD_RE.exec(text) || Q_NUM_RE.exec(text);
    return m ? m[2].trim() : text;
  }

  function parseTablesInto(state, rows) {
    var nonEmpty = rows.filter(function (r) { return r.some(function (c) { return c; }); });
    nonEmpty.forEach(function (row) {
      var first = row[0] || "";
      var tm = TIPO_CELL_RE.exec(first);
      var headerIsMatrix = row.slice(1).some(function (c) { return /^q?\d{1,3}$/i.test(String(c).trim()); });

      if (tm && headerIsMatrix && /^tipo$/i.test(first.trim())) {
        state.matrixHeader = normalizeLetters(row.slice(1));
        state.inGabaritoSection = true;
        return;
      }
      if (tm) {
        state.tipos.push({ tipo: parseInt(tm[1], 10), gabarito: normalizeLetters(row.slice(1)) });
        state.inGabaritoSection = true;
        return;
      }
      // Nº | Nome do Aluno | Tipo | A B C D ...
      if (row.length >= 3 && /^\d{1,3}$/.test(first.trim()) && (row[1] || "").length > 3) {
        var t2 = TIPO_CELL_RE.exec(row[2] || "");
        var last = row[row.length - 1] || "";
        state.alunos.push({
          numero: parseInt(first, 10),
          nome: row[1],
          tipo: t2 ? parseInt(t2[1], 10) : null,
          gabarito: lettersOf(last),
          turma: row.length >= 5 ? row[3] : ""
        });
        return;
      }
      var blob = row.join("  ");
      if (GABARITO_HINT_RE.test(blob)) {
        state.inGabaritoSection = true;
        collectPairs(blob, state.gabaritoFlat);
      }
    });
  }

  /* prova nominal: a tabela "Nº | Nome | Tipo | Gabarito" chega em texto corrido pelo PDF e pelo .doc */
  function alunosDoTexto(state, texto) {
    if (state.alunos.length) return;
    var m, achados = {}, total = state.questoes.length;
    LISTA_ALUNO_RE.lastIndex = 0;
    while ((m = LISTA_ALUNO_RE.exec(texto))) {
      var nome = m[2].replace(/\s+/g, " ").trim();
      var letras = lettersOf(m[5]);
      if (total && letras.length !== total) continue;
      var chave = m[1] + "|" + nome.toUpperCase();
      if (achados[chave]) continue;
      achados[chave] = true;
      var tipo = parseInt(m[4], 10);
      state.alunos.push({ numero: parseInt(m[1], 10), nome: nome, tipo: tipo, gabarito: letras, turma: "" });
      // a folha do tipo 1 traz o gabarito oficial na ordem do banco de questoes
      if (tipo === 1) letras.forEach(function (l, i) { state.gabaritoFlat[i + 1] = l; });
    }
  }

  function collectPairs(text, target) {
    var m, achados = 0;
    PAIR_RE.lastIndex = 0;
    while ((m = PAIR_RE.exec(text))) { target[parseInt(m[1], 10)] = m[2].toUpperCase(); achados++; }
    return achados;
  }

  function closeQuestion(state) {
    var q = state.current;
    if (!q) return;
    var pending = state.pending;
    if (Object.keys(q.alternativas).length === 0 && pending.length) {
      q.comando = pending.join(" ");
      q.enunciado = "";
    } else if (pending.length) {
      q.comando = pending[pending.length - 1];
      q.enunciado = pending.slice(0, -1).join(" ");
    }
    if (q.comando || Object.keys(q.alternativas).length) state.questoes.push(q);
    state.current = null;
    state.pending = [];
    state.rabo = null;
  }

  function ehCabecalhoDeCaderno(text) {
    return CABECALHO_INICIO_RE.test(String(text || "").trim());
  }

  /* devolve o rótulo da parte quando a linha é um cabeçalho dela, e "" quando não é */
  function parteDaLinha(text) {
    var t = String(text || "").replace(/\s+/g, " ").trim();
    if (!t || t.length > 60 || !/^[A-ZÀ-Ü0-9]/.test(t)) return "";
    var m = PARTE_RE.exec(t);
    if (!m) return "";
    var keyword = m[1] || "";
    var resto = m[2] || "";
    var separador = false, numero = "", nome = "";
    var sep = PARTE_SEP_RE.exec(resto);
    if (sep) { separador = true; resto = resto.slice(sep[0].length); }
    var num = PARTE_NUM_RE.exec(resto);
    if (num) { numero = num[1]; resto = resto.slice(num[0].length); }
    var sep2 = PARTE_SEP_RE.exec(resto);
    if (sep2) { separador = true; resto = resto.slice(sep2[0].length); }
    nome = resto.trim();
    if (nome && !separador && !numero && !DISCIPLINA_RE.test(nome)) return "";
    if (nome) {
      var miudo = nome.toLowerCase();
      return miudo.charAt(0).toUpperCase() + miudo.slice(1);
    }
    var base = keyword.charAt(0).toUpperCase() + keyword.slice(1).toLowerCase();
    var marca = /^[ivxlcdm]+$/i.test(numero) ? numero.toUpperCase() : numero;
    return marca ? base + " " + marca : base;
  }

  /* o PDF parte a frase no corte de pagina: linha comecando em minuscula e continuação do ultimo texto lido */
  function emendar(state, texto) {
    if (state.rabo.alt && state.current && state.current.alternativas[state.rabo.alt]) {
      state.current.alternativas[state.rabo.alt] += " " + texto;
      return;
    }
    if (state.pending.length) state.pending[state.pending.length - 1] += " " + texto;
  }

  function parseBlocks(blocks) {
    var explicitOnly = blocks.some(function (b) {
      return b.kind === "p" && Q_HEAD_RE.test(b.text);
    });
    var state = {
      questoes: [], tipos: [], alunos: [], gabaritoFlat: {}, repetidas: 0,
      meta: { titulo: "", disciplina: "", turma: "" },
      current: null, pending: [], inGabaritoSection: false, matrixHeader: null,
      emCabecalho: false, rabo: null, gradeViva: false, parteAtual: ""
    };

    /* a chave impressa no fim do documento vem logo depois deste rótulo? */
    function paresDepoisDe(idx) {
      var lidas = 0, texto = "";
      for (var i = idx + 1; i < blocks.length && lidas < 6; i++) {
        var b = blocks[i];
        if (b.kind === "table") return false;
        if (b.kind !== "p") continue;
        var t = String(b.text || "").trim();
        if (!t) continue;
        lidas++;
        texto += " " + t;
        if (texto.length > 400) break;
      }
      var m, pares = 0;
      PAIR_RE.lastIndex = 0;
      while ((m = PAIR_RE.exec(texto))) pares++;
      return pares >= 2;
    }

    blocks.forEach(function (block, idx) {
      if (block.kind === "table") {
        parseTablesInto(state, block.rows);
        return;
      }
      var bruto = block.text;
      var naGrade = bruto.search(GRADE_CAUDA_RE) >= 0;
      var text = podarGrade(bruto);
      /* a grade do cartao vem picotada em linhas: depois do primeiro pedaço, nenhuma celula e texto da prova */
      var celula = !text || ehGradeDeCartao(text) || CELULA_GRADE_RE.test(text) || GRADE_INICIO_RE.test(text);
      if (celula && state.gradeViva) return;
      state.gradeViva = celula || naGrade;
      if (!text) return;

      // "GABARITO OFICIAL" também abre a faixa de identificação do caderno: só fecha a
      // questão quando os pares "1 - B 2 - C" vêm logo depois, senão a chave se perderia
      if (state.current && GABARITO_INICIO_RE.test(text) && paresDepoisDe(idx)) {
        closeQuestion(state);
        state.inGabaritoSection = true;
        collectPairs(text, state.gabaritoFlat);
        return;
      }

      // a faixa de identificacao do proximo caderno cai no meio da questao: do timbre ao cartao, nao e texto
      if (state.emCabecalho) {
        if (isQuestionLine(text, explicitOnly)) state.emCabecalho = false;
        else {
          if (CABECALHO_FIM_RE.test(text)) state.emCabecalho = false;
          return;
        }
      } else if (state.current && ehCabecalhoDeCaderno(text)) {
        state.emCabecalho = true;
        return;
      }

      // o cabeçalho da próxima parte cai no meio da última questão: muda o assunto, não é texto dela
      var parte = parteDaLinha(text);
      if (parte) { state.parteAtual = parte; return; }

      if (state.current) {
        // a grade do cartao fecha o caderno no meio da ultima questao: nao e texto dela
        if (ehGradeDeCartao(text)) return;
        if (state.rabo && /^[a-zà-öø-ÿ]/.test(text)) { emendar(state, text); return; }
        var om = OPTION_RE.exec(text);
        if (om) {
          var letra = (om[1] || om[2] || om[3]).toUpperCase();
          if (LETTERS.indexOf(letra) >= 0) {
            if (!state.current.alternativas[letra]) state.current.alternativas[letra] = om[4].trim();
            state.rabo = { alt: letra };
            return;
          }
        }
        if (isQuestionLine(text, explicitOnly)) { closeQuestion(state); } else { state.pending.push(text); state.rabo = { pend: true }; return; }
      }

      if (state.current === null && isQuestionLine(text, explicitOnly)) {
        state.current = {
          numero: questionNumber(text),
          enunciado: "",
          comando: "",
          alternativas: {},
          gabarito: null,
          parte: state.parteAtual || ""
        };
        state.pending = [questionHeadRemainder(text)];
        state.rabo = { pend: true };
        state.inGabaritoSection = false;
        return;
      }

      if (state.current === null) {
        var isOrg = /governo|secretaria|prefeitura|minist[ée]rio|cas|sae/i.test(text);
        var looksTitle = /(avalia[çc][ãa]o|prova|exame|simulado)/i.test(text);
        var textoMeta = text;
        if (isOrg) {
          // o timbre do orgao vem emendado antes do titulo: aproveitamos so o nome da avaliacao
          var inicio = /((?:AVALIA[ÇC][ÃA]O|PROVA|SIMULADO|EXAME)[\s\S]*)/i.exec(text);
          textoMeta = inicio ? inicio[1] : "";
        }
        if (!state.meta.titulo && textoMeta.length > 8 && !MATRIZ_RE.test(text) &&
          (looksTitle || !isOrg)) state.meta.titulo = textoMeta;
        if (!state.meta.disciplina && textoMeta) {
          var dm = DISCIPLINA_RE.exec(textoMeta);
          if (dm) state.meta.disciplina = dm[0].charAt(0).toUpperCase() + dm[0].slice(1).toLowerCase();
        }
        var turmaMatch = /turma[:\s]+([0-9º°A-Za-z][\w.\-\/]{2,24})/i.exec(text);
        if (turmaMatch && !state.meta.turma) state.meta.turma = turmaMatch[1];
        if (GABARITO_INICIO_RE.test(text)) {
          state.inGabaritoSection = true;
          collectPairs(text, state.gabaritoFlat);
          return;
        }
        if (state.inGabaritoSection) {
          if (collectPairs(text, state.gabaritoFlat)) return;
          if (LETTER_RUN_RE.test(text)) {
            lettersOf(text).forEach(function (l, i) { state.gabaritoFlat[i + 1] = l; });
            return;
          }
        }
      }
    });
    closeQuestion(state);

    // Provas nominalizadas repetem o banco em cada folha; mantém a 1ª aparição
    // (ordem da folha 1, que é a ordem do Tipo 1).
    var bankKey = {};
    var bank = [];
    state.questoes.forEach(function (q) {
      var key = normKey((q.enunciado || "") + " " + (q.comando || ""));
      if (bankKey[key]) { state.repetidas++; return; }
      bankKey[key] = true;
      bank.push(q);
    });
    state.questoes = bank;
    state.questoes.forEach(function (q, i) {
      q.numero_original = q.numero;
      q.numero = i + 1;
    });

    var origin = "gabarito";
    alunosDoTexto(state, blocks.map(function (b) {
      return b.kind === "p" ? b.text : "";
    }).join("  "));
    if (!state.tipos.length) {
      // no PDF e no .doc a matriz por tipo so aparece emendada no texto: a folha de cada aluno conta qual e o tipo dele
      var porTipo = {};
      state.alunos.forEach(function (a) {
        if (a.tipo && (a.gabarito || []).length && !porTipo[a.tipo]) {
          porTipo[a.tipo] = { tipo: a.tipo, gabarito: a.gabarito };
        }
      });
      state.tipos = Object.keys(porTipo).map(function (k) { return porTipo[k]; });
    }
    state.questoes.forEach(function (q) {
      if (state.gabaritoFlat[q.numero]) q.gabarito = state.gabaritoFlat[q.numero];
    });
    var master = null;
    if (!Object.keys(state.gabaritoFlat).length && state.tipos.length &&
        state.tipos[0].gabarito.length === state.questoes.length) {
      master = state.tipos[0].gabarito;
      state.questoes.forEach(function (q, i) { q.gabarito = master[i]; });
      origin = "tipo-1";
    }

    var avisos = [];
    if (state.repetidas) {
      avisos.push(state.repetidas === 1
        ? "1 questão repetida em outra folha foi descartada (banco único mantido)."
        : state.repetidas + " questões repetidas em outras folhas foram descartadas (banco único mantido).");
    }
    if (origin === "tipo-1") {
      avisos.push("Gabarito oficial adotado da matriz do Tipo 1, que corresponde à ordem das questões da primeira folha.");
    }
    var semGabarito = state.questoes.filter(function (q) { return !q.gabarito; }).map(function (q) { return q.numero; });
    if (semGabarito.length) avisos.push(semGabarito.length + (semGabarito.length === 1 ? " questão" : " questões") +
      " sem gabarito: " + semGabarito.slice(0, 20).join(", "));
    var semAlternativas = state.questoes.filter(function (q) { return Object.keys(q.alternativas).length < 2; }).map(function (q) { return q.numero; });
    if (semAlternativas.length) avisos.push("Questões com menos de 2 alternativas: " + semAlternativas.slice(0, 20).join(", "));
    if (!state.questoes.length) avisos.push("nenhuma questão reconhecida neste arquivo");

    return {
      meta: state.meta,
      questoes: state.questoes,
      tipos: state.tipos,
      alunos: state.alunos,
      gabaritoFlat: state.gabaritoFlat,
      gabaritoOrigem: origin,
      avisos: avisos
    };
  }

  /* --------------------------------------------------------------- public */
  async function parseDocx(arrayBuffer) {
    var files = await unzip(arrayBuffer);
    var entry = files["word/document.xml"];
    if (!entry) throw new Error("Arquivo .docx sem word/document.xml.");
    var xml = new TextDecoder("utf-8").decode(entry);
    return parseBlocks(blocksFromDocumentXml(xml));
  }

  /* no PDF e no .doc cada celula do cartao vira uma linha propria: a faixa de celulas nao e texto da prova */
  function filtrarGrade(blocks) {
    var saida = [], n = 0;
    while (n < blocks.length) {
      var k = n, celulas = 0;
      while (k < blocks.length) {
        var t = blocks[k].text;
        if (CELULA_GRADE_RE.test(t)) celulas++;
        else if (!GRADE_INICIO_RE.test(t)) break;
        k++;
      }
      if (celulas >= 3) { n = k; continue; }
      saida.push(blocks[n]);
      n++;
    }
    return saida;
  }

  function parsePlain(text) {
    var blocks = String(text || "").split(/\r?\n/).map(function (line) {
      return { kind: "p", text: line.trim() };
    }).filter(function (b) { return b.text; });
    return parseBlocks(filtrarGrade(blocks));
  }

  /* a capa emenda subtitulo e texto de apresentacao no nome da prova: o campo quer so o titulo */
  function tituloCurto(texto) {
    var t = String(texto || "").trim();
    if (t.length <= 90) return t;
    var corte = t.search(/\s(?=[A-ZÀ-Ü][a-zà-ü])/);
    if (corte > 20) return t.slice(0, corte).trim();
    return t.slice(0, 90).replace(/\s\S*$/, "").trim();
  }

  function toProva(parsed, fallbackTitulo) {
    var total = parsed.questoes.length;
    var gabarito = [];
    for (var i = 0; i < total; i++) {
      var q = parsed.questoes[i];
      gabarito.push(q.gabarito || "");
    }
    return {
      titulo: tituloCurto(parsed.meta.titulo) || fallbackTitulo || "Prova importada",
      disciplina: parsed.meta.disciplina || "",
      quantidade_questoes: total,
      alternativas: 5,
      gabarito: gabarito,
      questoes: parsed.questoes.map(function (q, idx) {
        return {
          numero: idx + 1,
          numero_original: q.numero,
          enunciado: q.enunciado || "",
          comando: q.comando || "",
          alternativas: LETTERS.map(function (l) { return { letra: l, texto: q.alternativas[l] || "" }; })
            .filter(function (a) { return a.texto; }),
          gabarito: q.gabarito || "",
          peso: 1,
          parte: q.parte || "",
          descritor: "",
          habilidade_bncc: ""
        };
      }),
      tipos: parsed.tipos,
      alunos: parsed.alunos
    };
  }

  return {
    unzip: unzip,
    blocksFromDocumentXml: blocksFromDocumentXml,
    parseBlocks: parseBlocks,
    parseDocx: parseDocx,
    parsePlain: parsePlain,
    ehCabecalhoDeCaderno: ehCabecalhoDeCaderno,
    parteDaLinha: parteDaLinha,
    toProva: toProva,
    paraText: paraText
  };
});
