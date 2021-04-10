import { env } from '@extollo/lib'
import * as fs from "fs"

export default {
    name: env('APP_NAME', 'Extollo'),

    firebase: {
        credentials: JSON.parse(
            fs.readFileSync(env('FIREBASE_CREDENTIALS'))
                .toString('utf-8')
        ),

        api_auth_header: env('FIREBASE_API_AUTH_HEADER', 'X-Auth-Token'),

        rtdb: {
            default: env('FIREBASE_DEFAULT_RTDB', 'https://loc-chain-default-rtdb.firebaseio.com'),
            refs: {
                peers: 'chain/server/peers',
                transaction: 'chain/pending/transactions',
                block: 'chain/local/block',
            },
        },
    }
}
