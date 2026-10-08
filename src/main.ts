import { validationPipeOptions } from './validation';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { envValue } from './env';
import { AppModule } from './app.module'; import { ValidationPipe } from '@nestjs/common';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Enable CORS for frontend communication
  app.enableCors({
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-api-token'],
    origin: [
      'http://localhost:3001', // frontend address
      ...(JSON.parse(envValue(configService, 'ALLOWED_ORIGINS') ?? '[]') ?? []),
    ],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));



  const port = envValue(configService, 'PORT') ?? 3000;
  const host = envValue(configService, 'HOST');
  await (host ? app.listen(port, host) : app.listen(port));
  console.log(`Backend running at http://localhost:${port}`);
}
bootstrap();
