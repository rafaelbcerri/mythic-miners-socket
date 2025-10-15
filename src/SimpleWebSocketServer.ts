import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local first, then .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
import { createServer, Server } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
    WebSocketServerConfig,
    WebSocketMessage,
    ClientData,
    PlayerData,
    EquippedItemData,
    LifeUpdateData,
    EnergyUpdateData,
    DeathUpdateData,
    TilemapCreateData,
    SaveTilemapData,
    MinedRockData,
    SellOresData,
    HellyHealData,
    HellyRestoreEnergyData,
    DeleteOreData,
    BuyItemData,
    UseTeleportData,
    UseAntiFireData,
    UseBombData,
    UseHealData,
    UseEnergyData,
    ExplosiveTileData,
    AmazoniteConvertedData
} from './types';
import { CryptoUtils } from './utils/crypto';
import { auth } from './libs/thirdweb/auth';
import { jwtDecode } from 'jwt-decode';
import dbConnect from "./libs/mongodb/client";
import { readContract } from 'thirdweb';
import { EQUIPPED_TYPES, formatTokenId, ZERO_ADDRESS, COMMON_ENERGY, COMMON_HEALTH, COMMON_WEIGHT } from './utils/consts';
import { equipmentsManagerContract } from './contracts/EquipmentsManager';
import Nfts, { NftsCategory } from './models/Nfts';
import Players from './models/Player';
import SubscriptionModel from './models/SubscriptionModel';
import GameMap from './models/GameMap';
import { isOldDate, bigIntReplacer } from './utils';

export class SimpleWebSocketServer {
    private server: Server;
    private wss: WebSocketServer;
    private clients = new Map<WebSocket, ClientData>();
    private config: WebSocketServerConfig;
    private pingInterval: NodeJS.Timeout | null = null;
    private startTime = Date.now();

    private async cleanupConnection(ws: WebSocket, reason: string): Promise<void> {
        try {
            const clientData = this.clients.get(ws);
            if (!clientData) {
                console.log('Cleanup called for unknown client (possibly already removed). Reason:', reason);
                return;
            }
            this.clients.delete(ws);
            try {
                await Players.updateOne({ connectionId: clientData.id }, { $set: { connectionId: null, lastConnectedAt: null } });
            } catch (error) {
                console.warn('DB cleanup error during cleanupConnection:', error);
            }
            console.log(`Cleaned up client ${clientData.id} due to: ${reason}`);
        } catch (e) {
            console.warn('Unexpected error during cleanupConnection:', e);
        }
    }

    private async checkRecentDeath(address: string): Promise<{ hasRecentDeath: boolean; timeToWait?: number }> {
        const player = await Players.findOne({ address }, { deaths: 1 });

        if (!player || !player.deaths || player.deaths.length === 0) {
            return { hasRecentDeath: false };
        }

        const lastDeath = player.deaths[player.deaths.length - 1];
        const timeSinceLastDeath = Date.now() - lastDeath.getTime();
        const DEATH_COOLDOWN = 10000; // 10 segundos

        if (timeSinceLastDeath < DEATH_COOLDOWN) {
            return {
                hasRecentDeath: true,
                timeToWait: DEATH_COOLDOWN - timeSinceLastDeath
            };
        }

        return { hasRecentDeath: false };
    }

    constructor(config: WebSocketServerConfig) {
        this.config = config;
        this.server = createServer();

        // Add HTTP request handling for health checks
        this.setupHttpHandlers();

        this.wss = new WebSocketServer({
            server: this.server,
            perMessageDeflate: config.perMessageDeflate
        });

        this.setupWebSocketHandlers();
        this.startPingInterval();
    }

    private setupHttpHandlers(): void {
        this.server.on('request', async (req, res) => {
            // Handle CORS for health checks
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

            if (req.method === 'OPTIONS') {
                res.writeHead(200);
                res.end();
                return;
            }

            if (req.method === 'GET' && req.url === '/status') {
                try {
                    const uptime = Date.now() - this.startTime;
                    const clientCount = this.clients.size;
                    const aliveClients = Array.from(this.clients.values()).filter(c => c.isAlive).length;

                    // Test database connectivity
                    let dbStatus = 'unknown';
                    try {
                        await dbConnect();
                        dbStatus = 'connected';
                    } catch (error) {
                        console.error('Database health check failed:', error);
                        dbStatus = 'disconnected';
                    }

                    const status = {
                        status: 'healthy',
                        timestamp: new Date().toISOString(),
                        uptime: uptime,
                        uptimeFormatted: this.formatUptime(uptime),
                        server: {
                            port: this.config.port,
                            pingInterval: this.config.pingInterval,
                            pongTimeout: this.config.pongTimeout
                        },
                        clients: {
                            total: clientCount,
                            alive: aliveClients,
                            inactive: clientCount - aliveClients
                        },
                        database: {
                            status: dbStatus
                        }
                    };

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(status, null, 2));
                } catch (error) {
                    console.error('Health check error:', error);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: 'unhealthy',
                        error: error instanceof Error ? error.message : 'Unknown error',
                        timestamp: new Date().toISOString()
                    }));
                }
            } else {
                // Handle 404 for other routes
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: 'Not Found',
                    message: 'Available endpoints: GET /status'
                }));
            }
        });
    }

    private formatUptime(uptime: number): string {
        const seconds = Math.floor(uptime / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    private sendMessage(ws: WebSocket, type: string, data?: any): void {
        if (ws.readyState === WebSocket.OPEN) {
            const message = JSON.stringify({ type, data }, bigIntReplacer);
            ws.send(message);
        }
    }

    private broadcast(type: string, data?: any): void {
        const message = JSON.stringify({ type, data }, bigIntReplacer);
        this.clients.forEach((_, ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    private async handleMessage(ws: WebSocket, message: WebSocketMessage): Promise<void> {
        const clientData = this.clients.get(ws);
        if (!clientData) return;

        if (!clientData.address) {
            console.log('No address found');
            return;
        }
        const address = clientData.address;
        console.log('Processing message:', message.type, 'for address:', address);

        switch (message.type) {
            case 'player_data':
                await this.handlePlayerData(ws, address);
                break;

            case 'life_update':
                await this.handleLifeUpdate(ws, address, message as LifeUpdateData);
                break;

            case 'energy_update':
                await this.handleEnergyUpdate(ws, address, message as EnergyUpdateData);
                break;

            case 'death_update':
                await this.handleDeathUpdate(ws, address, message as DeathUpdateData);
                break;

            case 'tilemap_create':
                await this.handleTilemapCreate(ws, address, message as TilemapCreateData);
                break;

            case 'save_tilemap':
                await this.handleSaveTilemap(ws, address, message as SaveTilemapData);
                break;

            case 'mined_rock':
                await this.handleMinedRock(ws, address, message as MinedRockData);
                break;

            case 'sell_ores':
                await this.handleSellOres(ws, address, message as SellOresData);
                break;

            case 'helly_heal':
                await this.handleHellyHeal(ws, address, message as HellyHealData);
                break;

            case 'helly_restore_energy':
                await this.handleHellyRestoreEnergy(ws, address, message as HellyRestoreEnergyData);
                break;

            case 'delete_ore':
                await this.handleDeleteOre(ws, address, message as DeleteOreData);
                break;

            case 'use_teleport':
                await this.handleUseTeleport(ws, address, message as UseTeleportData);
                break;

            case 'use_heal':
                await this.handleUseHeal(ws, address, message as UseHealData);
                break;

            case 'use_energy':
                await this.handleUseEnergy(ws, address, message as UseEnergyData);
                break;

            case 'use_anti_fire':
                await this.handleUseAntiFire(ws, address, message as UseAntiFireData);
                break;

            case 'use_bomb':
                await this.handleUseBomb(ws, address, message as UseBombData);
                break;

            case 'buy_item':
                await this.handleBuyItem(ws, address, message as BuyItemData);
                break;

            case 'explosive_tile':
                await this.handleExplosiveTile(ws, address, message as ExplosiveTileData);
                break;

            case 'convert_amazonite':
                await this.handleAmazoniteConverted(ws, address, message as AmazoniteConvertedData);
                break;

            case 'ping':
                console.log('Ping received from:', clientData.id);
                this.sendMessage(ws, 'pong', { timestamp: Date.now() });
                break;

            case 'pong':
                console.log('Pong received from:', clientData.id);
                clientData.lastPong = Date.now();
                break;

            default:
                console.log('Unknown message type:', message.type);
                this.sendMessage(ws, 'error', { message: `Unknown message type: ${message.type}` });
        }
    }

    private async handlePlayerData(ws: WebSocket, address: string): Promise<void> {
        const [player, subscription, maps] = await Promise.all([
            Players.findOne({ address }),
            SubscriptionModel.findOne({ address, endDate: { $gte: new Date() } }),
            GameMap.find({ address })
        ]);

        const equippedItems = [
            { "contractAddress": "0x0165878A594ca255338adfa4d48449f69242Eb8F", "tokenId": BigInt("0") },
            { "contractAddress": "0x0165878A594ca255338adfa4d48449f69242Eb8F", "tokenId": BigInt("2") },
            { "contractAddress": "0x0165878A594ca255338adfa4d48449f69242Eb8F", "tokenId": BigInt("3") },
            { "contractAddress": "0x0165878A594ca255338adfa4d48449f69242Eb8F", "tokenId": BigInt("5") },
            { "contractAddress": "0x0165878A594ca255338adfa4d48449f69242Eb8F", "tokenId": BigInt("8") },
            { "contractAddress": "0x0165878A594ca255338adfa4d48449f69242Eb8F", "tokenId": BigInt("1") },
            { "contractAddress": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0", "tokenId": BigInt("0") }];

        console.log('equippedItems', JSON.stringify(equippedItems, bigIntReplacer));

        const equippedItemsData = equippedItems.map((equippedItem, index) => {
            const tokenId = equippedItem.tokenId;
            const contractAddress = equippedItem.contractAddress;
            if (contractAddress === ZERO_ADDRESS && tokenId === BigInt(0)) {
                return null;
            }

            return {
                tokenId: formatTokenId(tokenId),
                category: index === 6 ? NftsCategory.relics : NftsCategory.equipments,
            };
        }).filter(Boolean) as EquippedItemData[];

        const allMetadata = equippedItemsData.length > 0 ? await Nfts.find({
            $or: equippedItemsData.map(({ tokenId, category }) => ({ tokenId, category }))
        }) : [];

        const equipments = allMetadata.reduce((acc: any, cur: any) => {
            console.log(cur.category);
            if (cur.category === NftsCategory.relics) {
                const relic = cur.metadata.image.match(/\/relics\/(.+)\.png/);
                console.log(relic);
                if (relic) {
                    const amzConversion = cur.metadata.attributes.find((attr: any) => attr.trait_type === "Amazonite Conversion")?.value;
                    acc.relic = relic[1];
                    acc.amzConversion = amzConversion;
                }
            } else {
                const category = cur.metadata.attributes.find((attr: any) => attr.trait_type === "Category")?.value.toLowerCase();
                const regex = new RegExp(`\/equipments\/${category}s\/(.+)\.png`);
                const equipment = cur.metadata.image.match(regex);
                if (equipment) {
                    acc[category] = `${category}-${equipment[1].replace(/-[a|b|c|s]$/, '')}`;
                }
                if (category === 'jetpack') {
                    const energy = cur.metadata.attributes.find((attr: any) => attr.trait_type === "Energy")?.value;
                    acc.maxEnergy = energy;
                }
                if (category === 'helmet') {
                    const life = cur.metadata.attributes.find((attr: any) => attr.trait_type === "Health")?.value;
                    acc.maxLife = life;
                }
                if (category === 'belt') {
                    const maxWeight = cur.metadata.attributes.find((attr: any) => attr.trait_type === "Max Weight")?.value;
                    acc.maxWeight = maxWeight;
                }
            }
            return acc;
        }, {
            pickaxe: 'pickaxe-common',
            armour: 'armour-common',
            jetpack: 'jetpack-common',
            belt: 'belt-common',
            trinket: 'trinket-common',
            helmet: 'helmet-common',
            relic: undefined,
            maxLife: COMMON_HEALTH,
            maxEnergy: COMMON_ENERGY,
            maxWeight: COMMON_WEIGHT,
            amzConversion: 0,
        });

        const currentDeaths = player?.deaths.filter((date: Date) => !isOldDate(date)).length || 0;
        const playerData = {
            isVip: !!subscription,
            deaths: currentDeaths,
            life: player?.life || COMMON_HEALTH,
            energy: player?.energy || COMMON_ENERGY,
            maxLife: equipments.maxLife,
            maxEnergy: equipments.maxEnergy,
            maxLbs: equipments.maxWeight,
            amzConversion: equipments.amzConversion,
            Coal: player?.ores.Coal || 0,
            Copper: player?.ores.Copper || 0,
            Silver: player?.ores.Silver || 0,
            Gold: player?.ores.Gold || 0,
            Emerald: player?.ores.Emerald || 0,
            Sapphire: player?.ores.Sapphire || 0,
            Mythril: player?.ores.Mythril || 0,
            Adamantium: player?.ores.Adamantium || 0,
            Crownite: player?.ores.Crownite || 0,
            positionX: player?.position.x,
            positionY: player?.position.y,
            energyDrink: player?.items.energyDrink || 0,
            teleportPill: player?.items.teleportPill || 0,
            fireResistancePotion: player?.items.fireResistancePotion || 0,
            bomb: player?.items.bomb || 0,
            medkit: player?.items.medkit || 0,
            shouldCreateMap: player?.mapCreatedAt ? isOldDate(player?.mapCreatedAt) : true,
            minerPoints: player?.minerPoints || 0,
            helmet: equipments.helmet,
            pickaxe: equipments.pickaxe,
            armour: equipments.armour,
            belt: equipments.belt,
            trinket: equipments.trinket,
            jetpack: equipments.jetpack,
            buyedToday: player?.amazoniteConverted.filter((date: Date) => !isOldDate(date)).length || 0,
            vipBuyedToday: player?.vipAmazoniteConverted.filter((date: Date) => !isOldDate(date)).length || 0,
            amazonites: player?.amazonites || 0,
            ...maps.reduce((acc: any, cur: any) => {
                acc[cur.zone] = JSON.stringify(cur.map);
                return acc;
            }, {}),
        };

        this.sendMessage(ws, 'player_data', playerData);
    }

    private parseCookies(cookieHeader: string): Record<string, string> {
        const cookies: Record<string, string> = {};
        if (!cookieHeader) return cookies;

        cookieHeader.split(';').forEach(cookie => {
            const [name, value] = cookie.trim().split('=');
            if (name && value) {
                cookies[name] = decodeURIComponent(value);
            }
        });

        return cookies;
    }

    private setupWebSocketHandlers(): void {
        this.wss.on('connection', async (ws: WebSocket, request: any) => {
            try {
                // Extract cookies from the request headers
                const cookieHeader = request.headers.cookie;
                const cookies = this.parseCookies(cookieHeader);

                // console.log('Cookies received:', cookies);

                // // Authenticate the connection
                // if (!cookies.jwt) {
                //     console.log('No JWT found in connection, closing');
                //     ws.close(1008, 'Invalid authentication token');
                //     return;
                // }

                // const authResult = await auth.verifyJWT({ jwt: cookies.jwt });
                // if (!authResult.valid) {
                //     console.log('Invalid JWT during connection');
                //     ws.close(1008, 'Invalid authentication token');
                //     return;
                // }

                // const { sub } = jwtDecode(cookies.jwt);
                // if (!sub) {
                //     console.log('No sub found in JWT');
                //     ws.close(1008, 'Invalid authentication token');
                //     return;
                // }

                // await new Promise(resolve => setTimeout(resolve, 5000));
                const sub = '0x5D41a675D54E8b15ae7988cbAb68d04588C252aF';
                // Connect to database and find player
                await dbConnect();
                const player = await Players.findOne({ address: sub }, { connectionId: 1, lastConnectedAt: 1, address: 1 });
                if (!player) {
                    console.log('Player not found for address:', sub);
                    ws.close(1008, 'Player not found');
                    return;
                }

                const clientId = CryptoUtils.generateUniqueId();

                // If there's an existing connection for this address, terminate the old one and proceed
                const existingEntry = Array.from(this.clients.entries()).find(([_, c]) => c.address === sub);
                if (existingEntry) {
                    const [oldWs, oldClient] = existingEntry;
                    console.log('Existing session found for address, terminating old session:', sub, oldClient.id);
                    try {
                        oldWs.terminate();
                    } catch (e) {
                        console.warn('Error terminating old websocket for', sub, e);
                    }
                    this.clients.delete(oldWs);
                    // Best-effort DB cleanup for old connectionId
                    try {
                        await Players.updateOne({ connectionId: oldClient.id }, { $set: { connectionId: null, lastConnectedAt: null } });
                    } catch (e) {
                        console.warn('Error cleaning previous connectionId for', sub, e);
                    }
                }

                const clientData: ClientData = {
                    id: clientId,
                    address: sub,
                    isAlive: true,
                    lastPong: Date.now(),
                };

                this.clients.set(ws, clientData);
                console.log('Client connected:', clientId, 'for address:', sub);

                // Update player connection info
                player.lastConnectedAt = new Date();
                player.connectionId = clientId;
                await player.save();

                await this.handlePlayerData(ws, sub);

                // Handle incoming messages
                ws.on('message', (data: Buffer) => {
                    try {
                        const message: WebSocketMessage = JSON.parse(data.toString());
                        this.handleMessage(ws, message);
                    } catch (error) {
                        console.error('Error parsing message:', error);
                        this.sendMessage(ws, 'error', { message: 'Invalid message format' });
                    }
                });

                // Handle pong frames (built-in WebSocket ping/pong)
                ws.on('pong', () => {
                    if (clientData) {
                        clientData.lastPong = Date.now();
                        clientData.isAlive = true;
                    }
                });

                // Handle disconnection
                ws.on('close', async (code: number, reason: Buffer) => {
                    console.log(`Client ${clientId} disconnected. Code: ${code}, Reason: ${reason.toString()}`);
                    await this.cleanupConnection(ws, `ws close (code=${code})`);
                });

                // Handle WebSocket errors
                ws.on('error', async (error: Error) => {
                    console.error(`WebSocket error for client ${clientId}:`, error);
                    await this.cleanupConnection(ws, 'ws error');
                });

            } catch (error) {
                console.error('Error handling connection:', error);
                ws.close(1011, 'Internal server error during connection');
            }
        });
    }

    private startPingInterval(): void {
        this.pingInterval = setInterval(() => {
            const now = Date.now();
            console.log(`Pinging ${this.clients.size} clients...`);

            this.clients.forEach((clientData, ws) => {
                if (ws.readyState !== WebSocket.OPEN) {
                    return;
                }

                const timeSinceLastPong = now - clientData.lastPong;
                if (timeSinceLastPong > this.config.pongTimeout) {
                    console.log(`Client ${clientData.id} timed out (${timeSinceLastPong}ms since last pong). Terminating.`);
                    try {
                        ws.terminate();
                    } catch (e) {
                        console.warn('Error terminating timed-out websocket:', e);
                    }
                    // Cleanup will be handled by 'close' event if emitted; add safety cleanup as well
                    this.cleanupConnection(ws, 'pong timeout');
                    return;
                }

                // Send ping using built-in WebSocket ping
                try {
                    clientData.isAlive = false;
                    ws.ping();
                } catch (e) {
                    console.warn('Error sending ping:', e);
                }

                // Also send application-level ping (optional UI heartbeat)
                this.sendMessage(ws, 'ping', { timestamp: now });
            });
        }, this.config.pingInterval);
    }

    start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.config.port, (error?: Error) => {
                if (error) {
                    reject(error);
                } else {
                    console.log(`WebSocket server started on port ${this.config.port}`);
                    console.log(`Ping interval: ${this.config.pingInterval}ms`);
                    console.log(`Pong timeout: ${this.config.pongTimeout}ms`);
                    resolve();
                }
            });
        });
    }

    stop(): Promise<void> {
        return new Promise((resolve) => {
            console.log('Stopping WebSocket server...');

            // Clear ping interval
            if (this.pingInterval) {
                clearInterval(this.pingInterval);
                this.pingInterval = null;
            }

            // Close all client connections
            this.clients.forEach((clientData, ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.close(1000, 'Server shutting down');
                }
            });
            this.clients.clear();

            // Close WebSocket server
            this.wss.close((error) => {
                if (error) {
                    console.error('Error closing WebSocket server:', error);
                } else {
                    console.log('WebSocket server closed');
                }

                // Close HTTP server
                this.server.close((error) => {
                    if (error) {
                        console.error('Error closing HTTP server:', error);
                    } else {
                        console.log('HTTP server closed');
                    }
                    console.log('WebSocket server stopped completely');
                    resolve();
                });
            });
        });
    }

    getClientCount(): number {
        return this.clients.size;
    }

    getClients(): ClientData[] {
        return Array.from(this.clients.values());
    }

    broadcastMessage(type: string, data?: any): void {
        this.broadcast(type, data);
    }

    // Message handler methods migrated from handlers/websocket.ts
    private async handleLifeUpdate(ws: WebSocket, address: string, lifeUpdateData: LifeUpdateData): Promise<void> {
        // Verificar se o player morreu nos últimos 10 segundos
        const deathCheck = await this.checkRecentDeath(address);
        if (deathCheck.hasRecentDeath) {
            console.log(`Player ${address} died recently, skipping life update. Must wait ${deathCheck.timeToWait}ms more.`);
            this.sendMessage(ws, 'life_update', {
                message: 'death_too_recent',
                timeToWait: deathCheck.timeToWait
            });
            return;
        }

        const playerToUpdate = await Players.findOne({ address });
        playerToUpdate.life -= Math.trunc(lifeUpdateData.life);
        await playerToUpdate.save();

        this.sendMessage(ws, 'life_update', { message: 'success' });
    }

    private async handleEnergyUpdate(ws: WebSocket, address: string, energyUpdateData: EnergyUpdateData): Promise<void> {
        if (energyUpdateData.energy > 0) {
            const player = await Players.findOne({ address }, { connectionId: 1, energy: 1, position: 1 });
            player.energy = Math.trunc(energyUpdateData.energy);
            player.life = Math.trunc(energyUpdateData.life);
            if (energyUpdateData.x !== undefined && energyUpdateData.y !== undefined) {
                player.position.x = energyUpdateData.x;
                player.position.y = energyUpdateData.y;
            }

            const oreTypes = {
                1: 'Coal',
                2: 'Copper',
                3: 'Silver',
                4: 'Gold',
                5: 'Emerald',
                6: 'Sapphire',
                7: 'Mythril',
                8: 'Adamantium',
                9: 'Crownite'
            };

            // Process all zones efficiently
            const zones = ['z1s1', 'z1s2', 'z2s1', 'z2s2', 'z3s1', 'z3s2', 'z4s1', 'z4s2', 'z5s1', 'z5s2'];
            const zoneUpdates: Array<{ zone: string; tileIndices: number[] }> = [];

            // Collect all zones that have updates
            zones.forEach(zone => {
                const rawTileIndices = energyUpdateData[zone as keyof EnergyUpdateData] as number[];
                if (Array.isArray(rawTileIndices) && rawTileIndices.length > 0) {
                    // Sanitize indices: keep only integers and non-negative numbers
                    const tileIndices = rawTileIndices
                        .map((idx) => Number(idx))
                        .filter((idx) => Number.isInteger(idx) && idx >= 0);
                    if (tileIndices.length > 0) {
                        zoneUpdates.push({ zone, tileIndices });
                    }
                }
            });

            // Process all zones in parallel if there are updates
            if (zoneUpdates.length > 0) {
                // Batch fetch all required maps in a single query
                const zoneNames = zoneUpdates.map(z => z.zone);
                const allMaps = await GameMap.find({
                    address,
                    zone: { $in: zoneNames }
                }, { zone: 1, map: 1 });

                // Create a map for quick lookup
                const mapsByZone = allMaps.reduce((acc, map) => {
                    acc[map.zone] = map.map || [];
                    return acc;
                }, {} as Record<string, number[]>);

                const allOreUpdates: Record<string, number> = {};
                const mapUpdates: Array<{ zone: string; mapSet: Record<string, number> }> = [];

                // Process each zone using the pre-fetched data
                for (const { zone, tileIndices } of zoneUpdates) {
                    const mapData = mapsByZone[zone] || [];

                    const oreUpdates: Record<string, number> = {};
                    const mapSet: Record<string, number> = {};

                    // Process each tile index
                    tileIndices.forEach((tileIndex: number) => {
                        // Guard against out-of-bounds indices before reading or writing
                        if (!Number.isInteger(tileIndex) || tileIndex < 0 || tileIndex >= mapData.length) {
                            return;
                        }

                        const tileValue = mapData[tileIndex];
                        if (tileValue >= 1 && tileValue <= 9) {
                            const oreType = oreTypes[tileValue as keyof typeof oreTypes];
                            oreUpdates[`ores.${oreType}`] = (oreUpdates[`ores.${oreType}`] || 0) + 1;
                        }
                        mapSet[`map.${tileIndex}`] = 0;
                    });

                    // Accumulate ore updates
                    Object.keys(oreUpdates).forEach(key => {
                        allOreUpdates[key] = (allOreUpdates[key] || 0) + oreUpdates[key];
                    });

                    // Collect map updates
                    if (Object.keys(mapSet).length > 0) {
                        mapUpdates.push({ zone, mapSet });
                    }
                }

                // Batch all database operations
                const dbOperations: Promise<any>[] = [];

                // Add player ore update if needed
                if (Object.keys(allOreUpdates).length > 0) {
                    dbOperations.push(Players.updateOne({ address }, { $inc: allOreUpdates }));
                }

                // Add map updates
                mapUpdates.forEach(({ zone, mapSet }) => {
                    dbOperations.push(GameMap.updateOne({ address, zone }, { $set: mapSet }));
                });

                // Add player save (energy and position updates)
                dbOperations.push(player.save());

                // Execute all operations in parallel
                await Promise.all(dbOperations);
            } else {
                // Only save player if no zone updates
                await player.save();
            }
        }

        this.sendMessage(ws, 'energy_update', { message: 'success' });
    }

    private async handleDeathUpdate(ws: WebSocket, address: string, deathUpdateData: DeathUpdateData): Promise<void> {
        // Verificar se o player morreu nos últimos 10 segundos
        const deathCheck = await this.checkRecentDeath(address);
        if (deathCheck.hasRecentDeath) {
            console.log(`Player ${address} died recently, skipping death update. Must wait ${deathCheck.timeToWait}ms more.`);
            return;
        }

        const SHORT_EQUIPPED_TYPES = {
            HELMET: 0,
            JETPACK: 3,
        } as const;
        const equippedItems = [
            { "contractAddress": "0x0165878A594ca255338adfa4d48449f69242Eb8F", "tokenId": BigInt("0") },
            { "contractAddress": "0x0165878A594ca255338adfa4d48449f69242Eb8F", "tokenId": BigInt("5") },
        ];

        console.log('handleDeathUpdate', JSON.stringify(equippedItems, bigIntReplacer, 2));

        const equippedItemsData = equippedItems.map((equippedItem, index) => {
            const tokenId = equippedItem.tokenId;
            const contractAddress = equippedItem.contractAddress;
            if (contractAddress === ZERO_ADDRESS && tokenId === BigInt(0)) {
                return null;
            }

            return {
                tokenId: formatTokenId(tokenId),
                category: index === 6 ? NftsCategory.relics : NftsCategory.equipments,
            };
        }).filter(Boolean) as EquippedItemData[];

        const allMetadata = equippedItemsData.length > 0 ? await Nfts.find({
            $or: equippedItemsData.map(({ tokenId, category }) => ({ tokenId, category }))
        }) : [];

        const equipments = allMetadata.reduce((acc: any, cur: any) => {
            const category = cur.metadata.attributes.find((attr: any) => attr.trait_type === "Category")?.value.toLowerCase();
            const regex = new RegExp(`\/equipments\/${category}s\/(.+)\.png`);
            const equipment = cur.metadata.image.match(regex);
            if (equipment) {
                acc[category] = `${category}-${equipment[1].replace(/-[a|b|c|s]$/, '')}`;
            }
            if (category === 'jetpack') {
                const energy = cur.metadata.attributes.find((attr: any) => attr.trait_type === "Energy")?.value;
                acc.maxEnergy = energy;
            }
            if (category === 'helmet') {
                const life = cur.metadata.attributes.find((attr: any) => attr.trait_type === "Health")?.value;
                acc.maxLife = life;
            }
            return acc;
        }, {
            maxLife: COMMON_HEALTH,
            maxEnergy: COMMON_ENERGY,
        });

        await Players.updateOne({ address }, {
            $push: {
                deaths: new Date()
            },
            $set: {
                life: equipments.maxLife || COMMON_HEALTH,
                energy: equipments.maxEnergy || COMMON_ENERGY,
                minerPoints: 0,
                ores: {
                    Coal: 0,
                    Copper: 0,
                    Silver: 0,
                    Gold: 0,
                    Emerald: 0,
                    Sapphire: 0,
                    Mythril: 0,
                    Adamantium: 0,
                    Crownite: 0,
                },
                items: {
                    energyDrink: 0,
                    teleportPill: 0,
                    fireResistancePotion: 0,
                    bomb: 0,
                    medkit: 0,
                },
                mapCreatedAt: null,
            }
        });
        this.sendMessage(ws, 'death_update', { message: 'success' });
    }

    private async handleTilemapCreate(ws: WebSocket, address: string, message: TilemapCreateData): Promise<void> {
        try {
            await Promise.all([
                GameMap.updateOne({ address, zone: message.name }, { $set: { map: JSON.parse(message.tilemap) } }, { upsert: true }),
                Players.updateOne({ address }, { $set: { mapCreatedAt: new Date() } })
            ]);
            this.sendMessage(ws, 'tilemap_create', { message: 'success' });
        } catch (error) {
            this.sendMessage(ws, 'tilemap_create', { message: 'error' });
        }
    }

    private async handleSaveTilemap(ws: WebSocket, address: string, message: SaveTilemapData): Promise<void> {
        try {
            const safeIndex = Number(message.tileIndex);
            if (!Number.isInteger(safeIndex) || safeIndex < 0) {
                this.sendMessage(ws, 'error', { message: 'Invalid tile index' });
                return;
            }

            await GameMap.updateOne({ address, zone: message.tilemapName }, { $set: { [`map.${safeIndex}`]: 0 } });
            this.sendMessage(ws, 'save_tilemap', { message: 'success' });
        } catch (error) {
            console.error('Error in handleSaveTilemap:', error);
            this.sendMessage(ws, 'error', { message: 'Failed to save tilemap' });
        }
    }

    private async handleMinedRock(ws: WebSocket, address: string, message: MinedRockData): Promise<void> {
        await Players.updateOne({ address }, { $inc: { [`ores.${message.rock}`]: 1 } });
    }

    private async handleSellOres(ws: WebSocket, address: string, message: SellOresData): Promise<void> {
        const player = await Players.findOne({ address }, { ores: 1 });
        const oreValues = {
            Coal: 60,
            Copper: 100,
            Silver: 200,
            Gold: 400,
            Emerald: 1000,
            Sapphire: 3200,
            Mythril: 9000,
            Adamantium: 21000,
            Crownite: 99999
        };

        const totalOreValue = Object.entries(player?.ores || {}).reduce((total, [oreType, count]) => {
            console.log(oreType, count, oreValues[oreType as keyof typeof oreValues]);
            return total + ((count as number) * (oreValues[oreType as keyof typeof oreValues] || 0));
        }, 0);

        await Players.updateOne({ address }, {
            $inc: { minerPoints: totalOreValue },
            $set: {
                ores: {
                    Coal: 0,
                    Copper: 0,
                    Silver: 0,
                    Gold: 0,
                    Emerald: 0,
                    Sapphire: 0,
                    Mythril: 0,
                    Adamantium: 0,
                    Crownite: 0,
                }
            }
        });

        this.sendMessage(ws, 'sell_ores', { message: 'success' });
    }

    private async handleHellyHeal(ws: WebSocket, address: string, message: HellyHealData): Promise<void> {
        await Players.updateOne({ address }, { $set: { life: message.currentLife, minerPoints: message.minerPoints } });
    }

    private async handleHellyRestoreEnergy(ws: WebSocket, address: string, message: HellyRestoreEnergyData): Promise<void> {
        await Players.updateOne({ address }, { $set: { energy: message.currentEnergy, minerPoints: message.minerPoints } });
    }

    private async handleDeleteOre(ws: WebSocket, address: string, message: DeleteOreData): Promise<void> {
        await Players.updateOne({ address }, { $set: { [`ores.${message.ore}`]: 0 } });
    }

    private async handleUseTeleport(ws: WebSocket, address: string, message: UseTeleportData): Promise<void> {
        await Players.updateOne({ address }, { $inc: { ['items.teleportPill']: -1 }, $set: { position: { x: message.positionX, y: message.positionY } } });
    }

    private async handleUseHeal(ws: WebSocket, address: string, message: UseHealData): Promise<void> {
        await Players.updateOne({ address }, { $inc: { ['items.medkit']: -1 }, $set: { life: message.currentLife } });
    }

    private async handleUseEnergy(ws: WebSocket, address: string, message: UseEnergyData): Promise<void> {
        await Players.updateOne({ address }, { $inc: { ['items.energyDrink']: -1 }, $set: { energy: message.currentEnergy } });
    }

    private async handleUseAntiFire(ws: WebSocket, address: string, message: UseAntiFireData): Promise<void> {
        await Players.updateOne({ address }, { $inc: { ['items.fireResistancePotion']: -1 } });
    }

    private async handleUseBomb(ws: WebSocket, address: string, message: UseBombData): Promise<void> {
        await Players.updateOne({ address }, { $inc: { ['items.bomb']: -1 } });
    }

    private async handleExplosiveTile(ws: WebSocket, address: string, message: ExplosiveTileData): Promise<void> {
        // No implementation needed currently
    }

    private async handleBuyItem(ws: WebSocket, address: string, message: BuyItemData): Promise<void> {
        await Players.updateOne({ address }, { $inc: { [`items.${message.item}`]: 1 }, $set: { minerPoints: message.minerPoints } });
        this.sendMessage(ws, 'buy_item', { message: 'success' });
    }

    private async handleAmazoniteConverted(ws: WebSocket, address: string, message: AmazoniteConvertedData): Promise<void> {
        const prices = [
            1000,
            2000,
            4000,
            8000,
            16000,
            32000,
            64000,
            128000,
            256000,
            512000,
        ];
        const amountConverted = [
            4,
            4,
            4,
            6,
            6,
            8,
            8,
            10,
            10,
            15
        ];

        const { buttonIndex, isVip, requestId } = message;

        const equippedRelic = {
            "contractAddress": "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
            "tokenId": BigInt("0")
        };

        console.log('equippedRelic', JSON.stringify(equippedRelic, bigIntReplacer, 2));


        let conversionValue = 0;
        if (equippedRelic && equippedRelic.contractAddress !== ZERO_ADDRESS) {
            console.log('ENTRA')
            const relicData = await Nfts.findOne({
                tokenId: formatTokenId(equippedRelic.tokenId), category: 'relics'
            });
            console.log(relicData)

            if (relicData) {
                conversionValue = relicData.metadata.attributes.find((attr: any) => attr.trait_type === "Amazonite Conversion")?.value || 0;
                console.log('conversionValue', conversionValue)
            }
        }


        const subscription = await SubscriptionModel.findOne({ address, endDate: { $gte: new Date() } });
        if (isVip && !subscription) {
            return;
        }

        const converted = (isVip && !!subscription) ? 'vipAmazoniteConverted' : 'amazoniteConverted';
        const player = await Players.findOne({ address }, { minerPoints: 1, [converted]: 1 });
        if (!player?.minerPoints) {
            return;
        }

        if (!prices[buttonIndex] || !amountConverted[buttonIndex]) {
            return;
        }

        if (prices[buttonIndex] > player.minerPoints) {
            return;
        }

        const convertedCount = player?.[converted]?.filter((date: Date) => !isOldDate(date)).length || 0;
        if (convertedCount != buttonIndex) {
            return;
        }

        const newAmazonites = conversionValue ? ((amountConverted[buttonIndex] * (conversionValue + 100)) / 100) : amountConverted[buttonIndex];
        console.log('newAmazonites', newAmazonites);

        await Players.updateOne({ address }, {
            $inc: { minerPoints: -prices[buttonIndex], amazonites: newAmazonites },
            $push: { [`${converted}`]: new Date() }
        }).then(async () => {
            console.log('amazonite_success', address, buttonIndex, converted, new Date());
            this.sendMessage(ws, 'amazonite_success', { requestId });
            return
        }).catch((error) => {
            console.error('Error in handleAmazoniteConverted:', error);
            console.error('Error in handleAmazoniteConverted:', address, buttonIndex, converted, new Date());
        });
    }
}
