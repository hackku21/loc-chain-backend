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
            if ( !Array.isArray(snapshot.val()) || snapshot.val().length < 2 ) return;

            for ( const left of snapshot.val() ) {
                for ( const right of snapshot.val() ) {
                    this.compare(left, right).then(match => {
                        if ( match ) {
                            this.blockchain.submitTransactions([left, right])
                        }
                    })
                }
            }
        })

        /*this.firebase.ref("transaction").on("child_added", async () => {
            this.logging.debug('Received child_added event for transactions reference.')
            // if ( !this.claim() ) return
            // await this.firebase.trylock('block', 'Transaction_child_added')

            // array of pairs of transaction resource items
            let groupedTransactions: [TransactionResourceItem, TransactionResourceItem][] = []
            // collection of transaction resource items
            let transactions = await TransactionResource.collect().collect()
            // await this.firebase.unlock('block')

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

            // await this.firebase.trylock('block', 'Transaction_submitTransactions')
            for (const group of groupedTransactions) {
                const block = await this.blockchain.submitTransactions(group)

                this.logging.verbose('Created block:')
                this.logging.verbose(block)

                await this.firebase.ref("transaction").child(group[0].firebaseID).remove()
                await this.firebase.ref("transaction").child(group[1].firebaseID).remove()
            }

            // this.release()
            // await this.firebase.unlock('block')
        })*/
    }

    /**
     * Release listeners and resources before shutdown.
     */
    public async down() {
        // Release all subscriptions before shutdown
        this.firebase.ref("transaction").off()
    }
}
