# Simple WebSocket Game Server

A clean and simple WebSocket server with ping/pong heartbeat for game development.

## Project Structure

```
src/
├── types/
│   └── index.ts                  # Type definitions and interfaces
├── utils/
│   └── crypto.ts                 # Cryptographic utilities
├── SimpleWebSocketServer.ts      # Main WebSocket server (simplified)
├── server.ts                     # Server entry point
└── client-test.ts                # Test client with ping/pong support
```

## Features

- **Simple Architecture**: All logic in one main server class - easy to understand and modify
- **Ping/Pong Heartbeat**: Automatic client health monitoring with configurable intervals
- **Type Safe**: Full TypeScript support with comprehensive type definitions
- **Dual Ping System**: Both WebSocket native ping/pong and application-level ping/pong
- **Client Timeout**: Automatic disconnection of unresponsive clients
- **Error Handling**: Comprehensive error handling and logging
- **Cryptography**: Built-in RSA key generation and AES encryption setup
- **Graceful Shutdown**: Proper cleanup on server termination

## Installation

```bash
npm install
```

## Environment Setup

This project requires several environment variables to be configured. Create a `.env.local` file in the project root with the following variables:

### Required Environment Variables

```bash
# Server Configuration
PORT=3031
NODE_ENV=development
WS_HEARTBEAT_INTERVAL=30000

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/MythicMiners

# Thirdweb Configuration
THIRDWEB_CLIENT_ID=your_thirdweb_client_id_here
THIRDWEB_SECRET_KEY=your_thirdweb_secret_key_here
THIRDWEB_PRIVATE_KEY=your_private_key_here

# Web URL for authentication
WEB_URL=http://localhost:3000

# Contract Addresses
ICO_MANAGER_ADDRESS=0x0000000000000000000000000000000000000000
RELICS_ADDRESS=0x0000000000000000000000000000000000000000
EQUIPMENTS_ADDRESS=0x0000000000000000000000000000000000000000
AMAZONITE_ADDRESS=0x0000000000000000000000000000000000000000
AIRDROP_MANAGER_ADDRESS=0x0000000000000000000000000000000000000000
BETA_ADDRESS=0x0000000000000000000000000000000000000000
EQUIPMENTS_MANAGER_ADDRESS=0x0000000000000000000000000000000000000000
```

### Optional Environment Variables

```bash
# Hardhat RPC URL for Docker environments
HARDHAT_RPC_URL=http://host.docker.internal:8545

# Offline mode flag
IS_OFFLINE=true
```

### Environment Variable Descriptions

- **PORT**: Server port (default: 3031)
- **NODE_ENV**: Environment mode (development/production)
- **WS_HEARTBEAT_INTERVAL**: WebSocket heartbeat interval in milliseconds
- **MONGODB_URI**: MongoDB connection string
- **THIRDWEB_CLIENT_ID**: Thirdweb client ID for blockchain interactions
- **THIRDWEB_SECRET_KEY**: Thirdweb secret key
- **THIRDWEB_PRIVATE_KEY**: Private key for blockchain transactions
- **WEB_URL**: Base URL for authentication
- **Contract Addresses**: Ethereum contract addresses for various game components

The project is configured to load `.env.local` first, then fall back to `.env` if needed.

### Quick Setup

You can use the provided script to create a template `.env.local` file:

```bash
npm run setup-env
```

This will create a `.env.local` file with all required variables. You'll need to update the placeholder values with your actual configuration.

## Usage

### Development (with auto-reload)
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Testing
```bash
# In one terminal, start the server
npm run dev

# In another terminal, run the test client
npx tsx src/client-test.ts
```

## Ping/Pong Configuration

Configure heartbeat settings in `src/server.ts`:

```typescript
const config: WebSocketServerConfig = {
  port: 8000,
  pingInterval: 30000,     // Send ping every 30 seconds
  pongTimeout: 60000,      // Timeout clients after 60 seconds without pong
  // ... other options
};
```

## Message Types

The server supports the following message types:

### `player`
Request player data.

**Request:**
```json
{
  "type": "player"
}
```

**Response:**
```json
{
  "type": "player_data",
  "data": "{...player data json...}"
}
```

### `player_update`
Update player stats (life, energy, etc.).

**Request:**
```json
{
  "type": "player_update",
  "data": "{\"life\": 10, \"energy\": 5, \"minedRock\": {...}}"
}
```

**Response:**
```json
{
  "type": "player_data",
  "data": "{...updated player data...}"
}
```

### `ping`
Send a ping to the server.

**Request:**
```json
{
  "type": "ping",
  "data": { "timestamp": 1234567890 }
}
```

**Response:**
```json
{
  "type": "pong",
  "data": { "timestamp": 1234567890 }
}
```

### `pong`
Respond to a server ping.

**Request:**
```json
{
  "type": "pong",
  "data": { "timestamp": 1234567890 }
}
```

## Heartbeat System

The server implements a dual heartbeat system:

1. **Native WebSocket Ping/Pong**: Built-in WebSocket protocol level ping/pong frames
2. **Application-Level Ping/Pong**: JSON message-based ping/pong for application logic

### How it works:

1. Server sends ping every `pingInterval` milliseconds
2. Client must respond with pong within `pongTimeout` milliseconds
3. If client doesn't respond, connection is terminated
4. Both native WebSocket and application-level ping/pong are supported

## Adding New Message Types

Simply add new cases to the switch statement in `SimpleWebSocketServer.ts`:

```typescript
private handleMessage(ws: WebSocket, message: WebSocketMessage): void {
  const clientData = this.clients.get(ws);
  if (!clientData) return;

  switch (message.type) {
    case 'player':
      // existing code...
      break;
    
    case 'chat':  // Add new message type
      console.log('Chat message:', message.data);
      this.broadcast('chat_message', {
        from: clientData.id,
        message: message.data,
        timestamp: Date.now()
      });
      break;
    
    // ... other cases
  }
}
```

## Client Connection Example

```javascript
const ws = new WebSocket('ws://localhost:8000');

ws.on('open', () => {
  console.log('Connected to server');
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  
  if (message.type === 'ping') {
    // Respond to server ping
    ws.send(JSON.stringify({
      type: 'pong',
      data: { timestamp: Date.now() }
    }));
  }
});

// Handle native WebSocket ping
ws.on('ping', (data) => {
  ws.pong(data);
});
```

## Server Stats

The server logs connection statistics every 30 seconds:

```
Server stats - Total clients: 5, Alive: 4
```

## Error Handling

The server provides comprehensive error handling:

- **Invalid JSON**: Returns error message for malformed JSON
- **Unknown message types**: Returns error for unsupported message types
- **Connection timeouts**: Automatic cleanup of unresponsive clients
- **WebSocket errors**: Proper error logging and connection cleanup

## Player Data Structure

```typescript
interface PlayerData {
  minerPoints: number;
  amazonites: number;
  isVip: boolean;
  deaths: number;
  life: number;
  energy: number;
  helmet: string;
  pickaxe: string;
  armor: string;
  belt: string;
  trinket: string;
  jetpack: string;
  energyDrink: number;
  teleportPill: number;
  fireResistancePotion: number;
  bomb: number;
  medkit: number;
  tier1: number;
  tier2: number;
  tier3: number;
  tier4: number;
  tier5: number;
  tier6: number;
  tier7: number;
  tier8: number;
  tier9: number;
}
```

## License

ISC 