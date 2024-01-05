import { Message } from './message.js';
import {
  Mina,
  PrivateKey,
  AccountUpdate,
  Reducer
} from 'o1js';

const useProof = false

const Local = Mina.LocalBlockchain({ proofsEnabled: useProof });
Mina.setActiveInstance(Local);


const { privateKey: deployerKey, publicKey: deployerAccount } = Local.testAccounts[0];
const { privateKey: senderKey, publicKey: senderAccount } = Local.testAccounts[1];

// Create a public/private key pair. The public key is your address and where you deploy the zkApp to
const zkAppPrivateKey = PrivateKey.random();
const zkAppAddress = zkAppPrivateKey.toPublicKey();

// create an instance of Message - and deploy it to zkAppAddress
const zkAppInstance = new Message(zkAppAddress);
const deployTxn = await Mina.transaction(deployerAccount, () => {
  AccountUpdate.fundNewAccount(deployerAccount);
  zkAppInstance.deploy();
});

await deployTxn.prove();

await deployTxn.sign([deployerKey, zkAppPrivateKey]).send();

// user to be added
const Bob = PrivateKey.fromBase58(
  'EKFAdBGSSXrBbaCVqy4YjwWHoGEnsqYRQTqz227Eb5bzMx2bWu3F'
)
// check for adding members
const txn1 = await Mina.transaction(senderAccount, () => {
  zkAppInstance.addUsers( Bob.toPublicKey() );
  zkAppInstance.requireSignature()

});

await txn1.prove();
const tx1Promise = await txn1.sign([ senderKey, zkAppPrivateKey]).send();

await tx1Promise.wait();

// Fetch all events from zkapp starting at block 0
// const events = await zkAppInstance.fetchEvents(UInt32.from(0));

// let pastActions = await zkAppInstance.reducer.fetchActions({
//   fromActionState: Reducer.initialActionState
// })

