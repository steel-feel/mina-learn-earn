import {
    SmartContract,
    method,
    Permissions,
    PublicKey,
    Bool,
    state,
    State,
    Field,
    Struct,
    ZkProgram,
    SelfProof,
} from 'o1js';

let zkAppInstance: SpyMasterContract;

export class MessageDetails extends Struct({
    SNo: Field,
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
    current: Field,
    prev: Field
}) {
    empty(): ProcessedMessage {
        return new ProcessedMessage({
            offset: Field.empty(),
            current: Field.empty(),
            prev: Field.empty()
        });
    }

}

export class ProcessResult extends Struct({
    isAgentZero: Bool,
    isSnoGreater: Bool,
    isMessageValid: Bool
}) { }


export const SpyMasterProgram = ZkProgram({
    name: "spymaster",
    //ToDo: Should be struct having current value and message count offset value
    publicInput: ProcessedMessage,
    publicOutput: ProcessResult,

    methods: {
        init: {

            privateInputs: [],
            method(state: ProcessedMessage): ProcessResult {
                state.offset.assertEquals(state.current)
                state.offset.assertEquals(state.prev)
                return new ProcessResult({
                    isAgentZero: Bool(false),
                    isSnoGreater: Bool(false),
                    isMessageValid: Bool(false)
                })
            }

        },


        //check if agent ID is 0
        agentIdCheck: {
            privateInputs: [MessageDetails, SelfProof],
            method(newState: ProcessedMessage, messageDetails: MessageDetails,earlierProof: SelfProof<ProcessedMessage, ProcessResult>): ProcessResult {
                earlierProof.verify()
                newState.current.assertEquals(messageDetails.SNo)
                messageDetails.AgentID.assertEquals(Field(0))

                return new ProcessResult({
                    isAgentZero:Bool(true),
                    isSnoGreater: Bool(false),
                    isMessageValid: Bool(false)
                })
            }

        },
        //check if processing message Sno is greater than current one
        messageNumberCheck: {
            privateInputs: [MessageDetails, SelfProof],
            method(newState: ProcessedMessage, messageDetails: MessageDetails, earlierProof: SelfProof<ProcessedMessage, ProcessResult>): ProcessResult {
                earlierProof.verify()
                newState.current.assertEquals(newState.prev)
                earlierProof.publicInput.prev.assertGreaterThanOrEqual(messageDetails.SNo)

                return new ProcessResult({
                    isAgentZero: Bool(false),
                    isSnoGreater: Bool(true),
                    isMessageValid: Bool(false)
                })
            }

        },
        //check to run message details validation
        validMessageCheck: {
            privateInputs: [MessageDetails,SelfProof],
            method(newState: ProcessedMessage, messageDetails: MessageDetails, earlierProof: SelfProof<ProcessedMessage, ProcessResult> ): ProcessResult {
                earlierProof.verify()
                newState.current.assertEquals(messageDetails.SNo)
                messageDetails.validateMessage().assertTrue("Message is invalid")

                return new ProcessResult({
                    isAgentZero: Bool(false),
                    isSnoGreater: Bool(false),
                    isMessageValid:  Bool(true),
                })
            }
        },

        //process message and increment prev processed message
        processMessage: {
            privateInputs: [SelfProof],
            method(newState: ProcessedMessage, earlierProof: SelfProof<ProcessedMessage, ProcessResult>): ProcessResult {
                earlierProof.verify()

                earlierProof.publicOutput.isAgentZero.or(earlierProof.publicOutput.isSnoGreater).or(earlierProof.publicOutput.isMessageValid).assertTrue()
                newState.prev.assertEquals(earlierProof.publicInput.current);
                
                return new ProcessResult({
                    isAgentZero: Bool(false),
                    isSnoGreater: Bool(false),
                    isMessageValid: Bool(false),
                })
            }
        }

    }
})


export let SpyMessageProof_ = ZkProgram.Proof(SpyMasterProgram);
export class SpyMessageProof extends SpyMessageProof_ { }


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

        this.messageCount.set(spyMessageProof.publicInput.prev);
    }

}