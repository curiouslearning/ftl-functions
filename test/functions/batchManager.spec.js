const test = require('firebase-functions-test')();
const sinon = require('sinon');
const functions = require('firebase-functions');
const admin = require('firebase-admin');
adminInitStub = sinon.stub(admin, 'initializeApp');
const { BatchManager } = require('../../functions/batchManager');
const firestore = admin.firestore();
var sandbox = require('sinon').createSandbox();
beforeEach(()=>{
  adminInitStub = sinon.stub(admin, 'initializeApp');
});

afterEach(()=>{
  adminInitStub.restore();
});

describe('functions/BatchManager', function() {
  const firestore = admin.firestore();
  const date = new Date(Date.now());
  const getFakeUser = (i)=>{
    const id = 'fake-user;' + i;
    return {id: id, data: {
      userID: id,
      country: 'fake-country',
      region: 'fake-region',
      sourceDonor: 'fake-donor',
      sourceCampaign: 'fake-campaign',
      dateCreated: admin.firestore.Firestore.Timestamp.fromDate(date),
      learnerLevel: 'first-open',
      sourceDonation: 'fake-donation',
      userStatus: 'assigned',
      assignedOn: admin.firestore.Firestore.Timestamp.fromDate(date),
    }};
  };
  beforeEach(function() {
    manager = new BatchManager();
    commitStub = sandbox.stub(manager.batches[0], 'commit');
    commitStub.returns(new Promise((res, rej)=>{
      res('success!');
    }));
    docList = [];
    for (let i=0; i < 1000; i++) {
      docList.push(getFakeUser(i));
    }
  });

  afterEach(function() {
    sandbox.restore();
    commitStub.restore();
    manager = null;
  });

  describe('BatchManager', function() {
    it('should create an array of batch objects with one element', async ()=>{
      manager = new BatchManager();
      manager.batches.length.should.equal(1);
      manager.batches[0].should.be.an.instanceOf(admin.firestore.WriteBatch);
    });
  });

  describe('updateBatch', function() {
    it('should increment the batch size by 1 when called', async ()=>{
      manager.updateBatch();
      manager.batchSize.should.equal(1);
    });
    it('should add a new batch element if the batch size > 495', async ()=>{
      manager.batchSize = 495;
      manager.updateBatch();
      manager.batches.length.should.equal(2);
    });
    it('should reset the batch size to 0 when adding a new batch', async ()=>{
      manager.batchSize = 495;
      manager.updateBatch();
      manager.batchSize.should.equal(0);
    });
    it('should increment the batch count by 1 when adding a new batch', async ()=>{
      manager.batchSize = 495;
      manager.updateBatch();
      manager.batchCount.should.equal(1);
    });
    it('should throw an error if the batch could not be updated', async ()=>{

    });
  });

  describe('set', function() {
    it('should call updateBatch', async ()=>{
      const spy = sinon.spy(manager, 'updateBatch');
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      manager.set(docRef, docList[0].data, true);
      spy.should.have.been.calledOnce;
    });
    it('should add an operation to the most recent batch', async ()=>{
      const spy = sinon.spy(manager.batches[0], 'set');
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      await manager.set(docRef, docList[0].data, true);
      spy.should.have.been.calledOnce;
    });
    it('should throw an error if the batch could not be updated', async ()=>{

    });
  });

  describe('update', function() {
    it('should call updateBatch', async ()=>{
      const spy = sinon.spy(manager, 'updateBatch');
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      await manager.update(docRef, docList[0].data);
      spy.should.have.been.calledOnce;
    });
    it('should add an operation to the most recent batch', async ()=>{
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      const spy = sinon.spy(manager.batches[0], 'update');
      await manager.update(docRef, docList[0].data);
      spy.should.have.been.calledOnce;
    });
    it('should throw an error if the batch could not be updated', async ()=>{
    });
  });

  describe('delete', function() {
    it('should call updateBatch', async ()=>{
      const spy = sinon.spy(manager, 'updateBatch');
      let docRef = firestore.collection('user_pool').doc('fake-user');
      manager.delete(docRef);
      spy.should.have.been.calledOnce;
    });
    it('should add an operation to the most recent batch', async ()=>{
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      const spy = sinon.spy(manager.batches[0], 'delete');
      await manager.delete(docRef);
      spy.should.have.been.calledOnce;
    });
    it('should throw an error if the batch could not be updated', async ()=>{

    });
  });

  describe('commit', function() {
    it('should call commit on each batch in the array', async ()=>{
      let docRef = firestore.collection('user_pool').doc(docList[0].id);
      manager.set(docRef, docList[0], false);
      await manager.commit();
      commitStub.should.have.been.calledOnce;
    });
    it('should wait 1050ms between actions', async ()=>{
      for (let i = 0; i < 500; i++) {
        if (docList[i]) {
          const id = docList[i].id;
          let docRef = firestore.collection('user_pool').doc(id);
          manager.set(docRef, docList[i].data, true);
        }
      }
      manager.batches.length.should.equal(2);
      const secondBatch = sinon.stub(manager.batches[1], 'commit');
      secondBatch.returns(new Promise((res, rej)=>{}));
      const clock = sinon.useFakeTimers();
      const res = manager.commit();
      await clock.tick(1050);
      commitStub.should.have.been.calledOnce;
      secondBatch.should.not.have.been.called;
      await clock.tick(1050);
      commitStub.should.have.been.calledOnce;
      secondBatch.should.have.been.calledOnce;
      secondBatch.restore();
      clock.restore();
    });
    it('should return true on successful commit', async ()=>{
      const res = await manager.commit();
      res.should.equal(true);
    });
    it('should log an error on unsuccessful commit', async ()=>{
      commitStub.returns(new Promise((res, rej)=>{
         throw new TypeError('you failed!');
      }));
      await manager.commit();
      commitStub.should.have.thrown;
    });
  });
});
