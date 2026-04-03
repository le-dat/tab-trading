import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Load .env with ${VAR} variable interpolation support.
 * Must run before NestJS bootstraps so ConfigModule sees expanded vars.
 */
function loadEnvWithInterpolation(envPath: string) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex);
    let value = trimmed.slice(eqIndex + 1);

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    value = value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
      return process.env[varName] ?? '';
    });

    process.env[key] = value;
  }
}

// Expand ${VAR} references BEFORE NestJS reads the .env
loadEnvWithInterpolation(path.join(process.cwd(), '.env'));

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.enableCors({
    origin: process.env.NODE_ENV === 'development',
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Tap Trading API')
    .setDescription('Mobile-first gamified price-touch trading platform')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
  console.log(`[NestApplication] Running on http://localhost:${port}`);
  console.log(`[Swagger] API docs available at http://localhost:${port}/api/docs`);
}
bootstrap();
