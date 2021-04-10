import {Application} from "@extollo/lib";
import {Units} from './Units.extollo'

;(async () => {
    /*
     * The Application
     * -----------------------------------------------------
     * The application instance is a global inversion of control container that
     * ties your entire application together. The app container manages services
     * and lifecycle.
     */
    const app = Application.getApplication()
    app.scaffold(__dirname, Units)
    await app.run()
})()
