import {Inject, Singleton} from "@extollo/di"
import {Application, Config, Logging, Unit} from "@extollo/lib"
import {FirebaseUnit} from "./FirebaseUnit"
import {
    BlockEncounterTransaction,
    BlockResourceItem,
    BlockTransaction,
    isBlockResourceItem
} from "../rtdb/BlockResource"
import {TransactionResourceItem} from "../rtdb/TransactionResource"
import * as openpgp from "openpgp"
import * as crypto from "crypto"
import axios from "axios"
import {collect, uuid_v4} from "@extollo/util"
import {ExposureResourceItem} from "../rtdb/ExposureResource"

async function pgpVerify(armoredKey: string, armoredMessage: string) {
    const [publicKeys, message] = await Promise.all([
        openpgp.readKey({ armoredKey }),
        openpgp.readMessage({ armoredMessage })
    ])

    return !!(await (await openpgp.verify({ publicKeys, message })).signatures?.[0]?.verified)
}

/**
 * Utility wrapper class for a block in the chain.
 */
export class Block implements BlockResourceItem {
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
        this.uuid = rec.uuid || uuid_v4()
        this.transactions = rec.transactions || []
        this.lastBlockHash = rec.lastBlockHash || ''
        this.lastBlockUUID = rec.lastBlockUUID || ''
        this.proof = rec.proof
        this.timestamp = rec.timestamp || (new Date).getTime()
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

        return pgpVerify(publicKey, proof)
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
    private readonly MAX_WAIT_TIME = 3000
    private readonly PENALTY_INTERVAL = 500
    private readonly MAX_PEERS_PENALTY = 10

    @Inject()
    protected readonly logging!: Logging

    @Inject()
    protected readonly firebase!: FirebaseUnit

    @Inject()
    protected readonly config!: Config

    protected approvedChain: Block[] = []

    protected peers: Peer[] = []

    protected breakForExit = false

    /**
     * Block transactions that will be attempted as part of this host's
     * next block submission.
     * @protected
     */
    protected pendingTransactions: BlockTransaction[] = []

    protected publicKey!: openpgp.Key
    protected privateKey!: openpgp.Key
    protected genesisProof!: string

    protected nextWaitTime!: number
    protected lastBlock!: Block
    protected nextProof!: string

    async up() {
        this.logging.info('Generating OpenPGP assets...')
        this.publicKey = await openpgp.readKey({
            armoredKey: this.config.get("app.gpg.key.public")
        })

        this.privateKey = await openpgp.readKey({
            armoredKey: this.config.get("app.gpg.key.private")
        })

        this.genesisProof = await openpgp.sign({
            message: openpgp.Message.fromText('0000'),
            privateKeys: this.privateKey,
        })

        this.logging.info('Performing initial load...')
        await this.initialLoad()

        this.logging.info('Contacting configured peers...')
        const peers = this.config.get('server.peers')
        await Promise.all(peers.map((host: string) => this.registerPeer({ host })))

        this.logging.info('Performing initial writeback...')
        await this.writeback()
    }

    async down() {
        this.breakForExit = true
    }

    async initialLoad() {
        const [peers, chain] = await Promise.all([
            this.firebase.ref('peers')
                .once('value')
                .then(val => val.val()),

            this.firebase.ref('block')
                .orderByKey()
                .once('value')
                .then(val => val.val())
        ])

        this.logging.debug({peers, chain})

        this.approvedChain = chain.map((item: BlockResourceItem) => new Block(item))
        this.peers = peers || []
    }

    /**
     * Returns true if the given host is registered as a peer.
     * @param host
     */
    public hasPeer(host: string): boolean {
        return this.peers.some(x => x.host === host)
    }

    /**
     * Get a list of all registered peers.
     */
    public getPeers(): Peer[] {
        return this.peers
    }

    /**
     * From a peer, fetch the submission blockchain, if it is valid.
     * @param peer
     */
    public async getPeerSubmit(peer: Peer): Promise<Block[] | undefined> {
        try {
            const result = await axios.get(`${peer.host}api/v1/chain/submit`)
            const blocks: unknown = result.data?.data?.records
            if ( Array.isArray(blocks) && blocks.every(block => {
                return isBlockResourceItem(block)
            }) ) {
                return blocks.map(x => new Block(x))
            }
        } catch (e) {
            this.logging.error(e)
            return undefined
        }
    }

    /**
     * Register a new host as a peer of this instance.
     * @param peer
     */
    public async registerPeer(peer: Peer) {
        if ( !this.hasPeer(peer.host) ) {
            this.logging.info(`Registering peer: ${peer.host}`)
            const header = this.config.get('app.api_server_header')

            try {
                await axios.post(`${peer.host}api/v1/peer`, {
                    host: this.getBaseURL(),
                }, {
                    headers: {
                        [header]: this.getPeerToken(),
                        'content-type': 'application/json',
                    }
                })
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
                const previous: Block | undefined = blocks.at(idx - 1)
                if ( !previous ) {
                    this.logging.debug(`Chain is invalid: block ${idx} is missing previous ${idx - 1}.`)
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

                    return false
                }

                if ( await block.isGenesis() ) {
                    return true
                }

                if ( !(await this.validateProofOfWork(block, previous)) ) {
                    this.logging.debug(`Chain is invalid: block ${idx} failed proof of work validation`)
                    return false;
                }

                return false
            })
        ).every(Boolean)
    }

    public async refresh() {
        if ( this.breakForExit ) return;
        this.logging.debug('Called refresh().')

        const peers = await this.getPeers()
        const time_x_block: {[key: string]: Block} = {}
        const time_x_blocks: {[key: string]: Block[]} = {}
        const time_x_peer: {[key: string]: Peer | true} = {}

        await Promise.all(peers.map(async peer => {
            const blocks: Block[] | undefined = await this.getPeerSubmit(peer)

            if ( blocks && await this.validate(blocks) ) {
                const block = blocks.slice(-1)[0]
                if ( !block ) return  // TODO fixme

                const penalty = blocks.slice(0, 10)
                        .map(block => block.peer === peer.host)
                        .filter(Boolean).length * this.PENALTY_INTERVAL
                    * (Math.min(peers.length, this.MAX_PEERS_PENALTY))

                block.waitTime += penalty

                time_x_block[block.waitTime] = block
                time_x_blocks[block.waitTime] = blocks.reverse()
                time_x_peer[block.waitTime] = peer
            } else {
                console.log('validation fail!')
            }
        }))

        console.log(time_x_blocks, time_x_peer, time_x_block)

        const submitBlock = this.getSubmitBlock()
        if ( submitBlock ) {
            time_x_block[submitBlock.waitTime] = submitBlock
            time_x_peer[submitBlock.waitTime] = true
        }

        console.log('submit block', submitBlock)

        const min = Math.min(...Object.keys(time_x_block).map(parseFloat))
        const peer = time_x_peer[min]

        console.log('peer?', peer)

        if ( peer === true ) {
            // Our version of the chain was accepted
            this.approvedChain.push(submitBlock!)
            this.pendingTransactions = []
        } else if ( peer ) {
            // A different server's chain was accepted
            this.approvedChain = (time_x_blocks[min] || []).map(block => {
                if (!block.transactions) {
                    block.transactions = []
                }

                return block
            })
        }

        console.log('approved chain', this.approvedChain)
        await this.writeback()
    }

    public getSubmitChain(): BlockResourceItem[] {
        const submit = this.getSubmitBlock()
        if ( !submit ) return this.approvedChain
        else return [...this.approvedChain, submit]
    }

    public async writeback() {
        if ( this.breakForExit ) return;
        this.logging.info('Generating initial proof-of-elapsed-time. This will take a second...')
        this.nextWaitTime = this.random(this.MIN_WAIT_TIME, this.MAX_WAIT_TIME)
        this.lastBlock = this.getLastBlock()
        this.nextProof = await this.generateProofOfWork(this.lastBlock, this.nextWaitTime)

        console.log('writeback approved chain', this.approvedChain)

        await Promise.all([
            this.firebase.ref('block').set(this.approvedChain.map(x => x.toItem())),
            this.firebase.ref('peers').set(this.peers)
        ])

        this.refresh()
    }

    public getSubmitBlock(): Block | undefined {
        if ( !this.pendingTransactions?.length ) {
            return
        }

        return new Block({
            timestamp: (new Date).getTime(),
            uuid: uuid_v4(),
            transactions: this.pendingTransactions,
            lastBlockHash: this.lastBlock.hash(),
            lastBlockUUID: this.lastBlock.uuid,
            proof: this.nextProof,
            waitTime: this.nextWaitTime,
            peer: this.getBaseURL(),
        })
    }

    /**
     * Submit a group of encounter transactions to be added to the chain.
     * @param groups
     */
    public submitTransactions(...groups: [TransactionResourceItem, TransactionResourceItem][]) {
        groups.forEach(group => {
            const txes = group.map(item => this.getEncounterTransaction(item))
            this.pendingTransactions.push(...txes)
        })
    }

    /**
     * Submit the given exposure notifications onto the blockchain.
     * @param exposures
     */
    public submitExposures(...exposures: ExposureResourceItem[]) {
        this.pendingTransactions.push(...exposures)
    }

    public getPeerToken() {
        return Buffer.from(this.genesisProof, 'utf-8')
            .toString('base64')
    }

    /**
     * Instantiate the genesis block of the entire chain.
     */
    public getGenesisBlock(): Block {
        return new Block({
            timestamp: (new Date).getTime(),
            uuid: '0000',
            transactions: [],
            lastBlockHash: '',
            lastBlockUUID: '',
            proof: this.genesisProof,
            firebaseID: '',
            waitTime: 0,
            peer: this.getBaseURL(),
        })
    }

    /**
     * Get the last block in the blockchain, or push the genesis if one doesn't already exist.
     */
    public getLastBlock(): Block {
        if ( !this.approvedChain ) {
            this.approvedChain = []
        }

        const rec = this.approvedChain.slice(-1)[0]
        if (rec) return rec

        const genesis = this.getGenesisBlock()
        this.approvedChain.push(genesis)
        return genesis
    }

    /**
     * Get a list of all blocks in the chain, in order.
     */
    public read(): Promise<BlockResourceItem[]> {
        return this.firebase.ref('block')
            .once('value')
            .then(snap => snap.val())
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
        const message = openpgp.Message.fromText(hashString)

        await this.sleep(waitTime)

        // Sign the hash using the server's private key
        return openpgp.sign({
            message,
            privateKeys: this.privateKey,
        })
    }

    /**
     * Validate that the proof of work of currentBlock is accurate relative to lastBlock.
     * @param currentBlock
     * @param lastBlock
     * @protected
     */
    protected validateProofOfWork(currentBlock: Block, lastBlock: Block): Promise<boolean> {
        const proof = lastBlock.proof
        const publicKey = this.config.get("app.gpg.key.public")
        return pgpVerify(publicKey, proof)
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
