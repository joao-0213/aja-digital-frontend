// Each domain issue adds routes only after its HTTP slice is available.
export const httpRoutes = new Set<string>([
  '/', '/perfil', '/usuarios', '/turmas', '/alunos', '/alunos/perfil', '/disciplinas',
  '/disciplinas/detalhes', '/materiais', '/questoes', '/questionarios', '/questionarios/criar',
  '/questionarios/responder', '/questionarios/resultado', '/avisos', '/calendario', '/forum', '/forum/topico', '/frequencia'
]);
