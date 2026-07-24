import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { isProduction, loadEnv } from './config/env';

async function bootstrap() {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);

  if (!isProduction()) {
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
  new Logger('Bootstrap').log(
    `API listening on :${env.API_PORT} (${env.NODE_ENV}) — docs at /api/docs`,
  );
}

bootstrap().catch((err) => {
  console.error('Fatal boot error:', err);
  process.exit(1);
});
