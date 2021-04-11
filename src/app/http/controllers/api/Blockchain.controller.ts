import {Controller, Config} from "@extollo/lib"
import {Injectable, Inject} from "@extollo/di"
import {TransactionResource, TransactionResourceItem} from "../../../rtdb/TransactionResource"
import {Iterable, many, one} from "@extollo/util"
import {Block, Blockchain as BlockchainService, Peer} from "../../../units/Blockchain"
import {ExposureResource, ExposureResourceItem} from "../../../rtdb/ExposureResource";
import {FirebaseUnit} from "../../../units/FirebaseUnit"
import { BlockResource, BlockResourceItem } from "../../../rtdb/BlockResource"

/**
 * Blockchain Controller
 * ------------------------------------
 * Route handlers for API endpoints.
 */
@Injectable()
export class Blockchain extends Controller {
    @Inject()
    protected readonly blockchain!: BlockchainService

    @Inject()
    protected readonly config!: Config

    @Inject()
    protected readonly firebase!: FirebaseUnit
    /**
     * Read the version of the blockchain held by this host, as it currently exists.
     */
    public async readBlockchain() {
        return many((await this.blockchain.read()).map(x => {
            // @ts-ignore
            delete x.firebaseID
            return x
        }))
    }

    /**
     * Read the version of the blockchain held by this host, including the host's
     * most recent submission, that has NOT been accepted yet.
     */
    public async readBlockchainSubmission() {
        return many((await this.blockchain.getSubmitChain()).map(x => {
            // @ts-ignore
            delete x.firebaseID
            return x
        }))
    }

    /**
     * Determine whether the current blockchain is valid.
     */
    public async validate() {
        const blocks = (await this.blockchain.read()).map(x => new Block(x))
        return {
            is_valid: await this.blockchain.validate(blocks)
        }
    }

    /**
     * Post a new transaction to the blockchain. This is only intended for testing.
     */
    public async postTransaction() {
        const item: TransactionResourceItem = {
            firebaseID: '',
            combinedHash: String(this.request.input('combinedHash')),
            timestamp: parseInt(String(this.request.input('timestamp'))),
            encodedGPSLocation: String(this.request.input('encodedGPSLocation')),
            partnerPublicKey: String(this.request.input('partnerPublicKey')),
            validationSignature: String(this.request.input('validationSignature')),
        }

        await (<TransactionResource> this.make(TransactionResource)).push(item)
        return one(item)
    }

    /**
     * Post a new exposure notification to the blockchain. This is only intended for testing.
     */
    public async postExposure() {
        const item: ExposureResourceItem = {
            firebaseID: '',
            clientID: String(this.request.input('clientID')),
            timestamp: parseInt(String(this.request.input('timestamp'))),
        }

        await (<ExposureResource> this.make(ExposureResource)).push(item)
        return one(item)
    }

    public async check() {
        let minTime = this.request.input('minTime')
        if (!minTime) {
            minTime = (new Date).getTime() - this.config.get('app.defaultTime')
        }

        const snapshot = await (<BlockResource> this.make(BlockResource)).ref()
            .orderByChild('timestamp')
            .startAt(minTime)
            .once('value')

        let blocks = (Object.values(snapshot.val()) as BlockResourceItem[])
        return many(blocks)
    }

    public async peer() {
        const url = this.request.input('host')
        const name = this.request.input('name')
        const peer: Peer = {
            host: String(url)
            } 
        if (name) {
            peer.name = String(name)
        }
        await this.blockchain.registerPeer(peer)
    }
}
