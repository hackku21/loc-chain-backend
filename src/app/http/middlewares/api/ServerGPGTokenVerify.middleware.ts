import {Middleware, Config, error} from "@extollo/lib"
import {Injectable, Inject} from "@extollo/di"
import { HTTPStatus } from "@extollo/util"
import * as openpgp from "openpgp"

/**
 * serverGPGTokenVerify Middleware
 * --------------------------------------------
 * Put some description here.
 */
@Injectable()
export class ServerGPGTokenVerify extends Middleware {
    @Inject()
    protected readonly config!: Config

    public async apply() {
        const header = this.config.get('app.api_server_header')
        let value = this.request.getHeader(header)
        // if nothing, fail
        if (!value) {
            return this.fail()
        }
        // if single string
        if (typeof(value) === 'string') {
            this.verifyToken(value)
            return
        } else { // else an array of strings
            for (const item of value) {
                if (await this.verifyToken(item)) {
                    return
                }
            }
            
        }
    }

    public fail() {
        return error("Unauthorized", HTTPStatus.FORBIDDEN)
    }
    public async verifyToken(message: string) {
        const publicKey = this.config.get("app.gpg.key.public")

        const result = await openpgp.verify({
            publicKeys: await openpgp.readKey({
                armoredKey: publicKey,
            }),
            message: await openpgp.readMessage({
                armoredMessage: message,
            }),
        })

        return !!(await result.signatures?.[0]?.verified)
    }
}
