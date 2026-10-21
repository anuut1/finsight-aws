const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

if (typeof jest !== 'undefined') {
  jest.setTimeout(60000);
}

let mongoServer;

const connectTestDb = async () => {
  if (mongoose.connection.readyState === 1) {
    return;
  }

  // Allow environment override if a test database URI is provided
  const externalTestUri = process.env.TEST_MONGO_URI || process.env.MONGO_URI_TEST;
  if (externalTestUri) {
    await mongoose.connect(externalTestUri);
    return;
  }

  if (!mongoServer) {
    mongoServer = await MongoMemoryServer.create({
      instance: {
        launchTimeout: 60000,
      },
    });
  }
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
};

const clearTestDb = async () => {
  if (mongoose.connection.readyState === 1) {
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      await collections[key].deleteMany({});
    }
  }
};

const closeTestDb = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
};

module.exports = {
  connectTestDb,
  clearTestDb,
  closeTestDb,
};
