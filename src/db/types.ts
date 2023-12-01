export type Account = {
    address: string,
    privateKey: string,
    newAddress: string,
    fireblocksVault: string,
    vaultId: number,
    status: 'completed' | 'pending' | 'ignore',
    claim_timestamp?: string,
    claim_signature?: string,
    claim_token_ids?: string,
    claim_txn_id?: string,
    updatedAt: string,
}
