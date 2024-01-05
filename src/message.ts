import {
    SmartContract,
    method,
    Permissions,
    PublicKey,
    Bool,
    Reducer,
    Provable
} from 'o1js';


export class Message extends SmartContract {

    //Map for storing user enrollment
    reducer = Reducer({
        actionType: PublicKey,
    });

    init() {
        super.init()
        this.account.permissions.set({
            ...Permissions.default(),
            editActionState: Permissions.signature(),
            editState: Permissions.proofOrSignature()
        });
    }

    @method addUsers(user: PublicKey) {
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
            (state: Bool, action: PublicKey) => {
                return action.equals(user).or(state);
            },
            // initial state
            initial
        );
            
        let toEmit = Provable.if(exists, PublicKey.empty(), user);

        this.reducer.dispatch(toEmit);

    }

}