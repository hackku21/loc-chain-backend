import {Config, Controllers, HTTPServer, Files, Middlewares, Routing, Unit} from '@extollo/lib'
import {Database, Models} from "@extollo/orm";
import {CommandLine} from "@extollo/cli";
import {Internationalization} from "@extollo/i18n";

export const Units = [
    Config,
    Files,
    CommandLine,
    Controllers,
    Middlewares,
    Database,
    Models,
    Internationalization,

    Routing,
    HTTPServer,
] as (typeof Unit)[]
