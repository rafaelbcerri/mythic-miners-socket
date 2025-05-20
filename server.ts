import { createServer, IncomingMessage } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { generateKeyPairSync, randomBytes, createCipheriv, privateDecrypt, constants, pbkdf2Sync } from 'node:crypto'; 

const PORT = 8000;
const server = createServer();

// Create a Socket.IO server instead of WebSocket
const io = new SocketIOServer(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    credentials: true
  },
  perMessageDeflate: {
    zlibDeflateOptions: {
      windowBits: 11,
      memLevel: 3
    },
    zlibInflateOptions: {
      windowBits: 11,
      memLevel: 3
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 11,
    concurrencyLimit: 10,
    threshold: 1024
  }
});

// Configurações de criptografia
const plus = 'MythicMiners';
const algorithm = 'aes-128-gcm';
const secretKey = randomBytes(32); // 32 bytes for AES-256
const iv = randomBytes(12); // 12 bytes for AES-GCM
const random = randomBytes(20); // 12 bytes for AES-GCM

function deriveKey(socketId: string): Buffer {
  return pbkdf2Sync(socketId + plus, 'salt', 100000, 16, 'sha256');
}



async function encryptMessage(socketId: string, message: string): Promise<string> {
  try {

    const key = deriveKey(socketId);
    // Generate random IV    
    // Create cipher
    const cipher = createCipheriv(algorithm, key, iv);
    
    // Encrypt the message
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    // Get the auth tag
    const authTag = cipher.getAuthTag();
    
    // Return IV + encrypted message + auth tag
    return encrypted + authTag.toString('hex');
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}


function decodeWithPrivateKey(encryptedData: string, privateKey: string): string {
  try {
    const buffer = Buffer.from(encryptedData, 'base64');
    const decrypted = privateDecrypt(
      {
        key: privateKey,
        passphrase: 'top secret',
        padding: constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      buffer
    );
    return decrypted.toString('utf8');
  } catch (error) {
    console.error('Error decoding data:', error);
    throw error;
  }
}

function transformPublicKey(publicKey: string, iv: Buffer, random: Buffer): string {
  const chave = publicKey
    .replace('-----BEGIN PUBLIC KEY-----', iv.toString('hex') + random.toString('hex'))
    .replace('-----END PUBLIC KEY-----', '');
  
  const lines = chave.split('\n');
  let newChave = '';

  // Verificar se há pelo menos duas linhas
  if (lines.length >= 2) {
    // Trocar a primeira linha com a segunda
    [lines[0], lines[1]] = [lines[1], lines[0]];
    
    // Juntar as linhas novamente em uma string
    newChave = lines.join('\n');
  }

  return newChave;
}

// Handle connection event
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  const {
    publicKey,
    privateKey,
  } = generateKeyPairSync('rsa', {
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

  const playerData = {
    minerPoints: 1000,
    amazonites: 1000,
    isVip: true,
    deaths: 0,
    life: 1000,
    energy: 1000,
    equipments: {
      helmet: "tier-1",
      pickaxe: "tier-1",
      armor: "tier-1",
      belt: "tier-1",
      trinket: "tier-1",
      jetpack: "tier-1"
    },
    inventory: [
      {
        id: "bomb",
        quantity: 1
      },
      {
        id: "rock-tier-1",
        quantity: 20
      }
    ]
  };



  // Handle incoming messages
  socket.on('key', () => {    
    const newChave = transformPublicKey(publicKey, iv, random);
    console.log('publicKey', publicKey);
    console.log('iv', iv.toString('hex'));
    console.log('newChave', newChave);
    socket.emit('key', newChave);
  });

  socket.on('player', async () => {
    const playerDataEncrypted = await encryptMessage(socket.id, JSON.stringify(playerData));
    socket.emit('player_data', playerDataEncrypted);
  });

  socket.on('player_update', async (data) => {
    console.log('player_update', data);
    const decodedData = decodeWithPrivateKey(data, privateKey)
    const { life, energy, inventory } = JSON.parse(decodedData);

    playerData.life -= life;
    playerData.energy -= energy;
    if (playerData.life <= 0 || playerData.energy <= 0) {
      playerData.life = 0;
      playerData.energy = 0;
      playerData.deaths++;
    }
    playerData.inventory = playerData.inventory.map((item) => {
      const findItem = inventory.find((i: { id: string }) => i.id === item.id);
      if (findItem) {
        item.quantity -= findItem.quantity;        
      }
      return item;
    }).filter((item) => item.quantity > 0);

    const playerDataEncrypted = await encryptMessage(socket.id, JSON.stringify(playerData));
    socket.emit('player_data', playerDataEncrypted);
  });  

  // Handle disconnection
  socket.on('disconnect', (reason) => {
    console.log(`Client ${socket.id} disconnected. Reason: ${reason}`);
  });
});

// Start the server
server.listen(PORT, () => console.log(`Socket.IO server started on port ${PORT}`));
