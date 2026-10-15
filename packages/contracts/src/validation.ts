import { z } from 'zod/v3';

export const validationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number().int()])),
  message: z.string(),
});
export type ValidationIssue = z.infer<typeof validationIssueSchema>;

// Return only paths and safe messages, never the submitted values or Zod metadata.
export function validationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => {
    let message = issue.message;
    switch (issue.code) {
      case 'invalid_type':
        message = 'Preencha este campo com um valor válido.';
        break;
      case 'too_small':
        message =
          issue.type === 'array'
            ? `Indique pelo menos ${issue.minimum} elementos.`
            : `Introduza pelo menos ${issue.minimum} carácter(es).`;
        break;
      case 'too_big':
        message =
          issue.type === 'array'
            ? `Indique no máximo ${issue.maximum} elementos.`
            : `Introduza no máximo ${issue.maximum} carácter(es).`;
        break;
      case 'invalid_string':
        // Specific schema messages describe formats, without echoing user input.
        if (issue.message === 'Invalid' || issue.message.startsWith('Invalid '))
          message = 'Introduza um valor no formato indicado.';
        break;
      case 'invalid_literal':
        message =
          issue.expected === true
            ? 'É necessário aceitar esta condição.'
            : 'Selecione um valor válido.';
        break;
      case 'invalid_enum_value':
      case 'invalid_union':
        message = 'Selecione ou introduza um valor válido.';
        break;
      case 'unrecognized_keys':
        message =
          'O pedido contém campos não reconhecidos. Atualize a página e tente novamente.';
        break;
    }
    return { path: issue.path, message };
  });
}
