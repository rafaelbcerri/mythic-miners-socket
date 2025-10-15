import dotenv from 'dotenv';
import path from 'path';
import { createAuth } from 'thirdweb/auth';
import { privateKeyToAccount } from 'thirdweb/wallets';

import { client } from './client';

// Load environment variables from .env.local first, then .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const FIVE_DAYS = 5 * 24 * 60 * 60;

export const auth = createAuth({
  domain: process.env.WEB_URL || '',
  adminAccount: privateKeyToAccount({ client, privateKey: process.env.THIRDWEB_PRIVATE_KEY! }),
  client,
  jwt: {
    expirationTimeSeconds: FIVE_DAYS,
  },
});
