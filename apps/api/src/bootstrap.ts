import { sessionCookie } from './common/security';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { RuntimeService } from './common/runtime.service';
import { ErrorFilter } from './common/error.filter';
export async function createApp() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  const runtime = app.get(RuntimeService);
  app.setGlobalPrefix('api/v1');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: runtime.env.APP_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token', 'X-Cart-CSRF-Token'],
  });
  app.useGlobalFilters(new ErrorFilter(runtime));
  app.enableShutdownHooks();
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('DevTrust Domains')
      .setVersion('1.0')
      .setDescription(
        'Account, catalog, registrar search and cart API. Mutation requests require Origin and X-CSRF-Token.',
      )
      .addCookieAuth(sessionCookie(runtime.env.NODE_ENV === 'production'))
      .build(),
  );
  const publicPaths = new Set(
    ['register', 'login', 'forgot-password', 'reset-password', 'verify-email']
      .map((path) => '/api/v1/auth/' + path)
      .concat(['/api/v1/tlds', '/api/v1/domains/check']),
  );
  for (const [path, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item || {})) {
      if (operation && ['get', 'post', 'patch', 'delete'].includes(method))
        operation.security =
          path === '/api/v1/health' || publicPaths.has(path)
            ? []
            : path.startsWith('/api/v1/cart')
              ? [{ cookie: [] }, {}]
              : [{ cookie: [] }];
      if (
        operation &&
        ['post', 'patch', 'delete'].includes(method) &&
        !publicPaths.has(path)
      ) {
        operation.parameters = [
          ...(operation.parameters || []),
          {
            name: path.startsWith('/api/v1/cart')
              ? 'X-Cart-CSRF-Token'
              : 'X-CSRF-Token',
            in: 'header',
            required: true,
            description: path.startsWith('/api/v1/cart')
              ? 'Visitante: dt_cart_csrf. Autenticado: usar X-CSRF-Token com dt_csrf.'
              : 'Valor do cookie dt_csrf associado à sessão.',
            schema: { type: 'string' },
          },
        ];
      }
    }
  }
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/openapi.json',
  });
  await app.init();
  return app;
}
