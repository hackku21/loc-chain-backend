"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Units = void 0;
const lib_1 = require("@extollo/lib");
const orm_1 = require("@extollo/orm");
const cli_1 = require("@extollo/cli");
const i18n_1 = require("@extollo/i18n");
exports.Units = [
    lib_1.Config,
    lib_1.Files,
    cli_1.CommandLine,
    lib_1.Controllers,
    lib_1.Middlewares,
    orm_1.Database,
    orm_1.Models,
    i18n_1.Internationalization,
    lib_1.Routing,
    lib_1.HTTPServer,
];
