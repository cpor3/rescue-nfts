import { InfuraProvider, Wallet, Contract, formatEther, formatUnits, BaseContractMethod, TransactionResponse } from 'ethers';
import KnotContract from './contracts/knotContract.json';
import SerumContract from './contracts/serumContract.json';
import KzKnotContract from './contracts/kzKnotContract.json';
import KzFighterContract from './contracts/kzFighterContract.json';
import { MAX_RETRIES, MAX_RETRIES_REFUND, PF_INCREASE } from './constants';
import { estimateGasForTransaction, estimateGasForContractMethod, getCurrentGasPrice, sendFunds, getCurrentMaxPriorityFee, getCurrentBaseFee } from './utils';
import { KzApi } from "./kzApi";
import { config } from 'dotenv';
import { PreClaimFighters } from './kzApi/types';
config();

const provider = new InfuraProvider("matic");

export type ProcessConfig = {
    safeWalletPrivateKey: string, 
    compromisedWalletPrivateKey: string,
    toWalletAddress?: string,
    verifyKnots?: boolean,
    manualPreClaimInput?: PreClaimFighters,
    manualTokenIds?: Array<number>,
};

async function processAccount(config: ProcessConfig) {
    const {
        safeWalletPrivateKey, 
        compromisedWalletPrivateKey,
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

    const api = new KzApi(compromisedWallet.address);
    
    const accountOk = await api.initialize(compromisedWallet);
    if (!accountOk) {
        console.log('Account doesn\'t exist, is locked, or invalid tokens set for Kz API.');
        return;
    }

    const {
        knotBalance, 
        serumBalance,
        inGameKnots,
        inGameSerum,
        inGameFighters,
        inGameFightersBatch20
    } = await getBalances(api, knotContract, serumContract, compromisedWallet.address);

    // Check required in-game knots
    const requiredKnotsForWithdrawals = Math.ceil(inGameFighters.length / 20) * 10;
    const missingKnots = requiredKnotsForWithdrawals - Number(formatEther(inGameKnots));
    if (verifyKnots && missingKnots > 0) {
        console.log('Insufficient In-game Knots for Fighters withdrawals.');
        if (missingKnots > Number(formatEther(knotBalance))) {
            console.log('Insufficient Knots on wallet.');
            return;
        }
        console.log('Trying to deposit Knots...');
        const depositKnots = await execute(safeWallet, compromisedWallet, kzKnotContract.deposit, [
            compromisedWallet.address,
            knotBalance
        ]);
        if (!depositKnots.success) {
            console.log('Error while trying to deposit knots');
            await returnUnusedFunds(safeWallet, compromisedWallet);
            return;
        }    
        console.log('Deposit OK: ', depositKnots.txn?.hash);
    }

    console.log('');

    // Claim fighters (if any)
    let tokenIds: Array<number> | undefined;
    if (inGameFighters.length) {
        let preClaimFighters: PreClaimFighters | null;
        
        if (manualPreClaimInput) {
            // Use alredy claimed data
            console.log('Using manual input for fighters pre-claim: ', manualPreClaimInput);
            preClaimFighters = manualPreClaimInput!;
        } else {
            // Pre-claim Fighters on API
            console.log('Pre-claiming fighters to API...');
            preClaimFighters = await api.preClaimFighters(inGameFightersBatch20);
            if (!preClaimFighters?.success) {
                console.log('Error while trying to claim fighters on API:', preClaimFighters?.errorReason);
                await returnUnusedFunds(safeWallet, compromisedWallet);
                return;
            }
            console.log('Pre-claim OK: ', preClaimFighters);
        }

        // Claim Fighters on smart contract
        console.log('Trying to claim Nfts...')
        tokenIds = preClaimFighters!.tokenIds;
        const { txId, timestamp, signature } = preClaimFighters!;
        const claimFighters = await execute(safeWallet, compromisedWallet, kzFighterContract.batchClaim, [
            compromisedWallet.address, 
            tokenIds, 
            txId, 
            timestamp, 
            signature
        ]);
        if (claimFighters.success) console.log('Claim OK: ', claimFighters.txn?.hash);
    }

    if (!tokenIds) {
        // No fighters recently claimed
        if (manualTokenIds) {
            // If manual input provided, use that list
            console.log('Using manual input for Nfts list: ', manualTokenIds?.join(','));
            tokenIds = manualTokenIds;
        } else {
            // Otherwise, read data from Kz API
            console.log('Reading Nfts from Kz API...');
            const response = await api.getFighters();
            if (Array.isArray(response) && response.length) {
                tokenIds = response.map(fighter => fighter.tokenId);
                console.log('Using Nfts list from API: ', tokenIds?.join(','));
            }
        }
    }
    
    // Transfer NFTs to a safe wallet (if any)
    if (tokenIds?.length) {
        console.log('Trying to transfer Nfts...')
        const nfts = await transferNfts(safeWallet, compromisedWallet, toWalletAddress, tokenIds!, kzFighterContract);
        if (nfts.success) console.log('Transfer OK');
    }

    // Return funds (if any)
    await returnUnusedFunds(safeWallet, compromisedWallet);
}

async function getBalances(api: KzApi, knotContract: Contract, serumContract: Contract, compromisedWallet: string) {
    console.log('--=== Balances ===--');

    const knotBalance = await knotContract.balanceOf(compromisedWallet);
    console.log('Knot Balance: ', formatEther(knotBalance));

    const serumBalance = await serumContract.balanceOf(compromisedWallet);
    console.log('Serum Balance: ', formatEther(serumBalance));

    const inGameKnots = await api.getInGameKnots();
    console.log('In-game Knots: ', formatEther(inGameKnots));
    
    const inGameSerum = await api.getInGameSerum();
    console.log('In-game Serum: ', inGameSerum);
    
    const inGameFighters = (await api.getInGameFighters()).map(fighter => fighter.tokenId);
    console.log('In-game Figthers: ', inGameFighters.join(',') || 0);

    const fighters = await api.getFighters();
    console.log('Fighters in wallet: ', fighters.length ? fighters?.map(fighter => fighter.tokenId).join(',') : 0);

    const inGameFightersBatch20 = inGameFighters.slice(0, 20);

    return {
        knotBalance, 
        serumBalance,
        inGameKnots,
        inGameSerum,
        inGameFighters,
        inGameFightersBatch20
    };
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
    
    console.log('Gas units (+10%): ', estimatedGasUnitsPlus10perc.toString());
    console.log('Base fee per gas: ', formatUnits(currentBaseFee, 'gwei'), 'Gwei');
    console.log('Priority fee per gas: ', formatEther(priorityFee), 'MATIC');
    console.log('Total gas required: ', formatEther(gasRequired), 'MATIC');

    sendFunds(safeWallet, compromisedWallet, provider, gasRequired);

    // Execute transaction
    let txn: TransactionResponse | null = null;
    let retry = 0;
    let success = false;
    while (!success && retry < maxRetries) {
        try {
            txn = await contractMethod(...args, {
                gasLimit: estimatedGasUnitsPlus10perc,
                maxFeePerGas: (currentBaseFee * BigInt(2)) + priorityFee,
                maxPriorityFeePerGas: priorityFee,
            });
            await txn?.wait();
            success = true;
        } catch (error: any) {
            console.log('Failed (try ', retry+1, 'of', maxRetries, '): ', error?.shortMessage ?? error);
            retry++;
        }
    }

    return {
        success,
        txn
    }
}

async function returnUnusedFunds(safeWallet: Wallet, compromisedWallet: Wallet, maxRetries = MAX_RETRIES_REFUND) {
    console.log('Returning funds from compromised wallet');
    const txnData = {
        to: safeWallet.address,
        gasLimit: 21000,
        value: BigInt(1) // sample value of 1 wei for estimating gas only
    };  
    const balance = await provider.getBalance(compromisedWallet.address);
    const estimatedGasUnits = await estimateGasForTransaction(compromisedWallet, txnData);
    const currentGasPrice = await getCurrentGasPrice(provider);
    const estimatedFee = estimatedGasUnits * currentGasPrice * BigInt(110) / BigInt(100);
    const availableFunds = balance - estimatedFee;
    if (availableFunds < 0) {
        console.log('No available funds.');
        return {
            success: false,
            txn: null
        };
    }
    txnData.value = availableFunds;
    console.log('Current Balance: ', formatEther(balance), 'MATIC');
    console.log('Estimated Fee (+10%): ', formatUnits(estimatedFee, 'gwei'), 'Gwei');
    console.log('Available funds to transfer: ', formatEther(availableFunds), 'MATIC');

    let txn: TransactionResponse | null = null;
    let retry = 0;
    let success = false;
    while (!success && retry < maxRetries) {
        try {
            txn = await compromisedWallet.sendTransaction(txnData);
            await txn.wait();
            success = true;
        } catch (error: any) {
            console.log('Failed (try ', retry+1, 'of', maxRetries, '): ', error?.shortMessage ?? error);
            retry++;
        };
    }

    if (success) console.log('Refund OK: ', txn?.hash);

    return {
        success,
        txn
    }
}

async function transferNfts(safeWallet: Wallet, compromisedWallet: Wallet, toWalletAddress: string, tokenIds: Array<number>, kzFighterContract: Contract) {
    let success = true;
    for (let i=0; i<tokenIds.length; i++) {
        const transferNfts = await execute(safeWallet, compromisedWallet, kzFighterContract.transferFrom, [
            compromisedWallet.address,
            toWalletAddress,
            tokenIds[i]
        ]);
        if (transferNfts.success) console.log('Transfer of NFT #', i+1, 'OK: ', transferNfts.txn?.hash);
        success = success && transferNfts.success;
    }
    
    return {
        success,
    }
}

export default processAccount;
