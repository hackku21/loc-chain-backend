import {FirebaseResource, FirebaseResourceItem} from "../FirebaseResource"
import {Injectable} from "@extollo/di"
import {RTDBRef} from "../units/FirebaseUnit"
import {AsyncCollection} from "@extollo/util"

/**
 * Interface representing a client-submitted encounter transaction.
 */
export interface TransactionResourceItem extends FirebaseResourceItem {
    combinedHash: string;  // The salted and hashed combination of the client IDs
    timestamp: number;  // the unix-time in milliseconds when the interaction occurred
    encodedGPSLocation: string;  // Encoded GPS location data
    partnerPublicKey: string;  // The public key of the other client
    validationSignature: string;  // The transaction validation data
}

/**
 * A Firebase realtime-database resource for managing encounter transactions.
 */
@Injectable()
export class TransactionResource extends FirebaseResource<TransactionResourceItem> {
    public static collect(): AsyncCollection<TransactionResourceItem> {
        return new AsyncCollection<TransactionResourceItem>(new TransactionResource())
    }

    protected refName: RTDBRef = 'transaction'
}
