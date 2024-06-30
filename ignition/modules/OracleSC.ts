import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { parseEther } from "viem";

const callPrice = parseEther("0.01");

const OSCModule = buildModule("OracleSCModule", (m) => {

  const osc = m.contract("OracleSC");

  return { osc };
});

export default OSCModule;
