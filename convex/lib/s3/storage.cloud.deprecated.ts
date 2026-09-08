import { GetBucketCorsCommand, HeadObjectCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../../env";

// Create an S3 client
const S3_REGION = env.S3_ENDPOINT.split(".")[1];
const S3_URL = env.S3_ENDPOINT.startsWith("https://") ? env.S3_ENDPOINT : `https://${env.S3_ENDPOINT}`;
const s3Client = new S3Client({
  endpoint: S3_URL, // Replace with your Backblaze endpoint
  region: S3_REGION, // Specify your region if required
  credentials: {
    accessKeyId: env.S3_APP_KEY_ID,
    secretAccessKey: env.S3_APP_KEY,
  },
});

async function updateBucketCors() {
  const corsRules = [
    {
      AllowedOrigins: ["http://localhost:3000"],
      AllowedMethods: ["PUT", "POST", "GET"],
      AllowedHeaders: ["*"],
      MaxAgeSeconds: 3000,
    },
  ];

  const params = {
    Bucket: env.S3_DEFAULT_BUCKET,
    CORSConfiguration: {
      CORSRules: corsRules,
    },
  };

  try {
    const command = new PutBucketCorsCommand(params);
    await s3Client.send(command);
    console.log("CORS configuration updated successfully!");
  } catch (error) {
    console.error("Error updating CORS configuration:", error);
  }
}

const checkCacheControl = async (key: string) => {
  try {
    // Retrieve the metadata of the object
    const command = new HeadObjectCommand({
      Bucket: env.S3_DEFAULT_BUCKET,
      Key: key,
    });
    const response = await s3Client.send(command);

    console.log("Object metadata:", response);

    // Check the Cache-Control header
    const cacheControl = response.CacheControl;
    if (cacheControl) {
      console.log(`Cache-Control is set to: ${cacheControl}`);
    } else {
      console.log("Cache-Control header is not set.");
    }
  } catch (error) {
    console.error("Error retrieving object metadata:", error);
  }
};

async function getBucketCors() {
  try {
    const command = new GetBucketCorsCommand({ Bucket: env.S3_DEFAULT_BUCKET });
    const response = await s3Client.send(command);
    console.log("Current CORS configuration:", JSON.stringify(response.CORSRules, null, 2));
  } catch (error) {
    console.error("Error retrieving CORS configuration:", error);
  }
}

/**
 * Helpers for interacting with the storage cloud
 * @deprecated No need to use them
 */
export class StorageCloudDeprecated {
  static updateBucketCors = updateBucketCors;
  static getBucketCors = getBucketCors;
  static checkCacheControl = checkCacheControl;
}
