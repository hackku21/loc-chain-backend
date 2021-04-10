import {Config, error, Middleware} from "@extollo/lib"
import {Inject, Injectable} from "@extollo/di"
import {HTTPStatus} from "@extollo/util"

/**
 * DebugOnly Middleware
 * --------------------------------------------
 * Only allows the request to proceed if the app is in debug mode.
 */
@Injectable()
export class DebugOnly extends Middleware {
    @Inject()
    protected readonly config!: Config

    public async apply() {
        if ( !this.config.get('server.debug', false) ) {
            return error('Not found.', HTTPStatus.NOT_FOUND)
        }
    }
}
