export const DEFAULT_GAS_PRICE = BigInt(1e11); // 100 Gwei
export const DEFAULT_GAS_UNITS = BigInt(0) // 0
export const DEFAULT_BASE_FEE = BigInt(8e10) // 80 Gwei
export const DEFAULT_PRIORITY_FEE = BigInt(2e9) // 2 Gwei
export const PF_INCREASE = 21; // Percentage to increase above the current priority fee
export const MAX_RETRIES = 15; // Number of times to try sending a transaction
export const MAX_RETRIES_REFUND = 8; // Number of times to try sending the refund transaction

export const THREADS_COUNT = 2; // Max simultaneous threads for processing of accounts
export const WAIT_FOR_KNOTS_API = 10000; // Wait 