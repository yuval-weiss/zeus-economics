require("babel-core/register");
require("babel-polyfill");
import { assert } from 'chai';
import 'mocha';

const artifacts = require('../extensions/tools/eos/artifacts');
const deployer = require('../extensions/tools/eos/deployer');
const getDefaultArgs = require('../extensions/helpers/getDefaultArgs');
const { getEos,getCreateAccount } = require('../extensions/tools/eos/utils');
const delay = ms => new Promise(res => setTimeout(res, ms))

var args = getDefaultArgs();
var systemToken = (args.creator !== 'eosio') ? "EOS" : "SYS";

async function genAllocateEOSTokens(account) {
    const keys = await getCreateAccount(account, args);
    const { creator } = args;
    var eos = await getEos(creator, args);
    let servicesTokenContract = await eos.contract('eosio.token');

    await servicesTokenContract.issue({
        to: account,
        quantity: `1000.0000 ${systemToken}`,
        memo: ""
    }, {
        authorization: `eosio@active`,
        broadcast: true,
        sign: true
    });
}

const contractCode ='microauctions';
var contractArtifact = artifacts.require(`./${contractCode}/`);
var tokenContract = artifacts.require(`./Token/`);
describe(`${contractCode} Contract`, () => {
    var testcontract;
    var disttokenContract;
    const perCycle = "100.0000"
    const code = 'auction1';
    const cycleTime = 30;
    const distokenSymbol = "NEW"
    const disttoken = 'distoken';
    const testuser1 = "testuser1";
    const testuser2 = "testuser2";
    const testuser3 = "testuser3";
     before( done => {
        (async() => {
            try {
                
                var deployedContract = await deployer.deploy(contractArtifact, code);
                var deployedToken = await deployer.deploy(tokenContract, disttoken);
                disttokenContract = await deployedToken.eos.contract(disttoken);

                
                var eos  = deployedContract.eos;
                await genAllocateEOSTokens(testuser1);
                await genAllocateEOSTokens(testuser2);
                await genAllocateEOSTokens(testuser3);
                testcontract = await eos.contract(code);  
                
                await disttokenContract.create(code,`10000000000.0000 ${distokenSymbol}`, {authorization: `${disttoken}@active`,
                    broadcast: true,
                    sign: true});
                // var systemtokenContract = await eos.contract('eosio.token');
                console.error('init auction');
                var delayedStartCycles = 1;
                var res = await testcontract.init({
                    setting:{
                        whitelist:code,
                        cycles:12,
                        seconds_per_cycle:cycleTime,
                        start_ts: (new Date().getTime() + (delayedStartCycles * cycleTime*1000))*1000,
                        quantity_per_day:{
                            contract: disttoken,
                            amount:perCycle,
                            precision: 4,
                            symbol: distokenSymbol
                        },
                        accepted_token:{
                            contract: "eosio.token",
                            amount: `0.1000`,
                            precision: 4,
                            symbol: systemToken
                        }
                    }
                }, {authorization: `${code}@active`,
                    broadcast: true,
                    sign: true});
                
                
                
                done();
                
                
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    
    const _selfopts = {
        authorization:[`${code}@active`]
    };
    
    const claim = async(testuser, foraccount)=>{
        console.error(`claiming ${testuser}`);
        var eos = await getEos(testuser, args);
        var testcontract1 = await eos.contract(code);
        foraccount = foraccount || testuser;
        var res = await testcontract1.claim({
            to: foraccount
        }, {
            authorization: `${testuser}@active`,
            broadcast: true,
            sign: true
        });
        if(res.processed.action_traces[0].inline_traces[0])
            return res.processed.action_traces[0].inline_traces[0].act.data.quantity;
        else 
            return null;
    }
    
    const buy = async(testuser, quantity, foraccount) =>{
        console.error(`buying for ${quantity} - ${testuser}`);
        var eos = await getEos(testuser, args);
        const keys = await getCreateAccount(testuser, args);

        // var systemtokenContract = await eos.contract('eosio.token');
        // var testcontract1 = await eos.contract(code);
        var options = {
                    authorization: `${testuser}@active`,
                    broadcast: true,
                    sign: true,
                    keyProvider: [keys.privateKey]
                    
        };
        var transaction = await eos.transaction(
        ['eosio.token'],
        (c) => {
          
          c['eosio_token'].transfer({
                    from: testuser,
                    to: code,
                    quantity: `${quantity} ${systemToken}`,
                    memo: foraccount ? foraccount :""
                },options);
          
        },
        options,
      );                
            
    }
    const sleepCycle = ()=>{
        return delay((cycleTime+1) * 1000);
    }
    it('auction didnt start yet', done => {
        (async() => {
            try {
                var failed = false;
                try{
                    await buy(testuser1,"1.0000");
                }
                catch(e){
                    if(e.toString().indexOf("auction did not start yet") != -1)
                        failed = true;
                    else
                        throw e;
                }
                await sleepCycle();
                assert.equal(failed, true, "should have failed");
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    it('empty claim', done => {
        (async() => {
            try {
                var failed = false;
                try{
                    await claim(testuser3);
                }
                catch(e){
                    if(e.toString().indexOf("account not found") != -1)
                        failed = true;
                    else
                        throw e;
                }
                assert.equal(failed, true, "should have failed");
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    it('one cycle auction', done => {
        (async() => {
            try {
                await buy(testuser1,"10.0000");
                await sleepCycle();
                var claim1 = await claim(testuser1);
                assert.equal(claim1, "100.0000 NEW", "wrong claim amount");
                // user1 should have 100.0000
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    it('two cycle auction', done => {
        (async() => {
            try {
                await buy(testuser1,"10.0000");
                await sleepCycle();
                await buy(testuser1,"10.0000");
                await sleepCycle();
                var claim1 = await claim(testuser1);
                assert.equal(claim1, "200.0000 NEW", "wrong claim amount");
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    
    it('one cycle auction - multiple users', done => {
        (async() => {
            try {
                await Promise.all([buy(testuser1,"10.0000"),buy(testuser2,"30.0000")]);

                await sleepCycle();
                var claim1 = await claim(testuser1);
                var claim2 = await claim(testuser2);
                assert.equal(claim1, "25.0000 NEW", "wrong 1st claim amount");
                assert.equal(claim2, "75.0000 NEW", "wrong 2nd claim amount");
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    it('two cycle auction - multiple users', done => {
        (async() => {
            try {
                await Promise.all([buy(testuser1,"10.0000"),buy(testuser2,"30.0000")]);
                await sleepCycle();
                await Promise.all([buy(testuser1,"1.0000"),buy(testuser2,"3.0000")]);
                await sleepCycle();
                var claim1 = await claim(testuser1);
                var claim2 = await claim(testuser2);
                assert.equal(claim1, "50.0000 NEW", "wrong 1st claim amount");
                assert.equal(claim2, "150.0000 NEW", "wrong 2nd claim amount");
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    
    it('below minimum', done => {
        (async() => {
            try {
                var failed = false;
                try{
                    await buy(testuser1,"0.0001");
                }
                catch(e){
                    if(e.toString().indexOf("below minimum amount") != -1)
                        failed = true;
                    else
                        throw e;
                }
                assert.equal(failed, true, "should have failed");
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    it('claim for today', done => {
        (async() => {
            try {
                await buy(testuser1,"1.0000");
                var claim1 = await claim(testuser1);
                assert.equal(claim1, null, "wrong claim amount");
                await sleepCycle();
                var claim2 = await claim(testuser1);
                assert.equal(claim2, "100.0000 NEW", "wrong claim amount");
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    it('claim for today - with same day buy', done => {
        (async() => {
            try {
                await buy(testuser1,"1.0000");
                await sleepCycle();
                await buy(testuser1,"3.0000");
                var claim1 = await claim(testuser1);
                await sleepCycle();
                var claim2 = await claim(testuser1);
                assert.equal(claim1, "100.0000 NEW", "wrong 1st claim amount");
                assert.equal(claim2, "100.0000 NEW", "wrong 2nd claim amount");
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    
    
    it('3rd party buy', done => {
        (async() => {
            try {
                await buy(testuser1,"1.0000", testuser2);
                await sleepCycle();
                var claim1 = await claim(testuser2);
                assert.equal(claim1, "100.0000 NEW", "wrong claim amount");
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    it('3rd party claim', done => {
        (async() => {
            try {
                await buy(testuser1,"1.0000");
                await sleepCycle();
                var claim1 = await claim(testuser2, testuser1);
                assert.equal(claim1, "100.0000 NEW", "wrong claim amount");
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    
    it('whitelist', done => {
        (async() => {
            try {
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    it('whitelist 3rd party', done => {
        (async() => {
            try {
                done();
            }
            catch (e) {
                done(e);
            }                    
        })();
    });
    
    it('auction ended', done => {
        (async() => {
         try {
                var failed = false;
                try{
                    await buy(testuser1,"1.0000");
                }
                catch(e){
                    if(e.toString().indexOf("auction ended") != -1)
                        failed = true;
                    else
                        throw e;                        
                }
                assert.equal(failed, true, "should have failed");
                done();
         }
         catch (e) {
            done(e);
         }                    
        })();
    });

});