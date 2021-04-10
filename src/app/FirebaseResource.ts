import {Inject, Injectable} from "@extollo/di"
import {collect, Collection, Iterable} from "@extollo/util"
import {FirebaseUnit, RTDBRef} from "./units/FirebaseUnit"
import * as firebase from "firebase-admin"
import {Application} from "@extollo/lib"

/**
 * Base interface for an item in a Firebase RTDB collection.
 */
export interface FirebaseResourceItem {
    firebaseID: string;
    seqID: number;
}

/**
 * An asynchronous iterable wrapper that enables us to use AsyncCollection
 * to interact with the Firebase realtime database.
 */
@Injectable()
export class FirebaseResource<T extends FirebaseResourceItem> extends Iterable<T> {
    protected refName!: RTDBRef

    get firebase() {
        return Application.getApplication().make<FirebaseUnit>(FirebaseUnit)
    }

    /** Get the Reference for this resource. */
    ref(): firebase.database.Reference {
        return Application.getApplication().make<FirebaseUnit>(FirebaseUnit).ref(this.refName)
    }

    /** Get the next sequential ID. */
    async getNextID(): Promise<number> {
        return new Promise<number>((res, rej) => {
            this.ref().orderByChild('seqID')
                .on('value', snapshot => {
                    res((this.resolveObject(snapshot.val()).reverse()?.[0]?.seqID ?? -1) + 1)
                }, rej)
        })
    }

    /** Get the record at the ith index. */
    async at(i: number): Promise<T | undefined> {
        return new Promise<T | undefined>((res, rej) => {
            this.ref().orderByChild('seqID')
                .startAt(i).endAt(i)
                .on('value', snapshot => res(this.resolveObject(snapshot.val())[0]), rej)
        })
    }

    /** Fetch an array of records in a range. */
    async range(start: number, end: number): Promise<Collection<T>> {
        return new Promise<Collection<T>>((res, rej) => {
            this.ref().orderByChild('seqID')
                .startAt(start).endAt(end)
                .on('value', snapshot => {
                    res(new Collection<T>(this.resolveObject(snapshot.val())))
                }, rej)
        })
    }

    /** Count the items in the collection. */
    async count(): Promise<number> {
        return new Promise<number>((res, rej) => {
            this.ref().orderByChild('seqID')
                .on('value', snapshot => {
                    res(this.resolveObject(snapshot.val()).length)
                }, rej)
        })
    }

    findNextId(collection: FirebaseResourceItem[]) {
        if ( !collection.length ) return 0
        return collect<FirebaseResourceItem>(collection).max<number>('seqID') + 1
    }

    /**
     * Push a new item into the collection.
     * @param item
     */
    async push(item: T): Promise<T> {
        await this.firebase.trylock(this.refName)

        await this.ref().transaction((collection) => {
            if ( !collection ) collection = []
            item.seqID = this.findNextId(collection)

            // @ts-ignore
            delete item.firebaseID
            collection.push(this.filter(item))

            return collection
        })

        await new Promise<void>(res => {
            this.ref()
                .orderByChild('seqID')
                .startAt(item.seqID)
                .limitToFirst(1)
                .on('value', snapshot => {
                    console.log('got push ID back', snapshot.val(), snapshot.key)
                    res()
                })
        })

        await this.firebase.unlock(this.refName)
        return item
    }

    /**
     * Given the value of a realtime-database snapshot, resolve it to an array of T.
     * @param snapshot
     * @protected
     */
    protected resolveObject(snapshot: any | null | undefined) {
        if ( !snapshot ) snapshot = {}

        const returns: T[] = []
        for ( const key in snapshot ) {
            if ( !snapshot.hasOwnProperty(key) ) continue
            snapshot[key].firebaseID = key
            returns.push(snapshot[key])
        }

        return returns
    }

    clone(): Iterable<T> {
        const inst = new FirebaseResource<T>()
        inst.refName = this.refName
        return inst
    }

    filter(obj: {[key: string]: any}) {
        for (let key in obj) {
            if (obj[key] === undefined) {
                delete obj[key]
                continue
            }

            if (obj[key] && typeof obj[key] === "object") {
                this.filter(obj[key])
                if (!Object.keys(obj[key]).length) {
                    delete obj[key]
                }
            }
        }

        return obj
    }
}
