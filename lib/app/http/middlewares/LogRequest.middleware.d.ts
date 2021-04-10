import { Logging, Middleware } from "@extollo/lib";
export declare class LogRequest extends Middleware {
    protected readonly logging: Logging;
    apply(): Promise<void>;
}
