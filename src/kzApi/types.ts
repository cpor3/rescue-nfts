export type KzHeader = {
    "Api-Key": string,
    "x-api-base": string,
    "x-api-salt": string,
    "x-api-ts": string,
    "x-api-sign": string,
    "Authorization": string,
    "Authorizationk": string,
}

export type KzApiResponse<T> = {
    code: number,
    data: {
        state: number,
        msg: string,
        data: T
    }
}

export type NonceResponse = {
    code: number,
    data: {
        code: number,
        message: string,
        data: string,
    }
}

export type TokensResponse = {
    code: number,
    data: {
        code: number,
        message: string,
        data: {
            token: string,
            refreshToken: string,
            tokenHead: string,
            expiresIn: number
        },
        kToken: string
    }    
}

export type InGameFigther = {
    id: string,
    tokenId: number,
    status: number,
    existAllianceWarTeam: boolean,
}

export type InGameKnotsResponse = KzApiResponse<{
    inGameAmount: string
}>    


export type InGameSerumResponse = KzApiResponse<{
    inGameAmount: number,
    outGameAmount: number,
}>    

export type InGameFightersResponse = KzApiResponse<
    Array<InGameFigther>
>

export type WithdrawalRulesResponse = KzApiResponse<{
    baseControl: {
        is_banned: boolean,
        is_locked_claim: boolean
    },
    withdrawalRuleGroupList: Array<any>
}>

export type PreClaimFighters = {
    success: boolean,
    errorReason?: string,
    account?: string,
    txId: string,
    timestamp: number,
    signature: string,
    tokenIds: Array<number>,
}

export type PreClaimFightersResponse = KzApiResponse<PreClaimFighters>;

export type FightersResponse = {
    code: number,
    data: Array<{ 
        tokenId: number 
    }>
};
