export type Account = {
    address: string,
    privateKey: string,
    newAddress: string,
    fireblocksVault: string,
    status: 'completed' | 'pending',
    updatedAt: string,
}
