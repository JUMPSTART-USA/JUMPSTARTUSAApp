import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  COMM_CHANNELS,
  COMM_STATUSES,
  communicationBatchSchema,
  communicationTemplateSchema,
  listQuerySchema,
  sendCommunicationSchema,
  type CommunicationBatchInput,
  type CommunicationTemplateInput,
  type ListQuery,
  type SendCommunicationInput,
} from '@jumpstart/shared';
import { z } from 'zod';
import { CurrentUser, RequirePermission } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { AuthenticatedUser } from '../../common/types';
import { BatchesService } from './batches.service';
import { CommunicationsService } from './communications.service';

const templateListSchema = listQuerySchema.extend({
  channel: z.enum(COMM_CHANNELS).optional(),
  active: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});
type TemplateListQuery = z.infer<typeof templateListSchema>;

const communicationListSchema = listQuerySchema.extend({
  personId: z.string().uuid().optional(),
  channel: z.enum(COMM_CHANNELS).optional(),
  status: z.enum(COMM_STATUSES).optional(),
  batchId: z.string().uuid().optional(),
});
type CommunicationListQuery = z.infer<typeof communicationListSchema>;

@Controller('communications')
export class CommunicationsController {
  constructor(
    private readonly communications: CommunicationsService,
    private readonly batches: BatchesService,
  ) {}

  // ── Templates ──────────────────────────────────────────────────────────────

  @Get('templates')
  @RequirePermission('communications.read')
  listTemplates(@Query(zodQuery(templateListSchema)) query: TemplateListQuery) {
    const { channel, active, ...listQuery } = query;
    return this.communications.listTemplates(listQuery as ListQuery, { channel, active });
  }

  @Get('templates/:id')
  @RequirePermission('communications.read')
  getTemplate(@Param('id', ParseUUIDPipe) id: string) {
    return this.communications.getTemplate(id);
  }

  @Post('templates')
  @RequirePermission('communications.create')
  createTemplate(
    @Body(zodBody(communicationTemplateSchema)) body: CommunicationTemplateInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.communications.createTemplate(body, user.id);
  }

  @Patch('templates/:id')
  @RequirePermission('communications.update')
  updateTemplate(
    @Param('id', ParseUUIDPipe) id: string,
    // .innerType(): the shared schema wraps a superRefine (ZodEffects), which
    // has no .partial(); cross-field checks (subject/SMS length) re-run in the
    // service against the merged row where they belong for PATCH.
    @Body(zodBody(communicationTemplateSchema.innerType().partial()))
    body: Partial<CommunicationTemplateInput>,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.communications.updateTemplate(id, body, user.id);
  }

  @Delete('templates/:id')
  @RequirePermission('communications.delete')
  removeTemplate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.communications.removeTemplate(id, user.id);
  }

  // ── Sending ────────────────────────────────────────────────────────────────

  @Post('send')
  @RequirePermission('communications.create')
  send(
    @Body(zodBody(sendCommunicationSchema)) body: SendCommunicationInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.communications.send(body, user);
  }

  // ── Batches ────────────────────────────────────────────────────────────────

  @Post('batches')
  @RequirePermission('communications.create')
  createBatch(
    @Body(zodBody(communicationBatchSchema)) body: CommunicationBatchInput,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.batches.create(body, user);
  }

  @Get('batches')
  @RequirePermission('communications.read')
  listBatches(@Query(zodQuery(listQuerySchema)) query: ListQuery) {
    return this.batches.list(query);
  }

  @Get('batches/:id')
  @RequirePermission('communications.read')
  getBatch(@Param('id', ParseUUIDPipe) id: string) {
    return this.batches.get(id);
  }

  // ── History (?personId= → the person's timeline feed) ──────────────────────

  @Get()
  @RequirePermission('communications.read')
  list(@Query(zodQuery(communicationListSchema)) query: CommunicationListQuery) {
    const { personId, channel, status, batchId, ...listQuery } = query;
    return this.communications.list(listQuery as ListQuery, {
      personId,
      channel,
      status,
      batchId,
    });
  }
}
