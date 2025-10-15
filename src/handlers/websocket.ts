import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { WebSocketMessage, LifeUpdateData, EnergyUpdateData, DeathUpdateData, TilemapCreateData, SaveTilemapData, MinedRockData, SellOresData, EquippedItemData, HellyHealData, HellyRestoreEnergyData, DeleteOreData, BuyItemData, UseTeleportData, UseAntiFireData, UseBombData, UseHealData, UseEnergyData, ExplosiveTileData, AmazoniteConvertedData } from '../types';
import { sendMessage } from './shared';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env.local first, then .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();
import dbConnect from '../libs/mongodb/client';
import Players from '../models/Player';
import SubscriptionModel from '../models/SubscriptionModel';
import { isOldDate } from '../utils';
import { COMMON_ENERGY, COMMON_HEALTH, COMMON_WEIGHT, EQUIPPED_TYPES, formatTokenId } from '../utils/consts';
import { ZERO_ADDRESS } from '../utils/consts';
import { readContract } from 'thirdweb';
import { equipmentsManagerContract } from '../contracts/EquipmentsManager';
import Nfts, { NftsCategory } from '../models/Nfts';
import GameMap from '../models/GameMap';

// Handle player update
const handleLifeUpdate = async (connectionId: string, address: string, endpoint: string, lifeUpdateData: LifeUpdateData): Promise<void> => {
    // Verificar se o player morreu nos últimos 10 segundos
    const player = await Players.findOne({ address }, { deaths: 1, address: 1 });
    if (player && player.deaths && player.deaths.length > 0) {
        const lastDeath = player.deaths[player.deaths.length - 1];
        const tenSecondsAgo = new Date(Date.now() - 10000); // 10 segundos atrás

        if (lastDeath > tenSecondsAgo) {
            console.log(`Player ${address} died recently, skipping life update`);
            sendMessage(connectionId, 'life_update', endpoint, { message: 'death_too_recent' });
            return;
        }
    }

    const playerToUpdate = await Players.findOne({ address });
    playerToUpdate.life -= Math.trunc(lifeUpdateData.life);
    await playerToUpdate.save();

    sendMessage(connectionId, 'life_update', endpoint, { message: 'success' });
};

const handleEnergyUpdate = async (connectionId: string, address: string, endpoint: string, energyUpdateData: EnergyUpdateData,): Promise<void> => {
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
            const tileIndices = energyUpdateData[zone as keyof EnergyUpdateData] as number[];
            if (tileIndices && tileIndices.length > 0) {
                zoneUpdates.push({ zone, tileIndices });
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

    sendMessage(connectionId, 'energy_update', endpoint, { message: 'success' });
};

const handleDeathUpdate = async (connectionId: string, address: string, endpoint: string, deathUpdateData: DeathUpdateData): Promise<void> => {
    const player = await Players.findOne({ address }, { deaths: 1, address: 1 });

    // Verificar se o player morreu nos últimos 10 segundos
    if (player && player.deaths && player.deaths.length > 0) {
        const lastDeath = player.deaths[player.deaths.length - 1];
        const tenSecondsAgo = new Date(Date.now() - 10000); // 10 segundos atrás

        if (lastDeath > tenSecondsAgo) {
            console.log(`Player ${address} died recently (${lastDeath}), skipping death update`);
            return;
        }
    }

    const SHORT_EQUIPPED_TYPES = {
        HELMET: 0,
        JETPACK: 3,
    } as const;
    const equippedItems = await Promise.all(
        Object.values(SHORT_EQUIPPED_TYPES).map(equipType =>
            readContract({
                contract: equipmentsManagerContract,
                method: "getUserEquippedItem",
                params: [address, equipType],
            })
        )
    );

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
    sendMessage(connectionId, 'death_update', endpoint, { message: 'success' });
}

const handlePlayerData = async (connectionId: string, address: string, endpoint: string): Promise<void> => {
    const [player, subscription, maps] = await Promise.all([
        Players.findOne({ address }),
        SubscriptionModel.findOne({ address, endDate: { $gt: new Date() } }),
        GameMap.find({ address })
    ]);

    const equippedItems = await Promise.all(
        Object.values(EQUIPPED_TYPES).map(equipType =>
            readContract({
                contract: equipmentsManagerContract,
                method: "getUserEquippedItem",
                params: [address, equipType],
            })
        )
    );

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
        if (cur.category === NftsCategory.relics) {
            const relic = cur.metadata.image.match(/\/relics\/(.+)\.png/);
            if (relic) {
                acc.relic = relic[1];
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
    });

    // const deaths = player?.deaths.filter((date: Date) => !isOldDate(date)).length || 0;
    const playerData = {
        isVip: true || !!subscription,
        deaths: 0,
        life: player?.life || COMMON_HEALTH,
        energy: player?.energy || COMMON_ENERGY,
        maxLife: equipments.maxLife,
        maxEnergy: equipments.maxEnergy,
        maxLbs: equipments.maxWeight,
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

    await sendMessage(connectionId, 'player_data', endpoint, playerData);
}

const handleTilemapCreate = async (connectionId: string, address: string, endpoint: string, message: TilemapCreateData): Promise<void> => {
    try {
        await Promise.all([
            GameMap.updateOne({ address, zone: message.name }, { $set: { map: JSON.parse(message.tilemap) } }, { upsert: true }),
            Players.updateOne({ address }, { $set: { mapCreatedAt: new Date() } })
        ]);
        sendMessage(connectionId, 'tilemap_create', endpoint, { message: 'success' });
    } catch (error) {
        await sendMessage(connectionId, 'tilemap_create', endpoint, { message: 'error' });
    }
}

const handleSaveTilemap = async (connectionId: string, address: string, endpoint: string, message: SaveTilemapData): Promise<void> => {
    try {
        await GameMap.updateOne({ address, zone: message.tilemapName }, { $set: { [`map.${message.tileIndex}`]: 0 } });


        sendMessage(connectionId, 'save_tilemap', endpoint, { message: 'success' });
    } catch (error) {
        console.error('Error in handleSaveTilemap:', error);
        await sendMessage(connectionId, 'error', endpoint, { message: 'Failed to save tilemap' });
    }
}

const handleMinedRock = async (connectionId: string, address: string, endpoint: string, message: MinedRockData): Promise<void> => {
    await Players.updateOne({ address }, { $inc: { [`ores.${message.rock}`]: 1 } });
}

const handleSellOres = async (connectionId: string, address: string, endpoint: string, message: SellOresData): Promise<void> => {
    const player = await Players.findOne({ address }, { minerPoints: 1, ores: 1 });
    const ores = player?.ores;

    // Calculate the total value of ores based on their individual values
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

    // Calculate total value from ores
    const totalOreValue = Object.entries(ores || {}).reduce((total, [oreType, count]) => {
        console.log(oreType, count, oreValues[oreType as keyof typeof oreValues]);
        return total + ((count as number) * (oreValues[oreType as keyof typeof oreValues] || 0));
    }, 0);

    // Add the ore value to minerPoints and reset all ores to 0
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

    sendMessage(connectionId, 'sell_ores', endpoint, { message: 'success' });
}

const handleHellyHeal = async (connectionId: string, address: string, endpoint: string, message: HellyHealData): Promise<void> => {
    await Players.updateOne({ address }, { $set: { life: message.currentLife, minerPoints: message.minerPoints } });
}

const handleHellyRestoreEnergy = async (connectionId: string, address: string, endpoint: string, message: HellyRestoreEnergyData): Promise<void> => {
    await Players.updateOne({ address }, { $set: { energy: message.currentEnergy, minerPoints: message.minerPoints } });
}

const handleDeleteOre = async (connectionId: string, address: string, endpoint: string, message: DeleteOreData): Promise<void> => {
    await Players.updateOne({ address }, { $set: { [`ores.${message.ore}`]: 0 } });
}

const handleUseTeleport = async (connectionId: string, address: string, endpoint: string, message: UseTeleportData): Promise<void> => {
    await Players.updateOne({ address }, { $inc: { ['items.teleportPill']: -1 }, $set: { position: { x: message.positionX, y: message.positionY } } });
}

const handleUseHeal = async (connectionId: string, address: string, endpoint: string, message: UseHealData): Promise<void> => {
    await Players.updateOne({ address }, { $inc: { ['items.medkit']: -1 }, $set: { life: message.currentLife } });

}

const handleUseEnergy = async (connectionId: string, address: string, endpoint: string, message: UseEnergyData): Promise<void> => {
    await Players.updateOne({ address }, { $inc: { ['items.energyDrink']: -1 }, $set: { energy: message.currentEnergy } });
}

const handleUseAntiFire = async (connectionId: string, address: string, endpoint: string, message: UseAntiFireData): Promise<void> => {
    await Players.updateOne({ address }, { $inc: { ['items.fireResistancePotion']: -1 } });
}

const handleUseBomb = async (connectionId: string, address: string, endpoint: string, message: UseBombData): Promise<void> => {
    await Players.updateOne({ address }, { $inc: { ['items.bomb']: -1 } });
}

const handleExplosiveTile = async (connectionId: string, address: string, endpoint: string, message: ExplosiveTileData): Promise<void> => {
}


const handleBuyItem = async (connectionId: string, address: string, endpoint: string, message: BuyItemData): Promise<void> => {
    await Players.updateOne({ address }, { $inc: { [`items.${message.item}`]: 1 }, $set: { minerPoints: message.minerPoints } });

    sendMessage(connectionId, 'buy_item', endpoint, { message: 'success' });
}

const handleAmazoniteConverted = async (connectionId: string, address: string, endpoint: string, message: AmazoniteConvertedData): Promise<void> => {
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
    // return;
    const { buttonIndex, isVip, requestId } = message;

    const converted = isVip ? 'vipAmazoniteConverted' : 'amazoniteConverted';
    const player = await Players.findOne({ address }, { minerPoints: 1, [converted]: 1 });
    if (prices[buttonIndex] > player?.minerPoints) {
        return;
    }
    const convertedCount = player?.[converted]?.filter((date: Date) => !isOldDate(date)).length || 0;
    if (convertedCount != buttonIndex) {
        return;
    }

    await Players.updateOne({ address }, {
        $inc: { minerPoints: -prices[buttonIndex], amazonites: amountConverted[buttonIndex] },
        $push: { [`${converted}`]: new Date() }
    }).then(async () => {
        await sendMessage(connectionId, 'amazonite_success', endpoint, { requestId });
        return
    }).catch((error) => {
        console.error('Error in handleAmazoniteConverted:', error);
        console.error('Error in handleAmazoniteConverted:', address, buttonIndex, converted, new Date());
    });

}


// Handle incoming messages
const handleMessage = async (connectionId: string, message: WebSocketMessage, endpoint: string): Promise<void> => {
    await dbConnect();
    const player = await Players.findOne({ connectionId }, { address: 1 });
    if (!player) {
        console.log(`No player found for connectionId: ${connectionId}, cleaning up`);
        await Players.updateOne({ connectionId }, { $set: { connectionId: null } });
        return;
    }
    console.log(message);

    switch (message.type) {
        case 'player_data':
            await handlePlayerData(connectionId, player.address, endpoint);
            break;

        case 'life_update':
            await handleLifeUpdate(connectionId, player.address, endpoint, message as LifeUpdateData);
            break;

        case 'energy_update':
            await handleEnergyUpdate(connectionId, player.address, endpoint, message as EnergyUpdateData);
            break;

        case 'death_update':
            await handleDeathUpdate(connectionId, player.address, endpoint, message as DeathUpdateData);
            break;

        case 'tilemap_create':
            await handleTilemapCreate(connectionId, player.address, endpoint, message as TilemapCreateData);
            break;

        case 'save_tilemap':
            await handleSaveTilemap(connectionId, player.address, endpoint, message as SaveTilemapData);
            break;

        case 'mined_rock':
            await handleMinedRock(connectionId, player.address, endpoint, message as MinedRockData);
            break;

        case 'sell_ores':
            await handleSellOres(connectionId, player.address, endpoint, message as SellOresData);
            break;

        case 'helly_heal':
            await handleHellyHeal(connectionId, player.address, endpoint, message as HellyHealData);
            break;

        case 'helly_restore_energy':
            await handleHellyRestoreEnergy(connectionId, player.address, endpoint, message as HellyRestoreEnergyData);
            break;

        case 'delete_ore':
            await handleDeleteOre(connectionId, player.address, endpoint, message as DeleteOreData);
            break;

        case 'use_teleport':
            await handleUseTeleport(connectionId, player.address, endpoint, message as UseTeleportData);
            break;

        case 'use_heal':
            await handleUseHeal(connectionId, player.address, endpoint, message as UseHealData);
            break;

        case 'use_energy':
            await handleUseEnergy(connectionId, player.address, endpoint, message as UseEnergyData);
            break;

        case 'use_anti_fire':
            await handleUseAntiFire(connectionId, player.address, endpoint, message as UseAntiFireData);
            break;

        case 'use_bomb':
            await handleUseBomb(connectionId, player.address, endpoint, message as UseBombData);
            break;

        case 'buy_item':
            await handleBuyItem(connectionId, player.address, endpoint, message as BuyItemData);
            break;

        case 'explosive_tile':
            await handleExplosiveTile(connectionId, player.address, endpoint, message as ExplosiveTileData);
            break;

        case 'convert_amazonite':
            console.log('========================================');
            console.log('convert_amazonite', message);
            console.log('========================================');
            await handleAmazoniteConverted(connectionId, player.address, endpoint, message as AmazoniteConvertedData);
            break;

        case 'ping':
            await sendMessage(connectionId, 'pong', endpoint, { timestamp: Date.now() });
            break;

        case 'pong':
            break;

        default:
            console.log('Unknown message type:', message.type);
            await sendMessage(connectionId, 'error', endpoint, { message: `Unknown message type: ${message.type}` });
    }
};

// Lambda handler for WebSocket message events
export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    const connectionId = event.requestContext.connectionId!;
    const domainName = event.requestContext.domainName;
    const stage = event.requestContext.stage;
    const endpoint = `https://${domainName}/${stage}`;

    console.log('WebSocket connect event:', { connectionId });
    try {
        // Handle incoming messages
        if (event.body) {
            const message: WebSocketMessage = JSON.parse(event.body);
            await handleMessage(connectionId, message, endpoint);
        }

        return { statusCode: 200, body: 'Message processed' };

    } catch (error) {
        console.error('Error handling message event:', error);
        return { statusCode: 500, body: 'Internal server error' };
    }
}; 