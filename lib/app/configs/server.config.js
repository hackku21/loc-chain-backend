"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("@extollo/lib");
const orm_1 = require("@extollo/orm");
const util_1 = require("@extollo/util");
exports.default = {
    debug: lib_1.env('DEBUG_MODE', false),
    session: {
        /* The implementation of @extollo/lib.Session that serves as the session backend. */
        driver: orm_1.ORMSession,
    },
    /*
     * Here, you can define various filesystem drivers that can be used in
     * your application to store/retrieve files.
     *
     * The key in the object is the 'name' of the filesystem as it will be
     * fetched in code. For example, if you have a `fubar: { ... }` item,
     * then you can retrieve that filesystem using the Files service like
     * so:
     *
     * files.getFilesystem('fubar')  // => Filesystem { ... }
     */
    filesystems: {
        default: {
            /* If true, this will serve as the default filesystem for modules in your application. */
            isDefault: true,
            /* The implementation of @extollo/util.Filesystem that serves as the backend. */
            driver: util_1.LocalFilesystem,
            /* The config required by the filesystem driver. */
            config: {
                baseDir: lib_1.basePath('..', 'uploads').toLocal,
            },
        }
    },
    middleware: {
        global: {
            pre: ['LogRequest'],
        },
    },
};
