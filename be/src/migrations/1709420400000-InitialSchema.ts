import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1709420400000 implements MigrationInterface {
  name = 'InitialSchema1709420400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "order_status_enum" AS ENUM ('open', 'won', 'lost')
    `);
    await queryRunner.query(`
      CREATE TYPE "settlement_type_enum" AS ENUM ('win', 'lose', 'refund')
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_type_enum" AS ENUM ('deposit', 'withdrawal', 'bet_stake', 'bet_payout', 'bet_refund')
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_status_enum" AS ENUM ('pending', 'completed', 'failed')
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "wallet_address" varchar(42) NOT NULL UNIQUE,
        "privy_did" varchar(255),
        "nonce" int NOT NULL DEFAULT 0,
        "is_blocked" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_wallet_address" ON "users" ("wallet_address")`);

    // Create orders table
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_address" varchar(42) NOT NULL,
        "order_id_on_contract" bigint NOT NULL,
        "asset" varchar(20) NOT NULL,
        "target_price" bigint NOT NULL,
        "is_above" boolean NOT NULL,
        "duration" int NOT NULL,
        "multiplier_bps" int NOT NULL,
        "stake_wei" numeric(78) NOT NULL,
        "status" "order_status_enum" NOT NULL DEFAULT 'open',
        "expiry_timestamp" bigint NOT NULL,
        "settled_at" TIMESTAMP,
        "settled_by" varchar(42),
        "payout_wei" numeric(78),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_orders_user_address" ON "orders" ("user_address")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_order_id_on_contract" ON "orders" ("order_id_on_contract")`);
    await queryRunner.query(`CREATE INDEX "IDX_orders_status" ON "orders" ("status")`);

    // Create settlements table
    await queryRunner.query(`
      CREATE TABLE "settlements" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "order_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "type" "settlement_type_enum" NOT NULL,
        "payout_wei" numeric(78),
        "settlement_tx_hash" varchar(66),
        "block_number" bigint,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_settlements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_settlements_order" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_settlements_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_settlements_order_id" ON "settlements" ("order_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_settlements_user_id" ON "settlements" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_settlements_settlement_tx_hash" ON "settlements" ("settlement_tx_hash")`);

    // Create payments table
    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "type" "payment_type_enum" NOT NULL,
        "status" "payment_status_enum" NOT NULL DEFAULT 'pending',
        "amount_wei" numeric(78) NOT NULL,
        "tx_hash" varchar(66),
        "order_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_payments_user_id" ON "payments" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_payments_tx_hash" ON "payments" ("tx_hash")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "settlements"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "orders"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "settlement_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "order_status_enum"`);
  }
}
