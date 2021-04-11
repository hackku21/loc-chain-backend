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
import fetch from "node-fetch"
import {collect, uuid_v4} from "@extollo/util"
import {ExposureResourceItem} from "../rtdb/ExposureResource"

/**
 * Verify an OpenPGP signature based on an armored key.
 * @param armoredKey
 * @param armoredMessage
 */
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
    private readonly MIN_WAIT_TIME = 10000
    private readonly MAX_WAIT_TIME = 30000
    private readonly PENALTY_INTERVAL = 5000
    private readonly MAX_PEERS_PENALTY = 10

    @Inject()
    protected readonly logging!: Logging

    @Inject()
    protected readonly firebase!: FirebaseUnit

    @Inject()
    protected readonly config!: Config

    /** The most-correct, approved chain according to this node. */
    protected approvedChain: Block[] = []

    /** The peers this node will communicate with. */
    protected peers: Peer[] = []

    /** If true, the writeback/refresh cycle will stop. */
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

    /** Load the initial data from the data sources into memory for fast access. */
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

        this.approvedChain = (chain || []).map((item: BlockResourceItem) => new Block(item))
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
            this.logging.verbose(`Making request to: ${peer.host}api/v1/chain/submit`)
            const result = await fetch(`${peer.host}api/v1/chain/submit`).then(res => res.json())
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

            this.peers.push(peer)

            try {
                await fetch(`${peer.host}api/v1/peer`, {
                    method: 'POST',
                    body: JSON.stringify({
                        host: this.getBaseURL(),
                    }),
                    headers: {
                        'content-type': 'application/json',
                    },
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
                if ( await block.isGenesis() ) {
                    return true
                }

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

                if ( !(await this.validateProofOfWork(block, previous)) ) {
                    this.logging.debug(`Chain is invalid: block ${idx} failed proof of work validation`)
                    return false;
                }

                return false
            })
        ).every(Boolean)
    }

    /**
     * Perform the consensus algorithm among the peers of this node
     * to push a block onto the chain.
     */
    public async refresh() {
        if ( this.breakForExit ) return;
        this.logging.debug('Called refresh().')

        const peers = this.getPeers()
        this.logging.debug({peers})

        let longestChain: Block[] = []
        for ( const peer of peers ) {
            const chain = await this.getPeerSubmit(peer)
            console.log('got chain', chain)

            if (
                chain
                && chain.length > longestChain.length
                && await this.validate(chain)
            ) {
                longestChain = chain
            } else {
                this.logging.debug('Failed validation!')
            }
        }

        const submitted = this.getSubmitBlock()
        if ( (this.approvedChain.length + (submitted ? 1 : 0)) > longestChain.length ) {
            // Our chain is longer, so push the submit block onto it
            if ( submitted ) {
                this.approvedChain.push(submitted)
                this.pendingTransactions = []
            }
        } else {
            const temp: Block[] = this.approvedChain.reverse()
            this.approvedChain = longestChain.map(x => {
                if ( !x.transactions ) {
                    x.transactions = []
                }

                return x
            })

            for ( const block of temp ) {
                const found = this.approvedChain.some(otherBlock => {
                    return otherBlock.uuid === block.uuid
                })

                if ( !found ) {
                    this.pendingTransactions.concat(...(block.transactions || []))
                } else {
                    break
                }
            }
        }

        console.log('approved chain', this.approvedChain)
        await this.writeback()
    }

    /**
     * Get the current blockchain including the block submitted by this node.
     */
    public getSubmitChain(): BlockResourceItem[] {
        const submit = this.getSubmitBlock()
        if ( !submit ) return this.approvedChain
        else return [...this.approvedChain, submit]
    }

    /**
     * Write the in-memory data back to persistent data stores.
     */
    public async writeback() {
        if ( this.breakForExit ) return;
        this.nextWaitTime = this.random(this.MIN_WAIT_TIME, this.MAX_WAIT_TIME)
        this.lastBlock = this.getLastBlock()
        this.nextProof = await this.generateProofOfWork(this.lastBlock, this.nextWaitTime)

        await Promise.all([
            this.firebase.ref('block').set(this.approvedChain.map(x => x.toItem())),
            this.firebase.ref('peers').set(this.peers)
        ])

        this.refresh()
    }

    /**
     * Get the Block instance that we want to submit to the chain, if we have any transactions.
     */
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
        // @ts-ignore
        this.pendingTransactions.push(...exposures.map(exposure => {
            if ( !exposure.uuid ) {
                exposure.uuid = uuid_v4()
            }

            return exposure
        }))
    }

    /**
     * Get the peer-to-peer identifier token.
     */
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
            uuid: uuid_v4(),
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
