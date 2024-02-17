import { AccountUpdate, Field, verify, Mina, PrivateKey, PublicKey, VerificationKey } from "o1js"

import { SpyMasterContract, MessageDetails, ProcessedMessage, setzkAppInstance, SpyMasterProgram } from './spymaster';

describe('Spy Master Message proccessing', () => {

  let zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkAppInstance: SpyMasterContract,
    verificationKey: VerificationKey,
    Local: any


  beforeAll(async () => {

    //for ZK Program  
    const result = await SpyMasterProgram.compile({ forceRecompile: true });
    verificationKey = result.verificationKey;

    const useProof = false

    Local = Mina.LocalBlockchain({ proofsEnabled: useProof });
    Mina.setActiveInstance(Local);

    const { privateKey: deployerKey, publicKey: deployerAccount } = Local.testAccounts[0];

    // Create a public/private key pair. The public key is your address and where you deploy the zkApp to
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();

    // create an instance of Message - and deploy it to zkAppAddress
    zkAppInstance = new SpyMasterContract(zkAppAddress);
    const deployTxn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkAppInstance.deploy();
    });

    await deployTxn.prove();

    await deployTxn.sign([deployerKey, zkAppPrivateKey]).send();

    setzkAppInstance(zkAppAddress)



  });


  it("Should successfully execute init messages", async () => {
    const onChainMessageCount = await zkAppInstance.messageCount.fetch() || Field(0)

    const state = new ProcessedMessage({ offset: onChainMessageCount, current: onChainMessageCount })

    const proof0 = await SpyMasterProgram.init(state);

    return expect(verify(proof0.toJSON(), verificationKey)).resolves.toEqual(true);
  })

  it("Should create recursive proof ", async () => {

    const onChainMessageCount = await zkAppInstance.messageCount.fetch() || Field(0)

    const initState = new ProcessedMessage({ offset: onChainMessageCount, current: onChainMessageCount })

    const proof0 = await SpyMasterProgram.init(initState);

    const proof1 = await SpyMasterProgram.processMessage(
      new ProcessedMessage({ offset: initState.offset, current: initState.offset.add(1) }),
      proof0,
      new MessageDetails({ AgentID: Field(1), XLocation: Field(100), YLocation: Field(6000), CheckSum: Field(6101) }
      ))


    return expect(verify(proof1.toJSON(), verificationKey)).resolves.toEqual(true);
  })

  it("Should create recursive proof ", async () => {

    const onChainMessageCount = await zkAppInstance.messageCount.fetch() || Field(0)

    const initState = new ProcessedMessage({ offset: onChainMessageCount, current: onChainMessageCount })

    const proof0 = await SpyMasterProgram.init(initState);

    const proof1 = await SpyMasterProgram.processMessage(
      new ProcessedMessage({ offset: initState.offset, current: initState.offset.add(1) }),
      proof0,
      new MessageDetails({ AgentID: Field(1), XLocation: Field(100), YLocation: Field(6000), CheckSum: Field(6101) }
      ))


    return expect(verify(proof1.toJSON(), verificationKey)).resolves.toEqual(true);
  })

  it("Should commit latest messages to blockchain ", async () => {

    const onChainMessageCount = await zkAppInstance.messageCount.fetch() || Field(0)

    const initState = new ProcessedMessage({ offset: onChainMessageCount, current: onChainMessageCount })

    const proof0 = await SpyMasterProgram.init(initState);

    const proof1 = await SpyMasterProgram.processMessage(
      new ProcessedMessage({ offset: initState.offset, current: initState.offset.add(1) }),
      proof0,
      new MessageDetails({ AgentID: Field(1), XLocation: Field(100), YLocation: Field(6000), CheckSum: Field(6101) }
      ))

      const { privateKey: senderKey, publicKey: senderAccount } = Local.testAccounts[1];

          // check for adding members
    const txn1 = await Mina.transaction(senderAccount, () => {
      zkAppInstance.setMessageCount(proof1)  ;
      zkAppInstance.requireSignature()
    });

    await txn1.prove()

    return expect(txn1.sign([senderKey, zkAppPrivateKey]).send()).resolves.toBeTruthy()
  })


});
