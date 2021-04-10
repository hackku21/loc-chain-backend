import {json, Logging, Middleware} from "@extollo/lib";
import {Inject, Injectable} from "@extollo/di";

@Injectable()
export class LogRequest extends Middleware {
    @Inject()
    protected readonly logging!: Logging

    public async apply() {
        this.logging.info(`Incoming request: ${this.request.method} @ ${this.request.path}`)
    }
}
