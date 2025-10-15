import dotenv from 'dotenv';
import path from 'path';
import { createThirdwebClient } from 'thirdweb';
import { hardhat, polygon, defineChain } from 'thirdweb/chains';
import { privateKeyToAccount } from 'thirdweb/wallets';

// Load environment variables from .env.local first, then .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

export const client = createThirdwebClient({
  clientId: process.env.THIRDWEB_CLIENT_ID!,
  secretKey: process.env.THIRDWEB_SECRET_KEY!,
});

// Custom hardhat chain for Docker environments
const dockerHardhat = defineChain({
  id: 31337,
  name: 'Hardhat',
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  rpc: 'http://host.docker.internal:8545',
  testnet: true,
});

export const chain = process.env.NODE_ENV === 'production'
  ? polygon
  : (process.env.HARDHAT_RPC_URL ? dockerHardhat : hardhat);

export const account = privateKeyToAccount({
  client,
  privateKey: process.env.THIRDWEB_PRIVATE_KEY!
});