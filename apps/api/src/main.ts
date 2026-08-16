import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { MailService } from './mail/mail.service';
import { apiDocsEnabled, appEnv, loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  /**
   * Opt-in, never "anything that is not production". SwaggerModule mounts on
   * Express, outside the Nest guards, so these docs answer to anyone who can
   * reach the host — which is how a full API map ended up public on staging.
   */
  const docs = apiDocsEnabled();
  if (docs) {
    const config = new DocumentBuilder()
      .setTitle('JUMPSTART USA Operations Platform API')
      .setDescription(
        'Internal staff API + public intake endpoints. Session-cookie auth; RBAC enforced per endpoint.',
      )
      .setVersion('0.1.0')
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(env.API_PORT);
  const logger = new Logger('Bootstrap');
  logger.log(
    `API listening on :${env.API_PORT} (${appEnv()}, NODE_ENV=${env.NODE_ENV})` +
      (docs ? ' — docs at /api/docs' : ' — docs disabled'),
  );

  /**
   * Say it out loud when outbound email is not configured.
   *
   * The API runs perfectly well without it, which is exactly the problem: the
   * security notifications ride on email, so unconfigured mail means an
   * account can be locked, have its second factor reset, or have its address
   * changed, and the person it belongs to is told none of it. A single warn
   * buried in the send path was not enough to notice; this lists what is
   * actually switched off.
   */
  const mail = app.get(MailService);
  const DISABLED_BY_NO_MAIL =
    'account lockout, second-factor reset, email change, role change, ' +
    'password reset, and user invitations';
  if (!mail.configured()) {
    logger.warn(
      'Outbound email is NOT configured (GRAPH_TENANT_ID / GRAPH_CLIENT_ID / ' +
        `GRAPH_CLIENT_SECRET). These are silently skipped: ${DISABLED_BY_NO_MAIL}.`,
    );
  } else {
    /**
     * Probe at boot, and do it WITHOUT blocking the listen above — a slow
     * Entra must not delay the app becoming healthy.
     *
     * Configuration being present is not the same as it working: the
     * credential can be wrong or expired, which is exactly what happened and
     * went unnoticed for weeks because nothing ever exercised it.
     */
    void mail.probeSendPath().then((status) => {
      if (status === 'ok') return;
      logger.error(
        'Outbound email is configured but NOT WORKING — a token could not be ' +
          `acquired from Entra. These are being dropped: ${DISABLED_BY_NO_MAIL}. ` +
          'See the MailService error above for the reason.',
      );
    });
  }
}

bootstrap().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
