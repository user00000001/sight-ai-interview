# Operations

## project setup

```shell
pnpm install
```

## node setup

```shell
pnpm hardhat node --hostname 0.0.0.0
```

## Oracle UnitTests

```shell
pnpm hardhat test
```

## Oracle deployment

```shell
rm -rf ignition/deployments/chain-31337 # remove previous deployment at hardhat localhost if necessary.
pnpm hardhat clean
pnpm hardhat ignition deploy --network localhost ./ignition/modules/OracleSC.ts
```

## setup API as [sight-interview-compute-api](https://github.com/sight-ai/sight-interview-compute-api)'s README

## setup Gateway Service

```shell
pnpm hardhat run ./scripts/listen-event.ts --network localhost
```

## request oracle, check logs in the gateway service console(api: request/response, parsed result).

```shell
pnpm hardhat run --network localhost ./scripts/oracle-request.ts
```

### 初看需求，有点像chainlink提供的MockOracle。在周日下午开始，根据后面的理解在MockOracle上，依据要求进行了更具体的实现`contracts\OracleSC.sol`(根据需求增加了在Oracle上对结果的保存，compute下执行用户的执行逻辑，可以理解为对指定合约在方法中内部调用，时间有限就没来回继续确认，callback函数内有类似实现，但根据可选1，似乎有些不同)。根据主要方法，使用最新版本hardhat/viem，完成了单元测试的编写`test\OracleSC.ts`，没有对foundry框架下的测试进行编写，对gateway服务理解编写`scripts\listen-event.ts`(监听事件数据，再利用有权限账号对合约进行再操作)，辅助执行脚本的编写`scripts\oracle-request.ts`。

- 可选任务1思路: 相当于将`{
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
}`这部分内容里的可变内容参数化，使用mapping存下主体当模板，再建方法通过模板键和传入参数，在方法内恢复成以上类似内容(比如先根据可变参数位置对json文本进行split，再拿到之后的参数后，再zip合并)再进行后面的emit调用；或者直接emit模板和参数数据后，在gateway服务合并，之后进行后面的调用

- 可选任务2思路：类似ERC712/EIP-2612,离线对交易参数hash值签名产生vrs,在需要提取时,调用验证vrs的方法，将vrs和交易参数组合的hash值恢复拿到签名的地址，由此证明签名有效，再从签名的地址的allowance中转出到实际得交易对象下，见之前我的foundry练习库 https://github.com/user00000001/hardhat007/blob/master/test/Signatures.t.sol 
