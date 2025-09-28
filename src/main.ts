import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';import { ValidationPipe } from '@nestjs/common';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';


async function bootstrap() {
  const uploadPath = join(__dirname, '/upload/staff-ids');
  existsSync(uploadPath) || mkdirSync(uploadPath,{ recursive: true });
  const app = await NestFactory.create(AppModule);
  
  // Enable CORS for frontend communication
  app.enableCors({
    origin: 'http://localhost:3001', // frontend address
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));



  // Force default to 3001 if PORT is not set
  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`Backend running at http://localhost:${port}`);
}
bootstrap();
