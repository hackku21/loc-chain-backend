import {FirebaseResource, FirebaseResourceItem} from "../FirebaseResource"
import {Injectable} from "@extollo/di"
import {RTDBRef} from "../units/FirebaseUnit"
import {AsyncCollection} from "@extollo/util";

/**
 * Interface representing a client-submitted encounter transaction.
 */
export interface TransactionResourceItem extends FirebaseResourceItem {
    combinedHash: string;
    timestamp: number;
    encodedGPSLocation: string;
    partnerPublicKey: string;
    validationSignature: string;
}

@Injectable()
export class TransactionResource extends FirebaseResource<TransactionResourceItem> {
    public static collect(): AsyncCollection<TransactionResourceItem> {
        return new AsyncCollection<TransactionResourceItem>(new TransactionResource())
    }

    protected refName: RTDBRef = 'transaction'
}
