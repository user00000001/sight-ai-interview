import {
  Log,
  WatchContractEventReturnType,
  createPublicClient,
  getContract,
  hexToBigInt,
  hexToString,
  http,
  parseEventLogs,
  stringToHex,
} from "viem";
import hre from "hardhat";
import { hardhat } from "viem/chains";
import { abi } from "../artifacts/contracts/OracleSC.sol/OracleSC.json";
import deployed_addresses from "../ignition/deployments/chain-31337/deployed_addresses.json";
import { getContractAt } from "@nomicfoundation/hardhat-viem/types";
import "dotenv";
import axios from "axios";

const client = createPublicClient({
  chain: hardhat,
  transport: http(),
});

let unwatch: WatchContractEventReturnType;
let unwatch1: WatchContractEventReturnType;

async function main() {
  const oracle = await getContract({
    address: deployed_addresses["OracleSCModule#OracleSC"] as `0x${string}`,
    abi: abi,
    client,
  });

  // Event listener and onLogs callback function (OracleRequest/Callbacked)
  unwatch = oracle.watchEvent.OracleRequest({
    fromBlock: await client.getBlockNumber(),
    onLogs: handle_logs,
  });
  unwatch1 = oracle.watchEvent.Callbacked({
    fromBlock: await client.getBlockNumber(),
    onLogs: (logs: any[]) => {
      // console.log(logs);
      const {
        args: { success, requestId, callbackAddr, callbackFunctionId, data },
      } = logs[0];
      try {
        let rsp_data = hexToString(data, { size: 32 });
        console.error(rsp_data);
        let result = JSON.parse(rsp_data);
        console.error(`result: ${result.result}`);
      } catch (error) {
        console.error(error);
      }
    },
  });
  //   unwatch = client.watchContractEvent({
  //       address: process.env.ORACLE! as `0x${string}`,
  //       abi,
  //       eventName: "OracleRequest",
  //       onLogs: handle_logs,
  //   });
}

async function handle_logs(logs: any[]) {
  // console.log(logs);
  const {
    args: {
      requester,
      requestId,
      callbackAddr,
      callbackFunctionId,
      cancelExpiration,
      data,
    },
  } = logs[0];
  const [owner, ...othersAccount] = await hre.viem.getWalletClients();
  const oracle = await getContract({
    address: deployed_addresses["OracleSCModule#OracleSC"] as `0x${string}`,
    abi: abi,
    client,
  });
  const expired = hexToBigInt(cancelExpiration);
  const now = new Date();
  const now_bigint = BigInt(Math.floor(now.getTime() / 1000));
  if (expired >= now_bigint) { // if compute request is expired, do nothing, sender can apply cancelCompute to get the previous callPrice back.
    let request_data = hexToString(data);
    console.log(request_data);
    let resp = await axios.request({ // get computed data
      method: "POST",
      url: "http://localhost:3000/compute",
      data: JSON.parse(request_data),
    });
    let resp_data = stringToHex(JSON.stringify(resp.data), { size: 32 });
    await oracle.write.callback([requestId, resp_data], { // write result to Oracle and call specified contract's method to notify it.
      account: owner.account.address,
    });
  }
}

main().catch((error) => {
  console.error(error);
  unwatch();
  unwatch1();
  process.exit(1);
});
