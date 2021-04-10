import {Config, Controllers, HTTPServer, Files, Middlewares, Routing, Unit} from '@extollo/lib'
import {CommandLine} from "@extollo/cli"
import {FirebaseUnit} from "./app/units/FirebaseUnit"
import {Blockchain} from "./app/units/Blockchain"
import {Transaction} from "./app/units/rtdb/Transaction"
import {Exposure} from "./app/units/rtdb/Exposure"

export const Units = [
    Config,
    FirebaseUnit,
    Blockchain,
    Transaction,
    Exposure,
    Files,
    CommandLine,
    Controllers,
    Middlewares,

    Routing,
    HTTPServer,
] as (typeof Unit)[]
