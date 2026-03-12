import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_ACCESS_KEY_ID = import.meta.env.VITE_R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = import.meta.env.VITE_R2_SECRET_ACCESS_KEY;
const R2_ENDPOINT = import.meta.env.VITE_R2_ENDPOINT;
const R2_BUCKET_NAME = import.meta.env.VITE_R2_BUCKET_NAME;

const client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

export async function getR2UploadUrl(fileName: string, contentType: string, tenantId: string) {
    const key = `${tenantId}/${Date.now()}_${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 });

    return { uploadUrl, key };
}
