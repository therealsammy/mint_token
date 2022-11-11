console.clear();

require("dotenv").config();

const {
  Client,
  AccountId,
  PrivateKey,
  TokenCreateTransaction,
  FileCreateTransaction,
  FileAppendTransaction,
  ContractCreateTransaction,
  ContractExecuteTransaction,
  ContractFunctionParameters,
  TokenUpdateTransaction,
  TokenInfoQuery,
  AccountBalanceQuery,
  Hbar,
} = require("@hashgraph/sdk");

const fs = require("fs");

const operatorId = AccountId.fromString(process.env.OPERATOR_ID);
const operatorKey = PrivateKey.fromString(process.env.OPERATOR_KEY);
const treasuryId = AccountId.fromString(process.env.TREASURY_ID);
const treasuryKey = PrivateKey.fromString(process.env.TREASURY_KEY);
const receiverId = AccountId.fromString(process.env.RECEIVER_ID);
const receiverKey = PrivateKey.fromString(process.env.RECEIVER_KEY);

const client = Client.forTestnet().setOperator(operatorId, operatorKey);
client.MaxTransactionFee(new Hbar(0.75));
client.setMaxQueryPayment(new Hbar(0.01));

async function main() {
  //Read bytecode from file
  const bytecode = fs.readFileSync("./contract.bin");
  console.log("- Done reading contract.bin \n");

  // Create a fungible token
  const tokenTx = await new TokenCreateTransaction()
    .setTokenName("MyToken")
    .setTokenSymbol("MT")
    .setDecimals(0)
    .setInitialSupply(100)
    .setTreasuryAccountId(treasuryId)
    .setAdminKey(treasuryKey)
    .setSupplyKey(treasuryKey)
    .freezeWith(client)
    .sign(treasuryKey);

  const tokenSubmit = await tokenTx.execute(client);
  const tokenReceipt = await tokenSubmit.getReceipt(client);
  const tokenId = tokenReceipt.tokenId;
  const tokenAddressSol = tokenId.toSolidityAddress();
  console.log(`- Token created with ID: ${tokenId} \n`);
  console.log(`- Token ID in Solidity: ${tokenAddressSol} \n`);

  // Token query
  const tokenInfo = await tQuery(tokenId);
  console.log(`- Token supply: ${tokenInfo.totalSupply.low} \n`);

  // Create a file on Hedera and store the bytecode
  const fileCreateTx = await new FileCreateTransaction()
    .setKeys(treasuryId)
    .freezeWith(client);

  const fileCreateTxSigned = await fileCreateTx.sign(treasuryKey);
  const fileCreateSubmit = await fileCreateTxSigned.execute(client);
  const fileCreateReceipt = await fileCreateSubmit.getReceipt(client);
  const fileId = fileCreateReceipt.fileId;
  console.log(`- File created with ID: ${fileId} \n`);

  // Append the bytecode to the file
  const fileAppendTx = await new FileAppendTransaction()
    .setFileId(fileId)
    .setContents(bytecode)
    .setMaxChunks(10)
    .freezeWith(client);
  const fileAppendTxSigned = await fileAppendTx.sign(treasuryKey);
  const fileAppendSubmit = await fileAppendTxSigned.execute(client);
  const fileAppendReceipt = await fileAppendSubmit.getReceipt(client);
  console.log(`- File appended: ${fileAppendReceipt.status} \n`);

  // Create a contract
  const contractCreateTx = await new ContractCreateTransaction()
    .setBytecodeFileId(fileId)
    .setGas(3000000)
    .setConstructorParameters(
      new ContractFunctionParameters().addAddress(tokenAddressSol)
    );
  const contractCreateTxSubmit = await contractCreateTx.execute(client);
  const contractCreateTxReceipt = await contractCreateTxSubmit.getReceipt(
    client
  );
  const contractId = contractCreateTxReceipt.contractId;
  const contractAddress = contractId.toSolidityAddress();
  console.log(`- Contract created with ID: ${contractId} \n`);
  console.log(`- Contract ID in Solidity: ${contractAddress} \n`);

  // token query
  const tokenInfo2 = await tQuery(tokenId);
  console.log(`- Token supply key: ${tokenInfo2.supplyKey.toString()} \n`);

  // Update token so the contract manages the supply
  const tokenUpdateTx = await new TokenUpdateTransaction()
    .setTokenId(tokenId)
    .setSupplyKey(contractId)
    .freezeWith(client)
    .sign(treasuryKey);

  const tokenUpdateSubmit = await tokenUpdateTx.execute(client);
  const tokenUpdateReceipt = await tokenUpdateSubmit.getReceipt(client);
  console.log(`- Token updated: ${tokenUpdateReceipt.status} \n`);

  // token query
  const tokenInfo2p1 = await tQuery(tokenId);
  console.log(`- Token supply key: ${tokenInfo2p1.supplyKey.toString()} \n`);

  // Execute the contract (mint)
  const contractExecuteTx = await new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(3000000)
    .setFunction("mintToken", new ContractFunctionParameters().addUint64(100));
  const contractExecuteTxSubmit = await contractExecuteTx.execute(client);
  const contractExecuteTxReceipt = await contractExecuteTxSubmit.getReceipt(
    client
  );
  console.log(
    `- Contract executed: ${contractExecuteTxReceipt.status.toString()} \n`
  );

  // token query
  const tokenInfo3 = await tQuery(tokenId);
  console.log(`- Token supply: ${tokenInfo3.totalSupply.low} \n`);

  // Execute the contract (burn)
  const contractExecuteTx2 = await new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(3000000)
    .setFunction("burnToken", new ContractFunctionParameters().addUint64(100));
  const contractExecuteTxSubmit2 = await contractExecuteTx2.execute(client);
  const contractExecuteTxReceipt2 = await contractExecuteTxSubmit2.getReceipt(
    client
  );
  console.log(
    `- Contract executed: ${contractExecuteTxReceipt2.status.toString()} \n`
  );

  // token query
  const tokenInfo4 = await tQuery(tokenId);
  console.log(`- Token supply: ${tokenInfo4.totalSupply.low} \n`);

  // Execute a contract function (associate)
  const contractExecuteTx3 = await new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(3000000)
    .setFunction(
      "tokenAssociate",
      new ContractFunctionParameters().addAddress(
        receiverId.toSolidityAddress()
      )
    )
    .freezeWith(client);
  const ContractExecuteTx3Signed = await contractExecuteTx3.sign(receiverKey);
  const contractExecuteTxSubmit3 = await ContractExecuteTx3Signed.execute(
    client
  );
  const contractExecuteTxReceipt3 = await contractExecuteTxSubmit3.getReceipt(
    client
  );
  console.log(
    `- Contract executed: ${contractExecuteTxReceipt3.status.toString()} \n`
  );

  // execute a contract function (transfer)
  const contractExecuteTx4 = await new ContractExecuteTransaction()
    .setContractId(contractId)
    .setGas(3000000)
    .setFunction(
      "tokenTransfer",
      new ContractFunctionParameters()
        .addAddress(treasuryId.toSolidityAddress())
        .addAddress(receiverId.toSolidityAddress())
        .addUint64(100)
    )
    .freezeWith(client);
  const ContractExecuteTx4Signed = await contractExecuteTx4.sign(treasuryKey);
  const contractExecuteTxSubmit4 = await ContractExecuteTx4Signed.execute(
    client
  );
  const contractExecuteTxReceipt4 = await contractExecuteTxSubmit4.getReceipt(
    client
  );
  console.log(
    `- Contract executed: ${contractExecuteTxReceipt4.status.toString()} \n`
  );

  // token query
  const treasuryBalance = await bQuery(treasuryId);
  const receiverBalance = await bQuery(receiverId);

  console.log(`- Treasury balance: ${treasuryBalance} units of ${tokenId} \n`);
  console.log(`- Receiver balance: ${receiverBalance} units of ${tokenId} \n`);

  // Reused query functions

  async function tQuery(aId) {
    let tInfo = await new TokenInfoQuery().setTokenId(aId).execute(client);
    return tInfo;
  }

  async function bQuery(aId) {
    let balanceCheckInfo = await new AccountBalanceQuery()
      .setAccountId(aId)
      .execute(client);
    return balanceCheckInfo.tokens.__map.get(aId.toString());
  }
}
