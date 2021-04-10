const fs = require('fs')
const openpgp = require('openpgp')
const bcrypt = require('bcrypt')

class TestClient {
    constructor(keyName, id) {
        this.keyName = keyName
        this.id = id
        this.publicKey = fs.readFileSync(`./${this.keyName}.public.gpg.key`).toString('utf-8')
        this.privateKey = fs.readFileSync(`./${this.keyName}.private.gpg.key`).toString('utf-8')
        this.salt = fs.readFileSync(`./${this.keyName}.salt`).toString('utf-8')
    }

    getHash(otherClientId) {
        const [lesserId, greaterId] = [otherClientId, this.id].sort()
        return bcrypt.hashSync(`${lesserId}-${greaterId}`, this.salt)
    }

    async interactWith(otherClient) {
        const hash = this.getHash(otherClient.id)
        const message = openpgp.Message.fromText(hash)
        const signature = (await openpgp.sign({
            message, privateKeys: await openpgp.readKey({
                armoredKey: this.privateKey
            })
        })).toString()

        return {
            combinedHash: hash,
            timestamp: (new Date).getTime(),
            encodedGPSLocation: JSON.stringify({ none: true }),
            partnerPublicKey: otherClient.publicKey,
            validationSignature: signature
        }
    }
}

;(async () => {
    const client_a = new TestClient('test_a', 'a893irwe')
    const client_b = new TestClient('test_b', 'bawesfdi')

    const a_transact = await client_a.interactWith(client_b)
    const b_transact = await client_b.interactWith(client_a)

    console.log(a_transact, b_transact)
})()

