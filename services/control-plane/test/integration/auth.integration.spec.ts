/**
 * Integration test: Auth flow
 *
 * Requires a running Postgres + a connected NestJS application.
 * Skipped automatically when TEST_DB_URL is not set.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GlobalExceptionFilter } from '../../src/common/filters/http-exception.filter.js';
import { RequestIdInterceptor } from '../../src/common/interceptors/request-id.interceptor.js';
import { UserRole } from '../../src/database/enums.js';
import { ALL_ENTITIES } from '../../src/database/data-source.js';
import { UserEntity } from '../../src/entities/user.entity.js';
import { AuthModule } from '../../src/modules/auth/auth.module.js';
import type { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import supertest from 'supertest';

const TEST_DB_URL = process.env['TEST_DB_URL'];

describe.skipIf(!TEST_DB_URL)('Auth integration', () => {
  let app: INestApplication;
  let userRepo: Repository<UserEntity>;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: TEST_DB_URL,
          entities: ALL_ENTITIES,
          synchronize: false,
        }),
        ThrottlerModule.forRoot([
          { name: 'global', ttl: 60_000, limit: 300 },
          { name: 'login', ttl: 900_000, limit: 5 },
        ]),
        JwtModule.register({
          secret: process.env['JWT_SECRET'] ?? 'test-integration-secret',
          signOptions: { expiresIn: '15m' },
        }),
        AuthModule,
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalInterceptors(new RequestIdInterceptor());
    await app.init();

    userRepo = module.get<Repository<UserEntity>>(getRepositoryToken(UserEntity));

    // Seed a test user
    const hash = await bcrypt.hash('Integration@Pass1', 12); // pragma: allowlist secret;
    await userRepo.save(
      userRepo.create({
        email: 'integration-test@example.com',
        passwordHash: hash,
        displayName: 'Integration Tester',
        role: UserRole.VIEWER,
      }),
    );
  });

  afterAll(async () => {
    await userRepo.delete({ email: 'integration-test@example.com' });
    await app.close();
  });

  it('POST /api/v1/auth/login — returns 200 with tokens on valid credentials', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'integration-test@example.com', password: 'Integration@Pass1' }) // pragma: allowlist secret
      .expect(200);

    expect(res.body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
      user: { email: 'integration-test@example.com' },
    });
  });

  it('POST /api/v1/auth/login — returns 401 on wrong password', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'integration-test@example.com', password: 'wrong-password' }) // pragma: allowlist secret
      .expect(401);

    expect(res.body).toMatchObject({ code: 'AUTH_REQUIRED' });
  });

  it('POST /api/v1/auth/login — returns 400 on invalid body', async () => {
    const res = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'not-an-email', password: '' })
      .expect(400);

    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('POST /api/v1/auth/refresh + GET /api/v1/auth/me — full round-trip', async () => {
    // 1. Login
    const loginRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'integration-test@example.com', password: 'Integration@Pass1' }) // pragma: allowlist secret
      .expect(200);

    const { access_token, refresh_token } = loginRes.body as {
      access_token: string;
      refresh_token: string;
    };

    // 2. Call /me with access token
    const meRes = await supertest(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${access_token}`)
      .expect(200);

    expect(meRes.body).toMatchObject({ email: 'integration-test@example.com' });

    // 3. Refresh
    const refreshRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token })
      .expect(200);

    expect(refreshRes.body).toMatchObject({
      access_token: expect.any(String),
      refresh_token: expect.any(String),
    });

    // 4. Old refresh token must be revoked (rotating)
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token })
      .expect(401);
  });

  it('POST /api/v1/auth/logout — revokes the refresh token', async () => {
    const loginRes = await supertest(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'integration-test@example.com', password: 'Integration@Pass1' }) // pragma: allowlist secret
      .expect(200);

    const { refresh_token } = loginRes.body as { refresh_token: string };

    await supertest(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .send({ refresh_token })
      .expect(204);

    // Subsequent refresh must fail
    await supertest(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token })
      .expect(401);
  });

  it('GET /api/v1/auth/me — returns 401 without token', async () => {
    const res = await supertest(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

    expect(res.body).toMatchObject({ code: 'AUTH_REQUIRED' });
  });
});
