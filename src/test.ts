import { FireblocksApi } from "./fireblocksApi";

const main = async () => {
    const fb = new FireblocksApi();

    // const res1 = await fb.setGasStationSettings('0.01', '0.03');
    // console.log(res1);

    const res = await fb.getGasStationSettings();
    console.log(res);
}

main();
