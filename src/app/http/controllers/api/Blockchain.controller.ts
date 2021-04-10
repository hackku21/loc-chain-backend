import {Controller} from "@extollo/lib"
import {Injectable, Inject} from "@extollo/di"
import {TransactionResource, TransactionResourceItem} from "../../../rtdb/TransactionResource"
import {many, one} from "@extollo/util"
import {Block, Blockchain as BlockchainService} from "../../../units/Blockchain"
import {ExposureResource, ExposureResourceItem} from "../../../rtdb/ExposureResource";

/**
 * Blockchain Controller
 * ------------------------------------
 * Route handlers for API endpoints.
 */
@Injectable()
export class Blockchain extends Controller {
    @Inject()
    protected readonly blockchain!: BlockchainService

    /**
     * Read the version of the blockchain held by this host, as it currently exists.
     */
    public async readBlockchain() {
        return many((await this.blockchain.read()).map(x => {
            // @ts-ignore
            delete x.firebaseID
            return x
        }))
    }

    public async validate() {
        const blocks = (await this.blockchain.read()).map(x => new Block(x))
        return {
            is_valid: await this.blockchain.validate(blocks)
        }
    }

    /**
     * Post a new transaction to the blockchain. This is only intended for testing.
     */
    public async postTransaction() {
        const item: TransactionResourceItem = {
            firebaseID: '',
            seqID: -1,
            combinedHash: String(this.request.input('combinedHash')),
            timestamp: parseInt(String(this.request.input('timestamp'))),
            encodedGPSLocation: String(this.request.input('encodedGPSLocation')),
            partnerPublicKey: String(this.request.input('partnerPublicKey')),
            validationSignature: String(this.request.input('validationSignature')),
        }

        await (<TransactionResource> this.make(TransactionResource)).push(item)
        return one(item)
    }

    /**
     * Post a new exposure notification to the blockchain. This is only intended for testing.
     */
    public async postExposure() {
        const item: ExposureResourceItem = {
            firebaseID: '',
            seqID: -1,
            clientID: String(this.request.input('clientID')),
            timestamp: parseInt(String(this.request.input('timestamp'))),
        }

        await (<ExposureResource> this.make(ExposureResource)).push(item)
        return one(item)
    }
}
