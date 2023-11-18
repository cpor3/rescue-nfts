import { InfuraProvider, Wallet, TransactionRequest, BaseContractMethod, TransactionResponse } from "ethers";
import { DEFAULT_GAS_PRICE, DEFAULT_GAS_UNITS, DEFAULT_BASE_FEE, DEFAULT_PRIORITY_FEE } from "./constants";

export async function sleep(ms: number): Promise<void> {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve();
        }, ms);
    })
}
export async function getCurrentGasPrice(provider: InfuraProvider): Promise<bigint> {
    const feeData = await provider.getFeeData();
    return feeData.gasPrice ?? DEFAULT_GAS_PRICE;
}

export async function getCurrentMaxPriorityFee(provider: InfuraProvider): Promise<bigint> {
    const feeData = await provider.getFeeData();
    return feeData.maxPriorityFeePerGas ?? DEFAULT_PRIORITY_FEE;
}

export async function getCurrentBaseFee(provider: InfuraProvider): Promise<bigint> {
    const block = await provider.getBlock('latest');
    return block?.baseFeePerGas ?? DEFAULT_BASE_FEE;
}

export async function estimateGasForTransaction(wallet: Wallet, txn: TransactionRequest) {
    let estimatedGasUnits = DEFAULT_GAS_UNITS;
    try {
        estimatedGasUnits = await wallet.estimateGas(txn);
    } catch (error: any) {
        console.log('Error while trying to estimate gas:', error?.shortMessage ?? error);
    }
    return estimatedGasUnits;
}

export async function estimateGasForContractMethod(contractMethod: BaseContractMethod, args: Array<any>) {
    let estimatedGasUnits = DEFAULT_GAS_UNITS;
    try {
        estimatedGasUnits = await contractMethod.estimateGas(...args);       
    } catch (error: any) {
        console.log('Error while trying to estimate gas:', error?.shortMessage ?? error);
    }
    return estimatedGasUnits;
}

export class Treasury {
    private static instance: Treasury;
    private currentNonce: number | undefined = undefined;
    provider: InfuraProvider;
    safeWalletAddress: string;

    private constructor(provider: InfuraProvider, safeWalletAddress: string) {
        console.log('Treasury: New instance!');
        this.provider = provider;
        this.safeWalletAddress = safeWalletAddress;
    }

    public static getInstance(provider: InfuraProvider, safeWalletAddress: string): Treasury {
        console.log('Treasury: get instance');
        if (!Treasury.instance) Treasury.instance = new Treasury(provider, safeWalletAddress);
        return Treasury.instance;
    }

    async getNonce(): Promise<number> {
        if (this.currentNonce === undefined) this.currentNonce = (await this.provider.getTransactionCount(this.safeWalletAddress)) - 1;
        this.currentNonce++;
        return this.currentNonce;
    }
}

export async function sendFunds(safeWallet: Wallet, compromisedWallet: Wallet, valueToSend: bigint, nonce: number): Promise<TransactionResponse | null> {
    console.log(`Sending funds to ${compromisedWallet.address}. Nonce: ${nonce}`);
    const txnData = {
        to: compromisedWallet.address,
        gasLimit: 21000,
        nonce: nonce,
        value: valueToSend
    };  
    const txn = safeWallet.sendTransaction(txnData);
    return txn;
}
