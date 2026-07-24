import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { ZodTypeAny } from 'zod';

/**
 * Validates a request part against a shared Zod schema and returns the PARSED
 * value (with coercions/defaults applied). The same schemas run in the SPA's
 * forms — one source of truth for every business rule.
 *
 * Usage: @Body(zodBody(caseNoteSchema)) body: CaseNoteInput
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodTypeAny) {}

  transform(value: unknown) {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        errors: result.error.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}

export const zodBody = (schema: ZodTypeAny) => new ZodValidationPipe(schema);
export const zodQuery = (schema: ZodTypeAny) => new ZodValidationPipe(schema);
