import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserIdToOrders1709500000000 implements MigrationInterface {
  name = 'AddUserIdToOrders1709500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add user_id column as nullable first (can't add NOT NULL FK without default)
    await queryRunner.query(`
      ALTER TABLE "orders" ADD COLUMN "user_id" uuid
    `);

    // Backfill user_id from users table based on wallet_address
    await queryRunner.query(`
      UPDATE "orders" o
      SET "user_id" = u.id
      FROM "users" u
      WHERE o."user_address" = u."wallet_address"
    `);

    // Make NOT NULL and add FK
    await queryRunner.query(`
      ALTER TABLE "orders" ALTER COLUMN "user_id" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_user"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    `);

    // Add index
    await queryRunner.query(`
      CREATE INDEX "IDX_orders_user_id" ON "orders" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_user"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "user_id"`);
  }
}
