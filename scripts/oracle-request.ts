import {
    createPublicClient,
    getContract,
    http,
    parseEther,
    stringToHex,
  } from "viem";
  import { hardhat } from "viem/chains";
  import { abi } from "../artifacts/contracts/OracleSC.sol/OracleSC.json";
  import deployed_addresses from "../ignition/deployments/chain-31337/deployed_addresses.json";
  import hre from "hardhat";
  import "dotenv";
  
  const client = createPublicClient({
    chain: hardhat,
    transport: http(),
  });

  const callPrice = parseEther("0.01");

  const json_req = `{
  "numbers": [1],
  "ast": {
    "type": "operation",
    "value": "+",
    "left": {
      "type": "variable",
      "index": 0
    },
    "right": {
      "type": "number",
      "value": 2
    }
  }
}`;
    
  async function main() {
    const [owner, ...othersAccount] = await hre.viem.getWalletClients();
    const oracle = await getContract({
      address: deployed_addresses["OracleSCModule#OracleSC"] as `0x${string}`,
      abi: abi,
      client,
    });
    await oracle.write.compute([
      othersAccount[0].account.address,
      "0x00000000",
      0n,
      stringToHex(JSON.stringify(JSON.parse(json_req))),
    ], {value: callPrice + 1n, account: owner.account.address})
  }
  
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
  