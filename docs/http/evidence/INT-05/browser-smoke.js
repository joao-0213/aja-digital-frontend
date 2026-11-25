async page => {
  await page.goto('http://127.0.0.1:3001/login');
  await page.getByRole('heading', { name: 'Entrar no AJA Digital' }).waitFor();

  const email = page.getByRole('textbox', { name: 'E-mail' });
  const password = page.getByRole('textbox', { name: 'Senha' });
  const submit = page.getByRole('button', { name: 'Entrar' });
  if (!(await email.isVisible())) throw new Error('Email field is not visible');
  if (!(await password.isVisible())) throw new Error('Password field is not visible');
  if (!(await submit.isVisible())) throw new Error('Login button is not visible');
  if ((await page.title()) !== 'AJA Digital · Portal acadêmico') {
    throw new Error('Unexpected page title');
  }

  return {
    page: 'login',
    assertions: ['title', 'heading', 'email field', 'password field', 'login button'],
    credentialsEntered: false
  };
}
