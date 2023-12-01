import { InfuraProvider, Wallet } from "ethers";
import { FireblocksApi } from "./fireblocksApi";
import { KzApi } from "./kzApi";
import { config } from 'dotenv';
config();

const getGasStation = async () => {
    const fb = new FireblocksApi();

    // const res1 = await fb.setGasStationSettings('0.01', '0.03');
    // console.log(res1);

    const res = await fb.getGasStationSettings();
    console.log(res);
}
// getGasStation();

const getUserInGameLevel = async () => {
    const provider = new InfuraProvider('matic');
    const safeWallet = new Wallet(process.env.SAFE_WALLET_PK!, provider);

    const kz = new KzApi(process.env.SAFE_WALLET_WALLET!);
    await kz.initialize(safeWallet);

    console.log(await kz.setInGameLevel(10020434274, '1'));
}
// getUserInGameLevel();

const moveMatic = async () => {
    const fb = new FireblocksApi();
    const sourceVaultId = await fb.getVaultId('GAMES');
    const destVaultId = await fb.getVaultId('Karmaverse-31');
    console.log(sourceVaultId);
    console.log(destVaultId);
    const res = await fb.transferMatic(sourceVaultId, destVaultId, 0.01);
    console.log(res);
}
// moveMatic();
