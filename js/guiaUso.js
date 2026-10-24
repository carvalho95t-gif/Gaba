/* Gaba — o guia de uso. Cada artigo é uma resposta curta, escrita com as palavras que
   aparecem na tela. As perguntas de exemplo e as chaves existem para a busca acertar o
   jeito como o professor escreve, não para aparecer no texto. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.GabaGuia = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* as chaves são os data-tab do app; o rótulo é o que aparece no topo e nas abas */
  var TELAS = {
    geral: "Primeiros passos",
    dashboard: "Alívio",
    scanner: "Leitor",
    relatorios: "Análise",
    turmas: "Bastidor › Turmas",
    provas: "Bastidor › Provas",
    caderno: "Bastidor › Cadernos",
    config: "Bastidor › Ajustes",
    ajuda: "Ajuda"
  };

  var ARTIGOS = [
    {
      id: "comecar",
      tela: "geral",
      titulo: "Não sei por onde começar",
      perguntas: [
        "como começo a usar o gaba",
        "primeiros passos",
        "qual é a ordem das telas",
        "o que eu faço primeiro"
      ],
      chaves: ["comecar", "iniciar", "começar", "primeiro", "ordem", "tutorial", "novato"],
      resumo: "A ordem é sempre a mesma: entrar, cadastrar a turma, montar o caderno, ler as folhas e ver as notas.",
      passos: [
        "Entre com e-mail e senha pelo selo no topo ou por Bastidor › Ajustes.",
        "Em Bastidor › Turmas, crie a escola, a turma e traga a lista de alunos.",
        "Em Bastidor › Cadernos, importe o documento da prova (.docx, .doc ou PDF) e revise o gabarito.",
        "Ainda nos Cadernos, gere a prévia e imprima o lote.",
        "No Leitor, escolha a prova e a turma, ligue a câmera e passe as folhas.",
        "Em Análise, veja o resumo da turma, cada aluno, cada questão e os descritores."
      ],
      notas: [
        "Sem internet ou sem login, o Gaba continua corrigindo e guardando tudo neste aparelho; nada sobe para o banco até você entrar."
      ],
      veja: ["entrar", "importar-documento", "ler-folhas", "ver-notas"]
    },
    {
      id: "entrar",
      tela: "geral",
      titulo: "Como entrar no Gaba",
      perguntas: [
        "como faço login",
        "não consigo entrar",
        "e-mail ou senha não batem",
        "onde entro no banco",
        "o gaba pede senha toda hora"
      ],
      chaves: ["login", "entrar", "senha", "conta", "acesso", "autenticar", "identificar"],
      resumo: "O login é o que abre o banco: sem ele, o app corrige e guarda tudo só neste aparelho.",
      passos: [
        "Toque no selo de conexão no topo (aparece \"Supabase Desconectado\") ou abra Bastidor › Ajustes.",
        "Digite o seu e-mail e a sua senha.",
        "Toque em Entrar e confira se o selo passa a mostrar \"Conectado\".",
        "Se a mensagem for \"E-mail ou senha não batem\", confira a digitação ou peça uma senha nova a quem administra o Gaba na escola."
      ],
      notas: [
        "Sem login, as leituras ficam na fila do aparelho e sobem depois.",
        "Para subir o que foi lido antes do login, use Análise › Subir folhas do aparelho."
      ],
      veja: ["sem-internet", "conta", "sair-trocar-professor"]
    },
    {
      id: "conta",
      tela: "config",
      titulo: "Ainda não tenho conta de professor",
      perguntas: [
        "como crio minha conta",
        "não tenho senha",
        "cadastro de professor",
        "o criar conta deu erro",
        "signups not allowed"
      ],
      chaves: ["conta", "cadastro", "cadastrar", "senha", "convite", "criar", "registrar"],
      resumo: "As contas de professor do Gaba são criadas pela pessoa que administra o app na escola. O cadastro aberto fica desligado.",
      passos: [
        "Peça uma conta a quem administra o Gaba na sua escola, informando o seu e-mail.",
        "Quando receber a senha, entre pelo selo do topo ou por Bastidor › Ajustes.",
        "Se o botão \"Criar conta de professor\" mostrar um erro, é porque o cadastro aberto está desligado: use o pedido à administração."
      ],
      notas: [
        "Enquanto não tiver conta, você pode usar o Gaba só neste aparelho: as leituras ficam guardadas e sobem quando você entrar."
      ],
      veja: ["entrar", "sem-internet"]
    },
    {
      id: "sem-internet",
      tela: "scanner",
      titulo: "Funciona sem internet?",
      perguntas: [
        "preciso de internet para corrigir",
        "a escola não tem wi-fi",
        "o que acontece se cair a rede",
        "fila offline",
        "folhas que não subiram"
      ],
      chaves: ["internet", "rede", "wi-fi", "wifi", "offline", "conexao", "conexão", "fila", "pendente", "nuvem"],
      resumo: "Para ler e corrigir, não precisa de internet. A conexão só serve para subir as notas e usa o banco em outros aparelhos.",
      passos: [
        "Ligue a câmera e leia as folhas normalmente, mesmo sem rede ou sem login.",
        "Cada folha fica na fila do aparelho; o cartão \"Na fila offline\" no Leitor mostra quantas estão esperando.",
        "Quando tiver internet, entre no Gaba e toque em Análise › Subir folhas do aparelho.",
        "Confira em Análise › Resumo, na tabela \"Correções recentes\", se as linhas não têm mais a etiqueta \"aparelho\"."
      ],
      notas: [
        "Não limpe os dados do navegador antes de subir as folhas: a fila mora no armazenamento do aparelho.",
        "Na tabela \"Correções recentes\" da Análise, as linhas marcadas com \"aparelho\" são folhas lidas que ainda não estão no banco."
      ],
      veja: ["entrar", "ver-notas", "instalar"]
    },
    {
      id: "instalar",
      tela: "geral",
      titulo: "Como instalar o Gaba no celular",
      perguntas: [
        "dá para instalar como aplicativo",
        "colocar o gaba na tela inicial",
        "funciona no iphone",
        "vira um app"
      ],
      chaves: ["instalar", "aplicativo", "app", "atalho", "icone", "ícone", "tela inicial", "pwa", "celular"],
      resumo: "O Gaba é um app de navegador: ele ganha um ícone na tela inicial e abre em tela cheia, sem passar pela loja.",
      passos: [
        "No Android, abra o endereço do Gaba no Chrome, toque no menu de três pontos e escolha \"Adicionar à tela inicial\".",
        "No iPhone, abra no Safari, toque em Compartilhar e escolha \"Adicionar à Tela de Início\".",
        "Abra o Gaba sempre por esse ícone: ele usa os mesmos dados do navegador."
      ],
      notas: [
        "A câmera do Leitor só funciona em endereço https; o endereço publicado do Gaba já é."
      ],
      veja: ["comecar", "camera"]
    },
    {
      id: "escola",
      tela: "turmas",
      titulo: "Cadastrar a escola",
      perguntas: [
        "como cadastro a escola",
        "a escola não aparece no seletor",
        "preciso criar escola antes da turma",
        "nome da escola"
      ],
      chaves: ["escola", "unidade", "colégio", "colegio", "cadastrar", "seletor"],
      resumo: "A escola nasce antes de qualquer turma e é ela que separa as turmas de unidades diferentes.",
      passos: [
        "Abra Bastidor › Turmas.",
        "No passo 1, escreva o nome da escola e toque em \"Criar escola\".",
        "A escola passa a aparecer na lista e no seletor do topo.",
        "Para criar uma turma nela, toque em \"adicionar turma\" ao lado do nome."
      ],
      notas: [
        "A escola aparece no cadastro de turma mesmo no dia em que ainda não tem aluno nenhum."
      ],
      veja: ["turma", "filtro-escola"]
    },
    {
      id: "turma",
      tela: "turmas",
      titulo: "Criar uma turma",
      perguntas: [
        "como crio uma turma",
        "cadastrar turma nova",
        "a turma não aparece no leitor",
        "ano e período"
      ],
      chaves: ["turma", "classe", "serie", "série", "ano", "periodo", "período", "criar", "cadastrar"],
      resumo: "Basta o nome, o ano/período e a escola; a turma já fica disponível no Leitor e nos Cadernos.",
      passos: [
        "Abra Bastidor › Turmas.",
        "No passo 2, preencha o nome da turma (ex.: 1º Ano A) e o ano/período.",
        "Escolha a escola na lista (ela já vem preenchida quando você criou a escola pelo botão da lista).",
        "Toque em \"Salvar Turma\".",
        "Depois de criar, cadastre ou importe os alunos dessa turma."
      ],
      notas: [
        "Uma turma sem escola continua funcionando, mas fica fora do filtro por escola."
      ],
      veja: ["escola", "aluno", "importar-lista"]
    },
    {
      id: "aluno",
      tela: "turmas",
      titulo: "Cadastrar um aluno",
      perguntas: [
        "como adiciono um aluno",
        "cadastrar aluno que chegou depois",
        "número de chamada",
        "editar nome do aluno"
      ],
      chaves: ["aluno", "estudante", "nome", "chamada", "numero", "número", "matricula", "matrícula", "cadastrar"],
      resumo: "Um aluno de cada vez entra no cadastro manual; a turma inteira entra pela importação da lista.",
      passos: [
        "Abra Bastidor › Turmas e role até \"Cadastrar Aluno\".",
        "Escolha a turma que recebe o aluno.",
        "Digite o nome e o número de chamada.",
        "Toque em \"Adicionar Aluno\"."
      ],
      notas: [
        "Para corrigir a grafia de um nome já cadastrado, apague o aluno e cadastre de novo.",
        "O número de chamada aparece no Leitor e ajuda a achar o aluno na pilha de folhas."
      ],
      veja: ["importar-lista", "apagar"]
    },
    {
      id: "importar-lista",
      tela: "turmas",
      titulo: "Importar a lista de chamada do Excel",
      perguntas: [
        "como trago a lista da escola",
        "importar xlsx",
        "colar do excel",
        "a planilha não foi reconhecida",
        "importar csv"
      ],
      chaves: ["importar", "lista", "chamada", "planilha", "excel", "xlsx", "csv", "copiar", "colar", "responsavel", "responsável"],
      resumo: "O Gaba aceita o .xlsx da escola, um CSV salvo do Excel ou as células coladas, e encontra as colunas sozinho.",
      passos: [
        "Abra Bastidor › Turmas e role até \"Importar a lista de chamada\".",
        "Escolha a turma que vai receber a lista.",
        "Solte o arquivo .xlsx, .csv, .txt ou .tsv, ou cole as células copiadas do Excel.",
        "Toque em \"Ver o que a lista tem\" e confira a prévia.",
        "Se estiver certo, toque em \"Salvar na turma\"."
      ],
      notas: [
        "Nada é gravado antes de você ver a prévia; a leitura acontece no aparelho, sem enviar o arquivo para a internet.",
        "As colunas Nº, Nome, Matrícula, Responsável, E-mail, Telefone e Tipo de Prova são reconhecidas pelo título.",
        "Se aparecer \"Nenhuma aba tem coluna de Nº e de Nome juntas\", abra a planilha, deixe só a aba da chamada e salve como CSV."
      ],
      veja: ["aluno", "turma"]
    },
    {
      id: "filtro-escola",
      tela: "turmas",
      titulo: "Trabalho em mais de uma escola",
      perguntas: [
        "minhas turmas desapareceram",
        "trocar de escola",
        "o filtro do topo",
        "ver turmas de todas as escolas"
      ],
      chaves: ["escola", "filtro", "seletor", "topo", "desapareceu", "sumiu", "unidade", "trocar"],
      resumo: "O seletor de escola no topo decide quais turmas aparecem em todas as telas.",
      passos: [
        "Toque no seletor \"Escola\" no alto da tela.",
        "Escolha a escola em que vai trabalhar.",
        "Para voltar a ver tudo, escolha \"Todas as escolas\" no mesmo seletor ou use \"ver todas\" em Bastidor › Turmas."
      ],
      notas: [
        "Se uma turma \"sumiu\", confira primeiro qual escola está escolhida no topo."
      ],
      veja: ["escola", "turma"]
    },
    {
      id: "apagar",
      tela: "turmas",
      titulo: "Apagar escola, turma, aluno ou prova",
      perguntas: [
        "como excluo uma turma",
        "apagar aluno errado",
        "remover prova",
        "desfazer exclusão"
      ],
      chaves: ["apagar", "excluir", "remover", "deletar", "exclusao", "exclusão", "desfazer", "tirar"],
      resumo: "Cada item das listas tem o próprio botão de apagar, com uma confirmação antes.",
      passos: [
        "Aluno: em Bastidor › Turmas, toque em \"apagar\" na linha do aluno.",
        "Turma: toque em \"apagar\" na linha da turma; os alunos dela saem junto.",
        "Prova: em Bastidor › Provas, toque em \"apagar\" na linha da prova.",
        "Escola: na lista de escolas, toque em \"tirar do cadastro\"."
      ],
      notas: [
        "As notas já corrigidas continuam no banco mesmo depois de apagar a turma ou a prova.",
        "A exclusão não tem desfazer: leia a confirmação antes de tocar em OK."
      ],
      veja: ["turma", "aluno", "prova-gabarito"]
    },
    {
      id: "prova-gabarito",
      tela: "provas",
      titulo: "Criar uma prova só com o gabarito",
      perguntas: [
        "como salvo só o gabarito",
        "prova sem questões",
        "cadastrar gabarito oficial",
        "quantas questões"
      ],
      chaves: ["prova", "gabarito", "oficial", "questoes", "questões", "disciplina", "titulo", "título", "cadastrar"],
      resumo: "A tela Provas guarda o gabarito oficial, sem os enunciados, e o cartão A–E que o Leitor corrige.",
      passos: [
        "Abra Bastidor › Provas.",
        "Digite o título, a disciplina e a quantidade de questões (de 1 a 90).",
        "Em \"Gabarito Oficial\", escolha a letra certa de cada questão.",
        "Toque em \"Salvar Prova\"."
      ],
      notas: [
        "A prova salva aqui não tem enunciados. Para imprimir o caderno com as questões, importe o documento em Bastidor › Cadernos."
      ],
      veja: ["importar-documento", "revisar-questoes"]
    },
    {
      id: "importar-documento",
      tela: "caderno",
      titulo: "Importar a prova de Word ou PDF",
      perguntas: [
        "como importo a prova",
        "ler docx",
        "trazer o pdf da prova",
        "o word não abriu",
        "importar questões"
      ],
      chaves: ["importar", "documento", "docx", "doc", "word", "pdf", "questoes", "questões", "prova", "arquivo"],
      resumo: "Em Bastidor › Cadernos, o botão \"Importar documento\" lê o .docx, .doc ou PDF e monta as questões para revisar.",
      passos: [
        "Abra Bastidor › Cadernos.",
        "Toque em \"Importar documento\" e escolha o arquivo.",
        "Confira a mensagem \"Documento importado: X questões, Y alunos, Z tipo(s)\".",
        "Se aparecer \"N sem gabarito\", ajuste essas questões na revisão abaixo.",
        "Revise gabarito, peso e descritor e toque em \"Salvar revisão no banco\" para a prova valer em qualquer aparelho."
      ],
      notas: [
        "Enquanto não for salva no banco, a prova importada fica só neste aparelho e aparece com \"(documento)\" no seletor.",
        "Para o Gaba achar o gabarito, o documento precisa trazer uma seção, matriz ou tabela de gabarito (ex.: \"GABARITO: 1-A 2-C 3-B\" ou a tabela com Tipo e as letras). Sem isso, as questões entram sem gabarito e você define na revisão."
      ],
      veja: ["revisar-questoes", "embaralhar", "imprimir"]
    },
    {
      id: "revisar-questoes",
      tela: "caderno",
      titulo: "Revisar gabarito, peso e descritor",
      perguntas: [
        "como reviso as questões",
        "mudar o peso da questão",
        "colocar descritor",
        "o gabarito veio errado",
        "questão sem gabarito"
      ],
      chaves: ["revisar", "revisao", "revisão", "gabarito", "peso", "pontos", "descritor", "bncc", "habilidade", "questao", "questão"],
      resumo: "Depois de importar, cada questão ganha uma linha com gabarito, peso, descritor e habilidade BNCC para acertar.",
      passos: [
        "Em Bastidor › Cadernos, escolha a prova.",
        "Na lista de questões, escolha a letra do gabarito (\"—\" quer dizer sem gabarito: a questão não dá ponto).",
        "Ajuste o peso de cada questão; o padrão é 1.",
        "No campo do descritor, comece a digitar o código e escolha na lista oficial.",
        "Se quiser, preencha a habilidade BNCC.",
        "Toque em \"Salvar revisão no banco\"."
      ],
      notas: [
        "A nota é a soma dos pesos das questões acertadas sobre o total de pesos, na escala de 0 a 10.",
        "O aviso \"Revisar antes de imprimir\" lista o que ainda está sem gabarito ou com gabarito fora das alternativas."
      ],
      veja: ["importar-documento", "analise-itens"]
    },
    {
      id: "embaralhar",
      tela: "caderno",
      titulo: "Embaralhar questões e criar tipos de caderno",
      perguntas: [
        "como embaralho as questões",
        "tipos de prova diferentes",
        "evitar cola",
        "embaralhar alternativas",
        "chave do embaralhamento"
      ],
      chaves: ["embaralhar", "embaralhamento", "tipo", "tipos", "versao", "versão", "ordem", "cola", "alternativas", "chave", "salt"],
      resumo: "Você escolhe quantos tipos de caderno existem; o QR de cada folha diz ao Leitor qual versão está na mão do aluno.",
      passos: [
        "Em Bastidor › Cadernos, escolha a prova e a turma.",
        "Em \"Embaralhamento\", escolha \"Única\" (todos na ordem original), \"Por tipo de caderno\" ou \"Ordem própria por aluno\".",
        "Defina o número de tipos quando escolher \"Por tipo de caderno\".",
        "Marque \"Embaralhar também as alternativas\" se quiser que a letra certa mude de posição.",
        "Preencha a chave do embaralhamento se quiser repetir a mesma ordem depois; vazia, o Gaba sempre sorteia igual."
      ],
      notas: [
        "O Leitor corrige cada caderno pela versão do QR, sem você escolher nada por aluno.",
        "Na revisão, os números das questões em dúvida seguem a ordem impressa no caderno do aluno."
      ],
      veja: ["imprimir", "reimprimir", "ler-folhas"]
    },
    {
      id: "modelo-cabecalho",
      tela: "caderno",
      titulo: "Modelo de prova, colunas e cabeçalho",
      perguntas: [
        "como mudo o cabeçalho",
        "modelo enem",
        "modelo paebes",
        "duas colunas",
        "nome da escola impresso",
        "instruções da prova"
      ],
      chaves: ["modelo", "cabecalho", "cabeçalho", "enem", "paebes", "saeb", "ama", "sedu", "coluna", "colunas", "instrucoes", "instruções", "professor", "bimestre"],
      resumo: "O modelo escolhe a cara do caderno; o cabeçalho imprime os dados da escola na folha de respostas.",
      passos: [
        "Em Bastidor › Cadernos, escolha o \"Modelo de prova\": Cabeçalho da escola, ENEM, PAEBES/SAEB ou AMA/SEDU-ES.",
        "Escolha \"Colunas do corpo\": uma ou duas.",
        "Abra \"Cabeçalho impresso na folha de respostas\" e preencha rede, escola, título, disciplina, professor(a), ano, bimestre e data.",
        "Nas instruções, escreva uma linha por instrução; em branco, o Gaba usa o texto do modelo escolhido."
      ],
      notas: [
        "Marque \"Imprimir o descritor sob cada questão\" só quando o caderno for do professor; o do aluno sai limpo se deixar desmarcado.",
        "O Gaba guarda essas escolhas no aparelho para as próximas provas."
      ],
      veja: ["imprimir", "embaralhar"]
    },
    {
      id: "imprimir",
      tela: "caderno",
      titulo: "Imprimir os cadernos da turma",
      perguntas: [
        "como imprimo os cadernos",
        "cada aluno com a sua prova",
        "configurar a impressora",
        "margem nenhuma",
        "imprimir frente e verso"
      ],
      chaves: ["imprimir", "impressao", "impressão", "impressora", "caderno", "lote", "margem", "margens", "a4", "verso", "frente", "previa", "prévia"],
      resumo: "Cada aluno recebe o próprio caderno: folha de respostas com QR na página 1, questões a partir da 2 e o último verso em branco.",
      passos: [
        "Em Bastidor › Cadernos, escolha a prova e a turma.",
        "Toque em \"Gerar prévia\" e confira o número de cadernos, de folhas A4 e de tipos.",
        "Toque em \"Imprimir lote\".",
        "No diálogo do navegador: papel A4, margens \"Nenhuma\", escala 100% e \"Cabeçalhos e margens\" desligado.",
        "Imprima frente e verso se a impressora fizer."
      ],
      notas: [
        "Se a janela de impressão não abrir, use Ctrl+P.",
        "\"Baixar HTML\" gera um arquivo para imprimir em outro computador."
      ],
      veja: ["cortado", "reimprimir", "modelo-cabecalho"]
    },
    {
      id: "cortado",
      tela: "caderno",
      titulo: "O Gaba avisou que o texto não cabe",
      perguntas: [
        "a questão foi cortada",
        "o texto saiu cortado",
        "não deixa imprimir",
        "atenção N linhas não caberiam",
        "questão maior que uma coluna"
      ],
      chaves: ["cortado", "corte", "cortadas", "nao cabe", "não cabe", "coube", "encaixe", "estourou", "coluna", "bloqueou", "aviso"],
      resumo: "Antes de imprimir, o Gaba mede o papel: o que não couber aparece em \"Revisar antes de imprimir\" e trava o lote.",
      passos: [
        "Leia a lista de avisos abaixo dos Cadernos.",
        "Se uma questão é maior que uma coluna inteira, troque o corpo para \"Duas colunas\" ou encurte o enunciado no documento.",
        "Se for o cabeçalho ou as instruções, diminua o texto.",
        "Diminua o \"Máximo por página\" se as questões estiverem apertadas.",
        "Gere a prévia de novo; quando a lista sumir, o botão \"Imprimir lote\" destrava."
      ],
      notas: [
        "O Gaba reduz sozinho o corpo das caixas do cabeçalho para tentar caber antes de cortar qualquer linha."
      ],
      veja: ["imprimir", "modelo-cabecalho"]
    },
    {
      id: "reimprimir",
      tela: "caderno",
      titulo: "Imprimi de novo: as folhas antigas ainda valem?",
      perguntas: [
        "as folhas antigas ainda valem",
        "reimprimir a prova",
        "aluno novo depois da impressão",
        "código do lote"
      ],
      chaves: ["reimprimir", "reimpressao", "reimpressão", "folha antiga", "codigo", "código", "lote", "impressao", "impressão", "aluno novo", "validade"],
      resumo: "A folha continua valendo quando a prova, a turma e o embaralhamento são os mesmos. Mudou a lista da turma ou o modo, imprima de novo para todos.",
      passos: [
        "Se só perdeu uma folha e nada mudou na prova nem na turma, gere a prévia e imprima o caderno daquele aluno.",
        "Se o Leitor avisar que a folha não bate com o lote, imprima o caderno de novo: o código da folha é de uma geração anterior.",
        "No modo \"Única\" todas as folhas têm o mesmo código, então a reimpressão é livre.",
        "Nos modos por tipo ou por aluno, leia as folhas que já estão com os alunos antes de mexer na lista da turma: aluno novo desloca os tipos dos seguintes."
      ],
      notas: [
        "A chave do embaralhamento muda a ordem e o código: mantenha a mesma chave para reimprimir sem invalidar as folhas.",
        "Este é um ponto para melhorar: o Gaba ainda não mantém os tipos dos alunos ao inserir um aluno novo no meio da lista."
      ],
      veja: ["embaralhar", "imprimir", "folha-recusada"]
    },
    {
      id: "ler-folhas",
      tela: "scanner",
      titulo: "Como corrigir as folhas com a câmera",
      perguntas: [
        "como uso o leitor",
        "ler as folhas",
        "corrigir com a câmera",
        "o celular apita",
        "preciso apertar botão para cada aluno"
      ],
      chaves: ["leitor", "ler", "corrigir", "camera", "câmera", "folha", "folhas", "apito", "bip", "passar", "scanner", "escanear"],
      resumo: "O Leitor reconhece a versão pelo QR, corrige, apita e salva sozinho: você só passa as folhas.",
      passos: [
        "Abra o Leitor, escolha a Prova e a Turma.",
        "Toque em \"Ligar câmera\" e permita o uso da câmera.",
        "Enquadre a folha inteira: as 4 marcas pretas em volta do cartão e o QR precisam aparecer.",
        "Segure firme até o apito; a última folha aparece na lista com o número de acertos e a nota.",
        "Vire a folha e repita; no fim, toque em \"Parar\"."
      ],
      notas: [
        "Apito curto e agudo: lida. Apito longo: lida com dúvida. Apito grave: recusada.",
        "Dá para desligar o som em \"Apito a cada folha\"."
      ],
      veja: ["camera", "nao-acha", "duvida", "sensibilidade"]
    },
    {
      id: "camera",
      tela: "scanner",
      titulo: "A câmera não abre",
      perguntas: [
        "a câmera não liga",
        "permissão de câmera",
        "camera nao autorizada",
        "NotAllowedError",
        "outro app está usando a câmera"
      ],
      chaves: ["camera", "câmera", "permissao", "permissão", "abrir", "ligar", "notallowed", "autorizar", "bloqueada", "celular"],
      resumo: "Quase sempre é permissão do navegador ou outro app usando a câmera. O Leitor também exige uma prova escolhida antes.",
      passos: [
        "Escolha a Prova antes de tocar em \"Ligar câmera\": sem prova, ele avisa \"Escolha a prova antes de ligar a camera\".",
        "Quando o navegador pedir, toque em Permitir.",
        "Se já tiver negado antes, toque no cadeado ao lado do endereço e libere a câmera.",
        "Feche outros apps que usam a câmera (WhatsApp, videochamada) e tente de novo.",
        "O endereço precisa ser https; o endereço publicado do Gaba já é."
      ],
      notas: [
        "Feche e abra o Gaba depois de mudar a permissão."
      ],
      veja: ["ler-folhas", "nao-acha"]
    },
    {
      id: "nao-acha",
      tela: "scanner",
      titulo: "O Leitor não acha a folha",
      perguntas: [
        "a folha não é reconhecida",
        "não lê a folha",
        "bolhas lidas, QR não encontrado",
        "enquadre a folha inteira",
        "marcas pretas"
      ],
      chaves: ["encontrar", "reconhecer", "reconhecida", "marcas", "pretas", "enquadre", "foco", "distancia", "distância", "borrado", "qr", "leiitura", "leitura", "sombra"],
      resumo: "O Leitor precisa ver as 4 marcas pretas em volta do cartão e o QR da folha.",
      passos: [
        "Afaste um pouco o celular até as 4 marcas pretas aparecerem completas na tela.",
        "Deixe a folha plana sobre a mesa, sem dobra.",
        "Evite sombra e reflexo: luz vindo de cima ou de trás de você costuma funcionar melhor.",
        "Confira se o QR está inteiro, sem rasura ou dobra.",
        "Se aparecer \"Bolhas lidas; QR não encontrado\", aproxime um pouco e tire o reflexo de cima do QR."
      ],
      notas: [
        "Folha impressa por outro sistema, ou por um modelo antigo do Gaba, não é aceita: reimprima pelo Bastidor › Cadernos."
      ],
      veja: ["ler-folhas", "folha-recusada", "sensibilidade"]
    },
    {
      id: "duvida",
      tela: "scanner",
      titulo: "\"Com dúvida\" e \"revisar: 3, 7\"",
      perguntas: [
        "o que é com dúvida",
        "revisar 3 7",
        "a folha foi lida com dúvida",
        "duas marcas na mesma questão",
        "corrigir a marca do aluno"
      ],
      chaves: ["duvida", "dúvida", "revisar", "confusao", "confusão", "ambigua", "ambígua", "marca", "rasura", "duas", "borrada"],
      resumo: "É o Leitor avisando que uma ou mais questões têm marca fraca, borrada ou duplas. A folha vale, mas aquelas questões você precisa conferir no papel.",
      passos: [
        "Leia os números depois de \"revisar:\": são as questões na ordem impressa no caderno do aluno.",
        "Confira essas questões na folha de papel.",
        "Se a marca estiver fraca, suba a sensibilidade e leia a folha de novo.",
        "O cartão \"Com dúvida\" no Leitor conta as folhas desta sessão que têm pelo menos uma questão a revisar."
      ],
      notas: [
        "Hoje o Gaba não deixa trocar a letra de uma questão direto na tela. É um ponto para melhorar: registre em Ajuda › Sugestões.",
        "A marca \"Com dúvida\" não muda a nota sozinha: a correção segue o que o Leitor leu."
      ],
      veja: ["sensibilidade", "reler", "ler-folhas"]
    },
    {
      id: "sensibilidade",
      tela: "scanner",
      titulo: "Sensibilidade: lápis ou caneta",
      perguntas: [
        "a prova foi a lápis",
        "marca fraca não lê",
        "aumentar a sensibilidade",
        "caneta x lápis",
        "marcação clara"
      ],
      chaves: ["sensibilidade", "lapis", "lápis", "caneta", "clara", "fraca", "escura", "marca", "ajuste"],
      resumo: "Para lápis, suba a sensibilidade; para exigir marca escura, desça.",
      passos: [
        "No Leitor, olhe o controle \"Sensibilidade (caneta ↔ lápis)\".",
        "Valores acima de 1 aceitam marcas mais fracas (lápis).",
        "Valores abaixo de 1 exigem marca mais escura (caneta), o que evita contar rasura.",
        "Leia uma folha de teste e ajuste até parar de errar."
      ],
      notas: [
        "A sensibilidade vale para as folhas lidas depois do ajuste, não para as que já estão na lista."
      ],
      veja: ["duvida", "ler-folhas"]
    },
    {
      id: "reler",
      tela: "scanner",
      titulo: "Ler a mesma folha de novo",
      perguntas: [
        "a folha já foi lida",
        "reler uma folha",
        "esquecer lidas",
        "a nota veio errada e quero ler outra vez"
      ],
      chaves: ["reler", "repetir", "duplicar", "duplicada", "esquecer", "zerar", "lista", "lida"],
      resumo: "\"Esquecer lidas\" zera a lista da sessão para o Leitor aceitar a mesma folha outra vez.",
      passos: [
        "Toque em \"Esquecer lidas\" no Leitor.",
        "Aponte a folha de novo, como se fosse a primeira leitura.",
        "A nova leitura toma o lugar da anterior, sem duplicar a nota."
      ],
      notas: [
        "O Leitor evita ler a mesma folha duas vezes na mesma sessão de propósito: isso protege contra folha passada em dobro."
      ],
      veja: ["ler-folhas", "folha-recusada"]
    },
    {
      id: "folha-recusada",
      tela: "scanner",
      titulo: "Folha recusada: o que cada aviso quer dizer",
      perguntas: [
        "folha de fora desta prova",
        "folha de outra impressão",
        "falta o gabarito desta versão",
        "folha impressa com outra posição de marcas",
        "o leitor recusou a folha"
      ],
      chaves: ["recusada", "rejeitada", "rejeitar", "fora", "gabarito", "versao", "versão", "impressao", "impressão", "marcas", "posicao", "posição", "reimprima"],
      resumo: "O apito grave é o Leitor recusando uma folha que ele não consegue corrigir com segurança. A mensagem na tela diz qual é o motivo.",
      passos: [
        "Se disser \"Folha de fora desta prova\" ou \"Folha de outra impressão\", confira a prova, a turma e o lote: essa folha não é desta impressão.",
        "Se disser \"Folha impressa com outra posição de marcas\", a folha é de um modelo antigo do Gaba: reimprima o caderno do aluno.",
        "Se disser \"Falta o gabarito desta versão no aparelho\", abra Bastidor › Cadernos, escolha a prova e a turma, toque em \"Gerar prévia\" e volte ao Leitor.",
        "Depois do ajuste, aponte a folha de novo."
      ],
      notas: [
        "O motivo também ajuda a achar folha de outra turma ou de outra escola na pilha."
      ],
      veja: ["reimprimir", "nao-acha", "ler-folhas"]
    },
    {
      id: "ver-notas",
      tela: "relatorios",
      titulo: "Onde vejo as notas",
      perguntas: [
        "ver as notas",
        "relatório de correções",
        "a nota não aparece",
        "folha marcada como aparelho",
        "subir folhas do aparelho"
      ],
      chaves: ["nota", "notas", "relatorio", "relatório", "correcao", "correção", "tabela", "aparelho", "marcada", "subir", "sincronizar", "resultado"],
      resumo: "Cada folha lida aparece em Análise › Resumo, na tabela \"Correções recentes\": data, aluno, turma, prova e nota final.",
      passos: [
        "Abra Análise (o gráfico no topo da faixa de telas).",
        "Toque em \"Subir folhas do aparelho\" para enviar ao banco o que ficou só neste aparelho.",
        "Confira \"Correções recentes\": as linhas com a etiqueta \"aparelho\" ainda não subiram; passe o mouse para ver o motivo.",
        "Use as abas Resumo, Por aluno, Por questão e Por descritor para ver a mesma prova por outros cortes."
      ],
      notas: [
        "A nota usa a soma dos pesos das questões acertadas."
      ],
      veja: ["sem-internet", "analise-itens", "excel"]
    },
    {
      id: "analise-itens",
      tela: "relatorios",
      titulo: "Análise de item: acertos, discriminação e distratores",
      perguntas: [
        "análise de item",
        "discriminação",
        "distrator mais forte",
        "questões difíceis",
        "mostrar só as questões a revisar"
      ],
      chaves: ["analise", "análise", "item", "itens", "acerto", "acertos", "discriminacao", "discriminação", "distrator", "distratores", "dificil", "difícil", "revisar", "csv"],
      resumo: "Para cada questão, o Gaba mostra quantos acertaram, se ela separa os melhores dos piores e qual alternativa errada mais enganou.",
      passos: [
        "Abra Análise e escolha a Prova e a Turma no topo.",
        "Toque na aba \"Por questão\".",
        "Ordene por \"Ordem da prova\", \"Menos acertos primeiro\", \"Pior discriminação primeiro\" ou \"Distrator mais forte primeiro\".",
        "Marque \"Mostrar só as questões a revisar\" para ver apenas as sinalizadas.",
        "Toque em \"Baixar CSV da análise\" se quiser analisar fora do app."
      ],
      notas: [
        "A análise conta as folhas do banco e as que ainda estão só neste aparelho, sempre na ordem da prova base, mesmo com cadernos embaralhados."
      ],
      veja: ["ver-notas", "revisar-questoes"]
    },
    {
      id: "excel",
      tela: "relatorios",
      titulo: "Levar as notas para o Excel",
      perguntas: [
        "exportar para excel",
        "baixar planilha",
        "análise e excel",
        "painel do professor",
        "salvar notas em xlsx"
      ],
      chaves: ["excel", "planilha", "exportar", "xlsx", "baixar", "painel", "professor", "csv"],
      resumo: "A Análise exporta CSV: \"Baixar CSV\" leva a aba aberta com os filtros, e \"Baixar CSV da análise\" leva a tabela por questão. O arquivo abre no Excel.",
      passos: [
        "Abra Análise e escolha a Prova e a Turma.",
        "Toque em \"Baixar CSV\" para exportar a aba que está aberta.",
        "Para a tabela por questão, abra a aba \"Por questão\" e toque em \"Baixar CSV da análise\".",
        "Abra o arquivo .csv no Excel ou no Google Planilhas."
      ],
      notas: [
        "O arquivo usa ponto e vírgula e vem com acentos: o Excel em português abre direto."
      ],
      veja: ["ver-notas", "analise-itens"]
    },
    {
      id: "alivio",
      tela: "dashboard",
      titulo: "O que é a Central de Alívio",
      perguntas: [
        "o que é a tela alívio",
        "papel que você não conferiu",
        "correção devolvida",
        "dados do painel inicial",
        "pilhas"
      ],
      chaves: ["alivio", "alívio", "painel", "inicio", "início", "papel", "tempo", "pilha", "pilhas", "contagem", "horas"],
      resumo: "É o painel inicial: mostra o que já foi lido, em papel e em tempo de correção manual, e as pilhas de cada turma.",
      passos: [
        "Abra Alívio.",
        "Confira os dois números grandes: papel e tempo devolvidos.",
        "Veja em \"As pilhas, uma por uma\" quantos alunos há em cada turma, quantas folhas foram lidas e quantas faltam."
      ],
      notas: [
        "A conta é uma estimativa: 5 g por folha e 22 s de correção manual por folha.",
        "Com uma escola escolhida no topo, os números contam só as turmas dela."
      ],
      veja: ["ver-notas", "filtro-escola"]
    },
    {
      id: "banco",
      tela: "config",
      titulo: "Banco de dados: URL, chave e conexão",
      perguntas: [
        "o que é supabase",
        "configurar banco",
        "project url",
        "anon key",
        "trocar de banco",
        "service role"
      ],
      chaves: ["banco", "supabase", "conexao", "conexão", "configurar", "url", "chave", "anon", "key", "servidor", "banco de dados"],
      resumo: "O endereço e a chave do banco já vêm dentro do app: o professor só precisa entrar com e-mail e senha.",
      passos: [
        "Não é preciso configurar nada para usar o Gaba na escola.",
        "Se alguém da administração mandar trocar a conexão, abra Bastidor › Ajustes › Banco de dados e preencha a Project URL e a Chave Pública.",
        "Toque em \"Salvar Credenciais\"."
      ],
      notas: [
        "A chave anon é pública por natureza; quem protege os dados é o login.",
        "Nunca cole a chave service_role no app: ela não é usada aqui."
      ],
      veja: ["erro-banco", "entrar"]
    },
    {
      id: "erro-banco",
      tela: "config",
      titulo: "Mensagens de erro do banco",
      perguntas: [
        "rode schema.sql",
        "o banco só atende quem entrou",
        "sem conexão com o banco",
        "salvou no aparelho mas não subiu",
        "tabelas novas"
      ],
      chaves: ["erro", "erro banco", "schema", "tabela", "coluna", "permissao", "permissão", "401", "unauthorized", "falha", "nao subiu", "não subiu"],
      resumo: "Cada mensagem do banco quer dizer uma coisa: o que fazer depende de qual apareceu.",
      passos: [
        "\"O banco só atende quem entrou\": entre com e-mail e senha em Bastidor › Ajustes.",
        "\"O banco ainda não tem as tabelas e colunas novas\": avise quem administra o Gaba para rodar a atualização do schema no Supabase.",
        "\"Sem rede: o registro ficou guardado neste aparelho\": tente de novo quando a internet voltar.",
        "\"Salvo no aparelho; N não subiu para o banco\": toque em Análise › Subir folhas do aparelho quando estiver conectado."
      ],
      notas: [
        "Registrar o problema em Ajuda › Problemas ajuda a achar o motivo: o relato vai com os últimos erros técnicos."
      ],
      veja: ["banco", "sem-internet"]
    },
    {
      id: "sair-trocar-professor",
      tela: "config",
      titulo: "Sair da conta ou trocar de professor",
      perguntas: [
        "como sair da conta",
        "sair do gaba",
        "trocar de professor",
        "outro professor usar o mesmo celular"
      ],
      chaves: ["sair", "logout", "desconectar", "trocar", "professor", "conta", "mesmo", "celular", "aparelho"],
      resumo: "Ao sair, o banco para de atender até alguém entrar de novo; as leituras continuam sendo guardadas no aparelho.",
      passos: [
        "Toque no selo de conexão no topo e escolha Sair, ou abra Bastidor › Ajustes › Professor e toque em Sair.",
        "Para outro professor usar o mesmo aparelho, ele entra com o e-mail e a senha dele.",
        "Antes de sair, use Análise › Subir folhas do aparelho para não deixar leitura para trás."
      ],
      notas: [
        "Se o celular é compartilhado, confira em Análise se tudo subiu antes de trocar de professor."
      ],
      veja: ["entrar", "ver-notas"]
    },
    {
      id: "pedir-ajuda",
      tela: "ajuda",
      titulo: "Ajuda: mandar dúvida, sugestão ou problema",
      perguntas: [
        "como mando uma sugestão",
        "relatar um problema",
        "falar com quem fez o app",
        "não achei minha dúvida",
        "mandar um erro"
      ],
      chaves: ["ajuda", "duvida", "dúvida", "sugestao", "sugestão", "problema", "relatar", "reclamar", "falar", "feedback", "melhoria", "contato"],
      resumo: "O botão de ajuda abre três coisas: dúvidas respondidas pelo guia, sugestões e o registro de problemas.",
      passos: [
        "Dúvidas: escreva a pergunta; o Gaba mostra os trechos do guia que combinam.",
        "Se nenhum resolver, toque em \"Não resolveu\" e mande a sua dúvida: ela entra no banco para melhorar o guia.",
        "Sugestões: escolha a tela, conte o que gostaria que mudasse e envie.",
        "Problemas: conte o que aconteceu; o Gaba anexa os últimos erros técnicos, sem nomes de alunos."
      ],
      notas: [
        "O que você envia fica no banco do Gaba para a manutenção do app."
      ],
      veja: ["privacidade-erros"]
    },
    {
      id: "privacidade-erros",
      tela: "ajuda",
      titulo: "O que vai junto quando relato um erro",
      perguntas: [
        "os nomes dos alunos vão junto",
        "o que o app envia",
        "privacidade dos dados",
        "excluir meus relatos"
      ],
      chaves: ["privacidade", "dados", "nome", "aluno", "lgpd", "envia", "envio", "relato", "erro", "apagar"],
      resumo: "O relato leva a tela, a versão do app, o navegador, a mensagem técnica e o texto que você escrever. Nome de aluno da sua lista não vai.",
      passos: [
        "Antes de enviar, o Gaba confere o texto e a mensagem técnica contra a sua lista de alunos e troca os nomes que reconhecer por \"[aluno]\".",
        "Nomes que não estão na lista carregada não têm como ser reconhecidos: escreva o relato sem nomes de alunos.",
        "Os relatos ficam no banco do Gaba e são usados para corrigir o app."
      ],
      notas: [
        "Não pergunte nem registre dados de saúde ou de família no relato: só o que aconteceu na tela."
      ],
      veja: ["pedir-ajuda"]
    }
  ];

  function catalogo() {
    return ARTIGOS;
  }

  function porId(id) {
    for (var i = 0; i < ARTIGOS.length; i++) if (ARTIGOS[i].id === id) return ARTIGOS[i];
    return null;
  }

  function telas() {
    return TELAS;
  }

  return { catalogo: catalogo, porId: porId, telas: telas };
});
