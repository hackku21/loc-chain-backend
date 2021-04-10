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

    Route.post('/peer', 'api:Blockchain.peer')

    Route.get('/chain', 'api:Blockchain.readBlockchain')

    Route.get('/check', 'api:Blockchain.check')
        .pre('api:FirebaseUserOnly')

    Route.get('/check-debug', 'api:Blockchain.check')
        .pre('DebugOnly')

    Route.get('/chain/submit', 'api:Blockchain.readBlockchainSubmission')
})
