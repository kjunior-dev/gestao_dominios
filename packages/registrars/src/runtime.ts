import type Redis from 'ioredis';
export type RegistrarRuntime = {
  env: {
    OPENPROVIDER_ENABLED: boolean;
    DOMAIN_REGISTRATION_MODE?: string;
    OPENPROVIDER_SANDBOX_CONTRACT_VERIFIED?: boolean;
    LIVE_TRANSACTIONS_ENABLED?: boolean;
    OPENPROVIDER_BASE_URL: string;
    OPENPROVIDER_USERNAME?: string;
    OPENPROVIDER_PASSWORD?: string;
    OPENPROVIDER_TIMEOUT_MS: number;
    OPENPROVIDER_TOKEN_TTL_SECONDS: number;
    OPENPROVIDER_REQUESTS_PER_MINUTE: number;
    TOTP_ENCRYPTION_KEY: string;
  };
  redis: Redis;
  logger: { info: (data: object) => void; warn: (data: object) => void };
};
