import { AccountUpdate, Field, Mina, PrivateKey, PublicKey, Reducer } from 'o1js';
import { Message } from './message';

describe('Spy Messaging Network', () => {
  let zkAppAddress: PublicKey,
    zkAppPrivateKey: PrivateKey,
    zkAppInstance: Message,
    Local: any

    const Bob = PrivateKey.fromBase58(
      'EKFAdBGSSXrBbaCVqy4YjwWHoGEnsqYRQTqz227Eb5bzMx2bWu3F'
    )

  beforeAll(async () => {
    const useProof = false

    Local = Mina.LocalBlockchain({ proofsEnabled: useProof });
    Mina.setActiveInstance(Local);

    const { privateKey: deployerKey, publicKey: deployerAccount } = Local.testAccounts[0];

    // Create a public/private key pair. The public key is your address and where you deploy the zkApp to
    zkAppPrivateKey = PrivateKey.random();
    zkAppAddress = zkAppPrivateKey.toPublicKey();

    // create an instance of Message - and deploy it to zkAppAddress
    zkAppInstance = new Message(zkAppAddress);
    const deployTxn = await Mina.transaction(deployerAccount, () => {
      AccountUpdate.fundNewAccount(deployerAccount);
      zkAppInstance.deploy();
    });

    await deployTxn.prove();

    await deployTxn.sign([deployerKey, zkAppPrivateKey]).send();

  });


  test("Only Admin can add users ", async () => {
    const { privateKey: senderKey, publicKey: senderAccount } = Local.testAccounts[1];

    // check for adding members
    const txn1 = await Mina.transaction(senderAccount, () => {
      zkAppInstance.addUsers(Bob.toPublicKey());
      zkAppInstance.requireSignature()
    });

    return expect(txn1.sign([senderKey, zkAppPrivateKey]).send()).resolves.toBeTruthy()

  })

  test("Non-admin can not add users", async () => {
    const Bob = PrivateKey.fromBase58(
      'EKFAdBGSSXrBbaCVqy4YjwWHoGEnsqYRQTqz227Eb5bzMx2bWu3F'
    )

    const { privateKey: senderKey, publicKey: senderAccount } = Local.testAccounts[1];

    // add members without signing
    const txn1 = await Mina.transaction(senderAccount, () => {
      zkAppInstance.addUsers(Bob.toPublicKey());
    });

    return expect(txn1.sign([senderKey]).send()).rejects.toThrow()
  })

  test("Method addUser should emit actions", async () => {
  
    let pastActions = await zkAppInstance.reducer.fetchActions({
      fromActionState: Reducer.initialActionState
    })

    expect(pastActions[0][0].toBase58()).toBe(Bob.toPublicKey().toBase58())

  })

  test("Total users should be 1", async () => {
    expect(zkAppInstance.totalUsers.get()).toEqual(Field.from(1))
  })


});
