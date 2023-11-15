import { Account } from "./accounts/types";
import { FireblocksApi } from "./fireblocksApi";
import { Worker } from 'worker_threads';
import path, { resolve } from 'path';
import fs from 'fs';
import { ProcessConfig } from "./process";

export async function loadAccounts(): Promise<Account[]> {
    try {
        const accounts: Account[] = JSON.parse(fs.readFileSync(path.resolve('./src/accounts/accounts.json'), 'utf-8'));
        return accounts;
    } catch (error) {
        console.log('Error while trying to read from accounts.json: ', error)
        return [];
    }
}

export async function saveAccounts(accounts: Account[]): Promise<boolean> {
    try {
        const accountsStringified = JSON.stringify(accounts);
        fs.writeFileSync(path.resolve('./src/accounts/accounts.json'), accountsStringified, 'utf-8');
        return true;
    } catch (error) {
        console.log('Error while trying to save data to accounts.json: ', error)
        return false;
    }
}

type WorkerResponse = {
    account: string,
    completed?: boolean,
    error?: string
}

async function createWorker(config: ProcessConfig, account: Account): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
        const worker = new Worker('./dist/src/process.js', {
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
    const accounts = await loadAccounts();
    const processes = [];
    for (let i=0; i<accounts.length; i++) {
        if (accounts[i].status !== 'completed') {
            processes.push(createWorker({
                readOnly: false,
                safeWalletPrivateKey: process.env.SAFE_WALLET_PK!,
                compromisedWalletPrivateKey: accounts[i].privateKey,
                toWalletAddress: accounts[i].newAddress,
            }, accounts[i]));
        }
    }
    const results = await Promise.all(processes);
    console.log(results);
}
main();

async function createFireblocksVaultAndAsset() {
    const fb = new FireblocksApi();

    const newVault = await fb.createVault('Karmaverse-8', false, '0x5fa1e533a75d931517f86e1193857497d11e37ae', true);
    if (!newVault) {
        console.log('Error creating Vault');
        return;
    }
    // console.log(newVault);

    const newAsset = await fb.createAsset(newVault.id, 'MATIC_POLYGON');
    console.log(newAsset.address);
}
// createFireblocksVaultAndAsset();

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
