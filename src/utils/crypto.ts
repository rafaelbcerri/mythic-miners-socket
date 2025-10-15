import { generateKeyPairSync, randomBytes } from 'node:crypto';

export class CryptoUtils {
    static readonly plus = 'MythicMiners';
    static readonly algorithm = 'aes-128-gcm';
    static readonly secretKey = randomBytes(32);
    static readonly iv = randomBytes(12);
    static readonly random = randomBytes(20);

    static generateUniqueId(): string {
        return Math.random().toString(36).substring(2) + Date.now().toString(36);
    }

    static generateKeyPair() {
        return generateKeyPairSync('rsa', {
            modulusLength: 4096,
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem',
            },
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
                cipher: 'aes-256-cbc',
                passphrase: 'top secret',
            },
        });
    }
} 