import {
    SmartContract,
    method,
    Permissions,
    PublicKey,
    Bool,
    Reducer,
    Provable,
    state,
    State,
    Field,
    Struct,
    UInt32,
    Poseidon,
} from 'o1js';


class Spy extends Struct({
    publicKey: PublicKey,
    message: Field,
}) {

    empty(): Spy {
        return new Spy({
            publicKey: PublicKey.empty(),
            message: Field.empty()
        });
    }

}

export class SpyNetwork extends SmartContract {

    /// Keep track of total Spies in network
    @state(Field) totalUsers = State<Field>();

    // Keep track of messages by users
    @state(Field) totalMessages = State<Field>();
    //Map for storing user enrollment
    reducer = Reducer({
        actionType: Spy
    });

    events = {
        "received-message-from": PublicKey
    }

    init() {
        super.init()
        this.account.permissions.set({
            ...Permissions.default(),
            editActionState: Permissions.proofOrSignature(),
            editState: Permissions.proofOrSignature()
        });
    }

    @method addUser(user: PublicKey) {
        /// To force admin only access We could also use `this.requireSignature()` 
        /// currently its done by `editActionState: Permissions.signature()`
        this.requireSignature();
        const x = this.totalUsers.get()
        this.totalUsers.requireEquals(x)
        x.assertLessThan(Field.from("100"), "Max user limit reached")
        // past actions 
        let pendingActions = this.reducer.getActions({ fromActionState: Reducer.initialActionState })

        // initial state of reducer
        let initial = {
            state: Bool(false),
            actionState: Reducer.initialActionState,
        };

        // checking if the user already exists within the actions
        let { state: exists } = this.reducer.reduce(
            pendingActions,
            Bool,
            (state: Bool, action: Spy) => {
                return action.publicKey.equals(user).or(state);
            },
            // initial state
            initial,
            {
                maxTransactionsWithActions: 200,
                skipActionStatePrecondition: true
            }
        );

        exists.assertFalse("User already exists")

        let toEmit = new Spy({
            publicKey: user,
            message: Field.empty()
        })

        let addedValue = x.add(1)

        this.totalUsers.set(addedValue);

        this.reducer.dispatch(toEmit);

    }

    @method sendMessage(message: Field) {
        const x = this.totalUsers.get()
        this.totalUsers.requireEquals(x)

        // past actions 
        let pendingActions = this.reducer.getActions({ fromActionState: Reducer.initialActionState })

        // initial state of reducer
        let initial = {
            state: new Bool(false),
            actionState: Reducer.initialActionState,
        };

        const txnSender = this.sender

        // checking if the user already messaged
        let { state: isUserEligible } = this.reducer.reduce(
            pendingActions,
            Bool,
            (state: Bool, action: Spy) => {
                //check if user is sender and its message is empty       
                let foundUser = action.publicKey.equals(txnSender)
                let foundMessage = foundUser.and(action.message.equals(0).not())

                let userExists = foundUser.or(state)
                return Provable.if(userExists.and(foundMessage), new Bool(false), userExists)
            },
            // initial state
            initial
        );

        /**
         * 
         * 
        Flag 6  mMessageBits[254] = Bool(false)
        Flag 5  mMessageBits[253] = Bool(false)       
        Flag 4  mMessageBits[252] = Bool(true)
        Flag 3 mMessageBits[251] = Bool(true)
        Flag 2  mMessageBits[250] = Bool(true)
        Flag 1 mMessageBits[249] = Bool(false)
         * 
         */

        //check correct message format
        const mMessageBits = message.toBits()
        const condition1 = Provable.if(mMessageBits[249],
            mMessageBits[250].not()
                .and(mMessageBits[251].not())
                .and(mMessageBits[252].not())
                .and(mMessageBits[253].not())
                .and(mMessageBits[254].not()),
            new Bool(true))

        const condition2 = Provable.if(mMessageBits[250], mMessageBits[251], new Bool(true))

        const condition3 = Provable.if(mMessageBits[252],
            mMessageBits[253].not()
                .and(mMessageBits[254].not()),
            new Bool(true))

        const finCondition = condition1.and(condition2).and(condition3)

        const messageGate = finCondition.and(isUserEligible)

        messageGate.assertTrue()

        /// Update message counter
        this.totalMessages.set(x.add(1));

        /// Emit Action
        let toEmit = new Spy({
            publicKey: this.sender,
            message: message,
        })
        this.reducer.dispatch(toEmit);

        /// Emit recevied message
        this.emitEvent("received-message-from", this.sender);

    }
}
