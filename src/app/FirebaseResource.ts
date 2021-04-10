import {Inject, Injectable} from "@extollo/di"
import {Collection, Iterable} from "@extollo/util"
import {FirebaseUnit, RTDBRef} from "./units/FirebaseUnit"
import * as firebase from "firebase-admin"
import {Application} from "@extollo/lib";

export interface FirebaseResourceItem {
    seqID: number
}

@Injectable()
export class FirebaseResource<T extends FirebaseResourceItem> extends Iterable<T> {
    protected refName!: RTDBRef

    ref(): firebase.database.Reference {
        return Application.getApplication().make<FirebaseUnit>(FirebaseUnit).ref(this.refName)
    }

    async getNextID(): Promise<number> {
        return new Promise<number>((res, rej) => {
            this.ref().orderByChild('seqID')
                .on('value', snapshot => {
                    res(this.resolveObject(snapshot.val()).reverse()?.[0]?.seqID || 1)
                }, rej)
        })
    }

    async at(i: number): Promise<T | undefined> {
        return new Promise<T | undefined>((res, rej) => {
            this.ref().orderByChild('seqID')
                .startAt(i).endAt(i)
                .on('value', snapshot => res(this.resolveObject(snapshot.val())[0]), rej)
        })
    }

    async range(start: number, end: number): Promise<Collection<T>> {
        return new Promise<Collection<T>>((res, rej) => {
            this.ref().orderByChild('seqID')
                .startAt(start).endAt(end)
                .on('value', snapshot => {
                    res(new Collection<T>(this.resolveObject(snapshot.val())))
                }, rej)
        })
    }

    async count(): Promise<number> {
        return new Promise<number>((res, rej) => {
            this.ref().orderByChild('seqID')
                .on('value', snapshot => {
                    res(this.resolveObject(snapshot.val()).length)
                }, rej)
        })
    }

    protected resolveObject(snapshot: object | null | undefined) {
        if ( !snapshot ) snapshot = {}
        return Object.values(snapshot)
    }

    clone(): Iterable<T> {
        const inst = new FirebaseResource<T>()
        inst.refName = this.refName
        return inst
    }
}
