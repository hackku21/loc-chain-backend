import { FirebaseUnit } from "../FirebaseUnit"
import { TransactionResource, TransactionResourceItem } from "../../rtdb/TransactionResource"
import { Singleton, Inject } from "@extollo/di"
import { Unit, Logging } from "@extollo/lib"
import * as openpgp from "openpgp"
import { Blockchain } from "../Blockchain"

/**
 * Transaction Unit
 * ---------------------------------------
 * Put some description here.
 */
@Singleton()
export class Transaction extends Unit {
    private processing: boolean = false

    @Inject()
    protected readonly firebase!: FirebaseUnit

    @Inject()
    protected readonly blockchain!: Blockchain

    @Inject()
    protected readonly logging!: Logging

    claim() {
        if ( !this.processing ) {
            this.processing = true
            return true
        }

        return false
    }

    release() {
        this.processing = false
    }

    public async compareTransactions(transaction1: TransactionResourceItem, transaction2: TransactionResourceItem) {
        // verify signature
        const result1 = await openpgp.verify({
            publicKeys: await openpgp.readKey({
                armoredKey: transaction2.partnerPublicKey
            }),
            message: await openpgp.readMessage({
                armoredMessage: transaction1.validationSignature,
            }),
        })

        const result2 = await openpgp.verify({
            publicKeys: await openpgp.readKey({
                armoredKey: transaction1.partnerPublicKey
            }),
            message: await openpgp.readMessage({
                armoredMessage: transaction2.validationSignature,
            }),
        })

        return (await result1.signatures[0].verified) && (await result2.signatures[0].verified)
    }

    public async up() {
        this.firebase.ref("transaction").on("child_added", async () => {
            this.logging.debug('Received child_added event for transactions reference.')
            if ( !this.claim() ) return

            // array of pairs of transaction resource items
            let groupedTransactions: [TransactionResourceItem, TransactionResourceItem][] = []
            // collection of transaction resource items
            let transactions = await TransactionResource.collect().collect()

            // compare each item
            await transactions.promiseMap(async transaction1 => {
                // for each item that is not itself
                await transactions.where('combinedHash', '!=', transaction1.combinedHash)
                    // get a second item
                    .promiseMap(async transaction2 => {
                        //if the item matches
                        if ( await this.compareTransactions(transaction1, transaction2) ) {
                            // and remove the two matching items
                            transactions = transactions.whereNotIn("combinedHash", [transaction1.combinedHash, transaction2.combinedHash])
                            // insert grouped items into groupedTransactions
                            groupedTransactions.push([transaction1, transaction2])
                        }
                    })
            })

            const seenCombinedHashes: string[] = []
            groupedTransactions = groupedTransactions.filter(group => {
                const key = group.map(x => x.combinedHash).sort().join('-')
                if ( !seenCombinedHashes.includes(key) ) {
                    seenCombinedHashes.push(key)
                    return true
                }

                return false
            })

            for (const group of groupedTransactions) {
                const block = await this.blockchain.submitTransactions(group)

                this.logging.verbose('Created block:')
                this.logging.verbose(block)

                await this.firebase.ref("transaction").child(group[0].firebaseID).remove()
                await this.firebase.ref("transaction").child(group[1].firebaseID).remove()
            }

            this.release()
        })
    }

    public async down() {
        // Release all subscriptions before shutdown
        this.firebase.ref("transaction").off()
    }
}
