import { Account } from "./db/types";
import { THREADS_COUNT } from "./constants";
import { FireblocksApi } from "./fireblocksApi";
import { Worker } from 'worker_threads';
import { ProcessConfig } from "./workers/process";
import { WorkerResponse } from "./workers/types";
import { dLogger } from './logger';
import { DB } from './db';
import { config } from 'dotenv';
config();

const db = new DB({
    connectionString: process.env.DB_CONNECTION_STRING
});

async function createWorker(config: ProcessConfig, account: Account): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
        const worker = new Worker('./dist/src/workers/process.js', {
            workerData: {
                config,
                account
            },
            stdout: false
        });
        worker.on('message', accountIsCompleted => {
            resolve({
                account: account.address,
                completed: accountIsCompleted
            });
        });
        worker.on('error', error => {
            reject({
                account: account.address,
                error: error
            });
        });
    });
}

async function main() {
    dLogger.info('MAIN', `°°*** Initializing ***°°`);
    let pendingAccounts = await db.readPending();
    
    while (pendingAccounts.length) {
        const processes = [];
        dLogger.info('MAIN', `>>> Looping: There are ${pendingAccounts.length} pending accounts to be processed.`);

        for (let i=0; (i<pendingAccounts.length && i<THREADS_COUNT); i++) {
            // create FB vault if needed <---
            processes.push(createWorker({
                readOnly: false,
                safeWalletPrivateKey: process.env.SAFE_WALLET_PK!,
                compromisedWalletPrivateKey: pendingAccounts[i].privateKey,
                toWalletAddress: pendingAccounts[i].newAddress,
            }, pendingAccounts[i]));
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
                dLogger.error('MAIN', `Error while processing account: ${JSON.stringify(rejectedResult.reason)}`);
            }
        }
        pendingAccounts = await db.readPending();
    }

    dLogger.info('MAIN', `All accounts processed!`);
}
main();

async function createFireblocksVaultAndAsset(vaultName: string, originalAddress: string): Promise<string> {
    const fb = new FireblocksApi();

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

//// Execute all
// processAccount({
//     readOnly: false,
//     safeWalletPrivateKey: process.env.SAFE_WALLET_PK!,
//     compromisedWalletPrivateKey: process.env.COMPROMISED_WALLET_PK!,
//     toWalletAddress: process.env.FIREBLOCKS_SAFE_WALLET!,
//     claimFighters: true,
//     verifyKnots: true,
// });

//// Manual pre-claim input
// processAccount({
//     safeWalletPrivateKey: process.env.SAFE_WALLET_PK!,
//     compromisedWalletPrivateKey: process.env.COMPROMISED_WALLET_PK!,
//     toWalletAddress: process.env.FIREBLOCKS_SAFE_WALLET!,
//     verifyKnots: false,
//     manualPreClaimInput: {
//         success: true,
//         txId: "1008280781772079104",
//         timestamp: 1699628217,
//         signature: "0x2cfd6e9a30e6d5d372c6ae2134f1defb4f6ebdebf5a21899c4b4bd66c4449026417bf904e783154922428148e3e101f2544ee931ae9460ebab263d7f4190c39f1c",
//         tokenIds: [
//             21747, 21748,
//             21749, 21751,
//             21752, 21753,
//             23356, 21501,
//             33535
//         ],
//     }
// });

//// Manual NFTs input
// processAccount({
//     safeWalletPrivateKey: process.env.SAFE_WALLET_PK!,
//     compromisedWalletPrivateKey: process.env.COMPROMISED_WALLET_PK!,
//     toWalletAddress: process.env.FIREBLOCKS_SAFE_WALLET!,
//     verifyKnots: false,
//     manualTokenIds: [
//         21510, 21509
//     ]
// });

//// Transfer NFTs, get list from API
// processAccount({
//     safeWalletPrivateKey: process.env.SAFE_WALLET_PK!,
//     compromisedWalletPrivateKey: process.env.COMPROMISED_WALLET_PK!,
//     toWalletAddress: process.env.FIREBLOCKS_SAFE_WALLET!,
//     verifyKnots: false
// });
