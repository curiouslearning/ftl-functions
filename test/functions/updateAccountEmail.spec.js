
const https = require('https');
const functions = require('firebase-functions');
const sinon = require('sinon');
const admin = require('firebase-admin');
const proxyquire = require('proxyquire');
const cloneDeep = require('lodash/cloneDeep');
const PassThrough = require('stream').PassThrough;
const stubbedAdmin = cloneDeep(admin);
const stubbedFunctions = cloneDeep(functions);
let stubTime;
let timeStub;
let Timestamp;
let DocumentReference;
let Query;

describe('functions/updateAccountEmail', () => {
  const myFunction = proxyquire('../../functions/updateAccountEmail', {
    'firebase-admin': stubbedAdmin,
  });
  const sandbox = sinon.createSandbox();
  let currentEmail;
  let newEmail;
  let uid;
  let body;
  let run;
  let res;
  let status;
  let send;
  let findStub;
  let deleteStub;
  let createStub;
  let getStub;
  let docRef;
  beforeEach(() => {
    Timestamp = admin.firestore.Firestore.Timestamp;
    DocumentReference = admin.firestore.Firestore.DocumentReference;
    stubTime = Timestamp.now();
    timeStub = sandbox.stub(Timestamp, 'now').returns(stubTime);
    currentEmail = 'bad@email.biz';
    newEmail = 'fake@email.biz';
    uid = 'fake-user';
    body = {newEmail, currentEmail};
    docRef = {
      exists: true,
      update: sandbox.stub().resolves(),
    };
    findStub = sandbox.stub(stubbedAdmin.auth(), 'getUserByEmail');
    findStub.resolves({uid});
    deleteStub = sandbox.stub(stubbedAdmin.auth(), 'deleteUser').resolves();
    createStub = sandbox.stub(stubbedAdmin.auth(), 'createUser');
    createStub.resolves({uid: uid, email: newEmail});
    getStub = sandbox.stub(DocumentReference.prototype, 'get').resolves(docRef);
    status = sandbox.stub();
    send = sandbox.spy();
    res = {status, send};
    status.returns(res);
    this.request = sandbox.stub(https, 'request');
    run = async () => {
      const request = new PassThrough();
      sandbox.stub(request, 'write');
      this.request.returns(request);
      return await myFunction.updateAccountEmail({body}, res);
    };
  });
  afterEach(() => {
    sandbox.restore();
    timeStub.restore();
  });
  it('should call status with 200', async () => {
    await run();
    res.status.should.have.been.calledWith(200);
  });
  it('should fetch the correct user', async () => {
    await run();
    findStub.should.have.been.calledWith(currentEmail);
  });
  it('should call delete user with the uid', async () => {
    await run();
    deleteStub.should.have.been.calledWith(uid);
  });
  it('should call createUser with the expected params', async () => {
    await run();
    createStub.should.have.been.calledWith({uid, email: newEmail});
  });
  it('should call status with 400', async () => {
    body.newEmail = undefined;
    await run();
    res.status.should.have.been.calledWith(400);
  });
  it('should call status with 400', async () => {
    body.currentEmail = undefined;
    await run();
    res.status.should.have.been.calledWith(400);
  });
  it('should call status with 400', async () => {
    findStub.rejects({code: 'auth/invalid-email'});
    await run();
    res.status.should.have.been.calledWith(400);
  });
  it('should call status with 500', async () => {
    findStub.rejects('fake-error');
    await run();
    res.status.should.have.been.calledWith(500);
  });
  it('should call status with 500', async () => {
    deleteStub.rejects();
    await run();
    res.status.should.have.been.calledWith(500);
  });
  it('should call status with 500', async () => {
    createStub.rejects();
    await run();
    res.status.should.have.been.calledWith(500);
  });
});
