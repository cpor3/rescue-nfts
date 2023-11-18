import { InfuraProvider, Wallet, Contract, formatEther, formatUnits, BaseContractMethod, TransactionResponse } from 'ethers';
import KnotContract from '../contracts/knotContract.json';
import SerumContract from '../contracts/serumContract.json';
import KzKnotContract from '../contracts/kzKnotContract.json';
import KzFighterContract from '../contracts/kzFighterContract.json';
import { MAX_RETRIES, MAX_RETRIES_REFUND, PF_INCREASE, WAIT_FOR_KNOTS_API } from '../constants';
import { sleep, estimateGasForTransaction, estimateGasForContractMethod, getCurrentGasPrice, getCurrentMaxPriorityFee, getCurrentBaseFee, sendFunds } from '../utils';
import { KzApi } from "../kzApi";
import { config } from 'dotenv';
import { PreClaimFighters } from '../kzApi/types';
import { parentPort, workerData } from 'worker_threads';
import { dLogger } from '../logger';
config();

const cconsole = {
    log: (message: string) => dLogger.info(workerData?.account?.fireblocksVault, message)
};

const provider = new InfuraProvider("matic");

export type ProcessConfig = {
    readOnly?: boolean,
    safeWalletPrivateKey: string, 
    compromisedWalletPrivateKey: string,
    toWalletAddress?: string,
    knotsDestination?: string,
    claimSerum?: boolean,
    claimFighters?: boolean,
    verifyKnots?: boolean,
    manualPreClaimInput?: PreClaimFighters,
    manualTokenIds?: Array<number>,
};

async function processAccount(config: ProcessConfig) {
    const {
        readOnly = false,
        safeWalletPrivateKey, 
        compromisedWalletPrivateKey,
        claimSerum = true,
        claimFighters = true,
        verifyKnots = true,
        manualPreClaimInput,
        manualTokenIds
    } = config;

    const {
        safeWallet, 
        compromisedWallet, 
        knotContract, 
        serumContract, 
        kzKnotContract,
        kzFighterContract
    } = await getContracts(safeWalletPrivateKey, compromisedWalletPrivateKey);

    const toWalletAddress = config.toWalletAddress ?? safeWallet.address;
    const knotsToWalletAddress = config.knotsDestination ?? toWalletAddress;

    const api = new KzApi(compromisedWallet.address);

    const accountOk = await api.initialize(compromisedWallet);
    if (!accountOk) {
        cconsole.log('Account doesn\'t exist, is locked, or invalid tokens set for Kz API.');
        return endProcess(false);
    }

    const {
        knotBalance, 
        serumBalance,
        fighters,
        inGameKnots,
        inGameSerum,
        inGameFighters,
    } = await api.getBalances(knotContract);

    cconsole.log(`--=== Balances ===--`);
    cconsole.log(`Knot Balance: ${formatEther(knotBalance)}`);
    cconsole.log(`Serum Balance: ${serumBalance}`);
    cconsole.log(`In-game Knots: ${formatEther(inGameKnots)}`);
    cconsole.log(`In-game Serum: ${inGameSerum}`);
    cconsole.log(`In-game Figthers (${inGameFighters?.length || 0}): ${inGameFighters?.join(',') || ''}`);
    cconsole.log(`Fighters in wallet (${fighters.length}): ${fighters?.map(fighter => fighter.tokenId).join(',') || ''}`);
  
    if (readOnly) {
        cconsole.log('Read only mode. Exiting.');
        return endProcess(false);
    }
    
    // Check if processing of the account is done:
    if (
        serumBalance === 0 && // no serum on wallet
        !fighters?.length && // no fighters on wallet
        // BigInt(inGameKnots) < BigInt(10*1e18) && // less than 10 in-game knots
        (inGameSerum <= 100 || (inGameSerum > 100 && !inGameFighters?.length)) && // minimum qty of Serum allowed to transfer is 100, fighters required to withdraw serum
        !inGameFighters?.length // no in-game fighers
    ) {
        // Return funds (if any)
        await returnUnusedFunds(safeWallet, compromisedWallet);    
        
        cconsole.log('Account successfully processed.');
        endProcess(true);
    }

    // Claim Serum (the minimum allowed claim qty is 100)
    let serumNetAmount = 0;
    if (claimSerum && inGameSerum >= 100) {
        // Pre-claim Serum on API
        cconsole.log('Pre-claiming serum to API...');
        const preClaimSerum = await api.preClaimSerum(inGameSerum);
        if (!preClaimSerum?.success) {
            cconsole.log(`Error while trying to claim serum on API: ${preClaimSerum?.errorReason}`);
            await returnUnusedFunds(safeWallet, compromisedWallet);
            return endProcess(false);
        }
        cconsole.log(`Pre-claim OK: ${preClaimSerum}`);

        // Claim Serum on smart contract
        cconsole.log('Trying to claim Serum...')
        const { txId, timestamp, signature } = preClaimSerum!;
        serumNetAmount = Number(preClaimSerum.amount) || 0;
        const claimSerum = await execute(safeWallet, compromisedWallet, serumContract.withdraw, [
            compromisedWallet.address,
            serumNetAmount,
            txId,
            timestamp,
            signature
        ]);
        if (!claimSerum.success) { // if serum claim failed, end process to avoid withdrawing nfts (still need them to withdraw the serum)
            cconsole.log('Error while trying to claim serum on smart contract');
            await returnUnusedFunds(safeWallet, compromisedWallet);
            return endProcess(false);
        }
        cconsole.log(`Claim OK: ${claimSerum.txn?.hash}`);        
    }

    // Transfer serum on wallet (if any)
    serumNetAmount = serumNetAmount || serumBalance;
    if (serumNetAmount > 0) {
        cconsole.log('Trying to transfer Serum to safe wallet...')
        const transferSerum = await execute(safeWallet, compromisedWallet, serumContract.transfer, [
            toWalletAddress,
            serumNetAmount
        ]);
        if (transferSerum.success) cconsole.log(`Transfer of Serum OK: ${transferSerum.txn?.hash}`);
    }

    // Check required in-game knots
    const requiredKnotsForWithdrawals = Math.ceil(inGameFighters.length / 20) * 10;
    const missingKnots = requiredKnotsForWithdrawals - Number(formatEther(inGameKnots));
    if (verifyKnots && missingKnots > 0) {
        cconsole.log('Insufficient In-game Knots for Fighters withdrawals.');
        if (missingKnots > Number(formatEther(knotBalance))) {
            cconsole.log('Insufficient Knots on wallet.');
            return endProcess(false);
        }
        const allowance = await knotContract.allowance(compromisedWallet, KzKnotContract.address);
        if (allowance < BigInt(missingKnots * 1e18)) {
            cconsole.log('Trying to approve allowance on KzKnot contract...');
            const approveKzKnotContract = await execute(safeWallet, compromisedWallet, knotContract.approve, [
                KzKnotContract.address,
                "9999999999999999999999"
            ]);
            if (!approveKzKnotContract.success) {
                cconsole.log('Error while trying to approve allowance');
                await returnUnusedFunds(safeWallet, compromisedWallet);
                return endProcess(false);
            }
            cconsole.log(`Approval OK: ${approveKzKnotContract.txn?.hash}`);
        }
        cconsole.log('Trying to deposit Knots...');
        const depositKnots = await execute(safeWallet, compromisedWallet, kzKnotContract.deposit, [
            compromisedWallet.address,
            BigInt(missingKnots * 1e18)
        ]);
        if (!depositKnots.success) {
            cconsole.log('Error while trying to deposit knots');
            await returnUnusedFunds(safeWallet, compromisedWallet);
            return endProcess(false);
        }    
        cconsole.log(`Deposit OK: ${depositKnots.txn?.hash}`);
        cconsole.log('Giving some time to the API to register the deposited knots...');
        await sleep(WAIT_FOR_KNOTS_API);
    }

    cconsole.log('');

    // Claim fighters (if any)
    let tokenIds: Array<number> | undefined;
    const inGameFightersBatch20 = inGameFighters.slice(0, 20); // Max 20 fighters per claim
    if (claimFighters && inGameFighters.length) {
        let preClaimFighters: PreClaimFighters | null;
        
        if (manualPreClaimInput) {
            // Use alredy claimed data
            cconsole.log(`Using manual input for fighters pre-claim: ${manualPreClaimInput}`);
            preClaimFighters = manualPreClaimInput!;
        } else {
            // Pre-claim Fighters on API
            cconsole.log('Pre-claiming fighters to API...');
            preClaimFighters = await api.preClaimFighters(inGameFightersBatch20);
            if (!preClaimFighters?.success) {
                cconsole.log(`Error while trying to claim fighters on API: ${preClaimFighters?.errorReason}`);
                await returnUnusedFunds(safeWallet, compromisedWallet);
                return endProcess(false);
            }
            cconsole.log(`Pre-claim OK: ${preClaimFighters}`);
        }

        // Claim Fighters on smart contract
        cconsole.log('Trying to claim Nfts...')
        tokenIds = preClaimFighters!.tokenIds;
        const { txId, timestamp, signature } = preClaimFighters!;
        const claimFighters = await execute(safeWallet, compromisedWallet, kzFighterContract.batchClaim, [
            compromisedWallet.address, 
            tokenIds, 
            txId, 
            timestamp, 
            signature
        ]);
        if (!claimFighters.success) tokenIds = undefined;
        if (claimFighters.success) cconsole.log(`Claim OK: ${claimFighters.txn?.hash}`);
    }

    if (!tokenIds) {
        // No fighters recently claimed
        if (manualTokenIds) {
            // If manual input provided, use that list
            cconsole.log(`Using manual input for Nfts list: ${manualTokenIds?.join(',')}`);
            tokenIds = manualTokenIds;
        } else {
            // Otherwise, read data from Kz API
            cconsole.log('Reading Nfts from Kz API...');
            const response = await api.getFighters();
            if (Array.isArray(response) && response.length) {
                tokenIds = response.map(fighter => fighter.tokenId);
                cconsole.log(`Using Nfts list from API: ${tokenIds?.join(',')}`);
            }
        }
    }
    
    // Transfer NFTs to a safe wallet (if any)
    if (tokenIds?.length) {
        cconsole.log('Trying to transfer Nfts...')
        const nfts = await transferNfts(safeWallet, compromisedWallet, toWalletAddress, tokenIds!, kzFighterContract);
        if (nfts.success) cconsole.log('Transfer OK: all tokens transferred');
        if (!nfts.success) cconsole.log(`Transfer Failed: only transferred ${nfts.tokensTransferred.length} out of ${tokenIds.length}.`);
    }

    // Return funds (if any)
    await returnUnusedFunds(safeWallet, compromisedWallet);
    return endProcess(false);
}

async function getContracts(safeWalletPrivateKey: string, compromisedWalletPrivateKey: string) {
    const safeWallet = new Wallet(safeWalletPrivateKey, provider);
    const compromisedWallet = new Wallet(compromisedWalletPrivateKey, provider);

    const knotContract = new Contract(KnotContract.address, KnotContract.abi, compromisedWallet);
    const serumContract = new Contract(SerumContract.address, SerumContract.abi, compromisedWallet);
    const kzKnotContract = new Contract(KzKnotContract.address, KzKnotContract.abi, compromisedWallet);
    const kzFighterContract = new Contract(KzFighterContract.address, KzFighterContract.abi, compromisedWallet);

    return {
        safeWallet, 
        compromisedWallet, 
        knotContract, 
        serumContract, 
        kzKnotContract,
        kzFighterContract
    };
}

async function execute(
    safeWallet: Wallet,
    compromisedWallet: Wallet,
    contractMethod: BaseContractMethod,
    args: Array<any>,
    maxRetries = MAX_RETRIES,
    maxPriorityFee?: bigint
) {
    // Estimate cost of contract execution and send the required gas
    const estimatedGasUnits = await estimateGasForContractMethod(contractMethod, args);
    if (estimatedGasUnits === BigInt(0)) return {
        success: false,
        txn: null
    }
    const estimatedGasUnitsPlus10perc = estimatedGasUnits * BigInt(110) / BigInt(100);
    
    const currentBaseFee = await getCurrentBaseFee(provider);
    const priorityFee = maxPriorityFee || (await getCurrentMaxPriorityFee(provider)) * BigInt(100 + PF_INCREASE) / BigInt(100); // defaults to maxPriorityFee +X%
    const gasRequired = estimatedGasUnitsPlus10perc * ((currentBaseFee * BigInt(2)) + priorityFee);
    
    // cconsole.log('Gas units (+10%): ', estimatedGasUnitsPlus10perc.toString());
    // cconsole.log('Base fee per gas: ', formatUnits(currentBaseFee, 'gwei'), 'Gwei');
    // cconsole.log('Priority fee per gas: ', formatEther(priorityFee), 'MATIC');
    // cconsole.log('Total gas required: ', formatEther(gasRequired), 'MATIC');

    let fundsSentError = false;
    cconsole.log('Sending MATIC from safe wallet...');
    const nonce = await getNonce();
    sendFunds(safeWallet, compromisedWallet, gasRequired, nonce)
        .catch((error: any) => {
            fundsSentError = true;
            cconsole.log(`Error while trying to send MATIC from safe wallet: ${error.shortMessage ?? error}`);
        });

    // Execute transaction
    let txn: TransactionResponse | null = null;
    let retry = 0;
    let success = false;
    while (!success && retry < maxRetries && !fundsSentError) {
        try {
            txn = await contractMethod(...args, {
                gasLimit: estimatedGasUnitsPlus10perc,
                maxFeePerGas: (currentBaseFee * BigInt(2)) + priorityFee,
                maxPriorityFeePerGas: priorityFee,
            });
            await txn?.wait(1, 60000);
            success = true;
        } catch (error: any) {
            cconsole.log(`Failed (try ${retry+1} of ${maxRetries}): ${error?.shortMessage ?? error}`);
            retry++;
        }
    }

    if (!success) cconsole.log(`Couldn\'t send trasaction after ${retry} tries!`);

    return {
        success,
        txn
    }
}

async function returnUnusedFunds(safeWallet: Wallet, compromisedWallet: Wallet, maxRetries = MAX_RETRIES_REFUND) {
    cconsole.log('Returning funds from compromised wallet');
    const txnData: any = {
        to: safeWallet.address,
        gasLimit: 21000,
        value: BigInt(1) // sample value of 1 wei for estimating gas only
    };
    const balance = await provider.getBalance(compromisedWallet.address);
    const estimatedGasUnitsPlus10perc = (await estimateGasForTransaction(compromisedWallet, txnData)) * BigInt(110) / BigInt(100);
    const currentGasPricePlus10perc = (await getCurrentGasPrice(provider)) * BigInt(110) / BigInt(100);
    const currentPriorityFeePlus20perc = (await getCurrentMaxPriorityFee(provider)) * BigInt(120) / BigInt(100);
    const estimatedFee = estimatedGasUnitsPlus10perc * (currentGasPricePlus10perc + currentPriorityFeePlus20perc);
    const availableFunds = balance - estimatedFee;
    if (availableFunds <= 0) {
        cconsole.log('No available funds.');
        return {
            success: false,
            txn: null
        };
    }
    txnData.value = availableFunds;
    txnData.maxPriorityFeePerGas = currentPriorityFeePlus20perc;
    cconsole.log(`Current Balance: ${formatEther(balance)} MATIC`);
    cconsole.log(`Estimated Fee (+10%): ${formatEther(estimatedFee)} MATIC`);
    cconsole.log(`Available funds to transfer: ${formatEther(availableFunds)} MATIC`);

    let txn: TransactionResponse | null = null;
    let retry = 0;
    let success = false;
    while (!success && retry < maxRetries) {
        try {
            txn = await compromisedWallet.sendTransaction(txnData);
            await txn.wait();
            success = true;
        } catch (error: any) {
            cconsole.log(`Failed (try ${retry+1} of ${maxRetries}): ${error?.shortMessage ?? error}`);
            retry++;
        };
    }

    if (success) cconsole.log(`Refund OK: ${txn?.hash}`);

    return {
        success,
        txn
    }
}

async function transferNfts(safeWallet: Wallet, compromisedWallet: Wallet, toWalletAddress: string, tokenIds: Array<number>, kzFighterContract: Contract) {
    let success = true;
    let tokensTransferred= [];
    for (let i=0; i<tokenIds.length; i++) {
        const transferNfts = await execute(safeWallet, compromisedWallet, kzFighterContract.transferFrom, [
            compromisedWallet.address,
            toWalletAddress,
            tokenIds[i]
        ]);
        if (transferNfts.success) {
            tokensTransferred.push(tokenIds[i]);
            cconsole.log(`Transfer of NFT #${i+1} OK: ${transferNfts.txn?.hash}`);
        }
        success = success && transferNfts.success;
    }
    
    return {
        success,
        tokensTransferred
    }
}

function endProcess(accountProcessCompleted: boolean) {
    parentPort?.postMessage(accountProcessCompleted ? 'accountCompleted' : 'accountNotCompleted');
}

async function getNonce(): Promise<number> {
    return new Promise(async (resolve, reject) => {
        let done = false;
        parentPort?.on('message', value => {
            done = true;
            resolve(value);
        })
        parentPort?.postMessage('getNonce');
        while (!done) await sleep(1000);
        parentPort?.removeAllListeners('message');
    });
}

processAccount(workerData.config);

export default processAccount;
