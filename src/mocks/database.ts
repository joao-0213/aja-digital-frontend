import type { MockDatabase } from '@/models';
import { questions } from './questions';
export const DEMO_DATE = '2026-10-05';
export const seed: MockDatabase = {
  version: 1,
  users: [{
    id: 'u1',
    name: 'Fernando Santos',
    email: 'fernando@exemplo.com',
    role: 'student',
    course: 'Ciência da Computação',
    institution: 'UFPR',
    quota: 'public_school',
    bio: 'Um passo por dia rumo à universidade.'
  }, {
    id: 'u2',
    name: 'Mariana Costa',
    email: 'mariana@exemplo.com',
    role: 'teacher',
    course: '',
    institution: 'UFPR',
    quota: 'none',
    bio: 'Professora de Matemática. Aprender fica melhor quando compartilhamos.'
  }, {
    id: 'u3',
    name: 'Rafael Oliveira',
    email: 'rafael@exemplo.com',
    role: 'admin',
    course: '',
    institution: 'AJA',
    quota: 'none',
    bio: 'Coordenação pedagógica do Cursinho Solidário AJA.'
  }, {
    id: 'u4',
    name: 'Ana Luiza Ribeiro',
    email: 'ana@exemplo.com',
    role: 'student',
    course: 'Medicina',
    institution: 'UFPR',
    quota: 'public_school',
    bio: 'Apaixonada por biologia e pela possibilidade de cuidar de pessoas.'
  }, {
    id: 'u5',
    name: 'Lucas Almeida',
    email: 'lucas@exemplo.com',
    role: 'student',
    course: 'Engenharia Civil',
    institution: 'UTFPR',
    quota: 'none',
    bio: ''
  }, {
    id: 'u6',
    name: 'Beatriz Lima',
    email: 'beatriz@exemplo.com',
    role: 'student',
    course: 'Direito',
    institution: 'UFPR',
    quota: 'income',
    bio: ''
  }, {
    id: 'u7',
    name: 'Pedro Martins',
    email: 'pedro@exemplo.com',
    role: 'student',
    course: 'História',
    institution: 'UFPR',
    quota: 'none',
    bio: ''
  }],
  classes: [{
    id: 'c1',
    name: 'Extensivo Noturno',
    code: 'EXT-N26',
    year: 2026,
    shift: 'Noite',
    active: true,
    studentIds: ['u1', 'u4', 'u5', 'u6', 'u7']
  }, {
    id: 'c2',
    name: 'Intensivo ENEM',
    code: 'INT-E26',
    year: 2026,
    shift: 'Tarde',
    active: true,
    studentIds: ['u1', 'u4', 'u5']
  }, {
    id: 'c3',
    name: 'Extensivo 2025',
    code: 'EXT-N25',
    year: 2025,
    shift: 'Noite',
    active: false,
    studentIds: []
  }],
  subjects: [{
    id: 's1',
    icon: 'calculator',
    classId: 'c1',
    name: 'Matemática',
    teacherId: 'u2',
    color: 'violet',
    description: 'Do raciocínio lógico à resolução de problemas.'
  }, {
    id: 's2',
    icon: 'leaf',
    classId: 'c1',
    name: 'Biologia',
    teacherId: 'u2',
    color: 'green',
    description: 'A vida, suas relações e transformações.'
  }, {
    id: 's3',
    icon: 'atom',
    classId: 'c1',
    name: 'Física',
    teacherId: 'u2',
    color: 'blue',
    description: 'Entenda os movimentos do mundo ao seu redor.'
  }, {
    id: 's4',
    icon: 'languages',
    classId: 'c2',
    name: 'Língua Portuguesa',
    teacherId: 'u2',
    color: 'amber',
    description: 'Leitura, interpretação e construção de sentidos.'
  }],
  modules: [{
    id: 'm1',
    subjectId: 's1',
    title: 'Funções: do conceito ao gráfico',
    description: 'Reconheça padrões e conecte álgebra e geometria.',
    order: 1
  }, {
    id: 'm2',
    subjectId: 's1',
    title: 'Análise combinatória e probabilidade',
    description: 'Organize possibilidades e calcule chances.',
    order: 2
  }, {
    id: 'm3',
    subjectId: 's2',
    title: 'Ecologia e sustentabilidade',
    description: 'Uma leitura integrada dos ecossistemas.',
    order: 1
  }, {
    id: 'm4',
    subjectId: 's3',
    title: 'Movimento e velocidade',
    description: 'Primeiros passos na cinemática.',
    order: 1
  }, {
    id: 'm5',
    subjectId: 's4',
    title: 'Interpretação de textos',
    description: 'Leia nas linhas e nas entrelinhas.',
    order: 1
  }],
  materials: [{
    id: 'mat1',
    createdAt: '2026-10-01T10:00:00-03:00',
    moduleId: 'm1',
    title: 'O que é uma função?',
    kind: 'lesson',
    duration: 12,
    order: 1,
    content: 'Uma função associa cada elemento de um conjunto de entrada a um único elemento de um conjunto de saída.\n\nImagine o preço de uma viagem: ele depende da distância percorrida. Se a taxa fixa é R$ 6 e cada quilômetro custa R$ 2,50, podemos escrever f(x) = 6 + 2,5x.\n\nO valor x é a variável independente. O resultado f(x) é a variável dependente. Identificar essas grandezas é o primeiro passo para construir um modelo matemático.\n\nAgora pratique: quanto custa uma viagem de 10 km? Substitua x por 10. O resultado é R$ 31,00.'
  }, {
    id: 'mat2',
    createdAt: '2026-10-02T10:00:00-03:00',
    moduleId: 'm1',
    title: 'Função afim: gráficos e coeficientes',
    kind: 'video',
    duration: 18,
    order: 2,
    content: 'Em f(x) = ax + b, a determina a inclinação da reta e b indica onde ela cruza o eixo vertical.\n\nSe a > 0, a função é crescente. Se a < 0, é decrescente. Se a = 0, é constante.\n\nExemplo: f(x) = 2x + 3. Pontos do gráfico: (0, 3), (1, 5) e (2, 7). Marque-os e trace a reta.\n\nEste player demonstrativo usa uma aula textual; nenhum vídeo externo é carregado.'
  }, {
    id: 'mat3',
    createdAt: '2026-10-03T10:00:00-03:00',
    moduleId: 'm1',
    title: 'Resumo e exercícios de funções',
    kind: 'pdf',
    duration: 15,
    order: 3,
    fileName: 'resumo-funcoes.pdf',
    content: 'RESUMO DE FUNÇÕES\n\nFunção afim: f(x) = ax + b.\nCoeficiente angular: a = Δy / Δx.\nRaiz: x = −b/a, quando a ≠ 0.\n\nEXERCÍCIOS\n1. Encontre a raiz de f(x) = 3x − 12.\n2. Uma reta passa por (0, 2) e (3, 8). Determine sua equação.\n3. Uma reserva de 80 litros perde 4 litros por minuto. Em quanto tempo se esgota?\n\nRESPOSTAS\n1. x = 4.\n2. f(x) = 2x + 2.\n3. 20 minutos.'
  }, {
    id: 'mat4',
    createdAt: '2026-10-04T10:00:00-03:00',
    moduleId: 'm2',
    title: 'Princípio fundamental da contagem',
    kind: 'lesson',
    duration: 14,
    order: 1,
    content: 'Se uma escolha pode ser feita de m maneiras e outra de n maneiras, o total de combinações é m × n.\n\nCom 3 camisetas e 2 calças, você pode formar 6 combinações. Use diagramas de árvore para visualizar as possibilidades antes de generalizar.'
  }, {
    id: 'mat5',
    createdAt: '2026-10-04T10:00:00-03:00',
    moduleId: 'm3',
    title: 'Cadeias e teias alimentares',
    kind: 'lesson',
    duration: 16,
    order: 1,
    content: 'A energia flui pelos ecossistemas. Os produtores transformam energia luminosa em matéria orgânica, os consumidores a obtêm por alimentação e os decompositores reciclam nutrientes.\n\nUma teia alimentar reúne várias cadeias interligadas. A remoção de uma espécie pode afetar todo o equilíbrio do ecossistema.'
  }, {
    id: 'mat6',
    createdAt: '2026-10-04T10:00:00-03:00',
    moduleId: 'm4',
    title: 'Velocidade média no cotidiano',
    kind: 'lesson',
    duration: 10,
    order: 1,
    content: 'Velocidade média é a razão entre deslocamento e intervalo de tempo. Para trajetórias retilíneas em um único sentido, use v = d/t.\n\nUm trajeto de 60 km feito em 1,5 hora tem velocidade média de 40 km/h. Para converter km/h em m/s, divida por 3,6.'
  }, {
    id: 'mat7',
    createdAt: '2026-10-04T10:00:00-03:00',
    moduleId: 'm5',
    title: 'Coesão e conectivos',
    kind: 'lesson',
    duration: 12,
    order: 1,
    content: 'Conectivos estabelecem relações entre ideias. “Portanto” indica conclusão; “porque” introduz explicação ou causa; “embora” expressa concessão.\n\nAo interpretar um texto, substitua mentalmente o conectivo por outro de mesmo sentido e observe se a relação se mantém.'
  }],
  questions,
  assessments: [{
    id: 'a1',
    publishedAt: '2026-10-01T14:00:00-03:00',
    moduleId: 'm1',
    title: 'Funções no dia a dia',
    description: 'Aplique o que aprendeu sobre funções afins em situações do cotidiano.',
    questionIds: ['q1', 'q2', 'q3'],
    deadline: '2026-10-08T23:59',
    attempts: 3,
    shuffle: false,
    status: 'published'
  }, {
    id: 'a2',
    publishedAt: '2026-10-02T14:00:00-03:00',
    moduleId: 'm2',
    title: 'Desafio de probabilidade',
    description: 'Vamos testar seu raciocínio?',
    questionIds: ['q4', 'q8'],
    deadline: '2026-10-14T23:59',
    attempts: 2,
    shuffle: false,
    status: 'published'
  }, {
    id: 'a3',
    publishedAt: '2026-10-03T14:00:00-03:00',
    moduleId: 'm3',
    title: 'Ecologia em revisão',
    description: 'Uma revisão rápida dos conceitos de ecologia.',
    questionIds: ['q5'],
    deadline: '2026-10-12T23:59',
    attempts: 2,
    shuffle: false,
    status: 'published'
  }],
  attempts: [],
  topics: [{
    id: 't1',
    classId: 'c1',
    subjectId: 's1',
    authorId: 'u4',
    title: 'Como identificar o coeficiente angular no gráfico?',
    body: 'Consigo resolver quando tenho a equação, mas fico em dúvida ao olhar apenas o gráfico. Como encontro o valor de a usando dois pontos da reta?',
    tags: ['função afim', 'gráficos'],
    createdAt: '2026-10-04T19:30:00',
    readBy: ['u4'],
    replies: [{
      id: 'r1',
      authorId: 'u2',
      body: 'Escolha dois pontos que você consiga ler com precisão. Calcule a variação vertical (Δy) e divida pela variação horizontal (Δx). Por exemplo, entre (1, 3) e (3, 7), a = (7 − 3)/(3 − 1) = 2. O sinal também importa: uma reta que desce da esquerda para a direita tem a negativo.',
      createdAt: '2026-10-04T20:10:00',
      votes: {
        u4: 1,
        u5: 1
      },
      accepted: true
    }, {
      id: 'r2',
      authorId: 'u5',
      body: 'Eu desenho um triângulo retângulo entre os dois pontos. A altura dividida pela base ajuda a visualizar essa razão!',
      createdAt: '2026-10-04T20:40:00',
      votes: {
        u4: 1
      },
      accepted: false
    }]
  }, {
    id: 't2',
    classId: 'c1',
    subjectId: 's2',
    authorId: 'u5',
    title: 'Energia e matéria: o que é reciclado no ecossistema?',
    body: 'Por que dizemos que a matéria é reciclada, mas a energia não? Fiquei com essa dúvida depois da aula.',
    tags: ['ecologia'],
    createdAt: '2026-10-03T18:15:00',
    readBy: ['u5'],
    replies: []
  }, {
    id: 't3',
    classId: 'c1',
    subjectId: 's3',
    authorId: 'u1',
    title: 'Dica para converter km/h em m/s',
    body: 'Sempre confundia se era multiplicar ou dividir. Lembrar que 36 km/h = 10 m/s me ajuda a verificar o resultado. Como vocês fazem?',
    tags: ['cinemática', 'dicas'],
    createdAt: '2026-10-02T17:00:00',
    readBy: ['u1'],
    replies: []
  }],
  announcements: [{
    id: 'n1',
    classId: 'c1',
    authorId: 'u3',
    title: 'Simulado presencial: prepare seu material',
    body: 'Nosso próximo simulado será em 10 de outubro, às 13h30. Traga documento com foto, caneta preta e uma garrafa de água. As salas serão informadas na recepção.',
    createdAt: '2026-10-04T14:00:00',
    notify: true
  }, {
    id: 'n2',
    classId: 'c1',
    subjectId: 's1',
    authorId: 'u2',
    title: 'Plantão de dúvidas de Matemática',
    body: 'Nesta quarta, teremos um encontro para revisar funções e resolver exercícios juntos. Separe suas dúvidas e participe!',
    createdAt: '2026-10-03T16:30:00',
    notify: true
  }],
  events: [{
    id: 'e1',
    title: 'Plantão de Matemática',
    kind: 'class',
    date: '2026-10-07',
    time: '18:30',
    description: 'Revisão de funções com a professora Mariana. Sala 02.',
    subjectId: 's1'
  }, {
    id: 'e2',
    title: 'Simulado presencial AJA',
    kind: 'exam',
    date: '2026-10-10',
    time: '13:30',
    description: 'Traga documento, caneta preta e água. Duração prevista: 4 horas.'
  }, {
    id: 'e3',
    title: 'Roda de conversa: vida na universidade',
    kind: 'event',
    date: '2026-10-16',
    time: '19:00',
    description: 'Estudantes da UFPR compartilham experiências e respondem perguntas.'
  }],
  attendance: [{
    id: 'att1',
    subjectId: 's1',
    date: '2026-10-01',
    time: '19:00',
    records: {
      u1: true,
      u4: true,
      u5: false,
      u6: true,
      u7: true
    }
  }],
  documents: [{
    id: 'd1',
    userId: 'u1',
    name: 'comprovante-escolar.pdf',
    size: 245760,
    status: 'approved',
    uploadedAt: '2026-09-02T12:00:00'
  }, {
    id: 'd2',
    userId: 'u1',
    name: 'solicitacao-adaptacao.pdf',
    size: 182300,
    status: 'pending',
    uploadedAt: '2026-10-02T12:00:00'
  }],
  progress: [{
    userId: 'u1',
    materialId: 'mat1',
    completed: true,
    lastAccess: '2026-10-03T20:00:00'
  }, {
    userId: 'u1',
    materialId: 'mat2',
    completed: false,
    lastAccess: '2026-10-04T21:00:00'
  }]
};
