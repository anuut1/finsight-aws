const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');

const region = process.env.AWS_REGION || 'ap-south-1';

const clientConfig = {
  region,
};

if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

const rawClient = new DynamoDBClient(clientConfig);

const dynamoDocClient = DynamoDBDocumentClient.from(rawClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
    convertClassInstanceToMap: true,
  },
  unmarshallOptions: {
    wrapNumbers: false,
  },
});

const CORE_TABLE = process.env.DYNAMODB_CORE_TABLE || 'finsight-core-prod';
const EPHEMERAL_TABLE = process.env.DYNAMODB_EPHEMERAL_TABLE || 'finsight-ephemeral-prod';

module.exports = {
  rawClient,
  dynamoDocClient,
  CORE_TABLE,
  EPHEMERAL_TABLE,
};
