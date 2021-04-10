import {Singleton, Inject} from "@extollo/di"
import {Unit, Logging, Config} from "@extollo/lib"
import {FirebaseUnit} from "./FirebaseUnit"
import {BlockEncounterTransaction, BlockResource, BlockResourceItem, BlockTransaction} from "../rtdb/BlockResource"
import {TransactionResourceItem} from "../rtdb/TransactionResource"
import * as openpgp from "openpgp"
import * as crypto from "crypto"
import {collect, uuid_v4} from "@extollo/util"

/**
 * Utility wrapper class for a block in the chain.
 */
export class Block implements BlockResourceItem {
    firebaseID: string;
    seqID: number;
    uuid: string;
    transactions: BlockTransaction[];
    lastBlockHash: string;
    lastBlockUUID: string;
    proof: string;

    constructor(rec: BlockResourceItem) {
        this.firebaseID = rec.firebaseID;
        this.seqID = rec.seqID
        this.uuid = rec.uuid
        this.transactions = rec.transactions
        this.lastBlockHash = rec.lastBlockHash
        this.lastBlockUUID = rec.lastBlockUUID
        this.proof = rec.proof;
    }

    /** Generate the hash for this block. */
    hash() {
        return crypto.createHash('sha256')
            .update(this.toString(), 'utf-8')
            .digest('hex')
    }

    /** Cast the Block's data to a plain object. */
    toItem(): BlockResourceItem {
        return {
            seqID: this.seqID,
            firebaseID: this.firebaseID,
            uuid: this.uuid,
            transactions: this.transactions,
            lastBlockHash: this.lastBlockHash,
            lastBlockUUID: this.lastBlockUUID,
            proof: this.proof,
        }
    }

    /** Generate the deterministic hash-able string. */
    toString() {
        return [
            this.uuid,
            JSON.stringify(this.transactions),
            this.lastBlockHash,
            this.lastBlockUUID,
        ].join('%')
    }
}

/**
 * Interface representing a federated peer.
 */
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

    @Inject()
    protected readonly config!: Config

    /**
     * Returns true if the given host is registered as a peer.
     * @param host
     */
    public async hasPeer(host: string): Promise<boolean> {
        const peers = await this.getPeers()
        return peers.some(peer => peer.host.toLowerCase() === host.toLowerCase())
    }

    /**
     * Get a list of all registered peers.
     */
    public async getPeers(): Promise<Peer[]> {
        const data = await this.firebase.ref('peers').once('value')
        return (data.val() as Peer[]) || []
    }

    /**
     * Register a new host as a peer of this instance.
     * @param peer
     */
    public async registerPeer(peer: Peer) {
        if ( !(await this.hasPeer(peer.host)) ) {
            await this.firebase.ref('peers').push().set(peer)
        }
    }

    /**
     * Given an array of blocks in chain-order, validate the chain.
     * @param chain
     * @return boolean - true if the chain is valid
     */
    public async validate(chain: Block[]) {
        const blocks = collect<Block>(chain)
        return blocks.every((block: Block, idx: number) => {
            if ( idx === 0 ) return true;  // TODO handle genesis

            return block.lastBlockHash === blocks.at(idx)!.hash()
        })
    }

    public async refresh() {

    }

    /**
     * Submit a group of encounter transactions to be added to the chain.
     * @param group
     */
    public async submitTransactions(group: [TransactionResourceItem, TransactionResourceItem]) {
        let lastBlock = await this.getLastBlock()
        if ( !lastBlock ) await this.getGenesisBlock()

        const block: BlockResourceItem = {
            uuid: uuid_v4(),
            transactions: group.map(item => this.getEncounterTransaction(item)),
            lastBlockHash: lastBlock!.hash(),
            lastBlockUUID: lastBlock!.uuid,
            proof: await this.generateProofOfWork(lastBlock!),

            firebaseID: '',
            seqID: -1,
        }

        await (<BlockResource> this.app().make(BlockResource)).push(block)
        return new Block(block)
    }

    /**
     * Instantiate the genesis block of the entire chain.
     */
    public getGenesisBlock(): Block {
        return new Block({
            uuid: '0000',
            transactions: [],
            lastBlockHash: '',
            lastBlockUUID: '',
            proof: '',
            firebaseID: '',
            seqID: -1,
        })
    }

    /**
     * Get the last block in the blockchain.
     */
    public async getLastBlock(): Promise<Block | undefined> {
        const rec: BlockResourceItem | undefined = await BlockResource.collect().last()
        return rec ? new Block(rec) : undefined
    }

    /**
     * Given a client-submitted transaction, generate a block encounter transaction record.
     * @param item
     * @protected
     */
    protected getEncounterTransaction(item: TransactionResourceItem): BlockEncounterTransaction {
        return {
            combinedHash: item.combinedHash,
            timestamp: item.timestamp,
            encodedGPSLocation: item.encodedGPSLocation,
        }
    }

    /**
     * Generate a proof of work string for the block that follows lastBlock.
     * @param lastBlock
     * @protected
     */
    protected async generateProofOfWork(lastBlock: Block): Promise<string> {
        const hashString = lastBlock.hash()
        const privateKey = this.config.get("app.gpg.key.private")
        const message = openpgp.Message.fromText(hashString)

        // Sign the hash using the server's private key
        return (await openpgp.sign({
            message,
            privateKeys: privateKey
        })).toString()
    }

    /**
     * Validate that the proof of work of currentBlock is accurate relative to lastBlock.
     * @param currentBlock
     * @param lastBlock
     * @protected
     */
    protected async validateProofOfWork(currentBlock: Block, lastBlock: Block): Promise<boolean> {
        const proof = lastBlock.proof
        const publicKey = this.config.get("app.gpg.key.public")
        const message = openpgp.Message.fromText(proof)

        // Verify the signature
        const verified = await (await openpgp.verify({
            message,
            publicKeys: publicKey
        })).signatures[0].verified
        
        return !!verified
    }
}
