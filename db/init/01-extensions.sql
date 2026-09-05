-- Runs once when the Postgres volume is first created. Schemas are owned by migrations.
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
