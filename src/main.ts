import { validationPipeOptions } from './validation';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module'; import { ValidationPipe } from '@nestjs/common';


async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Enable CORS for frontend communication
  app.enableCors({
    allowedHeaders: ['Content-Type', 'Authorization'],
    origin: [
      'http://localhost:3001', // frontend address
      ...(JSON.parse(configService.get('ALLOWED_ORIGINS') ?? '[]') ?? []),
    ],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));



  // Force default to 3001 if PORT is not set
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Backend running at http://localhost:${port}`);
}
bootstrap();
