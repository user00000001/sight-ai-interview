import {
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { assert, expect } from "chai";
import hre from "hardhat";
import { describe, it } from "mocha";
import { encodePacked, getAddress, keccak256, parseEther, parseEventLogs } from "viem";

const callPrice = parseEther("0.01");

describe("OSC", function () {
  async function deployLockFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, ...othersAccount] = await hre.viem.getWalletClients();

    const oracle = await hre.viem.deployContract("OracleSC");
    await oracle.write.setCallPrice([callPrice]);

    const publicClient = await hre.viem.getPublicClient();

    return {
      oracle,
      owner,
      othersAccount,
      publicClient,
    };
  }

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { oracle, owner } = await loadFixture(deployLockFixture);

      expect(await oracle.read.owner()).to.equal(
        getAddress(owner.account.address)
      );
    });
    it("Should set the right callPrice", async function () {
      const { oracle } = await loadFixture(deployLockFixture);

      expect(await oracle.read.callPrice()).to.equal(
        callPrice
      );
    });
    it("Should set the right another callPrice", async function () {
      const anotherCallPrice = parseEther("0.02");
      const { oracle } = await loadFixture(deployLockFixture);

      await oracle.write.setCallPrice([anotherCallPrice])

      expect(await oracle.read.callPrice()).to.equal(
        anotherCallPrice
      );
    });
  });

  describe("Compute", function() {
    it("Should need pay enough", async function () {
      const { oracle, othersAccount } = await loadFixture(deployLockFixture);
      await expect(oracle.write.compute([
        othersAccount[0].account.address,
        "0x00000000",
        0n,
        "0x"
      ])).to.be.rejectedWith("call price not matched");
    });

    it("Should anyone can call it", async function () {
      const { oracle, othersAccount } = await loadFixture(deployLockFixture);
      await expect(oracle.write.compute([
        othersAccount[0].account.address,
        "0x00000000",
        0n,
        "0x"
      ], {account: othersAccount[1].account.address, value: callPrice + 1000n})).to.be.ok;
    });
    
    it("Should send event with the right requester/callbackAddr", async function () {
      const { oracle, owner, othersAccount, publicClient } = await loadFixture(deployLockFixture);
      const hash = await oracle.write.compute([
        othersAccount[0].account.address,
        "0x00000000",
        0n,
        "0x"
      ], {value: callPrice + 1n});
      await publicClient.waitForTransactionReceipt({hash});

      const oracleRequest = await oracle.getEvents.OracleRequest();
      expect(oracleRequest).to.have.lengthOf(1);
      expect(oracleRequest[0].args.requester).to.equal(getAddress(owner.account.address));
      expect(oracleRequest[0].args.callbackAddr).to.equal(getAddress(othersAccount[0].account.address));
    });
    
    it("Should send event with the right requestId/callbackFunctionId/cancelExpiration/data", async function () {
      const { oracle, owner, othersAccount, publicClient } = await loadFixture(deployLockFixture);
      const hash = await oracle.write.compute([
        othersAccount[0].account.address,
        "0x00000000",
        0n,
        "0x"
      ], {value: callPrice + 1n});
      const txRcpt = await publicClient.waitForTransactionReceipt({hash});

      const oracleRequest = await oracle.getEvents.OracleRequest();
      expect(oracleRequest).to.have.lengthOf(1);
      expect(oracleRequest[0].args.requestId).to.equal(keccak256(encodePacked(["address", "uint256"], [owner.account.address, 0n])));
      expect(oracleRequest[0].args.callbackFunctionId).to.equal("0x00000000");
      const parsedLogs = parseEventLogs({abi: oracle.abi, eventName:  "OracleRequest", strict: true, logs: txRcpt.logs});
      expect(oracleRequest[0].args.cancelExpiration).to.equal(parsedLogs[0].args.cancelExpiration);
      expect(oracleRequest[0].args.data).to.equal("0x");
    });
    
    it("Should only cost the specified callprice if payed more", async function () {
      const { oracle, owner, othersAccount, publicClient } = await loadFixture(deployLockFixture);
      const beforeBalance = await publicClient.getBalance({address: owner.account.address});
      const hash = await oracle.write.compute([
        othersAccount[0].account.address,
        "0x00000000",
        0n,
        "0x"
      ], {value: callPrice*2n});
      const txRcpt = await publicClient.waitForTransactionReceipt({hash});
      const afterBalance = await publicClient.getBalance({address: owner.account.address});
      const gasCost = txRcpt.effectiveGasPrice * txRcpt.gasUsed;
      assert(beforeBalance == afterBalance + callPrice + gasCost);  
    });
  });

  describe("callback", function () {
    it("Should not the owner should not to call", async function () {
      const { oracle, owner, othersAccount } = await loadFixture(deployLockFixture);
      await oracle.write.compute([
        othersAccount[0].account.address,
        "0x00000000",
        0n,
        "0x"
      ], {value: callPrice + 1n});
      const requestId = keccak256(encodePacked(["address", "uint256"], [owner.account.address, 0n]));
      await expect(oracle.write.callback([requestId, `0x${"0".repeat(64)}`], {account: othersAccount[2].account.address})).to.be.rejectedWith("OwnableUnauthorizedAccount");
    });
    
    it("Should call with matched param types", async function () {
      const { oracle, owner, othersAccount } = await loadFixture(deployLockFixture);
      await oracle.write.compute([
        othersAccount[0].account.address,
        "0x00000000",
        0n,
        "0x"
      ], {value: callPrice + 1n});
      const requestId = keccak256(encodePacked(["address", "uint256"], [owner.account.address, 0n]));
      await expect(oracle.write.callback([requestId, `0x`], {account: othersAccount[2].account.address})).to.be.rejectedWith("Size of bytes \"0x\"");
    });

    it("Should exists requestId", async function () {
      const { oracle, owner } = await loadFixture(deployLockFixture);
      const requestId = keccak256(encodePacked(["address", "uint256"], [owner.account.address, 0n]));
      await expect(oracle.write.callback([requestId, `0x${"0".repeat(64)}`])).to.be.rejectedWith("Must have a valid requestId");
    });

    it("Should success with callbackAddr is EOA", async function () {
      const { oracle, owner, othersAccount } = await loadFixture(deployLockFixture);
      await oracle.write.compute([
        othersAccount[0].account.address,
        "0x00000000",
        0n,
        "0x"
      ], {value: callPrice + 1n});
      const requestId = keccak256(encodePacked(["address", "uint256"], [owner.account.address, 0n]));
      const txHash = await oracle.write.callback([requestId, `0x${"0".repeat(64)}`]);
      assert(true == true, `${txHash}: cannot get return value by this way(invoke outside of contract), by emit event with return value`);
    });
  });
  describe("CancelCompute", function () {
    it("Should fail when not the requester to cancel requestId.", async function () {
      const { oracle, owner, othersAccount } = await loadFixture(deployLockFixture);
      await oracle.write.compute([
        othersAccount[0].account.address,
        "0x00000000",
        0n,
        "0x"
      ], {value: callPrice + 1n});
      const requestId = keccak256(encodePacked(["address", "uint256"], [owner.account.address, 0n]));
      await expect(oracle.write.cancelCompute([requestId], {account: othersAccount[2].account.address})).to.be.rejectedWith("Only original sender can cancel.");
    });
    it("Should get the callPrice after cancel request.", async function () {
      const { oracle, owner, othersAccount, publicClient } = await loadFixture(deployLockFixture);
      await oracle.write.compute([
        othersAccount[0].account.address,
        "0x00000000",
        0n,
        "0x"
      ], {value: callPrice*2n});
      const beforeBalance = await publicClient.getBalance({address: owner.account.address});
      const requestId = keccak256(encodePacked(["address", "uint256"], [owner.account.address, 0n]));
      const hash = await oracle.write.cancelCompute([requestId]);
      const txRcpt = await publicClient.waitForTransactionReceipt({hash});
      const afterBalance = await publicClient.getBalance({address: owner.account.address});
      const gasCost = txRcpt.effectiveGasPrice * txRcpt.gasUsed;
      assert(beforeBalance + callPrice == afterBalance + gasCost);  
    });
  });
});
