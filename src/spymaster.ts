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
    ZkProgram,
    SelfProof,
} from 'o1js';

let zkAppInstance: SpyMasterContract;

export class MessageDetails extends Struct({
    AgentID: Field,
    XLocation: Field,
    YLocation: Field,
    CheckSum: Field
}) {

    validateMessage(): Bool {
        ///~~~~ CHECKS ~~~

        ///Checksum
        this.CheckSum.assertEquals(this.AgentID.add(this.XLocation.add(this.YLocation)))

        ///Agent's YLocation should be greater than Agent's XLocation
        this.YLocation.assertGreaterThan(this.XLocation)

        //Range 
        this.AgentID.assertGreaterThan(0)
        this.AgentID.assertLessThan(3000)

        this.XLocation.assertGreaterThan(0)
        this.XLocation.assertLessThan(15000)

        this.YLocation.assertGreaterThan(5000)
        this.YLocation.assertLessThan(20000)

        return Bool(true)
    }


}

export class ProcessedMessage extends Struct({
        offset: Field,
        current: Field
}){
    empty(): ProcessedMessage {
        return new ProcessedMessage({
            offset: Field.empty(),
            current: Field.empty()
        });
    }

}


export const SpyMasterProgram = ZkProgram({
    name: "spymaster",
    //ToDo: Should be struct having current value and message count offset value
    publicInput: ProcessedMessage,

    methods: {

        init: {

            privateInputs: [],

            async method(state: ProcessedMessage) {
                 state.offset.assertEquals(state.current)
            }

        },

        processMessage: {
            privateInputs: [SelfProof, MessageDetails],
            method(newState: ProcessedMessage, earlierProof: SelfProof<Field, void>, messageDetails: MessageDetails) {
              
                //ToDo: check if new state offset is same as public input
                earlierProof.verify();

                if (messageDetails.AgentID.equals(0)) {
                    return 
                }

                if (newState.current.lessThan(earlierProof.publicInput)) {
                    //Duplicate message, details needs not to be checked
                    return
                }

                messageDetails.validateMessage().assertTrue("Message validation failed");
                newState.current.assertEquals(earlierProof.publicInput.add(1));
            }
        },

    }
})


export let SpyMessageProof_ = ZkProgram.Proof(SpyMasterProgram);
export class SpyMessageProof extends SpyMessageProof_ {}


export function setzkAppInstance(address: PublicKey) {
    zkAppInstance = new SpyMasterContract(address);
}

export class SpyMasterContract extends SmartContract {
    /// Keep track of total processed message in network
    @state(Field) messageCount = State<Field>();

    init() {
        super.init()
        this.account.permissions.set({
            ...Permissions.default(),
            editState: Permissions.signature()
        });
    }

    @method setMessageCount(spyMessageProof: SpyMessageProof) {
        this.messageCount.getAndRequireEquals();

        this.messageCount.requireEquals(spyMessageProof.publicInput.offset)

        spyMessageProof.publicInput.current.assertGreaterThan(spyMessageProof.publicInput.offset)
        spyMessageProof.verify();

        this.messageCount.set(spyMessageProof.publicInput.current);
    }

}