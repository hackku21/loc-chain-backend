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
    @Inject()
    protected readonly firebase!: FirebaseUnit

    @Inject()
    protected readonly blockchain!: Blockchain

    public async compareTransactions(transaction1: TransactionResourceItem, transaction2: TransactionResourceItem) {
        // verify signature
        const result1 = await openpgp.verify({
            publicKeys: await openpgp.readKey({
                armoredKey: transaction2.partnerPublicKey
            }),
            message: openpgp.Message.fromText(transaction1.combinedHash),
            signature: await openpgp.readSignature({
                armoredSignature: transaction1.validationSignature // parse detached signature
            })
        })
        const result2 = await openpgp.verify({
            publicKeys: await openpgp.readKey({
                armoredKey: transaction1.partnerPublicKey
            }),
            message: openpgp.Message.fromText(transaction2.combinedHash),
            signature: await openpgp.readSignature({
                armoredSignature: transaction2.validationSignature // parse detached signature
            })
        })
        return await (result1.signatures[0].verified) && await (result2.signatures[0].verified)
    }

    public async up() {
        this.firebase.ref("transaction").on("value", async () => {
            // array of pairs of tranaction resource items
            const groupedTransactions: [TransactionResourceItem, TransactionResourceItem][] = []
            // collection of transaction resource items
            let transactions = await TransactionResource.collect().collect()
            // compare each item
            transactions.each(transaction1 => {
                // for each item that is not itself
                transactions.where("combinedHash", "!=", transaction1.combinedHash)
                    // get a second item
                    .each(transaction2 => {
                        //if the item matches
                        if (this.compareTransactions(transaction1, transaction2)) {
                            // and remove the two matching items
                            transactions = transactions.whereNotIn("combinedHash", [transaction1.combinedHash, transaction2.combinedHash])
                            // insert grouped items into groupedTransactions
                            groupedTransactions.push([transaction1, transaction2])
                        }
                    })
            })
            for (const group of groupedTransactions) {
                await this.blockchain.submitTransactions(group)
                await this.firebase.ref("transaction").child(group[0].firebaseID).remove()
                await this.firebase.ref("transaction").child(group[1].firebaseID).remove()
            }
        })
    }

    public async down() {
    }
}
