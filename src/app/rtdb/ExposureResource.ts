import {FirebaseResource, FirebaseResourceItem} from "../FirebaseResource"
import {Injectable} from "@extollo/di"
import {RTDBRef} from "../units/FirebaseUnit"
import {AsyncCollection} from "@extollo/util"

/**
 * Interface representing a client-submitted encounter transaction.
 */
export interface ExposureResourceItem extends FirebaseResourceItem {
    uuid?: string;
    clientID: string;  // the exposed client's ID - used as one half of the hashes
    timestamp: number;  // the unix-time in milliseconds when the interaction occurred
}

/**
 * A Firebase realtime-database resource for managing exposure transactions.
 */
@Injectable()
export class ExposureResource extends FirebaseResource<ExposureResourceItem> {
    public static collect(): AsyncCollection<ExposureResourceItem> {
        return new AsyncCollection<ExposureResourceItem>(new ExposureResource())
    }

    protected refName: RTDBRef = 'exposure'
}
