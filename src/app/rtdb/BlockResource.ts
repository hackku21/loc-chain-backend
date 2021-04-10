import {FirebaseResource, FirebaseResourceItem} from "../FirebaseResource"
import {Injectable} from "@extollo/di"
import {RTDBRef} from "../units/FirebaseUnit"
import {AsyncCollection} from "@extollo/util"

export interface BlockEncounterTransaction {
    combinedHash: string;
    timestamp: number;
    encodedGPSLocation: string;
}

export interface BlockInfectionTransaction {
    clientID: string;
    timestamp: number;
}

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

export interface BlockResourceItem extends FirebaseResourceItem {
    uuid: string;
    combinedHash: string;
    timestamp: number;
    encodedGPSLocation: string;
    transactions: BlockTransaction[];
    lastBlockHash: string;
    lastBlockUUID: string;
}

@Injectable()
export class BlockResource extends FirebaseResource<BlockResourceItem> {
    public static collect(): AsyncCollection<BlockResourceItem> {
        return new AsyncCollection<BlockResourceItem>(new BlockResource())
    }

    protected refName: RTDBRef = 'block'
}
