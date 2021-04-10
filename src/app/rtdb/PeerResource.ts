import {FirebaseResource, FirebaseResourceItem} from "../FirebaseResource"
import {Injectable} from "@extollo/di"
import {RTDBRef} from "../units/FirebaseUnit"
import {AsyncCollection} from "@extollo/util"

/**
 * Interface representing a peer of this node.
 */
export interface PeerResourceItem extends FirebaseResourceItem {
    host: string,
    name?: string,
}

/**
 * A Firebase realtime-database resource for managing blockchain peers.
 */
@Injectable()
export class PeerResource extends FirebaseResource<PeerResourceItem> {
    public static collect(): AsyncCollection<PeerResourceItem> {
        return new AsyncCollection<PeerResourceItem>(new PeerResource())
    }

    protected refName: RTDBRef = 'peers'
}
