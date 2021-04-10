import {env, basePath, MemorySession} from "@extollo/lib"
import {LocalFilesystem, LocalFilesystemConfig} from "@extollo/util"

export default {
    debug: env('DEBUG_MODE', false),

    base_url: env('BASE_URL', 'http://localhost:8000/'),

    peers: [
        'http://127.0.0.1:8100/',
    ],

    session: {
        /* The implementation of @extollo/lib.Session that serves as the session backend. */
        driver: MemorySession,
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
            driver: LocalFilesystem,

            /* The config required by the filesystem driver. */
            config: {
                baseDir: basePath('..', 'uploads').toLocal,
            } as LocalFilesystemConfig,
        }
    },

    middleware: {
        global: {
            pre: [],
            post: [],
        },
    },
}
