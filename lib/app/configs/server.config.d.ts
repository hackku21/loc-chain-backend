import { ORMSession } from "@extollo/orm";
import { LocalFilesystem, LocalFilesystemConfig } from "@extollo/util";
declare const _default: {
    debug: any;
    session: {
        driver: typeof ORMSession;
    };
    filesystems: {
        default: {
            isDefault: boolean;
            driver: typeof LocalFilesystem;
            config: LocalFilesystemConfig;
        };
    };
    middleware: {
        global: {
            pre: string[];
        };
    };
};
export default _default;
