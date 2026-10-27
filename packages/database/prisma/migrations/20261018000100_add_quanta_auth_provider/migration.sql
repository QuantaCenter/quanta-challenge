-- Separate migration: PostgreSQL requires a new enum value to commit before use.
ALTER TYPE "AuthProvider" ADD VALUE IF NOT EXISTS 'QUANTA';
