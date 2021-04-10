"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const lib_1 = require("@extollo/lib");
const Units_extollo_1 = require("./Units.extollo");
const cli_1 = require("@extollo/cli");
(() => __awaiter(void 0, void 0, void 0, function* () {
    /*
     * The Application
     * -----------------------------------------------------
     * The application instance is a global inversion of control container that
     * ties your entire application together. The app container manages services
     * and lifecycle.
     */
    const app = lib_1.Application.getApplication();
    app.forceStartupMessage = false;
    Units_extollo_1.Units.reverse();
    cli_1.CommandLineApplication.setReplacement(Units_extollo_1.Units[0]);
    Units_extollo_1.Units[0] = cli_1.CommandLineApplication;
    Units_extollo_1.Units.reverse();
    app.scaffold(__dirname, Units_extollo_1.Units);
    yield app.run();
}))();
