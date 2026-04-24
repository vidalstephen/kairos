import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ApprovalsAddCancelled20260425000007 implements MigrationInterface {
  public readonly name = 'ApprovalsAddCancelled20260425000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE approval_state_machine ADD VALUE IF NOT EXISTS 'CANCELLED'`,
    );
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // Postgres does not allow removing enum values without recreating the type.
    // This migration is intentionally not fully reversible.
  }
}
