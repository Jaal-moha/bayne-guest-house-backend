import { validationPipeOptions } from './validation';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { envValue, serverConfig } from './env';
import { AppModule } from './app.module'; import { ValidationPipe } from '@nestjs/common';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const { port, allowedOrigins } = serverConfig(app.get(ConfigService));

  // Enable CORS for frontend communication
  app.enableCors({
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-api-token'],
    origin: [
      'http://localhost:3001', // frontend address
      ...allowedOrigins,
    ],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));

  const host = envValue(app.get(ConfigService), 'HOST');
  await (host ? app.listen(port, host) : app.listen(port));
  console.log(`Backend running at http://localhost:${port}`);
}
bootstrap();
