import { FirebaseUnit } from "../FirebaseUnit"
import { TransactionResource, TransactionResourceItem } from "../../rtdb/TransactionResource"
import { Singleton, Inject } from "@extollo/di"
import { Unit, Logging } from "@extollo/lib"
import * as openpgp from "openpgp"
import { Blockchain } from "../Blockchain"

/**
 * Transaction Unit
 * ---------------------------------------
 * This unit listens for transactions created on the realtime database.
 * When new ones come through, it matches them up, validates them, and pushes
 * them onto this server's blockchain.
 */
@Singleton()
export class Transaction extends Unit {
    @Inject()
    protected readonly firebase!: FirebaseUnit

    @Inject()
    protected readonly blockchain!: Blockchain

    @Inject()
    protected readonly logging!: Logging

    async compare(t1: TransactionResourceItem, t2: TransactionResourceItem) {
        const [t2key, t1sig, t1key, t2sig] = await Promise.all([
            openpgp.readKey({
                armoredKey: t2.partnerPublicKey
            }),
            openpgp.readMessage({
                armoredMessage: t1.validationSignature,
            }),
            openpgp.readKey({
                armoredKey: t1.partnerPublicKey
            }),
            openpgp.readMessage({
                armoredMessage: t2.validationSignature,
            }),
        ])

        const [r1, r2] = await Promise.all([
            openpgp.verify({
                publicKeys: t2key,
                message: t1sig,
            }),
            openpgp.verify({
                publicKeys: t1key,
                message: t2sig,
            }),
        ])

        const [v1, v2] = await Promise.all([
            r1.signatures[0]?.verified,
            r2.signatures[0]?.verified
        ])

        return v1 && v2
    }

    /**
     * Subscribe to the transactions reference and wait for new transactions to be added.
     */
    public async up() {
        this.firebase.ref('transaction').on('value', snapshot => {
            for ( const leftKey in snapshot.val() ) {
                const left = snapshot.val()[leftKey]

                for ( const rightKey in snapshot.val() ) {
                    const right = snapshot.val()[rightKey]

                    this.compare(left, right).then(match => {
                        if ( match ) {
                            this.blockchain.submitTransactions([left, right])
                            this.firebase.ref('transaction').child(leftKey).remove()
                            this.firebase.ref('transaction').child(rightKey).remove()
                        }
                    })
                }
            }
        })
    }

    /**
     * Release listeners and resources before shutdown.
     */
    public async down() {
        // Release all subscriptions before shutdown
        this.firebase.ref("transaction").off()
    }
}
