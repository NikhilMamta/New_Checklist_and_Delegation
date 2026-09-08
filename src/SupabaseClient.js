import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://kfdtcqjkesvdfzncfbns.supabase.co";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_XvSW_BICw33KESpeQyAfkw_6Z2OpEWA";

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const uploadToSupabaseStorage = async (candidateBuckets, fileName, fileData, options = {}) => {
  const buckets = Array.isArray(candidateBuckets) ? candidateBuckets : [candidateBuckets];
  let lastError = null;

  for (const bucket of buckets) {
    try {
      console.log(`📡 [Supabase Storage] Attempting upload to bucket: '${bucket}' for file: '${fileName}'`);
      const { data, error } = await supabase.storage
        .from(bucket)
        .upload(fileName, fileData, options);

      if (!error && data) {
        const { data: { publicUrl } } = supabase.storage
          .from(bucket)
          .getPublicUrl(fileName);

        console.log(`✅ [Supabase Storage] Successfully uploaded to bucket: '${bucket}'! Public URL: ${publicUrl}`);
        return { publicUrl, bucket, data };
      }

      lastError = error;
      console.error(`⚠️ [Supabase Storage Response] Bucket: '${bucket}', Status: ${error?.status || error?.statusCode || 'N/A'}, Message: "${error?.message}", Full Error:`, error);
      const isNotFound = error?.message?.toLowerCase().includes("not found") || error?.error === "Bucket not found";
      if (isNotFound) {
        console.warn(`❌ [Supabase Storage Alert] Bucket '${bucket}' DOES NOT EXIST in your Supabase project! Please create bucket '${bucket}' in Supabase Dashboard -> Storage.`);
        continue;
      }
    } catch (e) {
      lastError = e;
    }
  }

  console.error(`❌ [Supabase Storage Error] Upload failed. Tried buckets: [${buckets.join(', ')}]. Please create bucket '${buckets[0]}' in Supabase Storage!`, lastError);
  return { publicUrl: null, error: lastError };
};

export default supabase;
