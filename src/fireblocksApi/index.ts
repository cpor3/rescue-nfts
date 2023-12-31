import { FireblocksSDK, PagedVaultAccountsRequestFilters, PeerType } from "fireblocks-sdk";
import { config } from 'dotenv';
import path from "path";
import fs from 'fs';
config();

export class FireblocksApi {
    private privateKey = fs.readFileSync(path.resolve(__dirname, "fireblocks_secret.key"), "utf8");
    sdk: FireblocksSDK;

    constructor() {
        this.sdk = new FireblocksSDK(this.privateKey, process.env.FIREBLOCKS_API_KEY!);
    }

    async getVaultInfo(id: string) {
        return await runSafely(async () => {
            const response = await this.sdk.getVaultAccountById(id);
            return response;
        }, 'Error while trying to get vault info');
    }

    async createVault(name: string, hidden?: boolean, ref?: string, autoFuel?: boolean, options?: any) {
        const response = await this.sdk.createVaultAccount(name, hidden, ref, autoFuel, options);
        return response;
    }

    async createAsset(vaultId: string, assetId: string, options?: any) {
        const response = await this.sdk.createVaultAsset(vaultId, assetId, options);
        return response;
    }

    async getGasStationSettings(asset?: string) {
        const response = await this.sdk.getGasStationInfo(asset ?? 'MATIC_POLYGON');
        return response;
    }

    async setGasStationSettings(min: string, max: string, maxGasPrice?: string, asset?: string) {
        const response = await this.sdk.setGasStationConfiguration(min, max, maxGasPrice, asset ?? 'MATIC_POLYGON');
        return response;
    }

    async getVaultId(vaultName: string) {
        const filter: PagedVaultAccountsRequestFilters = {
            limit: 500
        }
        const response = await this.sdk.getVaultAccountsWithPageInfo(filter);
        const vaultId = response.accounts.filter(vault => vault.name === vaultName)[0].id;
        return vaultId;
    }

    async transferMatic(sourceVaultId: string | number, destVaultId: string | number, amount: number) {
        const payload = {
            assetId: 'MATIC_POLYGON',
            amount: String(amount),
            source: {
                type: PeerType.VAULT_ACCOUNT,
                id: String(sourceVaultId)
            },
            destination: {
                type: PeerType.VAULT_ACCOUNT,
                id: String(destVaultId)
            },
            note: 'Automatic MATIC transfer from API'
        };
        const response = await this.sdk.createTransaction(payload);
        return response;
    }
}

async function runSafely(callback: (...args: any) => any, errorMessage: string) {
    try {
        const response = await callback();
        return response;
    } catch (error) {
        console.log(`${errorMessage}: ${error}`);
        return undefined;
    }
}