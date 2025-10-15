export const isOldDate = (date: Date) => {
    const now = new Date();
    const today = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const oneDayAgo = new Date(today);
    oneDayAgo.setUTCDate(oneDayAgo.getUTCDate() - 1);

    const utcDate = new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return utcDate <= oneDayAgo;
}

/**
 * JSON stringify replacer function to handle BigInt serialization
 * Converts BigInt values to strings for JSON serialization
 */
export const bigIntReplacer = (key: string, value: any): any => {
    return typeof value === 'bigint' ? value.toString() : value;
}