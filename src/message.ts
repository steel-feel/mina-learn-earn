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

export class Message extends SmartContract {

    /// Keep track of total Spies in network
    @state(Field) totalUsers = State<Field>();

    // Keep track of messages by users
    @state(Field) totalMessages = State<Field>();
    //Map for storing user enrollment
    reducer = Reducer({
        actionType: Spy,
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

    @method addUsers(user: PublicKey) {
        /// To force admin only access We could also use `this.requireSignature()` 
        /// currently its done by `editActionState: Permissions.signature()`
        this.requireSignature();
        const x = this.totalUsers.get()
        this.totalUsers.requireEquals(x)
        x.assertLessThanOrEqual(100)
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
            initial
        );

        let toEmit = new Spy({
            publicKey: Provable.if(exists, PublicKey.empty(), user),
            message: Field.empty()
        })

        let addedValue = Provable.if(exists, x, x.add(1));

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

        // checking if the user already messaged
        let { state: isUserEligible } = this.reducer.reduce(
            pendingActions,
            Bool,
            (state: Bool, action: Spy) => {
                //check if user is sender and its message is empty
                let foundMessage = action.publicKey.equals(this.sender).and(action.message.equals(0))
                let foundUser = action.publicKey.equals(this.sender)

                let userExists = foundUser.or(state)
                return Provable.if(userExists.and(foundMessage), new Bool(false), userExists)
            },
            // initial state
            initial
        );

        /// Update message counter
        let updatedTotalMessages = Provable.if(isUserEligible, x, x.add(1));
        this.totalMessages.set(updatedTotalMessages);

        /// Emit Action
        let toEmit = new Spy({
            publicKey: Provable.if(isUserEligible, this.sender, PublicKey.empty()),
            message: Provable.if(isUserEligible, message, Field.empty()),
        })
        this.reducer.dispatch(toEmit);

        /// Emit recevied message
        this.emitEvent("received-message-from", Provable.if(isUserEligible, this.sender, PublicKey.empty()));

    }
}
