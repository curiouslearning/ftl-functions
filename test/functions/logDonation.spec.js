const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
const PassThrough = require('stream').PassThrough;
const http = require('http');
const sandbox = require('sinon').createSandbox();

beforeEach(()=>{
  adminInitStub.restore();
  adminInitStub = sinon.stub(admin, 'initializeApp');
});

afterEach(()=>{
  adminInitStub.restore();
  sandbox.restore();
});

describe('functions/logDonation', ()=>{
  const myFunction = require('../../functions/logDonation');
  let docStub;
  beforeEach(()=>{
    this.request = sandbox.stub(http, 'request');
    sandbox.spy(console, 'error');
    docstub = {
      firstName: 'fake-firstName',
      lastName: 'fake-lastName',
      email: 'fake@email.biz',
      amount: '5.45',
      coveredByDonor: '0.45',
      campaignID: 'fake-campagin|fake-country',
      frequency: 'one-time',
    };
  });
  afterEach(()=>{
    sandbox.restore();
  });
  it('should accept a POST request with args', async ()=>{
    const writeStub = sinon.stub(myFunction, 'writeDonation');
    writeStub.returns(new Promise((res, rej)=>{}));
    const spy = sandbox.spy(myFunction, 'logDonation');
    const expected = JSON.stringify(docStub);
    const request = new PassThrough();
    const write = sandbox.stub(request, 'write');
    this.request.returns(request);
    myFunction.logDonation(docStub, function() {});
    spy.should.have.been.calledWith(expected);
  });
});
