import {error, Middleware} from "@extollo/lib"
import {Injectable} from "@extollo/di"
import {HTTPStatus} from "@extollo/util";

/**
 * ValidateEncounterTransaction Middleware
 * --------------------------------------------
 * Errors out the request if it is missing any fields required to create
 * a new encounter transaction on the blockchain.
 */
@Injectable()
export class ValidateEncounterTransaction extends Middleware {
    public async apply() {
        const required: string[] = [
            'combinedHash',
            'encodedGPSLocation',
            'partnerPublicKey',
            'validationSignature',
            'timestamp',
        ]

        for ( const field of required ) {
            if ( !this.request.input(field) ) {
                return error(`Missing required field: ${field}`, HTTPStatus.BAD_REQUEST, 'json')
            }
        }
    }
}
