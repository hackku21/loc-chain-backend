import { env } from '@extollo/lib'
import * as fs from "fs"

export default {
    name: env('APP_NAME', 'Extollo'),

    firebase: {
        credentials: JSON.parse(
            fs.readFileSync(env('FIREBASE_CREDENTIALS'))
                .toString('utf-8')
        ),

        defaultRTDB: env('FIREBASE_DEFAULT_RTDB', 'https://loc-chain-default-rtdb.firebaseio.com'),
    }
}
