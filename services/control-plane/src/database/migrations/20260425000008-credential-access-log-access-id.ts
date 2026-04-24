import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class CredentialAccessLogAddAccessId20260425000008 implements MigrationInterface {
  name = 'CredentialAccessLogAddAccessId20260425000008';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE credential_access_log
        ADD COLUMN IF NOT EXISTS access_id TEXT;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE credential_access_log
        DROP COLUMN IF EXISTS access_id;
    `);
  }
}
