import { AccountUpdate, Field, verify, Mina, PrivateKey, PublicKey, VerificationKey, Proof } from "o1js"

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

  test("Should process message if agent ID is zero", async () => {
    const onChainMessageCount = await zkAppInstance.messageCount.fetch() || Field(0)

    const initState = new ProcessedMessage({ offset: onChainMessageCount, current: onChainMessageCount, prev: onChainMessageCount })

    const proof0 = await SpyMasterProgram.init(initState);

    const newMessage = new MessageDetails({ SNo: initState.prev.add(1), AgentID: Field(0), XLocation: Field(100), YLocation: Field(6000), CheckSum: Field(6101) })
    const newState = new ProcessedMessage({ offset: proof0.publicInput.offset, current: newMessage.SNo, prev: proof0.publicInput.prev })

    //validate message
    const proof1 = await SpyMasterProgram.agentIdCheck(newState, newMessage, proof0)

    expect(await verify(proof1.toJSON(), verificationKey)).toEqual(true)

    const processState = new ProcessedMessage({ offset: proof1.publicInput.offset, current: proof1.publicInput.current, prev: proof1.publicInput.current })
    const processProof = await SpyMasterProgram.processMessage(processState, proof1)

    expect(await verify(processProof.toJSON(), verificationKey)).toEqual(true)
  })

  test("Should commit latest messages to blockchain ", async () => {

    const onChainMessageCount = await zkAppInstance.messageCount.fetch() || Field(0)
    const initState = new ProcessedMessage({ offset: onChainMessageCount, current: onChainMessageCount, prev: onChainMessageCount })

    const proof0 = await SpyMasterProgram.init(initState);

    const newMessage = new MessageDetails({ SNo: Field(1), AgentID: Field(1), XLocation: Field(100), YLocation: Field(6000), CheckSum: Field(6101) })
    const newState = new ProcessedMessage({ offset: proof0.publicInput.offset, current: newMessage.SNo, prev: proof0.publicInput.prev })

    //validate message
    const proof1 = await SpyMasterProgram.validMessageCheck(newState, newMessage, proof0)

    const processState = new ProcessedMessage({ offset: proof1.publicInput.offset, current: proof1.publicInput.current, prev: proof1.publicInput.current })
    const processProof = await SpyMasterProgram.processMessage(processState, proof1)

    const { privateKey: senderKey, publicKey: senderAccount } = Local.testAccounts[1];
    // commit latest processed message number to blockchain
    const txn1 = await Mina.transaction(senderAccount, () => {
      zkAppInstance.setMessageCount(processProof);
      zkAppInstance.requireSignature()
    });

    await txn1.prove()

    await txn1.sign([senderKey, zkAppPrivateKey]).send()

    const newChainMessageCount = await zkAppInstance.messageCount.fetch()

    if (newChainMessageCount)
    expect( newChainMessageCount.toString() ).toEqual("1")

  })


});
