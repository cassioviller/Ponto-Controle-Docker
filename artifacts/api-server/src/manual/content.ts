/**
 * Conteúdo do Manual do Usuário do Controle de Ponto.
 *
 * Cada seção tem:
 *  - title: aparece no sumário e como cabeçalho da seção
 *  - profile: quem usa essa funcionalidade (Admin / Funcionário / Ambos)
 *  - body: array de parágrafos (texto puro) ou subtítulos (objetos)
 *  - screenshots: nomes de arquivo (PNG) que devem existir em ./screenshots
 */

export type ManualBlock =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "img"; file: string; caption?: string };

export interface ManualSection {
  title: string;
  profile: "Admin" | "Funcionário" | "Ambos";
  body: ManualBlock[];
}

export const MANUAL_SECTIONS: ManualSection[] = [
  {
    title: "Visão Geral e Perfis de Acesso",
    profile: "Ambos",
    body: [
      {
        kind: "p",
        text: "O Controle de Ponto é um sistema web para registro e apuração de jornada de trabalho. Ele cobre desde a marcação diária do ponto pelo funcionário até a geração de relatórios mensais para o RH.",
      },
      { kind: "h", text: "Perfis de acesso" },
      {
        kind: "ul",
        items: [
          "Funcionário — usa exclusivamente a tela 'Bater Ponto' para registrar entrada, intervalo e saída.",
          "Administrador (RH/Gestor) — gerencia funcionários, jornadas, escalas, justificativas, gera relatórios e exporta planilhas.",
          "Super Admin — cria e gerencia empresas (tenants) e seus administradores.",
        ],
      },
      { kind: "h", text: "O que o sistema calcula automaticamente" },
      {
        kind: "ul",
        items: [
          "Horas trabalhadas no dia (entrada, intervalo, volta, saída).",
          "Atrasos em relação à jornada padrão.",
          "Horas extras divididas em HE 60% (até 2h além da jornada) e HE 100% (acima disso, e em feriados trabalhados).",
          "Faltas (em dias e em horas) e horas justificadas.",
          "Totais mensais por funcionário e do consolidado da empresa.",
        ],
      },
    ],
  },
  {
    title: "Login e Empresa",
    profile: "Ambos",
    body: [
      {
        kind: "p",
        text: "Acesse o sistema com o e-mail e senha fornecidos pelo administrador. Se o seu e-mail estiver cadastrado em mais de uma empresa, clique em 'Informar empresa manualmente' e digite o slug da empresa (ex.: demo).",
      },
      { kind: "img", file: "login.png", caption: "Tela de Login" },
      { kind: "h", text: "Sair" },
      {
        kind: "p",
        text: "Para encerrar a sessão, clique em 'Sair' no canto inferior esquerdo do menu lateral. Por segurança, o sistema desconecta automaticamente após 7 dias de inatividade.",
      },
    ],
  },
  {
    title: "Bater Ponto",
    profile: "Funcionário",
    body: [
      {
        kind: "p",
        text: "Tela usada pelo funcionário para registrar a marcação do dia. Selecione seu nome na lista e use os 4 botões na ordem correta:",
      },
      {
        kind: "ul",
        items: [
          "Entrada — início da jornada.",
          "Saída Intervalo — saída para o almoço/intervalo.",
          "Volta Intervalo — retorno do intervalo.",
          "Saída — fim da jornada.",
        ],
      },
      { kind: "img", file: "bater-ponto.png", caption: "Tela de Bater Ponto" },
      { kind: "h", text: "Regras importantes" },
      {
        kind: "ul",
        items: [
          "As marcações precisam ser feitas em ordem (não dá pra marcar Saída sem ter marcado Entrada antes, por exemplo).",
          "Cada tipo só pode ser registrado uma vez por dia. Após marcar a Saída, todos os botões ficam desabilitados.",
          "O horário registrado é sempre o horário atual do servidor — não dá pra editar nessa tela.",
          "Se algo for marcado errado, o administrador pode corrigir manualmente na 'Folha Individual' do funcionário.",
        ],
      },
      {
        kind: "p",
        text: "Após cada marcação, o sistema mostra uma confirmação com o horário registrado. Clique em 'Novo Registro' para liberar a tela para o próximo funcionário.",
      },
    ],
  },
  {
    title: "Cadastro de Funcionários",
    profile: "Admin",
    body: [
      {
        kind: "p",
        text: "Em 'Funcionários' o administrador cadastra, edita e desativa colaboradores. Use o botão 'Novo Funcionário' (canto superior direito) para criar um cadastro, ou clique em qualquer linha da tabela para editar.",
      },
      { kind: "img", file: "funcionarios-lista.png", caption: "Lista de funcionários cadastrados" },
      { kind: "h", text: "Campos do cadastro" },
      {
        kind: "ul",
        items: [
          "Dados de contrato: Código, Nome, Cargo, Vínculo (CLT, Contribuinte, Autônomo, Estagiário), Situação (Ativo, Demitido, Aviso, Férias).",
          "Remuneração: Salário, Adiantamento (R$ pago no mês), Vale Transporte (sim/não), Vale Alimentação (sim/não).",
          "Jornada Diária: total de horas que o funcionário trabalha por dia. É calculado automaticamente a partir da Jornada Padrão e usado como referência para horas extras e atrasos.",
          "Dados pessoais: PIS, Estado civil, Raça/Cor, Escolaridade, Data de contratação.",
          "Endereço: Rua, número, bairro, cidade, CEP.",
          "Anexos: PDFs, fotos e documentos (RG, CTPS, contrato, etc.) podem ser anexados após o primeiro salvamento.",
        ],
      },
      { kind: "img", file: "funcionario-novo.png", caption: "Drawer de cadastro de funcionário" },
      { kind: "h", text: "Desativar funcionário" },
      {
        kind: "p",
        text: "Funcionários demitidos não devem ser excluídos — basta mudar a Situação para 'Demitido' e desmarcar 'Ativo'. Isso preserva o histórico de pontos para relatórios passados.",
      },
    ],
  },
  {
    title: "Jornada Padrão e Escala Quinzenal",
    profile: "Admin",
    body: [
      {
        kind: "p",
        text: "Dentro do cadastro do funcionário, role até 'Jornada Padrão' para definir os horários de cada dia da semana. Para cada dia informe Entrada, Saída e Intervalo (formato HH:MM), ou marque 'Folga' se o funcionário não trabalha naquele dia.",
      },
      { kind: "img", file: "jornada-padrao.png", caption: "Configuração da jornada padrão semanal" },
      {
        kind: "p",
        text: "A 'Jornada Diária' (campo no topo do cadastro) é calculada automaticamente como a duração mais frequente entre os dias trabalhados. É essa jornada que serve de base para o cálculo de atrasos e horas extras.",
      },
      { kind: "h", text: "Escala Quinzenal (Semana A / Semana B)" },
      {
        kind: "p",
        text: "Para funcionários que alternam escalas a cada quinzena (clássico 'sábado sim, sábado não'), marque 'Escala quinzenal' e informe a Data de Referência — a data em que a Semana A começa. A partir daí, o sistema calcula automaticamente, para cada dia do mês, se aquela é uma Semana A ou Semana B, e usa o horário correto.",
      },
      { kind: "img", file: "escala-quinzenal.png", caption: "Escala Quinzenal habilitada — Semana A e Semana B" },
      {
        kind: "ul",
        items: [
          "Semana A: a primeira tabela. Usa o horário definido na semana onde está a 'Data de referência'.",
          "Semana B: aparece quando 'Escala quinzenal' está marcada. Tipicamente espelha a Semana A com diferença em 1 ou 2 dias (ex.: sábado vira folga).",
          "Em dias de folga quinzenal, não há jornada esperada — não conta como falta nem como hora extra.",
          "Trabalhar em um dia que era folga quinzenal: as horas viram horas normais (não viram automaticamente HE).",
        ],
      },
    ],
  },
  {
    title: "Folha Individual",
    profile: "Admin",
    body: [
      {
        kind: "p",
        text: "A Folha Individual mostra todas as marcações de um funcionário no mês, dia a dia. Acesse clicando no nome do funcionário em 'Resumo Geral' ou em 'Consolidado'.",
      },
      { kind: "img", file: "folha-individual.png", caption: "Folha Individual de um funcionário" },
      { kind: "h", text: "Edição manual de batidas" },
      {
        kind: "p",
        text: "Dê duplo clique em qualquer célula de horário (Entrada, Saída Intervalo, Volta Intervalo, Saída) para editar. Use o formato HH:MM (ex.: 08:00). Pressione Enter para salvar ou Esc para cancelar. O total de horas, HE e atrasos são recalculados automaticamente.",
      },
      { kind: "h", text: "Tipos de Dia" },
      {
        kind: "p",
        text: "Dê duplo clique na coluna 'Tipo de Dia' para mudar como o sistema deve calcular aquele dia:",
      },
      {
        kind: "ul",
        items: [
          "Normal — cálculo padrão. Horas além da jornada viram HE 60% (até 2h) e HE 100% (acima).",
          "Feriado — dia não trabalhado. Conta como jornada padrão. Sem HE, sem atraso, sem falta.",
          "Feriado Trabalhado — todas as horas trabalhadas viram HE 100%.",
          "Falta — conta 1 falta no mês. Total/HE/Atrasos = 0.",
          "Falta Justificada — sem desconto. Total = jornada padrão. Horas não trabalhadas viram 'horas justificadas'.",
          "Atraso Justificado — atrasos zerados. HE só sobre o excesso da jornada.",
        ],
      },
      {
        kind: "p",
        text: "Use o botão 'Voltar' (canto superior esquerdo) para retornar ao Resumo Geral.",
      },
    ],
  },
  {
    title: "Resumo Geral",
    profile: "Admin",
    body: [
      {
        kind: "p",
        text: "Tela inicial do sistema. Mostra o resumo mensal de todos os funcionários, com filtros por mês, situação e vínculo.",
      },
      { kind: "img", file: "resumo.png", caption: "Resumo Geral do mês" },
      { kind: "h", text: "Colunas" },
      {
        kind: "ul",
        items: [
          "Cód., Nome, Vínculo, Cargo, Situação — dados básicos do funcionário.",
          "Adianto. (R$) — adiantamento informado no cadastro.",
          "V.T. / V.A. — Vale Transporte e Vale Alimentação (Sim/Não).",
          "Faltas Dia / Faltas Hrs — totais de faltas no mês.",
          "Hrs Just. / Dias Just. — horas e dias com falta/atraso justificados.",
          "HE 60% / HE 100% — totais de horas extras do mês.",
          "Ações: 'Importar' permite importar uma planilha Excel preenchida com as batidas do mês para aquele funcionário.",
        ],
      },
      {
        kind: "p",
        text: "Clique no nome do funcionário para abrir a Folha Individual dele.",
      },
      { kind: "h", text: "Baixar Modelo Excel" },
      {
        kind: "p",
        text: "O botão 'Baixar Modelo Excel' (canto superior direito) gera uma planilha modelo com a aba 'Funcionários' e a aba 'Registros de Ponto' já formatadas. Útil para a digitação manual em lote do mês.",
      },
    ],
  },
  {
    title: "Consolidado Mensal",
    profile: "Admin",
    body: [
      {
        kind: "p",
        text: "Visão consolidada de todos os funcionários no mês, com totais agregados. Útil para fechamento de folha.",
      },
      { kind: "img", file: "consolidado.png", caption: "Consolidado do mês com totais por funcionário e total geral" },
      { kind: "h", text: "Colunas" },
      {
        kind: "ul",
        items: [
          "Total Horas — total de horas trabalhadas no mês.",
          "HE 60% / HE 100% — horas extras acumuladas.",
          "Atrasos — total de atrasos.",
          "Faltas — quantidade de faltas (em dias).",
          "Hrs Just. / Dias Just. — horas e dias justificados.",
          "Dias Trab. / Dom/Fer. — dias trabalhados e domingos/feriados no mês.",
          "Adianto. (R$) — adiantamento informado no cadastro.",
        ],
      },
      {
        kind: "p",
        text: "A última linha (TOTAL GERAL) mostra a soma de todos os funcionários ativos no mês.",
      },
    ],
  },
  {
    title: "Importação e Exportação Excel",
    profile: "Admin",
    body: [
      { kind: "h", text: "Baixar modelo Excel" },
      {
        kind: "p",
        text: "Em 'Resumo Geral', clique em 'Baixar Modelo Excel'. A planilha vem com duas abas: 'Funcionários' (com os dados cadastrais atuais) e 'Registros de Ponto' (em branco, com as colunas formatadas para preenchimento).",
      },
      { kind: "h", text: "Importar registros do mês" },
      {
        kind: "p",
        text: "Para importar as marcações de um mês inteiro de um funcionário a partir de um Excel:",
      },
      {
        kind: "ul",
        items: [
          "Em 'Resumo Geral', encontre o funcionário e clique no botão 'Importar' na coluna Ações.",
          "Escolha o mês de referência e selecione o arquivo .xlsx preenchido.",
          "Clique em 'Importar'. O sistema mostra quantos registros foram importados e quaisquer erros encontrados.",
        ],
      },
      {
        kind: "p",
        text: "Os registros importados sobrescrevem qualquer batida existente no mesmo dia. As horas (total, HE, atrasos) são recalculadas automaticamente conforme as regras de cada Tipo de Dia.",
      },
      { kind: "h", text: "Exportação da Folha Individual" },
      {
        kind: "p",
        text: "Na Folha Individual de cada funcionário, é possível exportar o mês corrente em Excel para impressão ou arquivo. O Excel exportado segue o mesmo layout do modelo, então pode ser editado e re-importado.",
      },
    ],
  },
  {
    title: "Super Admin",
    profile: "Admin",
    body: [
      {
        kind: "p",
        text: "Tela exclusiva do perfil 'Super Administrador'. Aparece como 'Super Admin' no menu lateral apenas para usuários com esse papel.",
      },
      { kind: "img", file: "super-admin.png", caption: "Tela de gestão de empresas e administradores" },
      { kind: "h", text: "Cadastrar nova empresa" },
      {
        kind: "p",
        text: "No formulário 'Nova Empresa (Tenant)', informe Nome, Slug (identificador único usado no login — só letras minúsculas, números e hífen), CNPJ (opcional) e Plano. Clique em 'Criar empresa'. A empresa aparece na lista logo abaixo, e pode ser ativada/desativada a qualquer momento.",
      },
      { kind: "h", text: "Cadastrar administrador (admin tenant)" },
      {
        kind: "p",
        text: "Em 'Novo Usuário Admin (Tenant)', escolha a empresa de destino, informe Nome, E-mail e uma senha inicial (mínimo 6 caracteres). Esse usuário poderá então fazer login no sistema e gerenciar funcionários, escalas e relatórios da empresa dele.",
      },
      {
        kind: "p",
        text: "Importante: o Super Admin não vê dados internos das empresas (funcionários, marcações, relatórios) — só gerencia o cadastro de tenants e administradores.",
      },
    ],
  },
  {
    title: "Dúvidas Frequentes",
    profile: "Ambos",
    body: [
      { kind: "h", text: "Esqueci minha senha" },
      {
        kind: "p",
        text: "Procure o administrador da empresa. Ele consegue redefinir sua senha pela tela de Super Admin (caso seja o Super Admin) ou pelo cadastro de funcionários.",
      },
      { kind: "h", text: "Marquei o ponto errado, e agora?" },
      {
        kind: "p",
        text: "Avise o administrador. Ele pode corrigir o horário diretamente na sua Folha Individual com duplo clique na célula.",
      },
      { kind: "h", text: "Por que o sábado tem dois horários diferentes?" },
      {
        kind: "p",
        text: "Provavelmente seu cadastro está com 'Escala Quinzenal' ativada. Nessa configuração o sábado da Semana A é diferente do sábado da Semana B (ex.: trabalho intercalado). O sistema escolhe o horário correto pela data.",
      },
      { kind: "h", text: "Trabalhei em um feriado. Como conta?" },
      {
        kind: "p",
        text: "O administrador deve mudar o 'Tipo de Dia' para 'Feriado Trabalhado' na sua Folha Individual. Aí todas as horas trabalhadas no dia viram HE 100%.",
      },
      { kind: "h", text: "Faltei e justifiquei (atestado, etc.). Como registrar?" },
      {
        kind: "p",
        text: "O administrador muda o 'Tipo de Dia' para 'Falta Justificada'. Você não perde horas no total mensal e o dia é contabilizado como 'dia justificado' nos relatórios.",
      },
    ],
  },
];
