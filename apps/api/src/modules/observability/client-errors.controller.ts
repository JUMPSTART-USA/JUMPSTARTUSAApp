import { Body, Controller, Get, HttpCode, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { listQuerySchema, type ListQuery } from '@jumpstart/shared';
import { z } from 'zod';
import { Public, RequirePermission } from '../../common/decorators';
import type { AuthenticatedRequest } from '../../common/types';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { ClientErrorsService } from './client-errors.service';

/**
 * A route PATTERN, never a live URL. The client replaces every uuid and numeric
 * segment before sending, and this rejects anything that still looks like an id
 * — belt and braces, because the whole value of a PII-free table is that it
 * stays PII-free even if a future caller gets sloppy.
 */
const routePattern = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/[A-Za-z0-9/:_-]*$/, 'route must be a path pattern')
  .refine(
    (value) => !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(value),
    'route must not contain a record id',
  );

/**
 * The refusals `route` already gets, applied to the free-text fields too.
 *
 * `message` and `stack` are where a record id or an email address rides in on
 * an error string — "Participant 3f2a… not found", or an address echoed back
 * by a failed form. They were capped in length and otherwise unexamined, which
 * left the PII-free table's guarantee resting on every future caller being
 * careful.
 *
 * Rejecting rather than scrubbing is deliberate: a rejected report is a
 * missing data point, and a scrubbed one is a silent claim that it was clean.
 */
const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;

/** Applied AFTER the string constraints — refine() returns ZodEffects, which
 *  no longer offers .trim()/.max(). */
const piiFree = <T extends z.ZodType<string>>(schema: T, label: string) =>
  schema
    .refine((v) => !UUID_PATTERN.test(v), `${label} must not contain a record id`)
    .refine((v) => !EMAIL_PATTERN.test(v), `${label} must not contain an email address`);

const reportSchema = z.object({
  message: piiFree(z.string().trim().min(1).max(500), 'message'),
  stack: piiFree(z.string().max(4_000), 'stack').optional(),
  route: routePattern,
  source: z.enum(['boundary', 'window', 'promise']),
  buildId: z.string().trim().max(100),
  viewportW: z.number().int().positive().max(20_000).optional(),
  viewportH: z.number().int().positive().max(20_000).optional(),
  userAgent: z.string().max(300).optional(),
});
type Report = z.infer<typeof reportSchema>;

const listFiltersSchema = listQuerySchema.extend({
  source: z.enum(['boundary', 'window', 'promise']).optional(),
  buildId: z.string().trim().max(100).optional(),
});
type ListFilters = z.infer<typeof listFiltersSchema>;

@Controller('client-errors')
export class ClientErrorsController {
  constructor(private readonly clientErrors: ClientErrorsService) {}

  /**
   * @Public because the errors most worth having come from users who are NOT
   * signed in: the login screen and the tokenized participant portal, where a
   * white screen is the whole experience and nobody is going to file a ticket.
   *
   * That makes it the app's only unauthenticated write, so it is deliberately
   * cheap to serve and hard to abuse: 10 reports per minute per IP on top of the
   * global limit, a body capped by the schema above, 204 with no body, and an
   * upsert keyed on a fingerprint so repeats increment a counter rather than
   * growing the table.
   */
  @Post()
  @Public()
  @HttpCode(204)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async report(@Body(zodBody(reportSchema)) body: Report, @Req() request: AuthenticatedRequest) {
    /**
     * The session, not @CurrentUser(): SessionAuthGuard returns early for a
     * @Public route and never attaches the user, so @CurrentUser() is always
     * undefined here — every report would have been filed as "signed out",
     * including the ones from staff who could tell you what they were doing.
     *
     * Reading session.userId is safe for attribution: the cookie is signed, and
     * users are SOFT-deleted, so the row a stale id points at still exists and
     * the foreign key holds.
     */
    await this.clientErrors.record(body, request.session?.userId ?? null);
  }

  /** Same permission as the audit log: this is the other observability surface. */
  @Get()
  @RequirePermission('audit.read')
  list(@Query(zodQuery(listFiltersSchema)) query: ListFilters) {
    const { source, buildId, ...listQuery } = query;
    return this.clientErrors.list(listQuery as ListQuery, { source, buildId });
  }

  @Get('builds')
  @RequirePermission('audit.read')
  builds() {
    return this.clientErrors.builds();
  }
}
