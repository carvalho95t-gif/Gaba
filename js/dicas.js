(function () {
  "use strict";

  var ABAS = {
    dashboard: ["Central de alívio", "Veja as folhas já lidas, o que falta em cada turma e quanto papel saiu da sua mesa."],
    scanner: ["Leitor", "Escolha a prova e a turma, ligue a câmera e aponte a folha. O QR identifica o caderno e o Gaba corrige sozinho."],
    relatorios: ["Análise", "Veja o desempenho da turma, de cada aluno, das questões e dos descritores. Descubra o que precisa ser retomado."],
    turmas: ["Turmas", "Crie a escola, cadastre ou importe as turmas dela e traga as listas de alunos."],
    provas: ["Provas", "Importe a prova ou cadastre só o gabarito. Revise questões, pesos e descritores antes de imprimir."],
    caderno: ["Cadernos", "Escolha quem recebe a prova, o embaralhamento e o modelo da folha. Gere a prévia e imprima."],
    config: ["Ajustes", "Entre com e-mail e senha, crie sua conta e confira a conexão com o banco neste aparelho."]
  };
  var SEGMENTOS = {
    "ab-resumo": ["Resumo da turma", "Confira acertos, notas e a distribuição dos resultados da prova escolhida."],
    "ab-aluno": ["Por aluno", "Escolha um aluno para ver os acertos e as habilidades que merecem atenção."],
    "ab-questao": ["Por questão", "Veja acertos, alternativas escolhidas e sinais de questões que precisam de revisão."],
    "ab-descritor": ["Por descritor", "Compare as habilidades avaliadas e descubra quais conteúdos a turma precisa retomar."],
    um: ["Um aluno por vez", "Cadastre o nome e o número de chamada de um aluno na turma escolhida."],
    lista: ["Importar a lista", "Mande um Excel, CSV ou texto colado. Confira os alunos reconhecidos antes de salvar na turma."]
  };
  var ACOES = {
    "turma-aqui": ["Adicionar turma", "Abre o cadastro com esta escola já escolhida. Falta só dar o nome e o ano da turma."],
    "importar-turmas": ["Importar turmas", "Mande o arquivo desta escola: uma aba por turma ou uma coluna Turma. O arquivo não precisa ter o nome da escola."],
    "escola-filtrar": ["Filtrar a escola", "Mostra só as turmas desta escola. Se ela já estiver escolhida, volta a mostrar todas."],
    "apagar-escola": ["Tirar do cadastro", "Retira a escola do cadastro, mas não apaga as turmas. O Gaba pede confirmação antes."],
    "escola-turma": ["Mudar de escola", "Escolha em qual escola esta turma fica, sem apagar seus alunos."],
    "renomear-turma": ["Renomear turma", "Mude o nome desta turma. Os alunos continuam nela."],
    "apagar-turma": ["Apagar turma", "Apaga a turma e seus alunos. As notas já corrigidas continuam no banco. Há uma confirmação antes."],
    "apagar-aluno": ["Apagar aluno", "Retira este aluno do cadastro. As folhas já impressas continuam podendo ser lidas."],
    "revisar-prova": ["Revisar prova", "Abra as questões para conferir o gabarito, ajustar os pesos e escolher os descritores."],
    "prova-no-caderno": ["Imprimir cadernos", "Leva esta prova para Cadernos. Escolha a turma e confira a prévia antes de imprimir."],
    "prova-no-leitor": ["Ler esta prova", "Abre o Leitor com esta prova escolhida para corrigir suas folhas."],
    "salvar-prova-no-banco": ["Guardar a prova no banco", "Envia esta prova do aparelho para o banco. Se já imprimiu os cadernos, será preciso imprimir de novo."],
    "apagar-prova": ["Apagar prova", "Retira esta prova do banco. As notas já corrigidas ficam guardadas. O Gaba pede confirmação."]
  };
  var BOTOES = {
    "escola-botao": ["Escolher escola", "Filtre o Gaba por escola: as turmas, os alunos e os seletores acompanham a escolha."],
    "imp-ver": ["Conferir a lista", "Lê o texto colado e mostra os alunos reconhecidos, com os avisos. Ainda não salva nada."],
    "imp-salvar": ["Salvar alunos", "Guarda os alunos na turma escolhida. O mesmo número de chamada atualiza o cadastro em vez de duplicar."],
    "imp-limpar": ["Limpar a prévia", "Limpa o texto e a lista desta importação. Não apaga os alunos já salvos."],
    "impt-salvar": ["Salvar turmas", "Importa só as turmas marcadas para esta escola. Turmas que já existem são reaproveitadas, sem duplicar."],
    "impt-cancelar": ["Fechar a importação", "Fecha esta prévia. As turmas que você já salvou continuam no cadastro."],
    "impt-outro": ["Outro arquivo", "Escolha uma nova planilha para importar as turmas desta mesma escola."],
    "scan-iniciar": ["Ligar câmera", "Pede acesso à câmera e começa a procurar as marcas e o QR da folha. Cada leitura é corrigida e guardada."],
    "scan-parar": ["Parar câmera", "Desliga a câmera. As folhas que já foram lidas continuam guardadas."],
    "scan-limpar": ["Permitir reler folhas", "Zera a memória de folhas lidas desta sessão para poder relê-las. Não apaga as correções salvas."],
    "nota-sincronizar": ["Subir folhas do aparelho", "Envia as leituras pendentes para o banco. Precisa de internet e do login do professor."],
    "ana-csv": ["Baixar a análise", "Salva os dados da análise em CSV para abrir numa planilha. Não altera as correções."],
    "cad-previa": ["Gerar prévia", "Monta os cadernos com estas escolhas para conferir as páginas antes de imprimir."],
    "cad-imprimir": ["Imprimir", "Abre a impressão dos cadernos. Confira a prévia e as opções da impressora antes de confirmar."],
    "cad-baixar": ["Baixar HTML", "Salva os cadernos num arquivo HTML para abrir depois no navegador."],
    "cad-folha-mudar": ["Mudar a folha", "Abra as opções de modelo, colunas, cabeçalho e verso em branco da impressão."],
    "cad-salvar-prova": ["Salvar revisão", "Guarda no banco as alterações feitas nas questões, nos pesos e nos descritores."],
    "btn-nova-conta": ["Criar conta", "Abre o cadastro do professor com nome, e-mail e senha."],
    "btn-sair": ["Sair da conta", "Encerra o login neste aparelho, mas mantém a conexão guardada para entrar de novo."],
    "selo-sair": ["Sair da conta", "Encerra o login neste aparelho. Suas leituras locais continuam guardadas."],
    "selo-ir-ajustes": ABAS.config,
    "btn-trocar-credencial": ["Trocar conexão", "Abre o endereço e a chave pública do banco para usar outro projeto neste aparelho."],
    "btn-usar-embutida": ["Conexão do app", "Volta a usar a conexão que vem no Gaba. O login do professor continua sendo necessário."]
  };
  var FORMULARIOS = {
    "form-escola": ["Criar escola", "Cadastre primeiro o nome da escola. Depois adicione ou importe as turmas dentro dela."],
    "form-turma": ["Salvar turma", "Cria a turma com o nome, ano e escola informados."],
    "form-aluno": ["Salvar aluno", "Guarda este aluno na turma escolhida com seu número de chamada."],
    "form-prova": ["Salvar gabarito", "Guarda a prova com o gabarito oficial para corrigir as folhas."],
    "form-login": ["Entrar", "Entre com seu e-mail e senha para guardar os cadastros e as leituras no banco."],
    "selo-login": ["Entrar", "Entre com e-mail e senha. Seu nome aparece no topo quando o login dá certo."],
    "form-conta": ["Criar conta e entrar", "Cria a conta do professor com os dados informados e faz o login."],
    "form-config": ["Guardar conexão", "Guarda o endereço e a chave pública do banco neste aparelho. Nunca use a chave service_role."]
  };

  function conteudo(el) {
    if (el.id === "status-conexao") {
      var rotulo = el.getAttribute("aria-label") || el.textContent.trim();
      return [rotulo, el.classList.contains("badge-on")
        ? "Toque para conferir a conta e sair quando terminar. Seu nome completo aparece ali."
        : "Toque para entrar ou configurar o banco. Sem login, as leituras ficam só neste aparelho."];
    }
    if (el.dataset.grupo === "bastidor") {
      return ["Bastidor", "Prepare tudo em quatro passos: Turmas, Provas, Cadernos e Ajustes."];
    }
    return BOTOES[el.id] || ACOES[el.dataset.acao] || SEGMENTOS[el.dataset.sub || el.dataset.seg] ||
      ABAS[el.dataset.tab || el.dataset.ir] || (el.type === "submit" && el.form && FORMULARIOS[el.form.id]);
  }

  function alvoDe(node) {
    var el = node && node.closest ? node.closest("button") : null;
    return el && conteudo(el) ? el : null;
  }

  function iniciar() {
    var balao = document.createElement("div");
    balao.id = "gaba-dica";
    balao.className = "gaba-dica status-bar";
    balao.setAttribute("role", "tooltip");
    balao.hidden = true;
    var titulo = document.createElement("strong");
    var texto = document.createElement("p");
    balao.appendChild(titulo);
    balao.appendChild(texto);
    document.body.appendChild(balao);

    var atual = null;
    var espera = 0;
    var teclado = false;
    var toque = null;
    var bloqueio = null;

    function esconder() {
      clearTimeout(espera);
      if (atual) {
        var ids = (atual.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (id) {
          return id && id !== balao.id;
        });
        if (ids.length) atual.setAttribute("aria-describedby", ids.join(" "));
        else atual.removeAttribute("aria-describedby");
      }
      atual = null;
      balao.hidden = true;
    }

    function mostrar(el) {
      var dica = conteudo(el);
      if (!dica || !el.isConnected || !el.getClientRects().length) return;
      esconder();
      atual = el;
      titulo.textContent = dica[0];
      texto.textContent = dica[1];
      el.removeAttribute("title");
      var ids = (el.getAttribute("aria-describedby") || "").split(/\s+/).filter(Boolean);
      ids.push(balao.id);
      el.setAttribute("aria-describedby", ids.join(" "));
      balao.hidden = false;

      var vv = window.visualViewport;
      var x = vv ? vv.offsetLeft : 0, y = vv ? vv.offsetTop : 0;
      var largura = vv ? vv.width : window.innerWidth, altura = vv ? vv.height : window.innerHeight;
      balao.style.width = Math.min(320, largura - 24) + "px";
      var r = el.getBoundingClientRect();
      var w = balao.offsetWidth, h = balao.offsetHeight;
      var centro = r.left + r.width / 2;
      var esquerda = Math.max(x + 12, Math.min(centro - w / 2, x + largura - w - 12));
      var abaixo = r.top - h - 14 < y + 12;
      var topo = abaixo ? r.bottom + 14 : r.top - h - 14;
      topo = Math.max(y + 12, Math.min(topo, y + altura - h - 12));
      balao.classList.toggle("dica-abaixo", abaixo);
      balao.style.left = esquerda + "px";
      balao.style.top = topo + "px";
      balao.style.setProperty("--dica-seta", Math.max(18, Math.min(centro - esquerda, w - 18)) + "px");
    }

    document.querySelectorAll("button[title]").forEach(function (el) {
      if (conteudo(el)) el.removeAttribute("title");
    });

    document.addEventListener("pointerover", function (ev) {
      if (ev.pointerType !== "mouse") return;
      var el = alvoDe(ev.target);
      if (!el || alvoDe(ev.relatedTarget) === el) return;
      esconder();
      espera = setTimeout(function () { mostrar(el); }, 350);
    });
    document.addEventListener("pointerout", function (ev) {
      if (ev.pointerType !== "mouse") return;
      var el = alvoDe(ev.target);
      if (el && alvoDe(ev.relatedTarget) !== el && !(teclado && document.activeElement === el)) {
        clearTimeout(espera);
        espera = setTimeout(esconder, 150);
      }
    });
    balao.addEventListener("pointerenter", function (ev) {
      if (ev.pointerType === "mouse") clearTimeout(espera);
    });
    balao.addEventListener("pointerleave", function (ev) {
      if (ev.pointerType === "mouse" && alvoDe(ev.relatedTarget) !== atual &&
        !(teclado && document.activeElement === atual)) esconder();
    });
    document.addEventListener("pointerdown", function (ev) {
      teclado = false;
      bloqueio = null;
      toque = null;
      esconder();
      if (ev.pointerType !== "touch" && ev.pointerType !== "pen") return;
      var el = alvoDe(ev.target);
      if (!el || !ev.isPrimary) return;
      toque = { el: el, id: ev.pointerId, x: ev.clientX, y: ev.clientY, longo: false };
      espera = setTimeout(function () {
        toque.longo = true;
        bloqueio = el;
        mostrar(el);
        if (navigator.vibrate) navigator.vibrate(20);
      }, 500);
    }, true);
    document.addEventListener("pointermove", function (ev) {
      if (!toque || ev.pointerId !== toque.id) return;
      if (Math.hypot(ev.clientX - toque.x, ev.clientY - toque.y) > 10) {
        toque = null;
        esconder();
      }
    }, { passive: true });
    document.addEventListener("pointerup", function (ev) {
      if (!toque || ev.pointerId !== toque.id) return;
      clearTimeout(espera);
      if (toque.longo) ev.preventDefault();
      toque = null;
    }, true);
    document.addEventListener("pointercancel", function () {
      toque = null;
      esconder();
    });
    document.addEventListener("contextmenu", function (ev) {
      var el = alvoDe(ev.target);
      if (el && ((toque && toque.el === el) || bloqueio === el)) ev.preventDefault();
    }, true);
    document.addEventListener("click", function (ev) {
      if (bloqueio && bloqueio.contains(ev.target)) {
        bloqueio = null;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        return;
      }
      esconder();
    }, true);
    document.addEventListener("keydown", function (ev) {
      teclado = true;
      bloqueio = null;
      if (ev.key === "Escape") esconder();
    }, true);
    document.addEventListener("focusin", function (ev) {
      var el = alvoDe(ev.target);
      if (teclado && el) mostrar(el);
    });
    document.addEventListener("focusout", function (ev) {
      if (alvoDe(ev.target) === atual) esconder();
    });
    document.addEventListener("scroll", function () {
      toque = null;
      esconder();
    }, { capture: true, passive: true });
    window.addEventListener("resize", esconder);
    window.addEventListener("beforeprint", esconder);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", esconder);
      window.visualViewport.addEventListener("scroll", esconder);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})();
