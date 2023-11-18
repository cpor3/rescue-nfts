export type Account = {
    address: string,
    privateKey: string,
    newAddress: string,
    fireblocksVault: string,
    vaultId: number,
    status: 'completed' | 'pending' | 'ignore',
    updatedAt: string,
}
