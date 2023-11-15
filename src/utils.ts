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

export async function sendFunds(safeWallet: Wallet, compromisedWallet: Wallet, provider: InfuraProvider, valueToSend: bigint): Promise<TransactionResponse | null> {
    // const nonce = await provider.getTransactionCount(safeWallet.address);
    const txnData = {
        to: compromisedWallet.address,
        gasLimit: 21000,
        // nonce: nonce,
        value: valueToSend
    };  
    const txn = safeWallet.sendTransaction(txnData);
    return txn;
}
