import md5 from 'md5';
import { 
    KzHeader,
    NonceResponse,
    InGameKnotsResponse,
    InGameSerumResponse,
    InGameFightersResponse,
    WithdrawalRulesResponse,
    PreClaimFightersResponse,
    FightersResponse,
    TokensResponse,
} from './types';
import { config } from 'dotenv';
import { Wallet } from 'ethers';
config();

const BASE_URL = "https://api.karmaverse.io/api/v1";

export class KzApi {
    url: string;
    compromisedWallet: string;
    private nonce = "";
    private token = "";
    private tokenK = "";
    
    constructor(compromisedWalletAddress: string, url?: string) {
        this.url = url || BASE_URL;
        this.compromisedWallet = compromisedWalletAddress.toLowerCase();
    }
    
    async initialize(wallet: Wallet): Promise<boolean> {
        this.nonce = await this.getNonce() ?? "";
        if (!this.nonce) return false;

        const message = `Welcome to Karmaverse, in order to verify your identity, please sign this message. Your sign code is: ${this.nonce}`;
        const signature = await wallet.signMessage(message);

        ({ token: this.token, tokenK: this.tokenK } = await this.getTokens(signature));
        if (!this.token || !this.tokenK) return false;
        
        if (!(await this.checkAccount())) return false;
        return true;
    }

    getHeaders(): KzHeader {
        const X_Api_Key = "QIN8Dqh63eqLNLQ7Xoi9zPcpDcqcTd";
        const X_Api_Base = "rfw0LWbFC6V0yBdWPKYJE5IJCK8uSfqqziIhrvD68gkwzmjQoE4M7LJb9ar7==";
        const X_Api_Salt = "SrCc89IINtXiUOglgvnQz55DZAeX3mKNrrIFtEfae9ilUTG1qa";
        const X_Api_Ts = Date.now();
        const X_Api_Sign = md5(X_Api_Base + '_' + X_Api_Salt + '_' + X_Api_Ts);

        return {
            "Api-Key": X_Api_Key,
            "x-api-base": X_Api_Base,
            "x-api-salt": X_Api_Salt,
            "x-api-ts": '' + X_Api_Ts,
            "x-api-sign": X_Api_Sign,
            "Authorization": this.token,
            "Authorizationk": this.tokenK
        }
    }

    async request<T>(path: string, method: 'GET' | 'POST', body?: BodyInit): Promise<T> {
        const response = await fetch(`${this.url}/${path}`, {
            method: method,
            headers: this.getHeaders(),
            body: body
        });
        return await response.json();
    }

    async get<T>(path: string): Promise<T> {
        return this.request(path, 'GET');
    }

    async post<T>(path: string, body?: BodyInit): Promise<T> {
        return this.request(path, 'POST', body);
    }

    async getNonce() {
        const urlencoded = new URLSearchParams();
        urlencoded.append("walletAddress", this.compromisedWallet);
        const response = await this.post<NonceResponse>(`account-nft/wallet`, urlencoded);
        return response.data.data;
    }

    async checkAccount(): Promise<boolean> {
        const response = await this.getWithdrawalsRules();
        return (response && !response.baseControl.is_banned && !response.baseControl.is_locked_claim);
    }

    async getTokens(signature: string) {
        const urlencoded = new URLSearchParams();
        urlencoded.append("signature", signature);
        urlencoded.append("walletAddress", this.compromisedWallet);
        const response = await this.post<TokensResponse>(`account-nft/metamask/login`, urlencoded);
        if (!response || response.data.message !== 'Success') return { 
            token: "",
            tokenK: ""
        }
        return {
            token: `${response.data.data.tokenHead}${response.data.data.token}`,
            tokenK: response.data.kToken
        }
    }

    async getInGameKnots() {
        const response = await this.get<InGameKnotsResponse>(`wallet-nft/player/query/knot?address=${this.compromisedWallet}`);
        return response.data.data.inGameAmount;
    }

    async getInGameSerum() {
        const response = await this.get<InGameSerumResponse>(`wallet-nft/serum/query?address=${this.compromisedWallet}`);
        return response.data.data.inGameAmount;
    }

    async getWithdrawalsRules() {
        const response = await this.get<WithdrawalRulesResponse>(`wallet-nft/player/query/withdrawalrules`);
        return response.data.data;
    }

    async getInGameFighters() {
        const response = await this.get<InGameFightersResponse>(`wallet-nft/fighter/queryingame?address=${this.compromisedWallet}`);
        return response.data.data;
    }

    async preClaimFighters(heros: Array<number>) {
        const response = await this.get<PreClaimFightersResponse>(`wallet-nft/fighter/claim?heros=${heros.join(',')}&address=${this.compromisedWallet}`);
        return response.data.data;
    }

    async getFighters(page=0, limit=200) {
        const response = await this.get<FightersResponse>(`assets/0x60ce73cF71Def773a7a8199D4e6B2F237D5a6b32/inventory?page=${page}&limit=${limit}`);
        return response.data;
    }
}
