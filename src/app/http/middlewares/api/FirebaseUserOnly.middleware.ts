import {Config, error, Middleware} from "@extollo/lib"
import {Inject, Injectable} from "@extollo/di"
import {FirebaseUnit} from "../../../units/FirebaseUnit"
import {HTTPStatus} from "@extollo/util"

/**
 * FirebaseUserOnly Middleware
 * --------------------------------------------
 * Authenticates the request based on the user ID token.
 */
@Injectable()
export class FirebaseUserOnly extends Middleware {
    @Inject()
    protected readonly firebase!: FirebaseUnit

    @Inject()
    protected readonly config!: Config

    get headerName(): string {
        return String(this.config.get('app.firebase.api_auth_header'))
    }

    getAuthHeader(): string {
        const tokens = this.request.getHeader(this.headerName)
        if ( Array.isArray(tokens) ) return tokens[0]
        return String(tokens)
    }

    public async apply() {
        const token = this.getAuthHeader()

        if ( !token ) {
            return error(`Missing ${this.headerName} header`, HTTPStatus.UNAUTHORIZED, 'json')
        }

        try {
            await this.firebase.get().auth().verifyIdToken(token)
        } catch (e) {
            return error('Invalid API token.', HTTPStatus.UNAUTHORIZED, 'json')
        }
    }
}
