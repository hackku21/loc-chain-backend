import {Config, Controllers, HTTPServer, Files, Middlewares, Routing, Unit} from '@extollo/lib'
import {Database, Models} from "@extollo/orm";
import {CommandLine} from "@extollo/cli";
import {FirebaseUnit} from "./app/units/FirebaseUnit";

export const Units = [
    Config,
    FirebaseUnit,
    Files,
    CommandLine,
    Controllers,
    Middlewares,
    Database,
    Models,

    Routing,
    HTTPServer,
] as (typeof Unit)[]
