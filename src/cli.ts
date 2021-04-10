import {Application} from "@extollo/lib";
import {Units} from './Units.extollo';
import {CommandLineApplication} from "@extollo/cli";

(async () => {
    /*
     * The Application
     * -----------------------------------------------------
     * The application instance is a global inversion of control container that
     * ties your entire application together. The app container manages services
     * and lifecycle.
     */
    const app = Application.getApplication()
    app.forceStartupMessage = false

    Units.reverse()
    CommandLineApplication.setReplacement(Units[0])
    Units[0] = CommandLineApplication
    Units.reverse()

    app.scaffold(__dirname, Units)
    await app.run()
})()
