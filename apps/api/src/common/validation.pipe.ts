import { BadRequestException, PipeTransform } from '@nestjs/common';
import { validationIssues } from '@devtrust/contracts';
import { z } from 'zod/v3';
export class SchemaPipe implements PipeTransform {
  constructor(private schema: z.ZodTypeAny) {}
  transform(value: unknown) {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException({
        message: 'Dados inválidos',
        fields: parsed.error.flatten().fieldErrors,
        issues: validationIssues(parsed.error),
      });
    return parsed.data;
  }
}
