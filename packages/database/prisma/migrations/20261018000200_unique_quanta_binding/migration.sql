-- The existing (provider, providerId) unique key protects the Quanta identity side.
-- This partial index protects the Challenge account side without changing EMAIL/QQ rules.
CREATE UNIQUE INDEX "auths_one_quanta_per_user" ON "auths" ("userId") WHERE "provider" = 'QUANTA';
