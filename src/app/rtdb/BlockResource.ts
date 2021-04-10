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

export function isBlockEncounterTransaction(what: any): what is BlockEncounterTransaction {
    return (
        what
        && typeof what.combinedHash === 'string'
        && typeof what.timestamp === 'number'
        && typeof what.encodedGPSLocation === 'string'
    )
}

export function isBlockInfectionTransaction(what: any): what is BlockInfectionTransaction {
    return (
        what
        && typeof what.clientID === 'string'
        && typeof what.timestamp === 'number'
    )
}

export function isBlockTransaction(what: any): what is BlockTransaction {
    return isBlockEncounterTransaction(what) || isBlockInfectionTransaction(what)
}

/**
 * Interface representing a single block in the chain.
 */
export interface BlockResourceItem extends FirebaseResourceItem {
    uuid: string;
    transactions: BlockTransaction[];
    lastBlockHash: string;
    lastBlockUUID: string;
    proof: string;
}

@Injectable()
export class BlockResource extends FirebaseResource<BlockResourceItem> {
    public static collect(): AsyncCollection<BlockResourceItem> {
        return new AsyncCollection<BlockResourceItem>(new BlockResource())
    }

    protected refName: RTDBRef = 'block'
}
