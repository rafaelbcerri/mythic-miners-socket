export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const EQUIPMENT_TYPE_NAMES = ['Helmet', 'Pickaxe', 'Armour', 'Jetpack', 'Belt', 'Trinket'] as const;
export const EQUIPPED_TYPES = {
    HELMET: 0,
    PICKAXE: 1,
    ARMOUR: 2,
    JETPACK: 3,
    BELT: 4,
    TRINKET: 5,
    RELIC: 6,
} as const;

export const formatTokenId = (id: bigint | undefined) => {
    return process.env.NODE_ENV === 'development' ? Number(id?.toString()) + 1000000 : Number(id?.toString())
}

export const COMMON_HEALTH = 45;
export const COMMON_ENERGY = 130;
export const COMMON_WEIGHT = 110;