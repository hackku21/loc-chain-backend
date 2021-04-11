import { FirebaseUnit } from "../FirebaseUnit"
import { Singleton, Inject } from "@extollo/di"
import { Unit, Logging } from "@extollo/lib"
import { Blockchain } from "../Blockchain"
import { ExposureResource, ExposureResourceItem } from "../../rtdb/ExposureResource"

/**
 * Exposure Unit
 * ---------------------------------------
 * This unit listens for exposure notifications created on the realtime database.
 * When new ones come through, it validates them, and pushes them onto this
 * server's blockchain.
 */
@Singleton()
export class Exposure extends Unit {
    /** True if currently processing transactions. */
    private processing: boolean = false

    @Inject()
    protected readonly firebase!: FirebaseUnit

    @Inject()
    protected readonly blockchain!: Blockchain

    @Inject()
    protected readonly logging!: Logging

    /** Claim the right to process transactions. Returns true if the right was granted. */
    claim() {
        if ( !this.processing ) {
            this.processing = true
            return true
        }

        return false
    }

    /** Release the right to claim transactions. */
    release() {
        this.processing = false
    }

    /**
     * Subscribe to the transactions reference and wait for new transactions to be added.
     */
    public async up() {
        this.firebase.ref('exposure').on('child_added', (snapshot) => {
            this.blockchain.submitExposures(snapshot.val())
            if (snapshot.key) {
                this.firebase.ref('exposure').child(snapshot.key).remove()
            }
        })
    }

    /**
     * Release listeners and resources before shutdown.
     */
    public async down() {
        // Release all subscriptions before shutdown
        this.firebase.ref('exposure').off()
    }
}
