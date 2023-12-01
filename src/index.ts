import { Account } from "./db/types";
import { READ_ONLY, THREADS_COUNT } from "./constants";
import { FireblocksApi } from "./fireblocksApi";
import { Worker } from 'worker_threads';
import { ProcessConfig } from "./workers/process";
import { WorkerResponse } from "./workers/types";
import { dLogger } from './logger';
import { DB } from './db';
import { config } from 'dotenv';
import { Treasury } from "./utils";
import { InfuraProvider } from "ethers";
config();

async function main() {
    const provider = new InfuraProvider("matic");
    const treasury = Treasury.getInstance(provider, process.env.SAFE_WALLET_WALLET!);
    const db = new DB({
        connectionString: process.env.DB_CONNECTION_STRING
    });

    const getNonce = async () => {
        return await treasury.getNonce();
    }

    async function createWorker(config: ProcessConfig, account: Account): Promise<WorkerResponse> {
        return new Promise((resolve, reject) => {
            const worker = new Worker('./dist/src/workers/process.js', {
                workerData: {
                    config,
                    account
                },
                stdout: false
            });
            worker.on('message', async (message: string) => {
                switch (message) {
                    case 'accountCompleted':
                    case 'accountNotCompleted':
                        resolve({
                            account: account.address,
                            completed: message === 'accountCompleted'
                        });
                        break;
                    case 'getNonce':
                        const nonce = await getNonce();
                        worker.postMessage(nonce);
                        break;
                    default:
                        break;
                }
            });
            worker.on('error', error => {
                reject({
                    account: account.address,
                    error: error
                });
            });
        });
    }

    const createFireblocksVaultAndAsset = async(vaultName: string, originalAddress: string): Promise<string> => {
        const newVault = await fb.createVault(vaultName, false, originalAddress, true);
        if (!newVault) {
            dLogger.error('FB:createVault', 'Error creating Vault');
            return '';
        }

        const newAsset = await fb.createAsset(newVault.id, 'MATIC_POLYGON');
        if (!newAsset) {
            dLogger.error('FB:createAsset', 'Error creating MATIC wallet in the Vault');
            return '';
        }

        return newAsset.address;
    }
    
    const fb = new FireblocksApi;
    let currentVaultId: number;
    let pendingAccounts = await db.readPending();

    while (pendingAccounts.length) {
        dLogger.info('MAIN', `>>> Looping: There are ${pendingAccounts.length} pending accounts to be processed.`);
        const processes = [];
        currentVaultId = await db.getCurrentVaultId();

        for (let i=0; (i<pendingAccounts.length && i<THREADS_COUNT); i++) {
            // Create FB vault if needed
            if (!pendingAccounts[i].fireblocksVault) {
                currentVaultId++;
                dLogger.info('MAIN', `Creating new wallet on Fireblocks (vaultId: ${currentVaultId})...`);
                const newWallet = await createFireblocksVaultAndAsset(`Karmaverse-${currentVaultId}`, pendingAccounts[i].address);
                if (!newWallet) throw new Error('MAIN: Error while trying to create FB wallet');
                pendingAccounts[i].newAddress = newWallet;
                pendingAccounts[i].vaultId = currentVaultId;
                pendingAccounts[i].fireblocksVault = `Karmaverse-${currentVaultId}`;
                db.update(pendingAccounts[i].address, {
                    newAddress: newWallet,
                    vaultId: currentVaultId,
                    fireblocksVault: `Karmaverse-${currentVaultId}`
                })
            }
            // Dispatch thread
            const config: ProcessConfig = {
                readOnly: READ_ONLY ?? true,
                safeWalletPrivateKey: process.env.SAFE_WALLET_PK!,
                compromisedWalletPrivateKey: pendingAccounts[i].privateKey,
                toWalletAddress: pendingAccounts[i].newAddress,
                knotsDestination: process.env.KNOTS_RECEPTION_WALLET,
            };
            processes.push(createWorker(config, pendingAccounts[i]));
        }
        const promisesResults = await Promise.allSettled(processes);

        for (let i=0; i<promisesResults.length; i++) {
            if (promisesResults[i].status === 'fulfilled') {
                const fulfilledResult = promisesResults[i] as PromiseFulfilledResult<WorkerResponse> ;
                if (fulfilledResult.value.completed) {
                    await db.update(fulfilledResult.value.account, {
                        status: 'completed'
                    });
                }
            } else {
                const rejectedResult = promisesResults[i] as PromiseRejectedResult;
                dLogger.error('MAIN', `Error while processing account: ${JSON.stringify(rejectedResult)}`);
            }
        }
        pendingAccounts = await db.readPending();
    }

    dLogger.info('MAIN', `All accounts processed!`);
}

main();
