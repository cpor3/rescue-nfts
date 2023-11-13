import processAccount from "./process";

//// Execute all
processAccount({
    safeWalletPrivateKey: process.env.SAFE_WALLET_PK!,
    compromisedWalletPrivateKey: process.env.COMPROMISED_WALLET_PK!,
    toWalletAddress: process.env.FIREBLOCKS_SAFE_WALLET!,
});

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
