import {Singleton, Inject} from "@extollo/di"
import {Unit, Logging} from "@extollo/lib"
import {FirebaseUnit} from "./FirebaseUnit"
import {BlockResource, BlockResourceItem, BlockTransaction} from "../rtdb/BlockResource"
import {TransactionResourceItem} from "../rtdb/TransactionResource"
import * as crypto from "crypto"

export class Block implements BlockResourceItem {
    seqID: number;
    uuid: string;
    combinedHash: string;
    timestamp: number;
    encodedGPSLocation: string;
    transactions: BlockTransaction[];
    lastBlockHash: string;
    lastBlockUUID: string;

    constructor(rec: BlockResourceItem) {
        this.seqID = rec.seqID
        this.uuid = rec.uuid
        this.combinedHash = rec.combinedHash
        this.timestamp = rec.timestamp
        this.encodedGPSLocation = rec.encodedGPSLocation
        this.transactions = rec.transactions
        this.lastBlockHash = rec.lastBlockHash
        this.lastBlockUUID = rec.lastBlockUUID
    }

    hash() {
        return crypto.createHash('sha256')
            .update(this.toString(), 'utf-8')
            .digest('hex')
    }

    toString() {
        return [
            this.uuid,
            this.combinedHash,
            this.timestamp.toString(),
            this.encodedGPSLocation,
            JSON.stringify(this.transactions),
            this.lastBlockHash,
            this.lastBlockUUID,
        ].join('%')
    }
}

export interface Peer {
    host: string,
    name?: string,
}

/**
 * Blockchain Unit
 * ---------------------------------------
 * Main service for interacting with the contact blockchain.
 */
@Singleton()
export class Blockchain extends Unit {
    @Inject()
    protected readonly logging!: Logging

    @Inject()
    protected readonly firebase!: FirebaseUnit

    public async hasPeer(host: string): Promise<boolean> {
        const peers = await this.getPeers()
        return peers.some(peer => peer.host.toLowerCase() === host.toLowerCase())
    }

    public async getPeers(): Promise<Peer[]> {
        const data = await this.firebase.ref('peers').once('value')
        return (data.val() as Peer[]) || []
    }

    public async registerPeer(peer: Peer) {
        if ( !(await this.hasPeer(peer.host)) ) {
            await this.firebase.ref('peers').push().set(peer)
        }
    }

    public async validate(chain: Block[]) {

    }

    public async refresh() {

    }

    public async submitBlock(afterBlock: Block, proofToken: string) {

    }

    public async submitTransactions(group: [TransactionResourceItem, TransactionResourceItem]) {
        // Not sure yet
    }

    public async getLastBlock(): Promise<Block | undefined> {
        const rec: BlockResourceItem | undefined = await BlockResource.collect().last()
        return rec ? new Block(rec) : undefined
    }

    public async up() {

    }

    public async down() {

    }
}