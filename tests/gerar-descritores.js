/* Gera o catalogo de descritores a partir dos PDFs oficiais das matrizes (PAEBES / AMA) e escreve
   js/descritoresMatriz.js (embutido no app, funciona offline) + supabase/seed-descritores.sql.
   Roda so no node, com os PDFs em disco:  node tests/gerar-descritores.js [pastaComPdf]
   Os arquivos de origem sao publicos (SEDU-ES) e nao vao para o repositorio: o catalogo gerado, sim. */
"use strict";

var fs = require("fs");
var path = require("path");

require("../js/pdfParser.js");
require("../js/matrizParser.js");
var GabaPdf = global.GabaPdf;
var GabaMatriz = global.GabaMatriz;

var PASTA = process.argv[2] ||
  path.join(process.env.USERPROFILE || process.env.HOME || "", "OneDrive", "Área de Trabalho", "matriz de referência");

/* o que cada arquivo entrega: matriz da fonte e disciplina quando a capa nao diz */
var FONTES = [
  { alvo: /descritores.*portugues|portugues.*paebes/i, matriz: "PAEBES", disciplina: "Língua Portuguesa" },
  { alvo: /ci[êe]ncias\s+humanas/i, matriz: "PAEBES", disciplina: "Ciências Humanas" },
  { alvo: /matem[áa]tica\s+paebes|paebes.*matem/i, matriz: "PAEBES", disciplina: "" },
  { alvo: /ama\s*2\s*2026|mt\s*-\s*ama\s*2/i, matriz: "AMA 2ª edição", disciplina: "Matemática" },
  { alvo: /ama\s*2026/i, matriz: "AMA 1ª edição", disciplina: "" }
];

function cabecalhoDe(nome) {
  for (var i = 0; i < FONTES.length; i++) if (FONTES[i].alvo.test(nome)) return FONTES[i];
  return { matriz: "", disciplina: "" };
}

/* ---------- js/descritoresMatriz.js: o catalogo embutido no app ---------- */

/* o modulo nao leva nome de campo em linha alguma: sao ~52KB que o caderno le no carregamento,
   entao a ordem dos campos fica escrita no cabecalho e o modulo expande na primeira consulta */
var CAMPOS = ["matriz", "codigo", "disciplina", "componente", "ano", "banda", "descricao", "anoChave", "pagina"];

function literal(v) {
  return JSON.stringify(typeof v === "number" ? v : String(v == null ? "" : v));
}

function linhaDe(r) {
  return [r.matriz, r.codigo, r.disciplina, r.componente, r.ano, r.banda, r.descricao,
    GabaMatriz.chaveDeAno(r.ano), Number(r.pagina) || 0].map(literal).join(", ");
}

function moduloDe(catalogo, rel) {
  var semTexto = catalogo.filter(function (r) { return !r.descricao; });
  var origem = rel.map(function (r) { return "     · " + r.arquivo + " — " + r.paginas + " páginas"; });
  var buracos = semTexto.map(function (r) {
    return "     · " + r.matriz + " / " + r.disciplina + " / " + r.ano + " / " + r.codigo +
      (r.duvida ? " (" + r.duvida + ")" : " (a linha do papel não trouxe texto)");
  });

  return [
    "/* Gaba — os descritores oficiais das matrizes de referência, embutidos no app para o professor",
    "   escolher a habilidade de cada questão sem depender de rede nem do banco.",
    "",
    "   GERADO POR tests/gerar-descritores.js — NÃO EDITE À MÃO. Quem mexe aqui perde o ajuste na",
    "   próxima regeneração: o que muda é o extrator (js/matrizParser.js) e aí o arquivo volta inteiro.",
    "",
    "   NOTICE — conteúdo de documento público",
    "   Extraído das matrizes de referência publicadas pela SEDU-ES para o PAEBES/PAEBES Alfa e para",
    "   as matrizes AMA (1ª e 2ª edições):",
    origem.join("\n"),
    "   O texto das habilidades é o dos documentos oficiais; a linha de cada descritor é montada pela",
    "   geometria do papel (o código é desenhado no meio da célula e a habilidade na coluna ao lado),",
    "   porque a ordem de leitura do PDF troca linhas vizinhas.",
    "",
    "   " + catalogo.length + " descritores, dos quais " + semTexto.length + " chegaram sem habilidade: nessas páginas do",
    "   9º ano o PDF imprime duas matrizes uma sobre a outra e não há como saber de quem é cada frase.",
    "   Ficam pelo código, com descricao vazia, para o seletor não mostrar chute:",
    buracos.join("\n"),
    "",
    "   Regenerar:  node tests/gerar-descritores.js [pasta com os PDFs]",
    "*/",
    "(function (root, factory) {",
    "  var api = factory();",
    "  if (typeof module === \"object\" && module.exports) module.exports = api;",
    "  root.GabaDescritores = api;",
    "})(typeof globalThis !== \"undefined\" ? globalThis : this, function () {",
    "  \"use strict\";",
    "",
    "  /* [matriz, codigo, disciplina, componente, ano, banda, descricao, chave do ano, pagina do PDF] */",
    "  var CAMPOS = [" + CAMPOS.map(literal).join(", ") + "];",
    "  var LINHAS = [",
    catalogo.map(function (r) { return "    [" + linhaDe(r) + "]"; }).join(",\n"),
    "  ];",
    "",
    "  var EXPANSAO = null;",
    "  function todos() {",
    "    if (!EXPANSAO) {",
    "      EXPANSAO = LINHAS.map(function (linha, k) {",
    "        var r = { idx: k };",
    "        CAMPOS.forEach(function (campo, i) { r[campo] = linha[i]; });",
    "        return r;",
    "      });",
    "    }",
    "    return EXPANSAO;",
    "  }",
    "",
    "  var RE_COMBINANDO = /[\\u0300-\\u036f]/g;",
    "  /* o professor digita \"lingua portuguesa\" e o papel tem \"Língua Portuguesa\": casa sem acento nem caixa */",
    "  function despido(texto) {",
    "    return String(texto == null ? \"\" : texto).normalize(\"NFD\").replace(RE_COMBINANDO, \"\")",
    "      .replace(/[\\u00ba\\u00aa]/g, \"o\").toLowerCase().replace(/\\s+/g, \" \").trim();",
    "  }",
    "",
    "  /* \"5º ano EF\", \"5 ano\", \"5ª série EM\" viram \"5:EF\" / \"5:EM\": a chave que une a turma ao descritor */",
    "  function chaveDeAno(texto) {",
    "    var s = despido(texto);",
    "    var m = s.match(/(\\d{1,2})\\s*o?\\s*(ano|anos|serie|series)/);",
    "    if (!m) return \"\";",
    "    return Number(m[1]) + \":\" + (/serie|series|medio/.test(s) ? \"EM\" : \"EF\");",
    "  }",
    "",
    "  /* disciplina e ano chegam como texto solto do cadastro, entao o casamento e de rotulo, nao de igual */",
    "  function mesmoRotulo(a, b) {",
    "    var x = despido(a), y = despido(b);",
    "    return !!x && !!y && (x === y || x.indexOf(y) >= 0 || y.indexOf(x) >= 0);",
    "  }",
    "",
    "  /* o filtro do seletor. Sem linha nenhuma no ano pedido o ano cai fora da conta: um 6º ano nao",
    "     tem matriz propria e o seletor vazio seria pior que a lista da disciplina toda. */",
    "  function filtrar(opcoes) {",
    "    var o = opcoes || {};",
    "    var chaves = despido(o.busca).split(\" \").filter(function (p) { return p; });",
    "    var ano = o.ano ? chaveDeAno(o.ano) : \"\";",
    "    var lista = todos().filter(function (r) {",
    "      if (!o.incompletos && !r.descricao) return false;",
    "      if (o.matriz && r.matriz !== o.matriz) return false;",
    "      if (o.disciplina && !mesmoRotulo(r.disciplina, o.disciplina)) return false;",
    "      if (o.banda && !mesmoRotulo(r.banda, o.banda)) return false;",
    "      var texto = despido(r.codigo + \" \" + r.descricao);",
    "      for (var i = 0; i < chaves.length; i++) if (texto.indexOf(chaves[i]) < 0) return false;",
    "      return true;",
    "    });",
    "    if (!ano) return lista;",
    "    var doAno = lista.filter(function (r) { return r.anoChave === ano; });",
    "    return doAno.length ? doAno : lista;",
    "  }",
    "",
    "  /* o mesmo codigo vale para mais de uma matriz e de mais de um ano: devolve lista, nunca uma linha */",
    "  function porCodigo(codigo, disciplina) {",
    "    var alvo = despido(codigo);",
    "    if (!alvo) return [];",
    "    return todos().filter(function (r) {",
    "      return despido(r.codigo) === alvo && (!disciplina || mesmoRotulo(r.disciplina, disciplina));",
    "    });",
    "  }",
    "",
    "  return {",
    "    todos: todos,",
    "    filtrar: filtrar,",
    "    porCodigo: porCodigo,",
    "    chaveDeAno: chaveDeAno,",
    "    despido: despido,",
    "    total: LINHAS.length",
    "  };",
    "});",
    ""
  ].join("\n");
}

/* ---------- supabase/seed-descritores.sql: o mesmo catalogo, para quem preferir o banco ---------- */

function aspa(v) {
  return "'" + String(v == null ? "" : v).replace(/'/g, "''") + "'";
}

function chaveDe(r) {
  return [r.matriz, r.disciplina, r.ano, r.codigo].join("|");
}

function seedDe(catalogo, rel) {
  var valores = catalogo.map(function (r) {
    return "  (" + [aspa(chaveDe(r)), aspa(r.matriz), aspa(r.codigo), aspa(r.disciplina),
      aspa(r.componente), aspa(r.ano), aspa(r.banda), aspa(r.descricao), aspa(r.fontes.join("; ")),
      Number(r.pagina) || 0, r.duvida ? "true" : "false"].join(", ") + ")";
  }).join(",\n");

  return [
    "-- Gaba — o catalogo de descritores das matrizes oficiais no banco.",
    "-- GERADO POR tests/gerar-descritores.js — NÃO EDITE À MÃO.",
    "--",
    "-- Origem: " + rel.map(function (r) { return r.arquivo; }).join(" | "),
    "-- " + catalogo.length + " linhas. As " + catalogo.filter(function (r) { return !r.descricao; }).length +
      " sem descricao vem de paginas onde o PDF imprime duas matrizes uma sobre a",
    "-- outra; ficam pelo codigo para o seletor nao mostrar chute.",
    "--",
    "-- A tabela, o index e a leitura publica sao as mesmas instrucoes de supabase/schema.sql. Vao",
    "-- repetidas aqui para este arquivo ser um paste so no SQL Editor do Supabase. Idempotente:",
    "-- roda de novo e atualiza linha por linha pela mesma chave.",
    "create table if not exists public.descritores (",
    "  id uuid primary key default gen_random_uuid(),",
    "  chave text not null unique,",
    "  matriz text not null,",
    "  codigo text not null,",
    "  disciplina text,",
    "  componente text,",
    "  ano text,",
    "  banda text,",
    "  descricao text,",
    "  fonte text,",
    "  pagina integer,",
    "  duvidoso boolean not null default false,",
    "  created_at timestamptz not null default now()",
    ");",
    "create index if not exists descritores_filtros_idx on public.descritores (disciplina, ano, codigo);",
    "alter table public.descritores enable row level security;",
    "drop policy if exists \"descritores_select_anon\" on public.descritores;",
    "create policy \"descritores_select_anon\" on public.descritores for select to anon, authenticated using (true);",
    "grant select on public.descritores to anon, authenticated;",
    "",
    "insert into public.descritores",
    "  (chave, matriz, codigo, disciplina, componente, ano, banda, descricao, fonte, pagina, duvidoso)",
    "values",
    valores,
    "-- uma regeneracao que nao pegou o texto nao apaga o que o banco ja tem",
    "on conflict (chave) do update set",
    "  matriz = excluded.matriz,",
    "  codigo = excluded.codigo,",
    "  disciplina = excluded.disciplina,",
    "  componente = excluded.componente,",
    "  ano = excluded.ano,",
    "  banda = excluded.banda,",
    "  descricao = coalesce(nullif(excluded.descricao, ''), public.descritores.descricao),",
    "  fonte = excluded.fonte,",
    "  pagina = excluded.pagina,",
    "  duvidoso = excluded.duvidoso;",
    ""
  ].join("\n");
}

(async function main() {
  if (!fs.existsSync(PASTA)) {
    console.log("nao achei a pasta das matrizes: " + PASTA);
    console.log("rode: node tests/gerar-descritores.js <pasta com os PDFs>");
    process.exit(2);
  }
  var nomes = fs.readdirSync(PASTA).filter(function (n) { return /\.pdf$/i.test(n); }).sort();
  var todos = [];
  var rel = [];
  for (var i = 0; i < nomes.length; i++) {
    var nome = nomes[i];
    var cab = cabecalhoDe(nome);
    var lido = await GabaPdf.parsePdf(new Uint8Array(fs.readFileSync(path.join(PASTA, nome))), { geometria: true });
    var semCoordenada = lido.linhas.filter(function (l) { return !l; }).length;
    var extra = GabaMatriz.descritoresDoPdf(lido, {
      matriz: cab.matriz, disciplina: cab.disciplina, arquivo: nome, fonte: nome
    });
    var vazio = extra.registros.filter(function (r) { return !r.descricao; }).length;
    var semAno = extra.registros.filter(function (r) { return !r.ano; }).length;
    var semDisciplina = extra.registros.filter(function (r) { return !r.disciplina; }).length;
    rel.push({ arquivo: nome, paginas: lido.paginas, semGeometria: semCoordenada, registros: extra.registros.length,
      duvidosos: extra.duvidosos, semDescricao: vazio, semAno: semAno, semDisciplina: semDisciplina });
    todos = todos.concat(extra.registros);
  }
  var catalogo = GabaMatriz.deduplicar(todos);
  catalogo.sort(function (a, b) {
    return String(a.matriz).localeCompare(String(b.matriz)) ||
      String(a.disciplina).localeCompare(String(b.disciplina)) ||
      String(a.ano).localeCompare(String(b.ano), "pt", { numeric: true }) ||
      a.codigo.localeCompare(b.codigo, "pt", { numeric: true });
  });

  console.log("== origem ==");
  rel.forEach(function (r) {
    console.log("  " + r.arquivo + ": " + r.paginas + " pag, " + r.registros + " linhas de descritor" +
      (r.semGeometria ? " [SEM coordenada em " + r.semGeometria + " pag]" : "") +
      (r.duvidosos ? " [duvidosas " + r.duvidosos + "]" : "") +
      (r.semDescricao ? " [sem descricao " + r.semDescricao + "]" : "") +
      (r.semDisciplina ? " [sem disciplina " + r.semDisciplina + "]" : "") +
      (r.semAno ? " [sem ano " + r.semAno + "]" : ""));
  });
  var grupos = {};
  catalogo.forEach(function (r) {
    var k = r.matriz + " / " + (r.disciplina || "?") + " / " + (r.ano || "?");
    grupos[k] = (grupos[k] || 0) + 1;
  });
  console.log("\n== catalogo: " + catalogo.length + " descritores ==");
  Object.keys(grupos).sort().forEach(function (k) { console.log("  " + k + ": " + grupos[k]); });
  console.log("\n  sem descricao: " + catalogo.filter(function (r) { return !r.descricao; }).length +
    " | duvidosos: " + catalogo.filter(function (r) { return r.duvida; }).length +
    " | sem ano: " + catalogo.filter(function (r) { return !r.ano; }).length);
  fs.writeFileSync(path.join(process.env.TEMP || "/tmp", "catalogo-descritores.json"),
    JSON.stringify(catalogo, null, 1), "utf8");
  console.log("\n  rascunho em " + path.join(process.env.TEMP || "/tmp", "catalogo-descritores.json"));

  var raiz = path.resolve(__dirname, "..");
  var js = path.join(raiz, "js", "descritoresMatriz.js");
  var sql = path.join(raiz, "supabase", "seed-descritores.sql");
  fs.writeFileSync(js, moduloDe(catalogo, rel), "utf8");
  fs.writeFileSync(sql, seedDe(catalogo, rel), "utf8");
  console.log("  gravado " + js);
  console.log("  gravado " + sql);
})();
