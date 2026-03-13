import { callEdgeFn } from './supabase'

/**
 * Gets a presigned upload URL for Cloudflare R2 by calling a Supabase Edge Function.
 * This keeps the sensitive R2 credentials on the server side.
 */
export async function getR2UploadUrl(fileName: string, contentType: string, tenantId: string) {
    try {
        // We now delegate the presigning to a secure Edge Function
        const data = await callEdgeFn('get-r2-upload-url', {
            fileName,
            contentType,
            tenantId
        })

        if (!data || !data.uploadUrl) {
            throw new Error('Invalid response from upload service')
        }

        return {
            uploadUrl: data.uploadUrl,
            key: data.key
        }
    } catch (err: any) {
        console.error('R2 Presign Error:', err)
        // Re-throw so the UI can catch it and show a toast
        throw new Error(err.message || 'Failed to initialize secure upload')
    }
}
