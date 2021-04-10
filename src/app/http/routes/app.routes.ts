import {Route} from "@extollo/lib"

Route.group('/api/v1', () => {
    Route.post('/encounter', 'api:Blockchain.postTransaction')
        .pre('api:ValidateEncounterTransaction')
})
