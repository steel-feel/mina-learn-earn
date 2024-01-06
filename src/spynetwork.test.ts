import { AccountUpdate, Bool, Field, Mina, PrivateKey, PublicKey, Reducer, UInt32, fetchEvents, verify } from 'o1js';
import { SpyNetwork } from './spynetwork';

describe('Spy Messaging Network', () => {
  let zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkAppInstance: SpyNetwork,
    Local: any

  beforeAll(async () => {
    const useProof = false

    Local = Mina.LocalBlockchain({ proofsEnabled: useProof });
    Mina.setActiveInstance(Local);

    const { privateKey: deployerKey, publicKey: deployerAccount } = Local.testAccounts[0];

    // Create a public/private key pair. The public key is your address and where you deploy the zkApp to
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();

    // create an instance of Message - and deploy it to zkAppAddress
    zkAppInstance = new SpyNetwork(zkAppAddress);
    const deployTxn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkAppInstance.deploy();
    });

    await deployTxn.prove();

    await deployTxn.sign([deployerKey, zkAppPrivateKey]).send();

  });


  test("Only Admin can add users ", async () => {
    const { privateKey: senderKey, publicKey: senderAccount } = Local.testAccounts[1];

    const { privateKey: bobPrivateKey, publicKey: bobAccount } = Local.testAccounts[2];

    // check for adding members
    const txn1 = await Mina.transaction(senderAccount, () => {
      const zkAppInstance = new SpyNetwork(zkAppAddress);
      zkAppInstance.addUsers(bobAccount);
      zkAppInstance.requireSignature()
    });

    return expect(txn1.sign([senderKey, zkAppPrivateKey]).send()).resolves.toBeTruthy()

  })

  test("Non-admin can not add users", async () => {

    const { privateKey: senderKey, publicKey: senderAccount } = Local.testAccounts[1];
    const { privateKey: bobPrivateKey, publicKey: bobAccount } = Local.testAccounts[2];

    // add members without signing
    // const txn1 = await Mina.transaction(senderAccount, () => {
    //   const zkAppInstance = new SpyNetwork(zkAppAddress);
    //   zkAppInstance.addUsers(bobAccount);
    //   zkAppInstance.requireSignature()
    // });

    // return expect(txn1.sign([senderKey]).send()).rejects.toThrow()

    return expect(Mina.transaction(senderAccount, () => {
      const zkAppInstance = new SpyNetwork(zkAppAddress);
      zkAppInstance.addUsers(bobAccount);
      zkAppInstance.requireSignature()
    })).rejects.toThrow()

  })

  test("Total users should be 1", async () => {
    expect(zkAppInstance.totalUsers.get()).toEqual(Field.from(1))
  })

  test("Spy should be able to send message", async () => {
    const { privateKey: bobPrivateKey, publicKey: bobAccount } = Local.testAccounts[2];

    const tx1 = await Mina.transaction(bobAccount, () => {
      const zkAppInstance = new SpyNetwork(zkAppAddress);
      const rawMessage = Field.random()
      const mBits = rawMessage.toBits()
      mBits[254] = new Bool(false)
      mBits[253] = new Bool(false)
      mBits[252] = new Bool(false)
      mBits[251] = new Bool(false)
      mBits[250] = new Bool(false)
      mBits[249] = new Bool(true)

      const message = Field.fromBits(mBits)

      zkAppInstance.sendMessage(message)
    })

    await tx1.prove()

    return expect(tx1.sign([bobPrivateKey]).send()).resolves.toBeTruthy()
  })

  test("Message should not be sent with wrong format", async () => {
    const { privateKey: bobPrivateKey, publicKey: bobAccount } = Local.testAccounts[2];

    const zkAppInstance = new SpyNetwork(zkAppAddress);

    return expect(Mina.transaction(bobAccount, () => {
      const rawMessage = Field.random()
      const mBits = rawMessage.toBits()
      mBits[254] = new Bool(false)
      mBits[253] = new Bool(true)
      mBits[252] = new Bool(false)
      mBits[251] = new Bool(false)
      mBits[250] = new Bool(false)
      mBits[249] = new Bool(true)

      const message = Field.fromBits(mBits)

      zkAppInstance.sendMessage(message)
    })).rejects.toThrow()

  })

  test("Should emit event for sent message", async () => {
    const { privateKey: bobPrivateKey, publicKey: bobAccount } = Local.testAccounts[2];
    const zkAppInstance = new SpyNetwork(zkAppAddress);

    //check for event of user
    const events = await zkAppInstance.fetchEvents(UInt32.from(0))

    expect(events[0].event.data).toEqual(bobAccount)
    expect(events[0].type).toMatch(/received-message-from/)
  })


});
