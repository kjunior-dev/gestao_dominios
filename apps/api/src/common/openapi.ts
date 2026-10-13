import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod/v3';
import { zodToJsonSchema } from 'zod-to-json-schema';
export function ApiInput(schema: z.ZodTypeAny) {
  return ApiBody({
    schema: zodToJsonSchema(schema, {
      target: 'openApi3',
      $refStrategy: 'none',
    }) as SchemaObject,
  });
}
export function ApiPagination() {
  return applyDecorators(
    ApiQuery({ name: 'page', required: false, type: Number, example: 1 }),
    ApiQuery({ name: 'pageSize', required: false, type: Number, example: 20 }),
    ApiQuery({ name: 'search', required: false, type: String }),
    ApiQuery({
      name: 'status',
      required: false,
      enum: ['ACTIVE', 'SUSPENDED'],
    }),
  );
}
