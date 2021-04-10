import { Singleton, Inject } from "@extollo/di"
import { Unit, Logging, Config } from "@extollo/lib"
import * as firebase from "firebase-admin"

export type RTDBRef = 'peers' | 'transaction' | 'block' | 'exposure' | 'locks'

/**
 * FirebaseUnit Unit
 * ---------------------------------------
 * Fetch credentials from config and setup the firebase-admin connection.
 */
@Singleton()
export class FirebaseUnit extends Unit {
    protected _firebase = firebase

    @Inject()
    protected readonly logging!: Logging

    @Inject()
    protected readonly config!: Config

    /** Get the underlying Firebase library. */
    get() {
        return this._firebase
    }

    /** Get a realtime-database Reference using our internal aliases. */
    ref(name: RTDBRef): firebase.database.Reference {
        return this._firebase.database().ref(
            String(this.config.get(`app.firebase.rtdb.refs.${name}`))
        )
    }

    /** Get the realtime database object directly. */
    db(): firebase.database.Database {
        return this._firebase.database()
    }

    /**
     * Try to lock the given database ref alias.
     * Promise will sleep if lock is held, and will resolve once lock is acquired.
     * @param name
     * @param description
     */
    async trylock(name: RTDBRef, description: string): Promise<any> {
        return this._firebase.database()
            .ref(`${this.config.get('app.firebase.rtdb.refs.locks')}/${name}`)
            .transaction(current => {
                if ( !current || current.time < 1 ) {
                    return {
                        time: (new Date).getTime(),
                        description,
                    }
                }
            }, undefined, false).then(async result => {
                if ( result.committed ) {
                    this.logging.debug(`Lock acquired: ${name}`)
                    return Promise.resolve()
                }

                this.logging.debug(`Unable to acquire lock: ${name} - ${description}. Trying again soon...`)
                await this.sleep(500)
                return this.trylock(name, description)
            })
            .catch(async reason => {
                this.logging.debug(`Unable to acquire lock: ${name} - ${description}. Trying again soon...`)
                await this.sleep(500)
                return this.trylock(name, description)
            })
    }

    /**
     * Release the lock on the given database ref.
     * @param name
     */
    async unlock(name: RTDBRef) {
        await this._firebase.database()
            .ref(`${this.config.get('app.firebase.rtdb.refs.locks')}/${name}`)
            .set({time: 0, description: 'none'}, err => {
                if ( err ) this.logging.error(err)
            })
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

    /** Sleep for (roughly) the given number of milliseconds. */
    async sleep(ms: number) {
        await new Promise<void>(res => {
            setTimeout(res, ms)
        })
    }
}
