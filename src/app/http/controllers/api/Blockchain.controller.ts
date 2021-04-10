import {Controller} from "@extollo/lib"
import {Injectable} from "@extollo/di"
import {TransactionResource, TransactionResourceItem} from "../../../rtdb/TransactionResource"
import {one} from "@extollo/util"

/**
 * Blockchain Controller
 * ------------------------------------
 * Route handlers for API endpoints.
 */
@Injectable()
export class Blockchain extends Controller {
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
}
