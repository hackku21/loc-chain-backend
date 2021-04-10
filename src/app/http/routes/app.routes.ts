import {Route} from "@extollo/lib"

Route.group('/api/v1', () => {
    Route.post('/encounter', 'api:Blockchain.postTransaction')
        .pre('DebugOnly')
        .pre('api:ValidateEncounterTransaction')

    Route.post('/exposure', 'api:Blockchain.postExposure')
        .pre('DebugOnly')
        .pre('api:ValidateExposureTransaction')

    Route.post('/validate', 'api:Blockchain.validate')
        .pre('DebugOnly')

    Route.get('/chain', 'api:Blockchain.readBlockchain')
})
