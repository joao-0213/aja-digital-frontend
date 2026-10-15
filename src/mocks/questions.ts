import type { Question } from '@/models';
export const questions: Question[] = [{
  id: 'q1',
  subject: 'Matemática',
  topic: 'Função afim',
  difficulty: 'easy',
  institution: 'AJA',
  year: 2026,
  statement: 'Um aplicativo de transporte cobra R$ 6,00 de taxa fixa e R$ 2,50 por quilômetro. Qual é o valor de uma viagem de 8 km?',
  options: ['R$ 20,00', 'R$ 22,50', 'R$ 26,00', 'R$ 28,50', 'R$ 32,00'],
  correct: 2,
  explanation: 'A função é f(x) = 6 + 2,5x. Para x = 8, temos 6 + 20 = R$ 26,00.'
}, {
  id: 'q2',
  subject: 'Matemática',
  topic: 'Função afim',
  difficulty: 'medium',
  institution: 'AJA',
  year: 2026,
  statement: 'A reta que representa f(x) = ax + b passa pelos pontos (0, 3) e (2, 7). Qual é o valor de a?',
  options: ['1', '2', '3', '4', '5'],
  correct: 1,
  explanation: 'O coeficiente angular é a = (7 − 3) / (2 − 0) = 2.'
}, {
  id: 'q3',
  subject: 'Matemática',
  topic: 'Função afim',
  difficulty: 'medium',
  institution: 'AJA',
  year: 2026,
  statement: 'Uma caixa contém 120 litros de água e perde 5 litros por minuto. Após quantos minutos restarão 35 litros?',
  options: ['7', '12', '15', '17', '24'],
  correct: 3,
  explanation: '120 − 5t = 35. Logo, 5t = 85 e t = 17 minutos.'
}, {
  id: 'q4',
  subject: 'Matemática',
  topic: 'Probabilidade',
  difficulty: 'easy',
  institution: 'AJA',
  year: 2026,
  statement: 'Um dado comum, não viciado, é lançado uma vez. Qual é a probabilidade de obter um número par?',
  options: ['1/6', '1/3', '1/2', '2/3', '5/6'],
  correct: 2,
  explanation: 'Existem três resultados pares (2, 4 e 6) entre os seis possíveis: 3/6 = 1/2.'
}, {
  id: 'q5',
  subject: 'Biologia',
  topic: 'Ecologia',
  difficulty: 'medium',
  institution: 'AJA',
  year: 2026,
  statement: 'Em uma cadeia alimentar, qual grupo é responsável pela transformação de matéria orgânica morta em nutrientes disponíveis no ambiente?',
  options: ['Produtores', 'Consumidores primários', 'Consumidores secundários', 'Decompositores', 'Predadores de topo'],
  correct: 3,
  explanation: 'Fungos e bactérias decompositores reciclam a matéria, disponibilizando nutrientes para os produtores.'
}, {
  id: 'q6',
  subject: 'Física',
  topic: 'Cinemática',
  difficulty: 'easy',
  institution: 'AJA',
  year: 2026,
  statement: 'Um ciclista percorre 18 km em 1,5 hora com velocidade constante. Qual é sua velocidade média?',
  options: ['9 km/h', '12 km/h', '15 km/h', '18 km/h', '27 km/h'],
  correct: 1,
  explanation: 'Velocidade média é distância dividida pelo tempo: 18 / 1,5 = 12 km/h.'
}, {
  id: 'q7',
  subject: 'Língua Portuguesa',
  topic: 'Interpretação',
  difficulty: 'medium',
  institution: 'AJA',
  year: 2026,
  statement: 'Na frase “Embora chovesse, os alunos foram à aula”, a palavra “embora” estabelece uma relação de:',
  options: ['Causa', 'Conclusão', 'Concessão', 'Finalidade', 'Condição'],
  correct: 2,
  explanation: 'A conjunção concessiva introduz um fato que não impede a realização da ação principal.'
}, {
  id: 'q8',
  subject: 'Matemática',
  topic: 'Probabilidade',
  difficulty: 'hard',
  institution: 'AJA',
  year: 2026,
  statement: 'Uma urna tem 4 bolas azuis e 3 vermelhas. Retiram-se duas bolas sem reposição. Qual é a probabilidade de ambas serem azuis?',
  options: ['2/7', '4/7', '1/7', '16/49', '3/7'],
  correct: 0,
  explanation: 'P = (4/7) × (3/6) = 12/42 = 2/7.'
}];
