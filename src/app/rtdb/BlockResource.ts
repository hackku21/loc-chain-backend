import {FirebaseResource, FirebaseResourceItem} from "../FirebaseResource"
import {Injectable} from "@extollo/di"
import {RTDBRef} from "../units/FirebaseUnit"
import {AsyncCollection} from "@extollo/util"

/**
 * A block transaction representing an encounter between two clients.
 */
export interface BlockEncounterTransaction {
    combinedHash: string;
    timestamp: number;
    encodedGPSLocation: string;
}

/**
 * A block transaction representing an infected client.
 */
export interface BlockInfectionTransaction {
    clientID: string;
    timestamp: number;
}

/** Union type of all possible block transactions. */
export type BlockTransaction = BlockInfectionTransaction | BlockEncounterTransaction

/** Returns true if the item is a valid BlockEncounterTransaction. */
export function isBlockEncounterTransaction(what: any): what is BlockEncounterTransaction {
    return (
        what
        && typeof what.combinedHash === 'string'
        && typeof what.timestamp === 'number'
        && typeof what.encodedGPSLocation === 'string'
    )
}

/** Returns true if the item is a valid BlockInfectionTransaction. */
export function isBlockInfectionTransaction(what: any): what is BlockInfectionTransaction {
    return (
        what
        && typeof what.clientID === 'string'
        && typeof what.timestamp === 'number'
    )
}

/** Returns true if the item is a valid BlockTransaction. */
export function isBlockTransaction(what: any): what is BlockTransaction {
    return isBlockEncounterTransaction(what) || isBlockInfectionTransaction(what)
}

/**
 * Interface representing a single block in the chain.
 */
export interface BlockResourceItem extends FirebaseResourceItem {
    uuid: string;  // Globally unique ID
    transactions: BlockTransaction[];  // Transactions validated by this block
    lastBlockHash: string;  // The combined sha256 hash of the previous block
    lastBlockUUID: string;  // the UUID of the previous block
    proof: string;  // the generated proof-of-work string
    timestamp: number;  // millisecond unix timestamp when this block was created
    waitTime: number;  // number of milliseconds between last block and this one
    peer: string;  // the host URL of the peer that submitted this block
}

/**
 * Returns true if the given item is a valid BlockResourceItem.
 * @param what
 */
export function isBlockResourceItem(what: any): what is BlockResourceItem {
    return (
        typeof what?.uuid === 'string'
        && Array.isArray(what?.transactions)
        && typeof what?.lastBlockHash === 'string'
        && typeof what?.lastBlockUUID === 'string'
        && typeof what?.proof === 'string'
        && typeof what?.timestamp === 'number'
        && typeof what?.waitTime === 'number'
    )
}

/**
 * A Firebase realtime database resource for blocks in the chain.
 */
@Injectable()
export class BlockResource extends FirebaseResource<BlockResourceItem> {
    public static collect(): AsyncCollection<BlockResourceItem> {
        return new AsyncCollection<BlockResourceItem>(new BlockResource())
    }

    protected refName: RTDBRef = 'block'
}
