import { Singleton, Inject } from "@extollo/di"
import { Unit, Logging, Config, Application } from "@extollo/lib"
import { FirebaseUnit } from "./FirebaseUnit"
import {
    BlockEncounterTransaction,
    BlockResource,
    BlockResourceItem,
    BlockTransaction,
    isBlockResourceItem
} from "../rtdb/BlockResource"
import { TransactionResourceItem } from "../rtdb/TransactionResource"
import * as openpgp from "openpgp"
import * as crypto from "crypto"
import axios from "axios"
import { collect, uuid_v4 } from "@extollo/util"
import {ExposureResourceItem} from "../rtdb/ExposureResource"
import {PeerResource} from "../rtdb/PeerResource"

/**
 * Utility wrapper class for a block in the chain.
 */
export class Block implements BlockResourceItem {
    firebaseID: string
    seqID: number
    uuid: string
    transactions: BlockTransaction[]
    timestamp: number
    lastBlockHash: string
    lastBlockUUID: string
    proof: string
    waitTime: number
    peer: string

    get config(): Config {
        return Application.getApplication().make(Config)
    }

    constructor(rec: BlockResourceItem) {
        this.firebaseID = rec.firebaseID
        this.seqID = rec.seqID
        this.uuid = rec.uuid
        this.transactions = rec.transactions
        this.lastBlockHash = rec.lastBlockHash
        this.lastBlockUUID = rec.lastBlockUUID
        this.proof = rec.proof
        this.timestamp = rec.timestamp
        this.waitTime = rec.waitTime
        this.peer = rec.peer
    }

    /** Returns true if this is the genesis block. */
    async isGenesis() {
        // first block will be guaranteed uuid 0000
        if (this.uuid !== '0000') {
            return false
        }
        const proof = this.proof
        const publicKey = this.config.get("app.gpg.key.public")

        const result = await openpgp.verify({
            publicKeys: await openpgp.readKey({
                armoredKey: publicKey,
            }),
            message: await openpgp.readMessage({
                armoredMessage: proof,
            }),
        })

        return !!(await result.signatures?.[0]?.verified)
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
            timestamp: this.timestamp,
            waitTime: this.waitTime,
            peer: this.peer,
        }
    }

    /** Generate the deterministic hash-able string. */
    toString() {
        return [
            this.uuid,
            this.waitTime,
            JSON.stringify(this.transactions || [], undefined, 0),
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
    private readonly MIN_WAIT_TIME = 1000
    private readonly MAX_WAIT_TIME = 5000
    private readonly PENALTY_INTERVAL = 500
    private readonly MAX_PEERS_PENALTY = 10

    @Inject()
    protected readonly logging!: Logging

    @Inject()
    protected readonly firebase!: FirebaseUnit

    @Inject()
    protected readonly config!: Config

    /**
     * Block transactions that will be attempted as part of this host's
     * next block submission.
     * @protected
     */
    protected pendingTransactions: BlockTransaction[] = []

    protected pendingSubmit?: Block

    protected isSubmitting: boolean = false

    async up() {
        const peers = this.config.get('server.peers')
        for ( const peer of peers ) {
            await this.registerPeer({
                host: peer,
            })
        }
    }

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
        return PeerResource.collect().all()
    }

    /**
     * From a peer, fetch the submission blockchain, if it is valid.
     * @param peer
     */
    public async getPeerSubmit(peer: Peer): Promise<Block[] | undefined> {
        try {
            const result = await axios.get(`${peer.host}api/v1/chain/submit`)
            const blocks: unknown = result.data?.data?.records
            if ( Array.isArray(blocks) && blocks.every(isBlockResourceItem) ) {
                return blocks.map(x => new Block(x))
            }
        } catch (e) {
            return undefined
        }
    }

    /**
     * Register a new host as a peer of this instance.
     * @param peer
     */
    public async registerPeer(peer: Peer) {
        if (!(await this.hasPeer(peer.host))) {
            this.logging.info(`Registering peer: ${peer.host}`)
            await (<PeerResource> this.make(PeerResource)).push({
                firebaseID: '',
                seqID: -1,
                name: peer.name,
                host: peer.host,
            })

            const header = this.config.get('app.api_server_header')

            try {
                console.log('return peering', [`${peer.host}api/v1/peer`, {
                    host: this.getBaseURL(),
                }, {
                    headers: {
                        [header]: await this.getPeerToken(),
                    }
                }])
                await axios.post(`${peer.host}api/v1/peer`, {
                    host: this.getBaseURL(),
                }, {
                    headers: {
                        [header]: await this.getPeerToken(),
                    }
                })

                this.refresh()
            } catch (e) {
                this.logging.error(e)
            }
        }
    }

    /**
     * Given an array of blocks in chain-order, validate the chain.
     * @param chain
     * @return boolean - true if the chain is valid
     */
    public async validate(chain: Block[]) {
        const blocks = collect<Block>(chain)
        return (
            await blocks.promiseMap(async (block, idx) => {
                if ( await block.isGenesis() ) {
                    return true
                }

                const previous: Block | undefined = blocks.at(idx - 1)
                if ( !previous ) {
                    this.logging.debug(`Chain is invalid: block ${idx} is missing previous ${idx - 1}.`)
                    return false;
                }

                if ( !(await this.validateProofOfWork(block, previous)) ) {
                    this.logging.debug(`Chain is invalid: block ${idx} failed proof of work validation`)
                    return false;
                }

                const pass = (
                    block.lastBlockUUID === previous.uuid
                    && block.lastBlockHash === previous.hash()
                )

                if ( !pass ) {
                    this.logging.debug(`Chain is invalid: block ${idx} does not match previous.`)
                    this.logging.debug({
                        lastBlockUUID: block.lastBlockUUID,
                        computedLastUUID: previous.uuid,
                        lastBlockHash: block.lastBlockHash,
                        computedLastHash: previous.hash(),
                    })
                }

                return pass
            })
        ).every(Boolean)
    }

    public async refresh() {
        if ( this.isSubmitting ) {
            return
        } else {
            this.isSubmitting = true
        }

        const validSeqID = (await this.read()).reverse()[0]?.seqID

        const peers = await this.getPeers()
        const time_x_block: {[key: string]: Block} = {}
        const time_x_blocks: {[key: string]: Block[]} = {}
        const time_x_peer: {[key: string]: Peer | true} = {}

        for ( const peer of peers ) {
            const blocks: Block[] | undefined = await this.getPeerSubmit(peer)
            if ( blocks && await this.validate(blocks) ) {
                const block = blocks.reverse()[0]
                if ( !block || block.seqID === validSeqID || !block.seqID ) continue

                const penalty = blocks.slice(0, 10)
                    .map(block => block.peer === peer.host)
                    .filter(Boolean).length * this.PENALTY_INTERVAL
                    * (Math.min(peers.length, this.MAX_PEERS_PENALTY))

                block.waitTime += penalty

                time_x_block[block.waitTime] = block
                time_x_blocks[block.waitTime] = blocks
                time_x_peer[block.waitTime] = peer
            }
        }

        if ( this.pendingTransactions.length && !this.pendingSubmit ) {
            await this.attemptSubmit()
        }

        if ( this.pendingSubmit ) {
            time_x_block[this.pendingSubmit.waitTime] = this.pendingSubmit
            time_x_peer[this.pendingSubmit.waitTime] = true
        }

        const min = Math.min(...Object.keys(time_x_block).map(parseFloat))
        const block = time_x_block[min]
        const peer = time_x_peer[min]

        if ( peer === true ) {
            this.pendingSubmit = undefined
            this.pendingTransactions = []
            await (<BlockResource>this.app().make(BlockResource)).push(block)
        } else {
            await this.firebase.ref('block').transaction((_) => {
                return (time_x_blocks[min] || []).map(x => x.toItem())
            })

            this.pendingSubmit = undefined
            await this.attemptSubmit()
        }

        this.isSubmitting = false
    }

    public async getSubmitChain(): Promise<BlockResourceItem[]> {
        const blocks = await this.read()
        const submit = await this.attemptSubmit()
        if ( submit ) {
            submit.seqID = blocks.length > 0 ? collect<BlockResourceItem>(blocks).max('seqID') + 1 : 0
            blocks.push(submit.toItem())
        }

        this.refresh()
        return blocks
    }

    public async attemptSubmit() {
        if ( !this.pendingSubmit && this.pendingTransactions.length ) {
            const lastBlock = await this.getLastBlock()
            const waitTime = this.random(this.MIN_WAIT_TIME, this.MAX_WAIT_TIME)
            const proof = await this.generateProofOfWork(lastBlock, waitTime)

            const block: BlockResourceItem = {
                timestamp: (new Date).getTime(),
                uuid: uuid_v4(),
                transactions: this.pendingTransactions,
                lastBlockHash: lastBlock!.hash(),
                lastBlockUUID: lastBlock!.uuid,
                proof,
                waitTime,
                peer: this.getBaseURL(),

                firebaseID: '',
                seqID: -1,
            }

            this.pendingSubmit = new Block(block)
        }

        return this.pendingSubmit
    }

    /**
     * Submit a group of encounter transactions to be added to the chain.
     * @param group
     */
    public async submitTransactions(group: [TransactionResourceItem, TransactionResourceItem]) {
        const txes = group.map(item => this.getEncounterTransaction(item))

        if ( this.pendingSubmit ) {
            this.pendingSubmit.transactions.push(...txes)
        }

        this.pendingTransactions.push(...txes)
        this.refresh()

        /*const lastBlock = await this.getLastBlock()

        this.logging.verbose('Last block:')
        this.logging.verbose(lastBlock)

        const block: BlockResourceItem = {
            timestamp: (new Date).getTime(),
            uuid: uuid_v4(),
            transactions: group.map(item => this.getEncounterTransaction(item)),
            lastBlockHash: lastBlock!.hash(),
            lastBlockUUID: lastBlock!.uuid,
            proof: await this.generateProofOfWork(lastBlock!),

            firebaseID: '',
            seqID: -1,
        }

        await (<BlockResource>this.app().make(BlockResource)).push(block)
        return new Block(block)*/
    }

    /**
     * Submit the given exposure notifications onto the blockchain.
     * @param exposures
     */
    public async submitExposures(...exposures: ExposureResourceItem[]) {
        if ( this.pendingSubmit ) {
            this.pendingSubmit.transactions.push(...exposures)
        }

        this.pendingTransactions.push(...exposures)
        this.refresh()

        /*const lastBlock = await this.getLastBlock()

        this.logging.verbose('Last block:')
        this.logging.verbose(lastBlock)

        const block: BlockResourceItem = {
            timestamp: (new Date).getTime(),
            uuid: uuid_v4(),
            transactions: exposures,
            lastBlockHash: lastBlock!.hash(),
            lastBlockUUID: lastBlock!.uuid,
            proof: await this.generateProofOfWork(lastBlock),

            firebaseID: '',
            seqID: -1,
        }

        await (<BlockResource>this.app().make(BlockResource)).push(block)
        return new Block(block)*/
    }

    public async getPeerToken() {
        const message = openpgp.Message.fromText("0000")
        const privateKey = this.config.get("app.gpg.key.private")

        return Buffer.from((await openpgp.sign({
            message,
            privateKeys: await openpgp.readKey({
                armoredKey: privateKey
            }),
        })), 'utf-8').toString('base64')
    }

    /**
     * Instantiate the genesis block of the entire chain.
     */
    public async getGenesisBlock(): Promise<Block> {
        const message = openpgp.Message.fromText("0000")
        const privateKey = this.config.get("app.gpg.key.private")

        return new Block({
            timestamp: (new Date).getTime(),
            uuid: '0000',
            transactions: [],
            lastBlockHash: '',
            lastBlockUUID: '',
            proof: (await openpgp.sign({
                message,
                privateKeys: await openpgp.readKey({
                    armoredKey: privateKey
                }),
            })),
            firebaseID: '',
            seqID: -1,
            waitTime: 0,
            peer: this.getBaseURL(),
        })
    }

    /**
     * Get the last block in the blockchain, or push the genesis if one doesn't already exist.
     */
    public async getLastBlock(): Promise<Block> {
        const rec: BlockResourceItem | undefined = await BlockResource.collect().last()
        if (rec) return new Block(rec)

        const genesis = (await this.getGenesisBlock()).toItem()
        await (<BlockResource>this.app().make(BlockResource)).push(genesis)
        return new Block(genesis)
    }

    /**
     * Get a list of all blocks in the chain, in order.
     */
    public async read(): Promise<BlockResourceItem[]> {
        return BlockResource.collect().all()
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
     * @param waitTime
     * @protected
     */
    protected async generateProofOfWork(lastBlock: Block, waitTime: number): Promise<string> {
        const hashString = lastBlock.hash()
        const privateKey = this.config.get("app.gpg.key.private")
        const message = openpgp.Message.fromText(hashString)

        await this.sleep(waitTime)

        // Sign the hash using the server's private key
        return (await openpgp.sign({
            message,
            privateKeys: await openpgp.readKey({
                armoredKey: privateKey,
            })
        }))
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

        const result = await openpgp.verify({
            publicKeys: await openpgp.readKey({
                armoredKey: publicKey,
            }),
            message: await openpgp.readMessage({
                armoredMessage: proof,
            }),
        })

        return !!(await result.signatures?.[0]?.verified)
    }

    /**
     * Get the base URL that identifies this peer.
     * This should be the endpoint used to fetch the submitted blockchain.
     * @protected
     */
    protected getBaseURL(): string {
        const base = this.config.get('server.base_url')
        return `${base}${base.endsWith('/') ? '' : '/'}`
    }

    /** Sleep for (roughly) the given number of milliseconds. */
    async sleep(ms: number) {
        await new Promise<void>(res => {
            setTimeout(res, ms)
        })
    }

    /**
     * Get a random number between two values.
     * @param min
     * @param max
     */
    random(min: number, max: number): number {
        return Math.floor(Math.random() * (Math.floor(max) - Math.ceil(min) + 1)) + Math.ceil(min);
    }
}
