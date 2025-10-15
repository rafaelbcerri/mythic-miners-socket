import { WebSocket } from 'ws';
import { NftsCategory } from '../models/Nfts';

export interface PlayerData {
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
    Coal: number;
    Copper: number;
    Silver: number;
    Gold: number;
    Emerald: number;
    Sapphire: number;
    Mythril: number;
    Adamantium: number;
    Crownite: number;
    buyedToday: number;
    vipBuyedToday: number;
}


export interface EquippedItemData {
    tokenId: number;
    equipmentType: number;
    equipmentSlot: string;
    contractAddress: string;
    isEquipped: boolean;
    category: NftsCategory;
}

export interface ClientData {
    id: string;
    playerData?: PlayerData;
    isAlive: boolean;
    lastPong: number;
    address?: string;
}

export interface LifeUpdateData {
    type: 'life_update';
    life: number;
}

export interface EnergyUpdateData {
    type: 'energy_update';
    energy: number;
    life: number;
    x?: number;
    y?: number;
    z1s1?: number[];
    z1s2?: number[];
    z2s1?: number[];
    z2s2?: number[];
    z3s1?: number[];
    z3s2?: number[];
    z4s1?: number[];
    z4s2?: number[];
    z5s1?: number[];
    z5s2?: number[];
}

export interface DeathUpdateData {
    type: 'death_update';
    death: Date;
}

export interface TilemapCreateData {
    type: 'tilemap_create';
    name: string;
    tilemap: string;
}

export interface MinedRockData {
    type: 'mined_rock';
    rock: string;
}

export interface SaveTilemapData {
    type: 'save_tilemap';
    tileIndex: number;
    tilemapName: string;
}

export interface SellOresData {
    type: 'sell_ores';
}

export interface HellyHealData {
    type: 'helly_heal';
    minerPoints: number;
    currentLife: number;
}

export interface HellyRestoreEnergyData {
    type: 'helly_restore_energy';
    minerPoints: number;
    currentEnergy: number;
}

export interface DeleteOreData {
    type: 'delete_ore';
    ore: string;
}

export interface BuyItemData {
    type: 'buy_item';
    item: string;
    minerPoints: number;
}

export interface UseTeleportData {
    type: 'use_teleport';
    positionX: number;
    positionY: number;
}

export interface UseHealData {
    type: 'use_heal';
    currentLife: number;
}

export interface UseEnergyData {
    type: 'use_energy';
    currentEnergy: number;
}

export interface UseAntiFireData {
    type: 'use_anti_fire';
}

export interface UseBombData {
    type: 'use_bomb';
}

export interface ExplosiveTileData {
    type: 'explosive_tile';
}

export interface AmazoniteConvertedData {
    type: 'convert_amazonite';
    isVip: boolean;
    buttonIndex: number;
    requestId: string;
}

export interface WebSocketMessage {
    type: 'player_data' |
    'life_update' |
    'energy_update' |
    'death_update' |
    'ping' |
    'pong' |
    'tilemap_create' |
    'save_tilemap' |
    'mined_rock' |
    'sell_ores' |
    'helly_heal' |
    'helly_restore_energy' |
    'delete_ore' |
    'buy_item' |
    'use_teleport' |
    'use_heal' |
    'use_energy' |
    'use_anti_fire' |
    'use_bomb' |
    'explosive_tile' |
    'convert_amazonite';
    data?: any;
}



export interface PlayerUpdateData {
    life: number;
    energy: number;
    minedRock?: any;
}

export interface WebSocketServerConfig {
    port: number;
    pingInterval: number;
    pongTimeout: number;
    perMessageDeflate?: {
        zlibDeflateOptions: {
            windowBits: number;
            memLevel: number;
        };
        zlibInflateOptions: {
            windowBits: number;
            memLevel: number;
        };
        clientNoContextTakeover: boolean;
        serverNoContextTakeover: boolean;
        serverMaxWindowBits: number;
        concurrencyLimit: number;
        threshold: number;
    };
} 