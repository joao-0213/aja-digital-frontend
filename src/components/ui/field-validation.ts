export function friendlyValidationMessage(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
): string {
  const { validity } = element;
  if (validity.valid) return '';
  if (validity.customError && element.validationMessage) return element.validationMessage;

  const isSelect = element.tagName === 'SELECT';
  const inputType = element.tagName === 'INPUT' ? (element as HTMLInputElement).type : '';

  if (validity.valueMissing) {
    if (isSelect) return 'Selecione uma opção.';
    if (inputType === 'email') return 'Informe seu e-mail.';
    if (inputType === 'url') return 'Informe um endereço válido.';
    if (inputType === 'date') return 'Escolha uma data.';
    if (inputType === 'time') return 'Escolha um horário.';
    if (inputType === 'datetime-local') return 'Escolha uma data e um horário.';
    if (inputType === 'file') return 'Selecione um arquivo.';
    return 'Preencha este campo.';
  }

  if (validity.typeMismatch) {
    if (inputType === 'email') return 'Informe um e-mail válido (ex.: nome@exemplo.com).';
    if (inputType === 'url') return 'Informe um link válido começando com http:// ou https://.';
    return 'Confira o formato informado.';
  }

  if (validity.tooShort && 'minLength' in element && element.minLength > 0) {
    return `Use pelo menos ${element.minLength} caracteres.`;
  }

  if (validity.tooLong && 'maxLength' in element && element.maxLength > 0) {
    return `Use no máximo ${element.maxLength} caracteres.`;
  }

  if (validity.rangeUnderflow && 'min' in element && element.min) {
    if (inputType === 'date') return 'A data não pode ser anterior ao mínimo permitido.';
    if (inputType === 'time') return 'O horário não pode ser anterior ao mínimo permitido.';
    if (inputType === 'datetime-local') return 'A data e o horário não podem ser anteriores ao mínimo permitido.';
    return `Informe um valor a partir de ${element.min}.`;
  }

  if (validity.rangeOverflow && 'max' in element && element.max) {
    if (inputType === 'date') return 'A data excede o limite permitido.';
    if (inputType === 'time') return 'O horário excede o limite permitido.';
    if (inputType === 'datetime-local') return 'A data e o horário excedem o limite permitido.';
    return `Informe um valor de até ${element.max}.`;
  }

  if (validity.stepMismatch || validity.badInput) {
    return 'Informe um valor válido.';
  }

  if (validity.patternMismatch) {
    return 'Confira o formato informado.';
  }

  return element.validationMessage || 'Confira este campo.';
}

export function isFirstInvalidInForm(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): boolean {
  const form = element.form;
  if (!form) return true;
  return form.querySelector(':invalid') === element;
}
