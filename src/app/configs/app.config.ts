import { env } from '@extollo/lib'
import * as fs from "fs"

export default {
    name: env('APP_NAME', 'Extollo'),
    defaultTime: env('DEFAULT_TIME', 1.21e+9),
    api_server_header: env('API_SERVER_HEADER', 'X-Server-Token'),

    gpg: {
       key: {
           // Contents of the SERVER's GPG public key, armored.
           public: fs.readFileSync(env('GPG_KEY_PUB')).toString('utf-8'),

           // Contents of the SERVER's GPG private key, armored.
           private: fs.readFileSync(env('GPG_KEY_PRIV')).toString('utf-8'),
       },
    },

    firebase: {
        // Contents of the Firebase service account credentials file.
        credentials: JSON.parse(
            fs.readFileSync(env('FIREBASE_CREDENTIALS'))
                .toString('utf-8')
        ),

        // Name of the HTTP header to check for the firebase auth token
        api_auth_header: env('FIREBASE_API_AUTH_HEADER', 'X-Auth-Token'),

        rtdb: {
            // URL of the realtime-database this app should use
            default: env('FIREBASE_DEFAULT_RTDB', 'https://loc-chain-default-rtdb.firebaseio.com'),

            // Mapping of ref-shortname to actual database reference
            // If you add a value here, also add it to the RTDBRef type alias
            refs: {
                locks: 'server/locks',  // Mutex-style locks for database refs
                peers: 'server/peers',  // Collection of federated peers
                transaction: 'chain/pending/transactions',  // List of pending encounter transactions
                exposure: 'chain/pending/exposures',  // List of pending exposure notifications
                block: 'chain/block',  // The blockchain itself
            },
        },
    }
}
