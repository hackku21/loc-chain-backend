import {Config, Controllers, HTTPServer, Files, Middlewares, Routing, Unit} from '@extollo/lib'
import {CommandLine} from "@extollo/cli";
import {FirebaseUnit} from "./app/units/FirebaseUnit";

export const Units = [
    Config,
    FirebaseUnit,
    Files,
    CommandLine,
    Controllers,
    Middlewares,

    Routing,
    HTTPServer,
] as (typeof Unit)[]
