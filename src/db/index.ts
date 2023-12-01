import { Pool, PoolConfig } from 'pg';
import { Account } from './types';
import { dLogger } from '../logger';

export class DB {
    private client;

    constructor(config: PoolConfig) {
        this.client = new Pool(config);
    }

    async readAll(): Promise<Account[]> {
        try {
            const result = await this.client.query<Account>('SELECT * FROM accounts');
            return result.rows.map(row => this.buildResponse(row));
        } catch (error) {
            dLogger.error('DB:readAll', `Error while trying to read: ${error}`);
            return [];
        }
    }

    async readPending(): Promise<Account[]> {
        try {
            const result = await this.client.query<Account>(`SELECT * FROM accounts WHERE status = 'pending'`);
            return result.rows.map(row => this.buildResponse(row));
        } catch (error) {
            dLogger.error('DB:readPending', `Error while trying to read: ${error}`);
            return [];
        }
    }

    async readByAccount(address: string): Promise<Account[]> {
        try {
            const result = await this.client.query<Account>(`SELECT * FROM accounts WHERE address = '${address}'`);
            return result.rows.map(row => this.buildResponse(row));
        } catch (error) {
            dLogger.error('DB:readByAccount', `Error while trying to read: ${error}`);
            return [];
        }
    }

    async getCurrentVaultId(): Promise<number> {
        try {
            const result = await this.client.query<{current_vault_id: number}>(`SELECT MAX(vault_id) AS current_vault_id FROM accounts`);
            return result.rows[0].current_vault_id;
        } catch (error) {
            dLogger.error('DB:getCurrentVaultId', `Error while trying to read: ${error}`);
            return 0;
        }
    }

    async update(address: string, data: Partial<Account>) {
        try {
            const query = `
                UPDATE accounts
                SET 
                    ${`address='${address}', `}
                    ${data?.privateKey ? `private_key='${data?.privateKey}', ` : ''}
                    ${data?.newAddress ? `new_address='${data?.newAddress}', ` : ''}
                    ${data?.fireblocksVault ? `fireblocks_vault='${data?.fireblocksVault}', ` : ''}
                    ${data?.vaultId ? `vault_id='${data?.vaultId}', ` : ''}
                    ${data?.status ? `status='${data?.status}', ` : ''}

                    ${data?.claim_timestamp ? `claim_timestamp='${data?.claim_timestamp}', ` : ''}
                    ${data?.claim_signature ? `claim_signature='${data?.claim_signature}', ` : ''}
                    ${data?.claim_token_ids ? `claim_token_ids='${data?.claim_token_ids}', ` : ''}
                    ${data?.claim_txn_id ? `claim_txn_id='${data?.claim_txn_id}', ` : ''}
                    
                    ${`updated_at='${(new Date()).toISOString()}'`}    
                WHERE address = '${address}'
            `;
            const result = await this.client.query<Account>(query);
            return result.rows.map(row => this.buildResponse(row));
        } catch (error) {
            dLogger.error('DB:update', `Error while trying to update: ${error}`);
            return undefined;
        }
    }

    async insert(data: Account) {
        try {
            const result = await this.client.query<Account>(`
                INSERT INTO accounts 
                (address, private_key, new_address, fireblocks_vault, vault_id, status, updated_at)
                VALUES ('${data.address}', '${data.privateKey}', '${data.newAddress}', '${data.fireblocksVault}', 
                    '${data.vaultId}', '${data.status}', '${(new Date()).toISOString()}')`
            );
            return result.rows.map(row => this.buildResponse(row));
        } catch (error) {
            dLogger.error('DB:insert', `Error while trying to insert: ${error}`);
            return undefined;
        }
    }

    async close() {
        this.client.end().then(() => dLogger.info('DB:close', 'DB connection closed.'));
    }

    buildResponse(accountRecord: any): Account {
        return {
            address: accountRecord.address,
            privateKey: accountRecord.private_key,
            newAddress: accountRecord.new_address,
            fireblocksVault: accountRecord.fireblocks_vault,
            vaultId: accountRecord.vault_id,
            status: accountRecord.status,
            updatedAt: accountRecord.updated_at
        }
    }
}
