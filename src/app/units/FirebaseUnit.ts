import {Singleton, Inject} from "@extollo/di"
import {Unit, Logging, Config} from "@extollo/lib"
import * as firebase from "firebase-admin"

export type RTDBRef = 'peers' | 'transaction' | 'block'

/**
 * FirebaseUnit Unit
 * ---------------------------------------
 * Fetch credentials from config and setup the firebase-admin connection.
 */
@Singleton()
export class FirebaseUnit extends Unit {
    protected _firebase = firebase;

    @Inject()
    protected readonly logging!: Logging

    @Inject()
    protected readonly config!: Config

    get() {
        return this._firebase
    }

    ref(name: RTDBRef): firebase.database.Reference {
        return this._firebase.database().ref(
            String(this.config.get(`app.firebase.rtdb.refs.${name}`))
        )
    }

    /** Called on app start. */
    public async up() {
        this.logging.info('Initializing Firebase application credentials...')
        this._firebase.initializeApp({
            credential: firebase.credential.cert(this.config.get('app.firebase.credentials')),
            databaseURL: this.config.get('app.firebase.rtdb.default'),
        })
    }

    /** Called on app shutdown. */
    public async down() {

    }
}
