import {Singleton, Inject} from "@extollo/di"
import {Unit, Logging, Config} from "@extollo/lib"
import * as firebase from "firebase-admin"

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

    /** Called on app start. */
    public async up() {
        this.logging.info('Initializing Firebase application credentials...')
        this._firebase.initializeApp({
            credential: firebase.credential.cert(this.config.get('app.firebase.credentials')),
            databaseURL: this.config.get('app.firebase.defaultRTDB'),
        })
    }

    /** Called on app shutdown. */
    public async down() {

    }
}
